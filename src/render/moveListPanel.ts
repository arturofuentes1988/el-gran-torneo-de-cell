// Panel "MOVIMIENTOS": golpes, especiales, súper, mecánicas y combos de cada
// luchador, armado desde sus datos (FighterDef). Lo usan la pantalla del menú
// y la pausa. Los botones se muestran como las teclas que el jugador tiene
// configuradas (CONTROLES), nunca con abreviaturas.

import { BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Assets } from '../app/game';
import type { FighterAsset } from '../content/mannequin/fighters';
import { P1_KEYS, P2_KEYS, keyLabel, type Keyboard, type KeyBindings, type MenuInput } from '../input/devices';
import type { Btn, FighterDef, MotionId } from '../sim/types';
import { VIEW_H, VIEW_W } from '../config';
import { capHeight, textTokens, tokenLine, type Token } from './keycap';
import { outlinedText } from './text';

const SIZE = 7;
const ROW = capHeight(SIZE) + 3;
/** Zona desplazable (a la derecha de la tarjeta del luchador). */
const AREA_X = 138;
const AREA_W = VIEW_W - AREA_X - 18;
const AREA_TOP = 44;
const AREA_BOTTOM = VIEW_H - 24;
const CARD_X = 14;
const CARD_W = AREA_X - CARD_X - 10;

export const MOTION: Record<MotionId, string> = {
  qcf: '↓↘→', qcb: '↓↙←', dp: '→↓↘', qcf2: '↓↘→↓↘→', charge: '← (CARGA) →', ff: '→→', bf: '←→', fbf: '→←→',
  mash: 'MACHACA', hold: 'MANTÉN Y SUELTA', chargeSuper: '← (CARGA) →←→',
};

export const C_HEAD = 0xffd040;
export const C_TEXT = 0xe8e0f0;
export const C_NAME = 0x8ae8ff;
export const C_SUPER = 0xff8af0;
export const C_SOFT = 0xa898bc;
export const C_ULTRA = 0xff6a3a;

/** Teclas del jugador que se muestran: nombre de la primera tecla de cada acción. */
export type Caps = Record<keyof KeyBindings, string>;

export function capsOf(keys: KeyBindings): Caps {
  const out = {} as Caps;
  for (const k of Object.keys(keys) as Array<keyof KeyBindings>) out[k] = keyLabel(keys[k][0]);
  return out;
}

export const cap = (label: string): Token => ({ cap: label });
export const txt = (text: string, color?: number): Token[] => textTokens(text, color);
/** Palabra corta entre teclas ("O", "+", ">"), con poco aire a los lados. */
export const joint = (t: string): Token[] => [{ gap: 2 }, { text: t, color: C_SOFT }, { gap: 4 }];
const sep = joint('>');

/** Botones de un especial: una tecla, o "A O S" si sirve cualquier golpe (cambia la fuerza). */
export function buttonTokens(buttons: Btn[] | undefined, c: Caps): Token[] {
  const bs = buttons?.length ? buttons : (['lp', 'hp'] as Btn[]);
  const out: Token[] = [];
  const allPunch = bs.every((b) => b === 'lp' || b === 'hp');
  const allKick = bs.every((b) => b === 'lk' || b === 'hk');
  bs.forEach((b, i) => {
    if (i > 0) out.push(...joint(allPunch || allKick ? 'O' : '+'));
    out.push(cap(c[b]));
  });
  return out;
}

/** Pasos de un combo sugerido: GD/GF/PD/PF/GOLPE/PATADA se cambian por las teclas. */
function stepTokens(steps: string, c: Caps): Token[] {
  const out: Token[] = [];
  steps.toUpperCase().split(/\s+/).filter(Boolean).forEach((w, i) => {
    if (i > 0) out.push({ gap: 3 });
    switch (w) {
      case '>': out.push({ text: '>', color: C_SOFT }); break;
      case '+': out.push({ text: '+', color: C_SOFT }); break;
      case 'GD': out.push(cap(c.lp)); break;
      case 'GF': out.push(cap(c.hp)); break;
      case 'PD': out.push(cap(c.lk)); break;
      case 'PF': out.push(cap(c.hk)); break;
      case 'GOLPE': out.push(cap(c.lp), ...joint('O'), cap(c.hp)); break;
      case 'PATADA': out.push(cap(c.lk), ...joint('O'), cap(c.hk)); break;
      default: out.push(...txt(w));
    }
  });
  return out;
}

/** Elemento de la lista: encabezado, fila nombre/comando, par de celdas, línea libre o espacio. */
type Item =
  | { kind: 'head'; text: string; color?: number }
  | { kind: 'row'; name: string; color: number; cmd: Token[] }
  | { kind: 'pair'; left: Token[]; right: Token[] }
  | { kind: 'line'; tokens: Token[]; indent?: number }
  | { kind: 'space' };

function items(def: FighterDef, c: Caps): Item[] {
  const out: Item[] = [];
  const head = (text: string, color = C_HEAD) => {
    if (out.length) out.push({ kind: 'space' });
    out.push({ kind: 'head', text, color });
  };

  head('BOTONES');
  const btn = (label: string, k: string): Token[] => [cap(k), { gap: 3 }, { text: label, color: C_TEXT }];
  out.push({ kind: 'pair', left: btn('GOLPE DÉBIL', c.lp), right: btn('GOLPE FUERTE', c.hp) });
  out.push({ kind: 'pair', left: btn('PATADA DÉBIL', c.lk), right: btn('PATADA FUERTE', c.hk) });
  out.push({ kind: 'pair', left: btn('MODO PODER', c.power), right: btn('RODADA', c.roll) });
  out.push({
    kind: 'pair',
    left: btn('PELÁ', c.taunt),
    right: [cap(c.up), cap(c.down), cap(c.left), cap(c.right), { gap: 3 }, { text: 'MOVERSE', color: C_TEXT }],
  });

  const stance = (st: 'stand' | 'crouch' | 'air', label: Token[]) => {
    const n = def.normals[st];
    const cell = (b: Btn): Token[] => [cap(c[b]), { gap: 3 }, { text: (def.moves[n[b]]?.name ?? '-').toUpperCase(), color: C_TEXT }];
    out.push({ kind: 'line', tokens: label });
    out.push({ kind: 'pair', left: cell('lp'), right: cell('hp') });
    out.push({ kind: 'pair', left: cell('lk'), right: cell('hk') });
  };
  head('GOLPES');
  stance('stand', txt('DE PIE', C_SOFT));
  stance('crouch', [...txt('AGACHADO (MANTÉN ', C_SOFT), cap(c.down), ...txt(')', C_SOFT)]);
  stance('air', txt('EN EL AIRE', C_SOFT));

  // Las versiones débil y fuerte (mismo nombre) van en una fila, del más simple al más complejo.
  const especiales = new Map<string, { motion?: MotionId; buttons: Btn[] }>();
  let superRow: { name: string; motion?: MotionId; buttons?: Btn[]; cost: number } | null = null;
  let ultraRow: { name: string; motion?: MotionId; buttons?: Btn[]; cost: number; danger: number } | null = null;
  for (const id of [...def.specials].reverse()) {
    const mv = def.moves[id];
    if (!mv) continue;
    if (mv.kind === 'super') {
      superRow = { name: mv.name, motion: mv.motion, buttons: mv.buttons, cost: Math.round((mv.meterCost ?? 100) / 100) };
      continue;
    }
    if (mv.kind === 'ultra') {
      ultraRow = {
        name: mv.name, motion: mv.motion, buttons: mv.buttons, cost: Math.round((mv.meterCost ?? 200) / 100),
        danger: Math.round((mv.ultra?.danger ?? 0.25) * 100),
      };
      continue;
    }
    const e = especiales.get(mv.name) ?? { motion: mv.motion, buttons: [] };
    for (const b of mv.buttons ?? []) if (!e.buttons.includes(b)) e.buttons.push(b);
    especiales.set(mv.name, e);
  }
  const command = (motion: MotionId | undefined, buttons: Btn[] | undefined): Token[] => [
    ...(motion ? txt(MOTION[motion]) : []),
    ...joint('+'),
    ...buttonTokens(buttons, c),
  ];
  head('ESPECIALES');
  for (const [name, e] of especiales) out.push({ kind: 'row', name: name.toUpperCase(), color: C_NAME, cmd: command(e.motion, e.buttons) });
  if (superRow) {
    head(`SÚPER · ${superRow.cost} BARRA${superRow.cost > 1 ? 'S' : ''}`, C_SUPER);
    out.push({ kind: 'row', name: superRow.name.toUpperCase(), color: C_SUPER, cmd: command(superRow.motion, superRow.buttons) });
  }
  if (ultraRow) {
    head(`ULTRA · ${ultraRow.cost} BARRAS`, C_ULTRA);
    out.push({ kind: 'row', name: ultraRow.name.toUpperCase(), color: C_ULTRA, cmd: command(ultraRow.motion, ultraRow.buttons) });
    out.push({ kind: 'line', tokens: txt(`RIVAL EN PELIGRO: ${ultraRow.danger}% DE VIDA O MENOS`, C_SOFT) });
    out.push({ kind: 'line', tokens: txt('SI CONECTA, HACE TODOS SUS GOLPES SOLO', C_SOFT) });
  }

  head('MECÁNICAS');
  const mec = (name: string, cmd: Token[]) => out.push({ kind: 'row', name, color: C_NAME, cmd });
  const chain = [cap(c.lp), ...sep, cap(c.lk), ...sep, cap(c.hp), ...sep, cap(c.hk)];
  mec('BLOQUEAR', txt('MANTÉN ← · BAJOS: ↙'));
  mec('CADENA', [...chain, ...txt(' AL CONECTAR', C_SOFT)]);
  // El lanzador lleva el nombre del golpe del luchador (René: GANCHO, como en Mortal Kombat).
  const launcherId = def.mechanics?.launcher ?? def.normals.crouch.hp;
  const launcherName = (launcherId && def.moves[launcherId]?.name) || 'Lanzador';
  if (launcherId) mec(launcherName.toUpperCase(), [...txt('↓'), ...joint('+'), cap(c.hp), ...txt(' Y LUEGO ↑')]);
  mec('COMBO AÉREO', [...txt('EN EL AIRE: ', C_SOFT), ...chain]);
  mec('SUPERSALTO', txt('↓ Y LUEGO ↑ RÁPIDO'));
  mec('SALTO CORTO', txt('TOCA ↑ Y SUELTA'));
  mec('RODADA', [cap(c.roll), ...joint('O'), cap(c.lp), ...joint('+'), cap(c.lk), ...txt(' · CON ← ATRÁS', C_SOFT)]);
  mec('MODO PODER', [cap(c.power), ...joint('O'), cap(c.hp), ...joint('+'), cap(c.hk), ...txt(' · 1 BARRA', C_SOFT)]);
  mec('CONTRAATAQUE', [...txt('BLOQUEANDO: →'), ...joint('+'), cap(c.roll), ...txt(' · 1 BARRA', C_SOFT)]);
  mec('AGARRE', [...txt('PEGADO: ', C_SOFT), cap(c.lp), ...joint('+'), cap(c.lk), ...txt(' · CON ← ATRÁS', C_SOFT)]);
  mec('PELÁ', [cap(c.taunt), ...txt(' LE QUITA SÚPER AL RIVAL', C_SOFT)]);

  head('COMBOS KILLER');
  const anyBtn = [cap(c.lp), ...joint('O'), cap(c.hp), ...joint('O'), cap(c.lk), ...joint('O'), cap(c.hk)];
  mec('DOBLE', [...txt('ESPECIAL QUE PEGA', C_SOFT), ...sep, ...anyBtn]);
  mec('ENLACE', [...txt('EN EL DOBLE: ESPECIAL CON ', C_SOFT), cap(c.lp), ...joint('O'), cap(c.lk)]);
  mec('REMATE', [...txt('ESPECIAL CON ', C_SOFT), cap(c.hp), ...joint('O'), cap(c.hk), ...txt(', SÚPER O ULTRA', C_SOFT)]);
  out.push({ kind: 'line', tokens: txt('DOBLE: 2 GOLPES SOLOS, HASTA 4 POR COMBO', C_SOFT) });
  mec('COMBO BREAKER', [...txt('DOBLE DÉBIL: ', C_SOFT), cap(c.roll), ...joint('O'), cap(c.lp), ...joint('+'), cap(c.lk)]);
  mec('', [...txt('DOBLE FUERTE: ', C_SOFT), cap(c.power), ...joint('O'), cap(c.hp), ...joint('+'), cap(c.hk)]);
  mec('BLOQUEO', txt('SI FALLAS: 2 SEGUNDOS SIN BREAKER', C_SOFT));

  head('2 VS 2');
  mec('CAMBIO', [cap(c.tag), ...txt(' EN NEUTRO', C_SOFT)]);
  mec('AYUDA', [cap(c.assist), ...txt(' TU COMPAÑERO HACE SU ESPECIAL', C_SOFT)]);
  mec('SÚPER EN EQUIPO', [...txt('DURANTE TU SÚPER: '), cap(c.tag)]);
  mec('VIDA ROJA', txt('SE RECUPERA AFUERA', C_SOFT));

  const combos = def.combos?.length
    ? def.combos
    : [{ name: 'BÁSICO', steps: 'GD > GF > ↓↘→ + GOLPE' }, { name: 'AÉREO', steps: '↓ + GF > ↑ > GD > PD > GF > PF' }];
  head('COMBOS SUGERIDOS');
  for (const cb of combos) {
    out.push({ kind: 'line', tokens: txt(cb.name.toUpperCase(), C_SUPER) });
    out.push({ kind: 'line', tokens: stepTokens(cb.steps, c), indent: 8 });
  }
  out.push({ kind: 'space' });
  out.push({ kind: 'line', tokens: txt('LOS COMANDOS SON MIRANDO A LA DERECHA.', C_SOFT) });
  return out;
}

/** Panel de movimientos con desplazamiento, cambio de luchador y de jugador (J1 / J2). */
export class MoveListPanel {
  readonly container = new Container();
  private body = new Container();
  private header = new Container();
  private glow = new Graphics();
  private preview = new Sprite();
  private bar = new Graphics();
  private frames: Array<{ tex: Texture; dur: number }> = [];
  private fi = 0;
  private ft = 0;
  private scroll = 0;
  private maxScroll = 0;
  private index: number;
  private player: 0 | 1 = 0;

  constructor(private assets: Assets, start = 0) {
    this.index = start;
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x05020c, alpha: 0.86 });
    // Panel principal y tarjeta del luchador.
    bg.roundRect(8, 36, VIEW_W - 16, AREA_BOTTOM - 36 + 6, 5).fill({ color: 0x140a24, alpha: 0.94 }).stroke({ color: 0xc89a3a, width: 1 });
    bg.roundRect(CARD_X, AREA_TOP - 2, CARD_W, AREA_BOTTOM - AREA_TOP + 2, 4).fill({ color: 0x0b0616, alpha: 1 });
    bg.moveTo(AREA_X - 4, AREA_TOP).lineTo(AREA_X - 4, AREA_BOTTOM).stroke({ color: 0x3a2a52, width: 1 });
    const title = outlinedText('MOVIMIENTOS', 12, 0xfff4e0, 0x5a0a10, 3);
    title.position.set(14, 10);
    const mask = new Graphics().rect(AREA_X - 2, AREA_TOP, AREA_W + 8, AREA_BOTTOM - AREA_TOP).fill(0xffffff);
    this.body.mask = mask;
    const help = tokenLine(
      [...textTokens('↑↓ DESPLAZAR   ←→ LUCHADOR   '), { cap: 'TAB' }, ...textTokens(' J1 / J2   '), { cap: 'ESC' }, ...textTokens(' VOLVER')],
      6,
      0x8ae8ff,
    );
    help.position.set(Math.round(VIEW_W / 2 - help.width / 2), VIEW_H - 18);
    this.glow.blendMode = 'add';
    this.glow.filters = [new BlurFilter({ strength: 14, quality: 4 })];
    this.container.addChild(bg, title, this.header, this.glow, this.preview, this.body, mask, this.bar, help);
    this.show();
  }

  /** Todo el plantel (también los que solo pelean en 2 VS 2). */
  private get fighters(): FighterAsset[] {
    return this.assets.roster.length ? this.assets.roster : this.assets.fighters;
  }

  private show(): void {
    const f = this.fighters[this.index];
    const caps = capsOf(this.player === 0 ? P1_KEYS : P2_KEYS);

    // Encabezado: luchador y de quién son las teclas.
    this.header.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    const many = this.fighters.length > 1;
    const name = tokenLine(textTokens(`${many ? '← ' : ''}${f.def.name.toUpperCase()}${many ? ' →' : ''}`, 0xffd040), 10);
    name.position.set(VIEW_W - 14 - name.width, 8);
    const who = tokenLine(textTokens(`TECLAS DE J${this.player + 1} · SE CAMBIAN EN CONTROLES`, 0x8ae8ff), 6);
    who.position.set(VIEW_W - 14 - who.width, 24);
    this.header.addChild(name, who);

    // Lista.
    this.body.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    let y = AREA_TOP + 4;
    let stripe = 0;
    for (const it of items(f.def, caps)) {
      if (it.kind === 'space') {
        y += 6;
        continue;
      }
      if (it.kind === 'head') {
        const t = outlinedText(it.text, 8, it.color ?? C_HEAD);
        t.position.set(AREA_X, y);
        const line = new Graphics()
          .moveTo(AREA_X + t.width + 6, y + 5)
          .lineTo(AREA_X + AREA_W, y + 5)
          .stroke({ color: it.color ?? C_HEAD, width: 1, alpha: 0.35 });
        this.body.addChild(line, t);
        y += 14;
        stripe = 0;
        continue;
      }
      // Si el nombre y el comando no caben juntos, el comando baja a la línea siguiente.
      const n = it.kind === 'row' ? tokenLine(textTokens(it.name, it.color), SIZE) : null;
      const cmd = it.kind === 'row' ? tokenLine(it.cmd, SIZE) : null;
      const wrap = !!n && !!cmd && n.width + 8 + cmd.width > AREA_W;
      if (stripe++ % 2 === 1) {
        this.body.addChild(new Graphics().rect(AREA_X - 2, y - 1, AREA_W + 4, wrap ? ROW * 2 : ROW).fill({ color: 0xffffff, alpha: 0.035 }));
      }
      if (it.kind === 'row' && n && cmd) {
        n.position.set(AREA_X, y);
        if (wrap) y += ROW;
        cmd.position.set(Math.round(AREA_X + AREA_W - cmd.width), y);
        this.body.addChild(n, cmd);
      } else if (it.kind === 'pair') {
        const l = tokenLine(it.left, SIZE);
        l.position.set(AREA_X, y);
        const r = tokenLine(it.right, SIZE);
        r.position.set(AREA_X + Math.round(AREA_W / 2) + 4, y);
        this.body.addChild(l, r);
      } else if (it.kind === 'line') {
        const l = tokenLine(it.tokens, SIZE);
        l.position.set(AREA_X + (it.indent ?? 0), y);
        this.body.addChild(l);
      }
      y += ROW;
    }
    const contentH = y - AREA_TOP + 4;
    this.maxScroll = Math.max(0, contentH - (AREA_BOTTOM - AREA_TOP));
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this.body.y = -this.scroll;
    this.drawBar();

    // Luchador animado (guardia) en su tarjeta, con una luz de su color detrás.
    const cx = CARD_X + CARD_W / 2;
    const feet = AREA_BOTTOM - 22;
    this.glow.clear();
    this.glow.ellipse(cx, feet - 62, 38, 62).fill({ color: f.def.ui.fx, alpha: 0.22 });
    this.frames = (f.def.anims.idle?.frames ?? []).map((fr) => ({ tex: this.assets.textures[fr.tex], dur: fr.dur })).filter((fr) => fr.tex);
    this.fi = 0;
    this.ft = 0;
    this.preview.visible = this.frames.length > 0;
    if (this.frames.length) {
      // El cuadro de guardia mide ~150 unidades de mundo; aquí se ve de ~130.
      const k = (130 * (f.def.texScale ?? 1)) / 150;
      this.preview.scale.set(k, k);
      this.preview.position.set(cx, feet);
      this.setFrame(0);
    }
  }

  /** Barra de desplazamiento (solo si la lista no cabe). */
  private drawBar(): void {
    this.bar.clear();
    if (this.maxScroll <= 0) return;
    const h = AREA_BOTTOM - AREA_TOP;
    const visible = h / (h + this.maxScroll);
    const bh = Math.max(16, h * visible);
    const by = AREA_TOP + (h - bh) * (this.scroll / this.maxScroll);
    const x = VIEW_W - 13;
    this.bar.roundRect(x, AREA_TOP, 3, h, 1.5).fill({ color: 0xffffff, alpha: 0.08 });
    this.bar.roundRect(x, by, 3, bh, 1.5).fill({ color: 0xffd040, alpha: 0.7 });
  }

  private setFrame(i: number): void {
    const tex = this.frames[i].tex;
    this.preview.texture = tex;
    this.preview.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
  }

  /** Entrada del menú: desplazar, cambiar de luchador y (con TAB) de jugador. */
  step(menu: MenuInput, kb?: Keyboard): void {
    if (menu.up || menu.down) {
      this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + (menu.down ? ROW * 2 : -ROW * 2)));
      this.body.y = -this.scroll;
      this.drawBar();
    }
    if ((menu.left || menu.right) && this.fighters.length > 1) {
      const n = this.fighters.length;
      this.index = (this.index + (menu.right ? 1 : n - 1)) % n;
      this.scroll = 0;
      this.show();
    }
    if (kb?.hit('Tab')) {
      this.player = this.player === 0 ? 1 : 0;
      this.show();
    }
    if (this.frames.length && ++this.ft >= this.frames[this.fi].dur) {
      this.ft = 0;
      this.fi = (this.fi + 1) % this.frames.length;
      this.setFrame(this.fi);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
