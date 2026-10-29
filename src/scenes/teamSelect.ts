// Pantalla "ARMA TU EQUIPO" del 2 VS 2: cada lado elige dos luchadores del
// plantel (se pueden repetir). El lado derecho es la CPU, salvo que el jugador
// 2 apriete un botón para unirse y elija él. Después: ELIGE ESCENARIO y pelea.

import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { VIEW_W } from '../config';
import type { FightMode, Game, Scene } from '../app/game';
import type { FighterAsset } from '../content/mannequin/fighters';
import { P1_KEYS, P2_KEYS } from '../input/devices';
import { NEON_CYAN, NEON_PINK } from '../render/live';
import { arcade, outlinedText } from '../render/text';
import { FightScene } from './fight';
import { CasualMenuScene } from './modeSelect';
import { StageSelectScene } from './stageSelect';
import { fitScale } from '../render/fit';
import { backdrop } from './backdrop';

const CARD_W = 84;
const CARD_H = 100;
const CARD_GAP = 10;
const CARD_Y = 52;
/** Alto de los luchadores en los cupos del equipo (unidades). */
const SLOT_FIGHTER_H = 50;
const BOX_Y = 176;
const BOX_W = 176;
const BOX_H = 62;
const TEAM_SIZE = 2;
/** Cuadros que se ve "¡LISTOS!" antes de pasar a elegir escenario. */
const READY_FRAMES = 36;

interface Keys {
  left: string[];
  right: string[];
  ok: string[];
  back: string[];
  /** Teclas que unen al jugador 2 (cualquiera suya). */
  join: string[];
}

/** Teclas de menú de cada jugador, según sus controles (se cambian en CONTROLES). */
function p1Menu(): Keys {
  return {
    left: ['ArrowLeft', ...P1_KEYS.left], right: ['ArrowRight', ...P1_KEYS.right],
    ok: [...P1_KEYS.lp, 'Enter', 'Space'], back: ['Escape', 'Backspace'], join: [],
  };
}
function p2Menu(): Keys {
  return {
    left: [...P2_KEYS.left], right: [...P2_KEYS.right], ok: [...P2_KEYS.lp, 'NumpadEnter'], back: [...P2_KEYS.hp],
    join: [...P2_KEYS.lk, ...P2_KEYS.hk, ...P2_KEYS.up, ...P2_KEYS.down],
  };
}

/** Una mano en el menú: teclas propias y su joystick (los menús normales mezclan a los dos jugadores). */
class MenuHand {
  left = false;
  right = false;
  ok = false;
  back = false;
  /** Apretó cualquier tecla o botón suyo (para unirse). */
  any = false;
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
    this.any = this.ok || this.back || this.left || this.right || this.keys.join.some((k) => kb.hit(k)) || pads.pressed(this.pad, 2) || pads.pressed(this.pad, 3);
  }
}

interface Card {
  /** null: ALEATORIO. */
  asset: FighterAsset | null;
  x: number;
  sprite: Sprite | null;
  frames: Array<{ tex: Texture; dur: number }>;
  fi: number;
  ft: number;
}

interface Slot {
  sprite: Sprite;
  name: Text;
  empty: Text;
}

function idleFrames(game: Game, a: FighterAsset): Array<{ tex: Texture; dur: number }> {
  return (a.def.anims.idle?.frames ?? []).map((fr) => ({ tex: game.assets.textures[fr.tex], dur: fr.dur })).filter((fr) => fr.tex);
}

function setTex(s: Sprite, tex: Texture): void {
  s.texture = tex;
  s.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
}

export class TeamSelectScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  private cards: Card[] = [];
  /** Índices del plantel elegidos por cada equipo. */
  private picks: [number[], number[]] = [[], []];
  /** ¿El jugador 2 se unió? (si no, el equipo de la derecha es la CPU y lo arma el jugador 1). */
  private joined = false;
  private pos: [number, number] = [0, 0];
  private hands: [MenuHand, MenuHand];
  private frames = new Graphics();
  private labels: [Text, Text];
  private slots: [Slot[], Slot[]] = [[], []];
  private teamTitles: [Text, Text];
  private hint: Text;
  private readyText: Text;
  private ready = -1;
  private t = 0;

  constructor(private game: Game) {
    this.hands = [new MenuHand(game, p1Menu(), 0), new MenuHand(game, p2Menu(), 1)];
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, 270).fill({ color: 0x0a0414, alpha: 0.55 });
    const title = outlinedText('ARMA TU EQUIPO', 14, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 18);
    this.ui.addChild(bg, title);

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
        // Se ajusta al alto real de sus cuadros (pies a 13 del borde de abajo, cabeza bajo el de arriba).
        sprite.scale.set(fitScale(frames, CARD_H - 13 - 4, CARD_W - 6));
        sprite.position.set(x + CARD_W / 2, CARD_Y + CARD_H - 13);
        const mask = new Graphics().roundRect(x + 1, CARD_Y + 1, CARD_W - 2, CARD_H - 2, 4).fill(0xffffff);
        sprite.mask = mask;
        c.addChild(sprite, mask);
      }
      if (!asset) {
        const q = outlinedText('?', 32, 0xffd040, 0x5a0a10, 3);
        q.anchor.set(0.5);
        q.position.set(x + CARD_W / 2, CARD_Y + CARD_H / 2 - 6);
        c.addChild(q);
      }
      const name = outlinedText(asset ? asset.def.name.toUpperCase() : 'ALEATORIO', 6, 0xffffff, 0x0a0610, 1);
      name.anchor.set(0.5, 0);
      name.position.set(x + CARD_W / 2, CARD_Y + CARD_H - 10);
      c.addChild(name);
      this.ui.addChild(c);
      this.cards.push({ asset, x, sprite, frames, fi: 0, ft: 0 });
    }

    // Cupos de cada equipo, abajo: J1 a la izquierda, CPU / J2 a la derecha (mirando al centro).
    this.teamTitles = [outlinedText('J1', 8, NEON_PINK, 0x0a0610, 2), outlinedText('CPU', 8, NEON_CYAN, 0x0a0610, 2)];
    for (const side of [0, 1] as const) {
      const bx = side === 0 ? VIEW_W / 2 - 10 - BOX_W : VIEW_W / 2 + 10;
      const g = new Graphics();
      g.roundRect(bx, BOX_Y, BOX_W, BOX_H, 4).fill({ color: 0x140a24, alpha: 0.86 }).stroke({ color: side === 0 ? NEON_PINK : NEON_CYAN, width: 1 });
      this.ui.addChild(g);
      const tt = this.teamTitles[side];
      tt.position.set(bx + 4, BOX_Y - 11);
      this.ui.addChild(tt);
      for (let k = 0; k < TEAM_SIZE; k++) {
        const sx = bx + BOX_W / 4 + (k * BOX_W) / 2;
        const sprite = new Sprite();
        sprite.position.set(sx, BOX_Y + BOX_H - 12);
        sprite.visible = false;
        const mask = new Graphics().rect(sx - BOX_W / 4 + 2, BOX_Y + 2, BOX_W / 2 - 4, BOX_H - 4).fill(0xffffff);
        sprite.mask = mask;
        const name = outlinedText('', 6, 0xffffff, 0x0a0610, 1);
        name.anchor.set(0.5, 0);
        name.position.set(sx, BOX_Y + BOX_H - 10);
        const empty = outlinedText(String(k + 1), 16, 0x4a3a5a, 0x0a0610, 2);
        empty.anchor.set(0.5);
        empty.position.set(sx, BOX_Y + BOX_H / 2 - 4);
        this.ui.addChild(sprite, mask, name, empty);
        this.slots[side].push({ sprite, name, empty });
      }
    }

    this.labels = [outlinedText('J1', 8, NEON_PINK, 0x0a0610, 2), outlinedText('CPU', 8, NEON_CYAN, 0x0a0610, 2)];
    for (const l of this.labels) l.anchor.set(0.5, 1);
    this.hint = outlinedText('J2: APRIETA UN BOTÓN PARA UNIRTE', 6, NEON_CYAN, 0x0a0610, 1);
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(VIEW_W / 2 + 10 + BOX_W / 2, BOX_Y + BOX_H + 6);
    this.readyText = outlinedText('¡LISTOS!', 24, 0xffd040, 0x5a0a10, 4);
    this.readyText.anchor.set(0.5);
    this.readyText.position.set(VIEW_W / 2, CARD_Y + CARD_H / 2);
    this.readyText.visible = false;
    this.ui.addChild(this.frames, ...this.labels, this.hint, this.readyText);
    this.refreshSlots();
  }

  /** Equipo que arma el jugador 1: el suyo y, sin jugador 2, después el de la CPU. */
  private p1Team(): 0 | 1 | null {
    if (this.picks[0].length < TEAM_SIZE) return 0;
    if (!this.joined && this.picks[1].length < TEAM_SIZE) return 1;
    return null;
  }

  private refreshSlots(): void {
    const roster = this.game.assets.roster;
    for (const side of [0, 1] as const) {
      this.slots[side].forEach((slot, k) => {
        const idx = this.picks[side][k];
        const a = idx !== undefined ? roster[idx] : undefined;
        slot.empty.visible = !a;
        slot.sprite.visible = !!a;
        slot.name.text = a ? arcade(a.def.name.toUpperCase()) : '';
        if (!a) return;
        const fr = idleFrames(this.game, a)[0];
        if (fr) setTex(slot.sprite, fr.tex);
        const s = (SLOT_FIGHTER_H * (a.def.texScale ?? 1)) / 150;
        // Los dos equipos se miran.
        slot.sprite.scale.set(side === 0 ? s : -s, s);
      });
    }
    this.teamTitles[1].text = this.joined ? 'J2' : 'CPU';
    this.hint.visible = !this.joined;
  }

  private pick(side: 0 | 1, card: number): void {
    const roster = this.game.assets.roster;
    const c = this.cards[card];
    const idx = c.asset ? roster.indexOf(c.asset) : Math.floor(Math.random() * roster.length);
    this.picks[side].push(idx);
    this.game.sfx.play('menuConfirm');
    this.refreshSlots();
    if (this.picks[0].length === TEAM_SIZE && this.picks[1].length === TEAM_SIZE) this.ready = 0;
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
    for (const c of this.cards) {
      if (!c.sprite || !c.frames.length) continue;
      if (++c.ft >= c.frames[c.fi].dur) {
        c.ft = 0;
        c.fi = (c.fi + 1) % c.frames.length;
        setTex(c.sprite, c.frames[c.fi].tex);
      }
    }
    if (this.ready >= 0) {
      if (++this.ready >= READY_FRAMES) this.startFight();
      return;
    }
    const [h1, h2] = this.hands;
    h1.sample();
    h2.sample();
    const n = this.cards.length;
    const sfx = this.game.sfx;

    // El jugador 2 se une con cualquier botón suyo (lo que la CPU tenía elegido se borra).
    if (!this.joined && h2.any) {
      this.joined = true;
      this.picks[1] = [];
      this.pos[1] = Math.min(n - 1, 1);
      sfx.play('menuConfirm');
      this.refreshSlots();
      return;
    }

    // Jugador 1.
    const t1 = this.p1Team();
    if (h1.left || h1.right) {
      this.pos[0] = (this.pos[0] + (h1.left ? n - 1 : 1)) % n;
      sfx.play('menuMove');
    }
    if (h1.ok && t1 !== null) this.pick(t1, this.pos[0]);
    else if (h1.back) {
      // Borra la última elección; sin nada elegido vuelve al menú.
      sfx.play('menuBack');
      if (!this.joined && this.picks[1].length) this.picks[1].pop();
      else if (this.picks[0].length) this.picks[0].pop();
      else {
        this.game.setScene(new CasualMenuScene(this.game));
        return;
      }
      this.refreshSlots();
    }

    // Jugador 2 (si se unió).
    if (this.joined && this.ready < 0) {
      if (h2.left || h2.right) {
        this.pos[1] = (this.pos[1] + (h2.left ? n - 1 : 1)) % n;
        sfx.play('menuMove');
      }
      if (h2.ok && this.picks[1].length < TEAM_SIZE) this.pick(1, this.pos[1]);
      else if (h2.back) {
        sfx.play('menuBack');
        // Sin nada elegido, se va y vuelve la CPU.
        if (this.picks[1].length) this.picks[1].pop();
        else this.joined = false;
        this.refreshSlots();
      }
    }
  }

  private startFight(): void {
    const g = this.game;
    const teams: [number[], number[]] = [[...this.picks[0]], [...this.picks[1]]];
    const mode: FightMode = this.joined ? '2p' : 'cpu';
    g.setScene(new StageSelectScene(g, () => new FightScene(g, mode, undefined, { teams }), () => new TeamSelectScene(g)));
  }

  render(): void {
    backdrop.render();
    const g = this.frames;
    g.clear();
    const blink = Math.floor(this.t / 12) % 2 === 0;
    const t1 = this.p1Team();
    // Cursor del jugador 1 (rosado; dice CPU cuando arma el equipo de la CPU) y del 2 (cian).
    const cursors: Array<{ on: boolean; pos: number; color: number; inset: number; label: Text; text: string; dx: number }> = [
      { on: t1 !== null && this.ready < 0, pos: this.pos[0], color: t1 === 1 ? NEON_CYAN : NEON_PINK, inset: 0, label: this.labels[0], text: t1 === 1 ? 'CPU' : 'J1', dx: 0 },
      { on: this.joined && this.picks[1].length < TEAM_SIZE && this.ready < 0, pos: this.pos[1], color: NEON_CYAN, inset: 3, label: this.labels[1], text: 'J2', dx: 0 },
    ];
    if (cursors[0].on && cursors[1].on && cursors[0].pos === cursors[1].pos) {
      cursors[0].dx = -14;
      cursors[1].dx = 14;
    }
    for (const c of cursors) {
      c.label.visible = c.on;
      if (!c.on) continue;
      const x = this.cards[c.pos].x;
      const w = blink ? 2 : 1.5;
      g.roundRect(x - 3 + c.inset, CARD_Y - 3 + c.inset, CARD_W + 6 - c.inset * 2, CARD_H + 6 - c.inset * 2, 5).stroke({ color: c.color, width: w });
      if (c.label.text !== c.text) c.label.text = c.text;
      c.label.style.fill = c.color;
      c.label.position.set(x + CARD_W / 2 + c.dx, CARD_Y - 5);
    }
    this.readyText.visible = this.ready >= 0;
    if (this.readyText.visible) this.readyText.scale.set(this.ready < 6 ? 1.6 - this.ready * 0.1 : 1);
  }
}
