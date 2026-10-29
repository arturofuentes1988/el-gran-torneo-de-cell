// Pantalla "ELIGE LUCHADOR" del 1 VS 1 y del ARCADE.
// Al centro, 8 casillas con la cara de cada luchador (las que faltan, bloqueadas) y
// ALEATORIO debajo. A los lados, en grande, el luchador de cada jugador: en gris
// mientras se elige y a color al elegirlo; después se elige el color de la ropa
// (izquierda / derecha) y se confirma.
// 1 VS CPU y PRÁCTICA: el jugador 1 elige el suyo y después el rival (CPU o muñeco).
// 1 VS 1: cada uno elige con su cursor al mismo tiempo. ARCADE: solo el jugador 1.
// Después: ELIGE ESCENARIO (o, en ARCADE, la primera pelea).

import { ColorMatrixFilter, Container, Graphics, Sprite, type Filter, type Text, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { FightMode, Game, Scene } from '../app/game';
import type { FighterAsset } from '../content/mannequin/fighters';
import { P1_KEYS, P2_KEYS } from '../input/devices';
import { COSTUME_COUNT, costumeFilter } from '../render/costume';
import { NEON_CYAN, NEON_PINK } from '../render/live';
import { arcade, outlinedText } from '../render/text';
import { startArcade } from './arcade';
import { FightScene } from './fight';
import { CasualMenuScene, MainMenuScene } from './modeSelect';
import { StageSelectScene } from './stageSelect';
import { fitScale } from '../render/fit';
import { backdrop } from './backdrop';

/** Casillas del plantel (las que todavía no tienen luchador se ven bloqueadas). */
const SLOTS = 8;
const COLS = 4;
const BOX = 40;
const GAP = 6;
const GRID_Y = 86;
const RANDOM_W = 76;
const RANDOM_H = 15;
/** Alto (unidades) y pies de los luchadores grandes, y su distancia al borde. */
const BIG_H = 150;
const BIG_Y = 226;
const BIG_X = 84;
/** Cuadros que se ve "¡LISTOS!" antes de seguir. */
const READY_FRAMES = 36;

export type SelectMode = Exclude<FightMode, 'demo'> | 'arcade';

interface Keys {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  ok: string[];
  back: string[];
}

/** Teclas de menú de cada jugador, según sus controles (se cambian en CONTROLES). */
function p1Menu(): Keys {
  return {
    left: ['ArrowLeft', ...P1_KEYS.left], right: ['ArrowRight', ...P1_KEYS.right],
    up: ['ArrowUp', ...P1_KEYS.up], down: ['ArrowDown', ...P1_KEYS.down],
    ok: [...P1_KEYS.lp, 'Enter', 'Space'], back: ['Escape', 'Backspace'],
  };
}
function p2Menu(): Keys {
  return {
    left: [...P2_KEYS.left], right: [...P2_KEYS.right], up: [...P2_KEYS.up], down: [...P2_KEYS.down],
    ok: [...P2_KEYS.lp, 'NumpadEnter'], back: [...P2_KEYS.hp],
  };
}

/** Una mano en el menú: teclas propias y su joystick (solo el toque, no mantener). */
class MenuHand {
  left = false;
  right = false;
  up = false;
  down = false;
  ok = false;
  back = false;
  private prev = { l: false, r: false, u: false, d: false };

  constructor(private game: Game, private keys: Keys, private pad: number) {}

  sample(): void {
    const kb = this.game.kb;
    const pads = this.game.pads;
    const p = pads.get(this.pad);
    const held = (ks: string[]): boolean => ks.some((k) => kb.held(k));
    const now = { l: held(this.keys.left) || !!p?.left, r: held(this.keys.right) || !!p?.right, u: held(this.keys.up) || !!p?.up, d: held(this.keys.down) || !!p?.down };
    this.left = now.l && !this.prev.l;
    this.right = now.r && !this.prev.r;
    this.up = now.u && !this.prev.u;
    this.down = now.d && !this.prev.d;
    this.prev = now;
    this.ok = this.keys.ok.some((k) => kb.hit(k)) || pads.pressed(this.pad, 0);
    this.back = this.keys.back.some((k) => kb.hit(k)) || pads.pressed(this.pad, 1);
  }
}

type Frames = Array<{ tex: Texture; dur: number }>;

/** Casilla: un luchador, una bloqueada (null) o ALEATORIO (la última). */
interface Cell {
  asset: FighterAsset | null;
  random: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cada lado: eligiendo, eligiendo color o listo. */
type Stage = 'choose' | 'color' | 'done';

/** Vista grande de un lado: el luchador marcado (gris) o elegido (a color), con su nombre. */
interface Big {
  sprite: Sprite;
  question: Text;
  name: Text;
  colorText: Text;
  frames: Frames;
  fi: number;
  ft: number;
  /** Lo que se está mostrando (para no rehacerlo cada cuadro). */
  shown: string;
}

function idleFrames(game: Game, a: FighterAsset): Frames {
  return (a.def.anims.idle?.frames ?? []).map((fr) => ({ tex: game.assets.textures[fr.tex], dur: fr.dur })).filter((fr) => fr.tex);
}

function setTex(s: Sprite, tex: Texture): void {
  s.texture = tex;
  s.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
}

/** Gris apagado del luchador que todavía no se elige. */
function greyFilter(): Filter {
  const f = new ColorMatrixFilter();
  f.desaturate();
  f.brightness(0.72, true);
  return f;
}

export class CharacterSelectScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  private cells: Cell[] = [];
  /** Índice del plantel elegido por cada lado (-1: todavía no) y su color de ropa. */
  private picks: [number, number] = [-1, -1];
  private colors: [number, number] = [0, 0];
  private stages: [Stage, Stage] = ['choose', 'choose'];
  /** Casilla marcada por cada cursor. */
  private pos: [number, number];
  private hands: [MenuHand, MenuHand];
  private frames = new Graphics();
  private cursorLabels: [Text, Text];
  private bigs: [Big, Big];
  private hint: Text;
  private readyText: Text;
  private ready = -1;
  private t = 0;
  private grey: [Filter, Filter] = [greyFilter(), greyFilter()];

  constructor(private game: Game, private mode: SelectMode) {
    this.hands = [new MenuHand(game, p1Menu(), 0), new MenuHand(game, p2Menu(), 1)];
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.55 });
    const title = outlinedText('ELIGE LUCHADOR', 14, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 18);
    this.ui.addChild(bg, title);
    if (mode === 'arcade') {
      const sub = outlinedText('ARCADE: GÁNALE A TODOS', 7, 0xffd040, 0x0a0610, 2);
      sub.anchor.set(0.5);
      sub.position.set(VIEW_W / 2, 36);
      this.ui.addChild(sub);
    } else {
      const vs = outlinedText('VS', 16, 0xffd040, 0x5a0a10, 3);
      vs.anchor.set(0.5);
      vs.position.set(VIEW_W / 2, 66);
      this.ui.addChild(vs);
    }

    // Vistas grandes: J1 a la izquierda; CPU / J2 / MUÑECO a la derecha (en ARCADE, los rivales).
    const rival = mode === '2p' ? 'J2' : mode === 'practica' ? 'MUÑECO' : mode === 'arcade' ? 'RIVALES' : 'CPU';
    const makeBig = (side: 0 | 1): Big => {
      const x = side === 0 ? BIG_X : VIEW_W - BIG_X;
      const color = side === 0 ? NEON_PINK : NEON_CYAN;
      const glow = new Graphics().ellipse(x, BIG_Y, 50, 9).fill({ color, alpha: 0.28 });
      const sprite = new Sprite();
      sprite.position.set(x, BIG_Y);
      const question = outlinedText('?', 52, 0xffd040, 0x5a0a10, 4);
      question.anchor.set(0.5);
      question.position.set(x, BIG_Y - 70);
      question.visible = false;
      const plate = new Graphics().roundRect(x - 66, BIG_Y + 6, 132, 16, 3).fill({ color: 0x140a24, alpha: 0.86 }).stroke({ color, width: 1 });
      const name = outlinedText('', 8, 0xffffff, 0x0a0610, 2);
      name.anchor.set(0.5);
      name.position.set(x, BIG_Y + 14);
      const colorText = outlinedText('', 6, 0xffd040, 0x0a0610, 2);
      colorText.anchor.set(0.5);
      colorText.position.set(x, BIG_Y + 30);
      // Quién elige este lado, en la esquina de arriba.
      const label = outlinedText(side === 0 ? 'J1' : rival, 10, color, 0x0a0610, 2);
      label.anchor.set(side === 0 ? 0 : 1, 0.5);
      label.position.set(side === 0 ? 14 : VIEW_W - 14, 18);
      this.ui.addChild(glow, sprite, question, plate, name, colorText, label);
      if (side === 1 && mode === 'arcade') {
        // En ARCADE el lado derecho muestra los rivales que vienen.
        plate.visible = false;
        glow.visible = false;
      }
      return { sprite, question, name, colorText, frames: [], fi: 0, ft: 0, shown: '' };
    };
    this.bigs = [makeBig(0), makeBig(1)];

    // Casillas: 8 (o más, si el plantel crece) en filas de 4 y ALEATORIO debajo.
    const roster = game.assets.roster;
    const slots = Math.max(SLOTS, Math.ceil(roster.length / COLS) * COLS);
    const gridW = COLS * BOX + (COLS - 1) * GAP;
    const x0 = Math.round((VIEW_W - gridW) / 2);
    for (let i = 0; i < slots; i++) {
      const x = x0 + (i % COLS) * (BOX + GAP);
      const y = GRID_Y + Math.floor(i / COLS) * (BOX + GAP);
      this.cells.push({ asset: roster[i] ?? null, random: false, x, y, w: BOX, h: BOX });
      this.ui.addChild(this.drawCell(this.cells[i]));
    }
    const rows = Math.ceil(slots / COLS);
    const ry = GRID_Y + rows * (BOX + GAP) + 2;
    const random: Cell = { asset: null, random: true, x: Math.round(VIEW_W / 2 - RANDOM_W / 2), y: ry, w: RANDOM_W, h: RANDOM_H };
    this.cells.push(random);
    this.ui.addChild(this.drawCell(random));

    // Cada cursor parte en un luchador distinto (si hay más de uno).
    this.pos = [0, Math.min(1, roster.length - 1)];
    this.cursorLabels = [outlinedText('J1', 6, NEON_PINK, 0x0a0610, 2), outlinedText(mode === '2p' ? 'J2' : rival, 6, NEON_CYAN, 0x0a0610, 2)];
    for (const l of this.cursorLabels) l.anchor.set(0.5, 1);
    this.hint = outlinedText('', 6, 0xd8d0e8, 0x0a0610, 1);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(VIEW_W / 2, ry + RANDOM_H + 8);
    this.readyText = outlinedText('¡LISTOS!', 24, 0xffd040, 0x5a0a10, 4);
    this.readyText.anchor.set(0.5);
    this.readyText.position.set(VIEW_W / 2, 128);
    this.readyText.visible = false;
    this.ui.addChild(this.frames, ...this.cursorLabels, this.hint, this.readyText);
    if (mode === 'arcade') {
      // No hay rival que elegir: el lado derecho ya está listo.
      this.stages[1] = 'done';
      this.cursorLabels[1].visible = false;
    }
    this.refreshHint();
  }

  /** Dibuja una casilla: la cara del luchador, una bloqueada o ALEATORIO. */
  private drawCell(c: Cell): Container {
    const box = new Container();
    const g = new Graphics();
    const locked = !c.asset && !c.random;
    g.roundRect(c.x, c.y, c.w, c.h, 4).fill({ color: locked ? 0x0c0716 : 0x1a0f2e, alpha: 0.9 }).stroke({ color: locked ? 0x4a3a5a : 0xc89a3a, width: 1 });
    box.addChild(g);
    if (c.random) {
      const t = outlinedText('ALEATORIO', 6, 0xffd040, 0x0a0610, 2);
      t.anchor.set(0.5);
      t.position.set(c.x + c.w / 2, c.y + c.h / 2 + 0.5);
      box.addChild(t);
      return box;
    }
    if (locked) {
      const q = outlinedText('?', 18, 0x5a4a6a, 0x0a0610, 2);
      q.anchor.set(0.5);
      q.position.set(c.x + c.w / 2, c.y + c.h / 2);
      box.addChild(q);
      return box;
    }
    const a = c.asset!;
    const mask = new Graphics().roundRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2, 3).fill(0xffffff);
    let s: Sprite;
    if (a.face) {
      s = new Sprite(a.face);
      s.anchor.set(0.5);
      s.width = c.w - 2;
      s.height = c.h - 2;
      s.position.set(c.x + c.w / 2, c.y + c.h / 2);
    } else {
      // Sin cara: su guardia, ajustada a la casilla.
      const frames = idleFrames(this.game, a);
      s = new Sprite();
      if (frames.length) {
        setTex(s, frames[0].tex);
        s.scale.set(fitScale(frames, c.h - 3, c.w - 4));
      }
      s.position.set(c.x + c.w / 2, c.y + c.h - 2);
    }
    s.mask = mask;
    box.addChild(s, mask);
    return box;
  }

  /** Lado que maneja ahora el jugador 1: el suyo y, sin jugador 2, después el del rival. */
  private p1Side(): 0 | 1 | null {
    if (this.stages[0] !== 'done') return 0;
    if (this.mode !== '2p' && this.stages[1] !== 'done') return 1;
    return null;
  }

  private refreshHint(): void {
    const side = this.p1Side();
    const rival = this.mode === 'practica' ? 'EL MUÑECO' : 'TU RIVAL';
    const colorStep = (side !== null && this.stages[side] === 'color') || (this.mode === '2p' && this.stages.includes('color'));
    this.hint.text = arcade(
      colorStep
        ? '◄ ► CAMBIA EL COLOR · ACEPTAR'
        : this.mode === '2p'
          ? 'CADA JUGADOR ELIGE CON SU CURSOR · ESC VUELVE'
          : side === 1
            ? `AHORA ELIGE A ${rival} · ESC VUELVE`
            : 'ELIGE TU LUCHADOR · ESC VUELVE',
    );
  }

  /** Casillas que se pueden marcar (luchadores y ALEATORIO; no las bloqueadas). */
  private selectable(i: number): boolean {
    const c = this.cells[i];
    return !!c && (c.random || !!c.asset);
  }

  /** Mueve el cursor de un lado con las flechas (salta las casillas bloqueadas). */
  private move(side: 0 | 1, h: MenuHand): boolean {
    const n = this.cells.length;
    const rnd = n - 1;
    const p = this.pos[side];
    let next = p;
    if (h.left || h.right) {
      const step = h.left ? n - 1 : 1;
      next = p;
      do next = (next + step) % n;
      while (!this.selectable(next) && next !== p);
    } else if (h.down) {
      next = p === rnd ? p : this.selectable(p + COLS) && p + COLS < rnd ? p + COLS : rnd;
    } else if (h.up) {
      if (p === rnd) {
        // De ALEATORIO sube a la última fila con luchadores.
        let i = rnd - 1;
        while (i > 0 && !this.selectable(i)) i--;
        next = i;
      } else if (p - COLS >= 0 && this.selectable(p - COLS)) next = p - COLS;
    } else return false;
    if (next === p) return false;
    this.pos[side] = next;
    return true;
  }

  /** Elige la casilla marcada (ALEATORIO se resuelve aquí) y pasa a elegir el color. */
  private pick(side: 0 | 1): void {
    const roster = this.game.assets.roster;
    const c = this.cells[this.pos[side]];
    const idx = c.random ? Math.floor(Math.random() * roster.length) : roster.indexOf(c.asset!);
    this.picks[side] = idx;
    this.colors[side] = this.freeColor(side, 0, 1);
    this.stages[side] = 'color';
    this.game.sfx.play('menuConfirm');
    this.refreshHint();
  }

  /** Color libre desde `from` en la dirección `dir` (el mismo luchador no puede repetir color). */
  private freeColor(side: 0 | 1, from: number, dir: number): number {
    const other = side === 0 ? 1 : 0;
    const clash = (c: number) => this.picks[other] === this.picks[side] && this.picks[other] >= 0 && this.colors[other] === c && this.stages[other] !== 'choose';
    let c = ((from % COSTUME_COUNT) + COSTUME_COUNT) % COSTUME_COUNT;
    for (let k = 0; k < COSTUME_COUNT && clash(c); k++) c = (c + dir + COSTUME_COUNT) % COSTUME_COUNT;
    return c;
  }

  /** Confirma el color: el lado queda listo; si los dos lo están, ¡LISTOS! */
  private confirmColor(side: 0 | 1): void {
    this.stages[side] = 'done';
    this.game.sfx.play('menuConfirm');
    this.refreshHint();
    if (this.stages[0] === 'done' && this.stages[1] === 'done') this.ready = 0;
  }

  /** Un lado vuelve un paso atrás; sin nada que deshacer, vuelve al menú. Devuelve false si salió. */
  private undo(side: 0 | 1): boolean {
    this.game.sfx.play('menuBack');
    if (this.stages[side] === 'done') this.stages[side] = 'color';
    else if (this.stages[side] === 'color') {
      this.stages[side] = 'choose';
      this.picks[side] = -1;
    } else if (side === 1 && this.mode !== '2p') this.stages[0] = 'color';
    else if (side === 0) {
      this.game.setScene(this.mode === 'arcade' ? new MainMenuScene(this.game) : new CasualMenuScene(this.game));
      return false;
    }
    this.refreshHint();
    return true;
  }

  /** Lo que hace la mano de un lado según su etapa (elegir o cambiar el color). */
  private handle(side: 0 | 1, h: MenuHand): boolean {
    const sfx = this.game.sfx;
    if (this.stages[side] === 'choose') {
      if (this.move(side, h)) sfx.play('menuMove');
      if (h.ok) this.pick(side);
    } else if (this.stages[side] === 'color') {
      if (h.left || h.right) {
        const dir = h.left ? -1 : 1;
        this.colors[side] = this.freeColor(side, this.colors[side] + dir, dir);
        sfx.play('menuMove');
      }
      if (h.ok) this.confirmColor(side);
    }
    if (h.back) return this.undo(side);
    return true;
  }

  /** La vista grande de un lado: el elegido a color (con su ropa) o el marcado en gris. */
  private updateBig(side: 0 | 1): void {
    const b = this.bigs[side];
    const roster = this.game.assets.roster;
    if (this.mode === 'arcade' && side === 1) {
      // Rivales del ARCADE: un "?" grande que late (se conocen pelea a pelea).
      b.sprite.visible = false;
      b.question.visible = true;
      b.name.text = '';
      b.colorText.text = '';
      return;
    }
    const picked = this.stages[side] !== 'choose';
    const cell = this.cells[this.pos[side]];
    const asset = picked ? roster[this.picks[side]] : cell.asset;
    const key = `${picked ? 'p' : 'h'}:${asset?.def.id ?? (cell.random ? 'random' : 'none')}:${picked ? this.colors[side] : -1}`;
    b.colorText.text = this.stages[side] === 'color' ? arcade(`◄ COLOR ${this.colors[side] + 1} ►`) : '';
    if (b.shown === key) return;
    b.shown = key;
    b.question.visible = !asset;
    b.sprite.visible = !!asset;
    b.name.text = arcade(asset ? asset.def.name.toUpperCase() : 'ALEATORIO');
    if (!asset) return;
    const frames = idleFrames(this.game, asset);
    if (b.frames[0]?.tex !== frames[0]?.tex) {
      b.frames = frames;
      b.fi = 0;
      b.ft = 0;
    }
    if (!b.frames.length) return;
    setTex(b.sprite, b.frames[b.fi].tex);
    const k = ((asset.def.texScale ?? 1) * BIG_H) / 160;
    // Los dos miran al centro.
    b.sprite.scale.set(side === 0 ? k : -k, k);
    const costume = picked ? costumeFilter(this.colors[side], asset.def.costume) : null;
    b.sprite.filters = picked ? (costume ? [costume] : []) : [this.grey[side]];
  }

  enter(): void {
    backdrop.attach(this.game);
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    backdrop.detach(this.game);
    this.game.display.hud.removeChild(this.ui);
    this.ui.destroy({ children: true });
  }

  step(): void {
    this.t++;
    for (const b of this.bigs) {
      if (!b.sprite.visible || !b.frames.length) continue;
      if (++b.ft >= b.frames[b.fi].dur) {
        b.ft = 0;
        b.fi = (b.fi + 1) % b.frames.length;
        setTex(b.sprite, b.frames[b.fi].tex);
      }
    }
    if (this.ready >= 0) {
      if (++this.ready >= READY_FRAMES) this.next();
      return;
    }
    const [h1, h2] = this.hands;
    h1.sample();
    h2.sample();
    // Jugador 1 (y, sin jugador 2, también el rival).
    const s1 = this.p1Side();
    if (s1 !== null && !this.handle(s1, h1)) return;
    if (s1 === null && h1.back && !this.undo(0)) return;
    // Jugador 2 (1 VS 1).
    if (this.mode === '2p' && this.ready < 0 && this.stages[1] !== 'done') this.handle(1, h2);
    else if (this.mode === '2p' && this.ready < 0 && h2.back) this.undo(1);
  }

  /** Con los dos listos: ELIGE ESCENARIO y la pelea, o la primera pelea del ARCADE. */
  private next(): void {
    const g = this.game;
    if (this.mode === 'arcade') {
      g.setScene(startArcade(g, this.picks[0], this.colors[0]));
      return;
    }
    const fighters: [number, number] = [this.picks[0], this.picks[1]];
    const colors: [number, number] = [this.colors[0], this.colors[1]];
    const mode = this.mode;
    g.setScene(new StageSelectScene(g, () => new FightScene(g, mode, undefined, { fighters, colors }), () => new CharacterSelectScene(g, mode)));
  }

  render(): void {
    backdrop.render();
    for (const side of [0, 1] as const) this.updateBig(side);
    if (this.mode === 'arcade') this.bigs[1].question.scale.set(1 + Math.sin(this.t / 12) * 0.06);
    const g = this.frames;
    g.clear();
    const blink = Math.floor(this.t / 12) % 2 === 0;
    const s1 = this.p1Side();
    // Cursor rosado del jugador 1 y cian del rival / jugador 2 (en 1 VS CPU el rival lo mueve el jugador 1).
    const cursors = [
      { on: this.ready < 0 && this.stages[0] === 'choose', pos: this.pos[0], color: NEON_PINK, inset: 0, label: this.cursorLabels[0], dx: 0 },
      {
        on: this.ready < 0 && this.stages[1] === 'choose' && (this.mode === '2p' || s1 === 1),
        pos: this.pos[1], color: NEON_CYAN, inset: 2, label: this.cursorLabels[1], dx: 0,
      },
    ];
    if (cursors[0].on && cursors[1].on && cursors[0].pos === cursors[1].pos) {
      cursors[0].dx = -9;
      cursors[1].dx = 9;
    }
    for (const c of cursors) {
      c.label.visible = c.on;
      if (!c.on) continue;
      const cell = this.cells[c.pos];
      const w = blink ? 2 : 1.4;
      g.roundRect(cell.x - 2 + c.inset, cell.y - 2 + c.inset, cell.w + 4 - c.inset * 2, cell.h + 4 - c.inset * 2, 5).stroke({ color: c.color, width: w });
      c.label.position.set(cell.x + cell.w / 2 + c.dx, cell.y - 3);
    }
    // Lado ya elegido: marco fijo en la casilla de su luchador.
    for (const side of [0, 1] as const) {
      if (this.stages[side] === 'choose' || this.picks[side] < 0) continue;
      const asset = this.game.assets.roster[this.picks[side]];
      const cell = this.cells.find((c) => c.asset === asset);
      if (!cell) continue;
      const inset = side === 0 ? 0 : 2;
      g.roundRect(cell.x - 2 + inset, cell.y - 2 + inset, cell.w + 4 - inset * 2, cell.h + 4 - inset * 2, 5)
        .stroke({ color: side === 0 ? NEON_PINK : NEON_CYAN, width: 2.4 });
    }
    this.readyText.visible = this.ready >= 0;
    if (this.readyText.visible) this.readyText.scale.set(this.ready < 6 ? 1.6 - this.ready * 0.1 : 1);
  }
}
