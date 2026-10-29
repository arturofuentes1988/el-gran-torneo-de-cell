import { BlurFilter, Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import type { FighterAsset } from '../content/mannequin/fighters';
import { P1_KEYS } from '../input/devices';
import { FxLayer } from '../render/fx';
import { textTokens, tokenLine, type Token } from '../render/keycap';
import { C_HEAD, C_NAME, C_SOFT, C_SUPER, C_TEXT, C_ULTRA, MOTION, buttonTokens, cap, capsOf, joint, txt, type Caps } from '../render/moveListPanel';
import { outlinedText, pixelText } from '../render/text';
import type { Btn, FighterDef, MotionId, Stance } from '../sim/types';
import { backdrop } from './backdrop';

// Pantalla PERSONAJES: la lista de movimientos de cada luchador. Al recorrerla,
// el luchador hace en su vitrina el movimiento marcado: la primera vez con sus
// voces, y lo que lanza cruza la vitrina. Después lo repite en silencio.

/** Vitrina (izquierda): ahí el luchador hace el movimiento marcado. */
const SHOW_X = 10;
const SHOW_Y = 38;
const SHOW_W = 184;
const SHOW_H = 210;
const FEET_Y = SHOW_Y + SHOW_H - 50;
const FIGHTER_X = SHOW_X + SHOW_W / 2 - 14;
/** Alto del luchador en la vitrina; los efectos están hechos para uno de ~150 (el de la pelea). */
const FIGHTER_H = 124;
const R = FIGHTER_H / 150;
/** Cuánto se eleva para los golpes en el aire. */
const AIR_LIFT = 28;
/** Columna derecha: la lista de movimientos. */
const COL_X = SHOW_X + SHOW_W + 8;
const COL_W = VIEW_W - COL_X - 10;
const COL_BOTTOM = SHOW_Y + SHOW_H;
const SIZE = 7;
const ROW = 12;
/** Cuadros en guardia entre una repetición del movimiento y la siguiente. */
const PAUSA = 50;
/** Ningún cuadro dura más que esto en la vitrina (las poses finales duran segundos en la pelea). */
const MAX_DUR = 40;

type Cat = 'especial' | 'super' | 'ultra' | 'golpe' | 'mas';

const CAT: Record<Cat, { head: string; tag: string; color: number }> = {
  especial: { head: 'ESPECIALES', tag: 'ESPECIAL', color: C_NAME },
  super: { head: 'SÚPER', tag: 'SÚPER', color: C_SUPER },
  ultra: { head: 'ULTRA', tag: 'ULTRA', color: C_ULTRA },
  golpe: { head: 'GOLPES', tag: 'GOLPE', color: C_HEAD },
  mas: { head: 'MÁS', tag: 'MECÁNICA', color: 0x9af0a0 },
};

/** Un tramo de lo que hace en la vitrina: una animación, su velocidad, si va en el aire y la voz al empezar. */
interface Clip {
  anim: string;
  speed?: number;
  air?: boolean;
  voice?: string;
  /** Secuencia del ultra: sin las voces ni los proyectiles propios de cada golpe (las frases van en fila). */
  quiet?: boolean;
}

/** Un movimiento de la lista. */
interface Entry {
  cat: Cat;
  name: string;
  cmd: Token[];
  /** Detalle corto bajo el comando (ej. "1 BARRA"). */
  note?: string;
  clips: Clip[];
  /** Voz al empezar (si son varias, una al azar: las frases de la pelá). */
  voice?: string | string[];
  fx?: 'super' | 'ultra' | 'power';
}

interface Frame {
  tex: Texture;
  dur: number;
  sfx?: string;
  spawn?: string;
}

/** Proyectil de adorno que cruza la vitrina. */
interface Shot {
  sprite: Sprite;
  frames: Texture[];
  fd: number;
  vx: number;
  t: number;
  glow: number;
  glowSize: number;
}

function entries(def: FighterDef, c: Caps): Entry[] {
  const out: Entry[] = [];
  const has = (anim: string): boolean => !!def.anims[anim]?.frames.length;
  const command = (motion: MotionId | undefined, buttons: Btn[] | undefined): Token[] => [
    ...(motion ? txt(MOTION[motion]) : []),
    ...joint('+'),
    ...buttonTokens(buttons, c),
  ];
  const bars = (n: number | undefined, base: number): string => {
    const b = Math.round((n ?? base) / 100);
    return `${b} BARRA${b > 1 ? 'S' : ''}`;
  };

  // Especiales (débil y fuerte, con el mismo nombre, van juntos), súper y ultra.
  const especiales = new Map<string, { anim: string; motion?: MotionId; buttons: Btn[] }>();
  let sup: Entry | null = null;
  let ult: Entry | null = null;
  for (const id of [...def.specials].reverse()) {
    const mv = def.moves[id];
    if (!mv) continue;
    if (mv.kind === 'super') {
      sup = { cat: 'super', name: mv.name, cmd: command(mv.motion, mv.buttons), note: bars(mv.meterCost, 100), clips: [{ anim: mv.anim }], voice: mv.cinematic?.song, fx: 'super' };
    } else if (mv.kind === 'ultra') {
      const speed = mv.ultra?.speed ?? 1.25;
      ult = {
        cat: 'ultra', name: mv.name, cmd: command(mv.motion, mv.buttons),
        note: `${bars(mv.meterCost, 200)} · RIVAL EN PELIGRO`,
        clips: [{ anim: mv.anim }, ...(mv.ultra?.sequence ?? []).map((st) => ({ anim: st.anim, speed: st.speed ?? speed, voice: st.voice, quiet: true }))],
        fx: 'ultra',
      };
    } else {
      const e = especiales.get(mv.name) ?? { anim: mv.anim, motion: mv.motion, buttons: [] };
      for (const b of mv.buttons ?? []) if (!e.buttons.includes(b)) e.buttons.push(b);
      especiales.set(mv.name, e);
    }
  }
  for (const [name, e] of especiales) out.push({ cat: 'especial', name, cmd: command(e.motion, e.buttons), clips: [{ anim: e.anim }] });
  if (sup) out.push(sup);
  if (ult) out.push(ult);

  // Golpes: de pie, agachado y en el aire.
  const launcher = def.mechanics?.launcher ?? def.normals.crouch.hp;
  const stances: Array<[Stance, (b: Btn) => Token[]]> = [
    ['stand', (b) => [cap(c[b])]],
    ['crouch', (b) => [...txt('↓'), ...joint('+'), cap(c[b])]],
    ['air', (b) => [...txt('EN EL AIRE: ', C_SOFT), cap(c[b])]],
  ];
  for (const [st, keys] of stances) {
    for (const b of ['lp', 'hp', 'lk', 'hk'] as Btn[]) {
      const id = def.normals[st][b];
      const mv = def.moves[id];
      if (!mv || !has(mv.anim)) continue;
      const note = id === launcher ? 'LANZA AL RIVAL · LUEGO ↑ PARA SEGUIR' : undefined;
      out.push({ cat: 'golpe', name: mv.name, cmd: keys(b), note, clips: [{ anim: mv.anim, air: st === 'air' }] });
    }
  }

  // Mecánicas con animación propia.
  const more = (name: string, cmd: Token[], clips: Clip[], extra: Partial<Entry> = {}): void => {
    const ok = clips.filter((cl) => has(cl.anim));
    if (ok.length) out.push({ cat: 'mas', name, cmd, clips: ok, ...extra });
  };
  const tauntVoices = def.taunts.map((t) => (typeof t === 'string' ? undefined : t.voice)).filter((v): v is string => !!v);
  more('Agarre', [...txt('PEGADO: ', C_SOFT), cap(c.lp), ...joint('+'), cap(c.lk)], [{ anim: def.moves[def.throwMove]?.anim ?? 'throwGrab' }, { anim: 'throwToss' }]);
  more('Modo Poder', [cap(c.power), ...joint('O'), cap(c.hp), ...joint('+'), cap(c.hk)], [{ anim: 'powerUp' }], { voice: 'voz/poder', fx: 'power', note: '1 BARRA' });
  more('Pelá', [cap(c.taunt)], [{ anim: 'taunt' }], { voice: tauntVoices, note: 'LE QUITA SÚPER AL RIVAL' });
  more('Rodada', [cap(c.roll), ...joint('O'), cap(c.lp), ...joint('+'), cap(c.lk)], [{ anim: 'roll' }]);
  more('Entrada', txt('AL EMPEZAR LA PELEA', C_SOFT), [{ anim: 'intro' }], { voice: 'voz/intro' });
  more('Victoria', txt('AL GANAR', C_SOFT), [{ anim: 'win' }], { voice: 'voz/victoria' });
  return out;
}

/** Achica un texto o línea para que no pase de `w` de ancho. */
function fitWidth(o: Container, w: number): void {
  o.scale.set(1);
  if (o.width > w) o.scale.set(w / o.width);
}

export class CharactersScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  private header = new Container();
  private show = new Container();
  private showBg = new Graphics();
  private showGlow = new Graphics();
  private fx = new FxLayer();
  private fighter = new Sprite();
  private shots = new Container();
  private caption = new Container();
  private list = new Container();
  private listRows = new Container();
  private listMask = new Graphics();
  private listBar = new Graphics();
  private selBar = new Graphics();
  private index = 0;
  private items: Entry[] = [];
  private sel = 0;
  /** Fila (en la lista) de cada movimiento, y textos de sus nombres. */
  private rowOf: number[] = [];
  private names: Text[] = [];
  private listTop = SHOW_Y;
  private listH = 0;
  private scroll = 0;
  private maxScroll = 0;
  /** Lo que está haciendo: los tramos del movimiento, en cuál va, o la guardia entre repeticiones. */
  private seq: Array<{ frames: Frame[]; clip: Clip }> = [];
  private si = 0;
  private fi = 0;
  private ft = 0;
  private idle: Frame[] = [];
  private resting = 0;
  private loud = true;
  private aura = 0;
  private flying: Shot[] = [];
  private t = 0;
  /** Entrada del luchador al cambiar (se desliza y aparece). */
  private slide = 0;

  constructor(private game: Game, private back: () => Scene) {
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x05020c, alpha: 0.6 });
    const title = outlinedText('PERSONAJES', 12, 0xfff4e0, 0x5a0a10, 3);
    title.position.set(14, 10);
    const help = tokenLine(
      [...textTokens('↑↓ MOVIMIENTO   ←→ PERSONAJE   '), { cap: 'ENTER' }, ...textTokens(' REPETIR   '), { cap: 'ESC' }, ...textTokens(' VOLVER')],
      6,
      0x8ae8ff,
    );
    help.position.set(Math.round(VIEW_W / 2 - help.width / 2), VIEW_H - 16);

    // Vitrina: luz y podio detrás, efectos, el luchador, lo que lanza y el cartel del movimiento.
    const showMask = new Graphics().roundRect(SHOW_X, SHOW_Y, SHOW_W, SHOW_H, 5).fill(0xffffff);
    this.showGlow.blendMode = 'add';
    this.showGlow.filters = [new BlurFilter({ strength: 14, quality: 4 })];
    this.fx.container.scale.set(R);
    this.show.addChild(this.showBg, this.showGlow, this.fx.container, this.fighter, this.shots, this.caption, showMask);
    this.show.mask = showMask;

    this.listRows.mask = this.listMask;
    this.list.addChild(this.selBar, this.listRows, this.listMask, this.listBar);
    this.ui.addChild(bg, title, this.header, this.show, this.list, help);
    this.showFighter();
  }

  /** Todo el plantel (también los que solo pelean en 2 VS 2). */
  private get fighters(): FighterAsset[] {
    return this.game.assets.roster.length ? this.game.assets.roster : this.game.assets.fighters;
  }

  private get def(): FighterDef {
    return this.fighters[this.index].def;
  }

  private frames(anim: string, speed = 1): Frame[] {
    return (this.def.anims[anim]?.frames ?? [])
      .map((fr) => ({ tex: this.game.assets.textures[fr.tex], dur: Math.max(1, Math.round(Math.min(MAX_DUR, fr.dur) / speed)), sfx: fr.sfx, spawn: fr.spawn }))
      .filter((fr) => fr.tex);
  }

  /** Arma todo para el luchador actual: encabezado, vitrina y lista. */
  private showFighter(): void {
    const def = this.def;
    this.game.sfx.silence(def.id);
    this.items = entries(def, capsOf(P1_KEYS));
    this.idle = this.frames('idle');
    this.sel = 0;
    this.scroll = 0;
    this.slide = 1;
    this.buildHeader();
    this.buildShowcase();
    this.buildList();
    this.startMove(true);
  }

  private buildHeader(): void {
    this.header.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    const many = this.fighters.length > 1;
    const name = tokenLine(textTokens(`${many ? '← ' : ''}${this.def.name.toUpperCase()}${many ? ' →' : ''}`, this.def.ui.color), 10);
    name.position.set(VIEW_W - 14 - name.width, 8);
    this.header.addChild(name);
    // Un punto por luchador: el actual, encendido.
    if (many) {
      const dots = new Graphics();
      const n = this.fighters.length;
      const x0 = VIEW_W - 14 - (n - 1) * 8 - 2;
      this.fighters.forEach((f, i) => {
        const on = i === this.index;
        dots.circle(x0 + i * 8, 27, on ? 2.2 : 1.6).fill({ color: on ? f.def.ui.color : 0x6a5a80 });
      });
      this.header.addChild(dots);
    }
  }

  private buildShowcase(): void {
    const def = this.def;
    const col = def.ui.color;
    const fxc = def.ui.fx;
    const cx = FIGHTER_X + 6;
    const g = this.showBg.clear();
    g.roundRect(SHOW_X, SHOW_Y, SHOW_W, SHOW_H, 5).fill({ color: 0x0b0616, alpha: 0.96 });
    // Piso en perspectiva, del color del luchador.
    const horizon = FEET_Y - 26;
    g.rect(SHOW_X, horizon, SHOW_W, SHOW_Y + SHOW_H - horizon).fill({ color: fxc, alpha: 0.06 });
    for (let i = -8; i <= 8; i++) g.moveTo(cx + i * 5, horizon).lineTo(cx + i * 34, SHOW_Y + SHOW_H);
    g.stroke({ color: col, width: 0.5, alpha: 0.18 });
    for (let j = 1; j <= 5; j++) {
      const y = horizon + (SHOW_Y + SHOW_H - horizon) * (j / 5) ** 2;
      g.moveTo(SHOW_X, y).lineTo(SHOW_X + SHOW_W, y);
    }
    g.stroke({ color: col, width: 0.5, alpha: 0.14 });
    // Podio: sombra y anillo de luz bajo los pies.
    g.ellipse(cx, FEET_Y, 50, 8).fill({ color: 0x000000, alpha: 0.55 }).stroke({ color: col, width: 1, alpha: 0.55 });
    g.roundRect(SHOW_X, SHOW_Y, SHOW_W, SHOW_H, 5).stroke({ color: col, width: 1, alpha: 0.7 });
    // Foco de arriba y luz de su color detrás.
    const l = this.showGlow.clear();
    l.poly([cx - 12, SHOW_Y - 4, cx + 12, SHOW_Y - 4, cx + 74, FEET_Y + 6, cx - 74, FEET_Y + 6]).fill({ color: 0xffffff, alpha: 0.07 });
    l.ellipse(cx, FEET_Y - 62, 46, 66).fill({ color: fxc, alpha: 0.32 });
    this.fighter.scale.set((FIGHTER_H * (def.texScale ?? 1)) / 150);
    this.fx.clear();
    for (const s of this.flying) s.sprite.destroy();
    this.flying = [];
  }

  private buildList(): void {
    this.listRows.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    this.list.children.filter((ch) => ch.label === 'frame').forEach((ch) => ch.destroy());
    const top = this.listTop;
    const h = COL_BOTTOM - top;
    const frame = new Graphics();
    frame.label = 'frame';
    frame.roundRect(COL_X, top, COL_W, h, 5).fill({ color: 0x140a24, alpha: 0.94 }).stroke({ color: 0xc89a3a, width: 1 });
    this.list.addChildAt(frame, 0);
    const head = outlinedText('MOVIMIENTOS', 7, C_HEAD, 0x0a0610, 2);
    head.position.set(COL_X + 10, top + 6);
    head.label = 'frame';
    this.list.addChild(head);

    this.listH = h - 22;
    const rowsTop = top + 18;
    this.listMask.clear().rect(COL_X + 2, rowsTop, COL_W - 4, this.listH).fill(0xffffff);
    this.rowOf = [];
    this.names = [];
    let row = 0;
    let last: Cat | null = null;
    this.items.forEach((e, i) => {
      if (e.cat !== last) {
        last = e.cat;
        const c = CAT[e.cat];
        const t = pixelText(c.head, 6, c.color);
        t.position.set(COL_X + 10, rowsTop + row * ROW + 2);
        const line = new Graphics()
          .moveTo(COL_X + 14 + t.width, rowsTop + row * ROW + 5)
          .lineTo(COL_X + COL_W - 12, rowsTop + row * ROW + 5)
          .stroke({ color: c.color, width: 1, alpha: 0.3 });
        this.listRows.addChild(line, t);
        row++;
      }
      const n = outlinedText(e.name.toUpperCase(), SIZE, C_TEXT, 0x0a0610, 1);
      n.position.set(COL_X + 18, rowsTop + row * ROW + 1);
      fitWidth(n, COL_W - 34);
      this.listRows.addChild(n);
      this.names.push(n);
      this.rowOf[i] = row;
      row++;
    });
    this.maxScroll = Math.max(0, row * ROW + 2 - this.listH);
    this.listRows.y = 0;
    this.updateSelection();
  }

  /** Marca la fila elegida y desplaza la lista para que se vea. */
  private updateSelection(): void {
    const rowsTop = this.listTop + 18;
    const y = this.rowOf[this.sel] * ROW;
    if (y - this.scroll < ROW) this.scroll = Math.max(0, y - ROW);
    if (y - this.scroll > this.listH - ROW * 2) this.scroll = Math.min(this.maxScroll, y - this.listH + ROW * 2);
    this.listRows.y = -this.scroll;
    const e = this.items[this.sel];
    const color = CAT[e.cat].color;
    this.names.forEach((n, i) => {
      n.style.fill = i === this.sel ? color : C_TEXT;
    });
    this.selBar.clear();
    const by = rowsTop + y - this.scroll - 1;
    if (by >= rowsTop - 2 && by < rowsTop + this.listH) {
      this.selBar.roundRect(COL_X + 6, by, COL_W - 16, ROW, 2).fill({ color, alpha: 0.16 });
      this.selBar.poly([COL_X + 10, by + 3, COL_X + 14, by + ROW / 2, COL_X + 10, by + ROW - 3]).fill({ color });
    }
    // Barra de desplazamiento.
    this.listBar.clear();
    if (this.maxScroll > 0) {
      const visible = this.listH / (this.listH + this.maxScroll);
      const bh = Math.max(12, this.listH * visible);
      const bt = rowsTop + (this.listH - bh) * (this.scroll / this.maxScroll);
      const bx = COL_X + COL_W - 6;
      this.listBar.roundRect(bx, rowsTop, 2, this.listH, 1).fill({ color: 0xffffff, alpha: 0.08 });
      this.listBar.roundRect(bx, bt, 2, bh, 1).fill({ color: C_HEAD, alpha: 0.7 });
    }
    this.buildCaption();
  }

  /** Cartel de la vitrina: tipo de movimiento arriba; nombre, comando y detalle bajo el luchador. */
  private buildCaption(): void {
    this.caption.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    const e = this.items[this.sel];
    const c = CAT[e.cat];
    const tag = pixelText(c.tag, 6, c.color);
    const pill = new Graphics()
      .roundRect(SHOW_X + 7, SHOW_Y + 7, tag.width + 10, 12, 3)
      .fill({ color: c.color, alpha: 0.16 })
      .stroke({ color: c.color, width: 1, alpha: 0.7 });
    tag.position.set(SHOW_X + 12, SHOW_Y + 10);
    const cx = SHOW_X + SHOW_W / 2;
    const name = outlinedText(e.name.toUpperCase(), 8, c.color, 0x0a0610, 2);
    name.anchor.set(0.5, 0);
    name.position.set(cx, FEET_Y + 11);
    fitWidth(name, SHOW_W - 12);
    const cmd = tokenLine(e.cmd, 7);
    fitWidth(cmd, SHOW_W - 12);
    cmd.position.set(Math.round(cx - cmd.width / 2), FEET_Y + 23);
    this.caption.addChild(pill, tag, name, cmd);
    if (e.note) {
      const note = pixelText(e.note, 6, C_SOFT);
      note.anchor.set(0.5, 0);
      note.position.set(cx, FEET_Y + 39);
      fitWidth(note, SHOW_W - 12);
      this.caption.addChild(note);
    }
  }

  /** Empieza el movimiento marcado (con voces si es la primera vez). */
  private startMove(loud: boolean): void {
    const e = this.items[this.sel];
    this.loud = loud;
    this.seq = e.clips.map((clip) => ({ frames: this.frames(clip.anim, clip.speed), clip })).filter((s) => s.frames.length);
    this.si = 0;
    this.fi = 0;
    this.ft = 0;
    this.resting = 0;
    if (!this.seq.length) return this.rest();
    if (loud) {
      this.game.sfx.silence(this.def.id);
      const v = Array.isArray(e.voice) ? e.voice[Math.floor(Math.random() * e.voice.length)] : e.voice;
      if (v) this.sound(v);
    }
    const fx = (x: number, y: number): [number, number] => [x / R, y / R];
    if (e.fx === 'super' || e.fx === 'ultra') {
      this.fx.superBurst(...fx(FIGHTER_X + 6, FEET_Y - 70), this.def.ui.fx);
    }
    if (e.fx === 'power') this.aura = 60;
    this.enterFrame();
  }

  /** Vuelve a la guardia un momento antes de repetir. */
  private rest(): void {
    this.seq = [];
    this.resting = PAUSA;
    this.fi = 0;
    this.ft = 0;
    if (this.idle.length) this.setTex(this.idle[0].tex, false);
  }

  private setTex(tex: Texture, air: boolean): void {
    this.fighter.texture = tex;
    this.fighter.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
    this.fighter.y = FEET_Y - (air ? AIR_LIFT : 0);
  }

  private enterFrame(): void {
    const { frames, clip } = this.seq[this.si];
    const fr = frames[this.fi];
    this.setTex(fr.tex, !!clip.air);
    if (this.fi === 0 && this.loud && clip.voice) this.sound(clip.voice, true);
    if (fr.spawn && !clip.quiet) this.launch(fr.spawn);
    if (fr.sfx && this.loud && !(clip.quiet && fr.sfx.startsWith('voz/'))) this.sound(fr.sfx);
  }

  /** Sonido del luchador (sus voces van por su canal; las del ultra, en fila) o genérico. */
  private sound(name: string, queue = false): void {
    const sfx = this.game.sfx;
    const id = this.def.id;
    const own = `${id}/${name}`;
    if (!sfx.has(own)) return sfx.play(name);
    if (!name.startsWith('voz/')) return sfx.play(own);
    sfx.play(own, queue ? { channel: id, mode: 'queue', maxWait: 1.5 } : { channel: id });
  }

  /** Lo que lanza cruza la vitrina, a la misma escala que el luchador. */
  private launch(id: string): void {
    const p = this.def.projectiles[id];
    if (!p) return;
    const frames = p.frames.map((f) => this.game.assets.textures[f]).filter((t): t is Texture => !!t);
    if (!frames.length) return;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.scale.set((p.texScale ?? 1) * R);
    sprite.position.set(this.fighter.x + p.offset.x * R, FEET_Y + p.offset.y * R);
    this.shots.addChild(sprite);
    this.flying.push({ sprite, frames, fd: p.frameDur, vx: Math.max(2.5, p.speed * R * 1.2), t: 0, glow: p.glow, glowSize: p.glowSize });
  }

  enter(): void {
    backdrop.attach(this.game);
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    this.game.sfx.silence(this.def.id);
    backdrop.detach(this.game);
    this.game.display.hud.removeChild(this.ui);
    this.ui.destroy({ children: true });
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (m.back) {
      this.game.sfx.play('menuBack');
      this.game.setScene(this.back());
      return;
    }
    if ((m.left || m.right) && this.fighters.length > 1) {
      const n = this.fighters.length;
      this.game.sfx.silence(this.def.id);
      this.index = (this.index + (m.right ? 1 : n - 1)) % n;
      this.game.sfx.play('menuMove');
      this.showFighter();
    } else if (m.up || m.down) {
      const n = this.items.length;
      this.sel = (this.sel + (m.down ? 1 : n - 1)) % n;
      this.game.sfx.play('menuMove');
      this.updateSelection();
      this.startMove(true);
    } else if (m.confirm) {
      this.startMove(true);
    }

    // Avanza la animación: el movimiento por tramos y, al terminar, la guardia antes de repetir.
    if (this.seq.length) {
      const cur = this.seq[this.si];
      if (++this.ft >= cur.frames[this.fi].dur) {
        this.ft = 0;
        if (++this.fi >= cur.frames.length) {
          this.fi = 0;
          if (++this.si >= this.seq.length) {
            if (this.items[this.sel].fx === 'ultra') this.fx.explosion((FIGHTER_X + 46) / R, (FEET_Y - 70) / R, this.def.ui.fx, true);
            this.rest();
          }
        }
        if (this.seq.length) this.enterFrame();
      }
    } else if (this.idle.length) {
      if (++this.ft >= this.idle[this.fi].dur) {
        this.ft = 0;
        this.fi = (this.fi + 1) % this.idle.length;
        this.setTex(this.idle[this.fi].tex, false);
      }
      if (--this.resting <= 0) this.startMove(false);
    }

    if (this.aura > 0) {
      this.aura--;
      this.fx.powerAura(this.fighter.x / R, FEET_Y / R, this.def.ui.fx, this.t);
    }
    for (const s of this.flying) {
      s.t++;
      s.sprite.x += s.vx;
      s.sprite.texture = s.frames[Math.floor(s.t / s.fd) % s.frames.length];
      if (s.t % 2 === 0) this.fx.trail(s.sprite.x / R, s.sprite.y / R, s.glow, s.glowSize);
    }
    this.flying = this.flying.filter((s) => {
      const gone = s.t > 90 || s.sprite.x > SHOW_X + SHOW_W + 60;
      if (gone) s.sprite.destroy();
      return !gone;
    });
    this.fx.step();
    // Al cambiar de luchador, entra deslizándose.
    this.slide *= 0.82;
    this.fighter.x = FIGHTER_X - this.slide * 40;
    this.fighter.alpha = 1 - this.slide;
  }

  render(): void {
    backdrop.render();
    this.fx.sync();
  }
}
