// Pantalla "ELIGE LUCHADOR" del 1 VS 1. Arriba, cada lado muestra en grande al
// luchador marcado (mirando al centro); abajo, las tarjetas del plantel y ALEATORIO.
// 1 JUGADOR y PRÁCTICA: el jugador 1 elige el suyo y después el rival (CPU o muñeco).
// 2 JUGADORES: cada uno elige con su cursor al mismo tiempo. Después: ELIGE ESCENARIO.

import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { FightMode, Game, Scene } from '../app/game';
import type { FighterAsset } from '../content/mannequin/fighters';
import { P1_KEYS, P2_KEYS } from '../input/devices';
import { NEON_CYAN, NEON_PINK } from '../render/live';
import { arcade, outlinedText } from '../render/text';
import { FightScene } from './fight';
import { ModeSelectScene } from './modeSelect';
import { StageSelectScene } from './stageSelect';
import { fitScale } from '../render/fit';
import { backdrop } from './backdrop';

const CARD_W = 60;
const CARD_H = 70;
const CARD_GAP = 8;
const CARD_Y = 178;
/** Alto de los luchadores en las vistas grandes (unidades). */
const BIG_FIGHTER_H = 104;
/** Pies de las vistas grandes y su distancia al borde. */
const BIG_Y = 144;
const BIG_X = 100;
/** Cuadros que se ve "¡LISTOS!" antes de pasar a elegir escenario. */
const READY_FRAMES = 36;

type Mode = Exclude<FightMode, 'demo'>;

interface Keys {
  left: string[];
  right: string[];
  ok: string[];
  back: string[];
}

/** Teclas de menú de cada jugador, según sus controles (se cambian en CONTROLES). */
function p1Menu(): Keys {
  return {
    left: ['ArrowLeft', ...P1_KEYS.left], right: ['ArrowRight', ...P1_KEYS.right],
    ok: [...P1_KEYS.lp, 'Enter', 'Space'], back: ['Escape', 'Backspace'],
  };
}
function p2Menu(): Keys {
  return { left: [...P2_KEYS.left], right: [...P2_KEYS.right], ok: [...P2_KEYS.lp, 'NumpadEnter'], back: [...P2_KEYS.hp] };
}

/** Una mano en el menú: teclas propias y su joystick. */
class MenuHand {
  left = false;
  right = false;
  ok = false;
  back = false;
  private prevL = false;
  private prevR = false;

  constructor(private game: Game, private keys: Keys, private pad: number) {}

  sample(): void {
    const kb = this.game.kb;
    const pads = this.game.pads;
    const p = pads.get(this.pad);
    const l = this.keys.left.some((k) => kb.held(k)) || !!p?.left;
    const r = this.keys.right.some((k) => kb.held(k)) || !!p?.right;
    this.left = l && !this.prevL;
    this.right = r && !this.prevR;
    this.prevL = l;
    this.prevR = r;
    this.ok = this.keys.ok.some((k) => kb.hit(k)) || pads.pressed(this.pad, 0);
    this.back = this.keys.back.some((k) => kb.hit(k)) || pads.pressed(this.pad, 1);
  }
}

type Frames = Array<{ tex: Texture; dur: number }>;

interface Card {
  /** null: ALEATORIO. */
  asset: FighterAsset | null;
  x: number;
  sprite: Sprite | null;
  frames: Frames;
  fi: number;
  ft: number;
}

/** Vista grande de un lado: el luchador marcado (o elegido) en grande, con su nombre. */
interface Big {
  sprite: Sprite;
  question: Text;
  name: Text;
  label: Text;
  frames: Frames;
  fi: number;
  ft: number;
  /** Índice de tarjeta que se está mostrando. */
  shown: number;
}

function idleFrames(game: Game, a: FighterAsset): Frames {
  return (a.def.anims.idle?.frames ?? []).map((fr) => ({ tex: game.assets.textures[fr.tex], dur: fr.dur })).filter((fr) => fr.tex);
}

function setTex(s: Sprite, tex: Texture): void {
  s.texture = tex;
  s.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
}

export class CharacterSelectScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  private cards: Card[] = [];
  /** Tarjeta elegida por cada lado (-1: todavía no). Se resuelve ALEATORIO al empezar la pelea. */
  private picks: [number, number] = [-1, -1];
  private pos: [number, number];
  private hands: [MenuHand, MenuHand];
  private frames = new Graphics();
  private cursorLabels: [Text, Text];
  private bigs: [Big, Big];
  private hint: Text;
  private readyText: Text;
  private ready = -1;
  private t = 0;

  constructor(private game: Game, private mode: Mode) {
    this.hands = [new MenuHand(game, p1Menu(), 0), new MenuHand(game, p2Menu(), 1)];
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.55 });
    const title = outlinedText('ELIGE LUCHADOR', 14, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 18);
    const vs = outlinedText('VS', 24, 0xffd040, 0x5a0a10, 4);
    vs.anchor.set(0.5);
    vs.position.set(VIEW_W / 2, 92);
    this.ui.addChild(bg, title, vs);

    // Vistas grandes: J1 a la izquierda, CPU / J2 / MUÑECO a la derecha.
    const rival = mode === '2p' ? 'J2' : mode === 'practica' ? 'MUÑECO' : 'CPU';
    const makeBig = (side: 0 | 1): Big => {
      const x = side === 0 ? BIG_X : VIEW_W - BIG_X;
      const color = side === 0 ? NEON_PINK : NEON_CYAN;
      const glow = new Graphics().ellipse(x, BIG_Y, 46, 9).fill({ color, alpha: 0.28 });
      const sprite = new Sprite();
      sprite.position.set(x, BIG_Y);
      const question = outlinedText('?', 48, 0xffd040, 0x5a0a10, 4);
      question.anchor.set(0.5);
      question.position.set(x, BIG_Y - 56);
      question.visible = false;
      const plate = new Graphics().roundRect(x - 62, BIG_Y + 4, 124, 16, 3).fill({ color: 0x140a24, alpha: 0.86 }).stroke({ color, width: 1 });
      const name = outlinedText('', 8, 0xffffff, 0x0a0610, 2);
      name.anchor.set(0.5);
      name.position.set(x, BIG_Y + 12);
      // Quién elige este lado, en la esquina de arriba (lejos del luchador).
      const label = outlinedText(side === 0 ? 'J1' : rival, 10, color, 0x0a0610, 2);
      label.anchor.set(side === 0 ? 0 : 1, 0.5);
      label.position.set(side === 0 ? 14 : VIEW_W - 14, 18);
      this.ui.addChild(glow, sprite, question, plate, name, label);
      return { sprite, question, name, label, frames: [], fi: 0, ft: 0, shown: -1 };
    };
    this.bigs = [makeBig(0), makeBig(1)];

    // Tarjetas: el plantel y ALEATORIO.
    const roster = game.assets.roster;
    const n = roster.length + 1;
    const x0 = Math.round((VIEW_W - (n * CARD_W + (n - 1) * CARD_GAP)) / 2);
    for (let i = 0; i < n; i++) {
      const asset = roster[i] ?? null;
      const x = x0 + i * (CARD_W + CARD_GAP);
      const c = new Container();
      const g = new Graphics();
      g.roundRect(x, CARD_Y, CARD_W, CARD_H, 4).fill({ color: 0x140a24, alpha: 0.86 }).stroke({ color: 0xc89a3a, width: 1 });
      c.addChild(g);
      let sprite: Sprite | null = null;
      const frames = asset ? idleFrames(game, asset) : [];
      if (asset && frames.length) {
        sprite = new Sprite();
        setTex(sprite, frames[0].tex);
        // Se ajusta al alto real de sus cuadros (pies a 11 del borde de abajo, cabeza bajo el de arriba).
        sprite.scale.set(fitScale(frames, CARD_H - 11 - 4, CARD_W - 6));
        sprite.position.set(x + CARD_W / 2, CARD_Y + CARD_H - 11);
        const mask = new Graphics().roundRect(x + 1, CARD_Y + 1, CARD_W - 2, CARD_H - 2, 4).fill(0xffffff);
        sprite.mask = mask;
        c.addChild(sprite, mask);
      }
      if (!asset) {
        const q = outlinedText('?', 24, 0xffd040, 0x5a0a10, 3);
        q.anchor.set(0.5);
        q.position.set(x + CARD_W / 2, CARD_Y + CARD_H / 2 - 5);
        c.addChild(q);
      }
      const name = outlinedText(asset ? asset.def.name.toUpperCase() : 'ALEATORIO', 5, 0xffffff, 0x0a0610, 1);
      name.anchor.set(0.5, 0);
      name.position.set(x + CARD_W / 2, CARD_Y + CARD_H - 9);
      // Los nombres largos se achican para caber en la tarjeta.
      if (name.width > CARD_W - 4) name.scale.set((CARD_W - 4) / name.width);
      c.addChild(name);
      this.ui.addChild(c);
      this.cards.push({ asset, x, sprite, frames, fi: 0, ft: 0 });
    }
    // Cada cursor parte en un luchador distinto (si hay más de uno).
    this.pos = [0, Math.min(1, roster.length - 1)];

    this.cursorLabels = [outlinedText('J1', 7, NEON_PINK, 0x0a0610, 2), outlinedText(rival, 7, NEON_CYAN, 0x0a0610, 2)];
    for (const l of this.cursorLabels) l.anchor.set(0.5, 1);
    this.hint = outlinedText('', 6, 0xd8d0e8, 0x0a0610, 1);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(VIEW_W / 2, CARD_Y + CARD_H + 7);
    this.readyText = outlinedText('¡LISTOS!', 24, 0xffd040, 0x5a0a10, 4);
    this.readyText.anchor.set(0.5);
    this.readyText.position.set(VIEW_W / 2, 132);
    this.readyText.visible = false;
    this.ui.addChild(this.frames, ...this.cursorLabels, this.hint, this.readyText);
    this.refreshHint();
  }

  /** Lado que elige el jugador 1: el suyo y, sin jugador 2, después el del rival. */
  private p1Side(): 0 | 1 | null {
    if (this.picks[0] < 0) return 0;
    if (this.mode !== '2p' && this.picks[1] < 0) return 1;
    return null;
  }

  private refreshHint(): void {
    const side = this.p1Side();
    const rival = this.mode === 'practica' ? 'EL MUÑECO' : 'TU RIVAL';
    this.hint.text = arcade(
      this.mode === '2p'
        ? 'CADA JUGADOR ELIGE CON SU CURSOR · ESC VUELVE'
        : side === 1
          ? `AHORA ELIGE A ${rival} · ESC VUELVE`
          : 'ELIGE TU LUCHADOR · ESC VUELVE',
    );
  }

  /** La vista grande de un lado muestra la tarjeta elegida o, si no, la marcada por su cursor. */
  private updateBig(side: 0 | 1, card: number): void {
    const b = this.bigs[side];
    if (b.shown === card) return;
    b.shown = card;
    const asset = this.cards[card].asset;
    b.question.visible = !asset;
    b.sprite.visible = !!asset;
    b.name.text = arcade(asset ? asset.def.name.toUpperCase() : 'ALEATORIO');
    b.frames = asset ? idleFrames(this.game, asset) : [];
    b.fi = 0;
    b.ft = 0;
    if (!asset || !b.frames.length) return;
    setTex(b.sprite, b.frames[0].tex);
    const k = (BIG_FIGHTER_H * (asset.def.texScale ?? 1)) / 150;
    // Los dos miran al centro.
    b.sprite.scale.set(side === 0 ? k : -k, k);
  }

  private pick(side: 0 | 1, card: number): void {
    this.picks[side] = card;
    this.game.sfx.play('menuConfirm');
    this.refreshHint();
    if (this.picks[0] >= 0 && this.picks[1] >= 0) this.ready = 0;
  }

  enter(): void {
    const d = this.game.display;
    backdrop.attach(this.game);
    d.hud.addChild(this.ui);
  }

  exit(): void {
    const d = this.game.display;
    backdrop.detach(this.game);
    d.hud.removeChild(this.ui);
    this.ui.destroy({ children: true });
  }

  step(): void {
    this.t++;
    const anim = (o: { sprite: Sprite | null; frames: Frames; fi: number; ft: number }): void => {
      if (!o.sprite || !o.frames.length) return;
      if (++o.ft >= o.frames[o.fi].dur) {
        o.ft = 0;
        o.fi = (o.fi + 1) % o.frames.length;
        setTex(o.sprite, o.frames[o.fi].tex);
      }
    };
    for (const c of this.cards) anim(c);
    for (const b of this.bigs) anim(b);
    if (this.ready >= 0) {
      if (++this.ready >= READY_FRAMES) this.startFight();
      return;
    }
    const [h1, h2] = this.hands;
    h1.sample();
    h2.sample();
    const n = this.cards.length;
    const sfx = this.game.sfx;

    // Jugador 1 (y, sin jugador 2, también el rival).
    const s1 = this.p1Side();
    if (s1 !== null && (h1.left || h1.right)) {
      this.pos[s1] = (this.pos[s1] + (h1.left ? n - 1 : 1)) % n;
      sfx.play('menuMove');
    }
    if (h1.ok && s1 !== null) this.pick(s1, this.pos[s1]);
    else if (h1.back) {
      // Borra la última elección; sin nada elegido vuelve al menú.
      sfx.play('menuBack');
      if (this.mode !== '2p' && this.picks[1] >= 0) this.picks[1] = -1;
      else if (this.picks[0] >= 0) this.picks[0] = -1;
      else {
        this.game.setScene(new ModeSelectScene(this.game));
        return;
      }
      this.refreshHint();
    }

    // Jugador 2 (2 JUGADORES).
    if (this.mode === '2p' && this.ready < 0) {
      if (this.picks[1] < 0 && (h2.left || h2.right)) {
        this.pos[1] = (this.pos[1] + (h2.left ? n - 1 : 1)) % n;
        sfx.play('menuMove');
      }
      if (h2.ok && this.picks[1] < 0) this.pick(1, this.pos[1]);
      else if (h2.back && this.picks[1] >= 0) {
        sfx.play('menuBack');
        this.picks[1] = -1;
      }
    }
  }

  private startFight(): void {
    const g = this.game;
    const roster = g.assets.roster;
    // ALEATORIO se resuelve recién ahora.
    const idx = (card: number): number => {
      const a = this.cards[card].asset;
      return a ? roster.indexOf(a) : Math.floor(Math.random() * roster.length);
    };
    const fighters: [number, number] = [idx(this.picks[0]), idx(this.picks[1])];
    const mode = this.mode;
    g.setScene(new StageSelectScene(g, () => new FightScene(g, mode, undefined, { fighters }), () => new CharacterSelectScene(g, mode)));
  }

  render(): void {
    backdrop.render();
    for (const side of [0, 1] as const) this.updateBig(side, this.picks[side] >= 0 ? this.picks[side] : this.pos[side]);
    const g = this.frames;
    g.clear();
    const blink = Math.floor(this.t / 12) % 2 === 0;
    const s1 = this.p1Side();
    // Cursor rosado del jugador 1 y cian del rival / jugador 2 (en 1 JUGADOR el rival lo mueve el jugador 1).
    const cursors = [
      { on: this.ready < 0 && this.picks[0] < 0, pos: this.pos[0], color: NEON_PINK, inset: 0, label: this.cursorLabels[0], dx: 0 },
      {
        on: this.ready < 0 && this.picks[1] < 0 && (this.mode === '2p' || s1 === 1),
        pos: this.pos[1], color: NEON_CYAN, inset: 3, label: this.cursorLabels[1], dx: 0,
      },
    ];
    if (cursors[0].on && cursors[1].on && cursors[0].pos === cursors[1].pos) {
      cursors[0].dx = -12;
      cursors[1].dx = 12;
    }
    for (const c of cursors) {
      c.label.visible = c.on;
      if (!c.on) continue;
      const x = this.cards[c.pos].x;
      const w = blink ? 2 : 1.5;
      g.roundRect(x - 3 + c.inset, CARD_Y - 3 + c.inset, CARD_W + 6 - c.inset * 2, CARD_H + 6 - c.inset * 2, 5).stroke({ color: c.color, width: w });
      c.label.position.set(x + CARD_W / 2 + c.dx, CARD_Y - 5);
    }
    // Lado ya elegido: marco fijo en su tarjeta y la vista grande a todo color (sin elegir, un poco apagada).
    for (const side of [0, 1] as const) {
      const p = this.picks[side];
      this.bigs[side].sprite.tint = p >= 0 ? 0xffffff : 0xb8b0cc;
      if (p < 0) continue;
      const x = this.cards[p].x;
      const inset = side === 0 ? 0 : 3;
      g.roundRect(x - 3 + inset, CARD_Y - 3 + inset, CARD_W + 6 - inset * 2, CARD_H + 6 - inset * 2, 5)
        .stroke({ color: side === 0 ? NEON_PINK : NEON_CYAN, width: 2.5 });
    }
    this.readyText.visible = this.ready >= 0;
    if (this.readyText.visible) this.readyText.scale.set(this.ready < 6 ? 1.6 - this.ready * 0.1 : 1);
  }
}
