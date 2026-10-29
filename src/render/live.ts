// Presentación "TRANSMISIÓN EN VIVO": el Gran Torneo de Cell vive en los lives de
// TikTok, así que la pelea se muestra como un live: contador de vistas,
// regalos que suben con el combo, palabras de hype chilenas, chat y corazones.
// Paleta neón rosado / cian, sin logos de marcas reales. Unidades de mundo
// (480x270) sobre el HUD. Lo que va al azar (vistas, chat) sale de un
// generador con la semilla de la pelea: la misma pelea arma el mismo show.

import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { VIEW_W } from '../config';
import type { SimEvent } from '../sim/events';
import type { Match } from '../sim/match';
import { Rng } from '../sim/rng';
import type { FighterDef } from '../sim/types';
import { COMBO_BREAKER, ULTRA_COMBO, comboNameFor } from './comboNames';
import { arcade, outlinedText } from './text';

export const NEON_PINK = 0xff2e63;
export const NEON_CYAN = 0x2be4f0;
export const NEON_YELLOW = 0xffd23f;
export const NEON_RED = 0xff3b3b;
/** Colores de los corazones que suben, como los "me gusta" de un live. */
export const HEART_COLORS: readonly number[] = [NEON_PINK, NEON_RED, NEON_CYAN, NEON_YELLOW];

const INK = 0x0a0414;
const SIDES = [0, 1] as const;

// Regalo del combo (dibujado pixel a pixel): corazón (2-3 golpes), rosa (4-5),
// corona (6-8) y cohete (9 o más).
const PAL: Record<string, number> = {
  o: 0x1a0820, P: NEON_PINK, p: 0xa8103c, W: 0xffffff, S: 0xb8c4dc, R: NEON_RED, r: 0xa81828,
  G: 0x46d870, Y: NEON_YELLOW, y: 0xc07a10, C: NEON_CYAN, O: 0xff8a20,
};
const GIFTS: readonly (readonly string[])[] = [
  [
    '..ooo...ooo..',
    '.oPPPo.oPPPo.',
    'oPWWPPoPPPPPo',
    'oPWPPPPPPPPPo',
    'oPPPPPPPPPPPo',
    'oPPPPPPPPPPpo',
    '.oPPPPPPPPpo.',
    '..oPPPPPPpo..',
    '...oPPPPpo...',
    '....oPPpo....',
    '.....opo.....',
    '......o......',
  ],
  [
    '....ooooo....',
    '...oRRRRRo...',
    '..oRRrRrRRo..',
    '..oRrRRRrRo..',
    '..oRRrrrRRo..',
    '..orRRRRRro..',
    '...orrrrro...',
    '....ooGoo....',
    '.oo...Go.....',
    'oGGo..Go.ooo.',
    '.oGGo.GooGGo.',
    '..ooGoGoGGo..',
    '....oGGooo...',
    '.....oGo.....',
    '......o......',
  ],
  [
    '.o....o....o.',
    'oYo..oYo..oYo',
    'oYYo.oYo.oYYo',
    'oYYYoYYYoYYYo',
    'oYYYYYYYYYYYo',
    'oYYYYYYYYYYYo',
    'oYCYYYPYYYCYo',
    'oYYYYYYYYYYYo',
    'oyyyyyyyyyyyo',
    'oyyyyyyyyyyyo',
    '.ooooooooooo.',
  ],
  [
    '......o......',
    '.....oWo.....',
    '....oWWSo....',
    '....oWWSo....',
    '...oWWWWSo...',
    '...oWoCoSo...',
    '...oWCCCSo...',
    '...oWoCoSo...',
    '...oWWWWSo...',
    '..ooWWWWSoo..',
    '.oPoWWWWSoPo.',
    '.oPPoWWSoPPo.',
    '.ooo.oPo.ooo.',
    '.....oOo.....',
    '....oYOYo....',
    '.....oYo.....',
    '......o......',
  ],
];

/** Dibuja un ícono pixel a pixel (1 unidad de mundo por pixel), centrado en (0, 0). */
function drawPixels(g: Graphics, art: readonly string[]): void {
  g.clear();
  const ox = -Math.floor(art[0].length / 2);
  const oy = -Math.floor(art.length / 2);
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const color = PAL[ch];
      if (color !== undefined) g.rect(ox + x, oy + y, end - x, 1).fill(color);
      x = end;
    }
  });
}

function tierFor(hits: number): number {
  return hits >= 9 ? 3 : hits >= 6 ? 2 : hits >= 4 ? 1 : 0;
}

/** Separador de miles chileno: 12345 → "12.345". */
export function formatViews(n: number): string {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}


/** Chat de mentira: livianito, sin garabatos. */
const CHAT_USERS = [
  '@pelaoxd', '@tia.rosa', '@nachito99', '@cami.lol', '@tio.pato', '@la_pame',
  '@joselo77', '@vale.cl', '@mati_gamer', '@abuelita.nena', '@coni.uwu', '@don.memo',
];
const CHAT_LINES = [
  'jajaja', 'fuaaa', 'wena wena', 'sigue sigue', 'no lo puedo creer', 'uff',
  '¡JAJAJA!', 'llegó la hora', 'otra otra', 'qué combo', 'noooo', 'me muero jaja',
  'épico', 'ksjdkjs', 'grande', 'clip clip',
];
const CHAT_COLORS = [NEON_CYAN, NEON_PINK, NEON_YELLOW, 0x9af08a];

/** Estilo del cartel del nombre del combo. */
const HYPE_STYLE = {
  combo: { size: 16, fill: 0xffffff, stroke: NEON_PINK },
  viral: { size: 24, fill: 0xffffff, stroke: NEON_PINK },
  ultra: { size: 28, fill: NEON_YELLOW, stroke: 0xc01020 },
  breaker: { size: 24, fill: 0xffffff, stroke: 0x1060e0 },
} as const;

const PILL_Y = 62;
const PILL_H = 32;
const PILL_EDGE = 6;
const CHAT_Y = 100;
const CHAT_STEP = 12;
const CHAT_LIFE = 120;

interface GiftPill {
  side: 0 | 1;
  c: Container;
  bg: Graphics;
  /** Avatar redondo y luchador que muestra (en 2 VS 2 cambia según quién pega). */
  avatar: Container;
  defId: string;
  name: Text;
  hits: Text;
  dmg: Text;
  icon: Graphics;
  tier: number;
  shown: boolean;
  /** Cuadros desde que apareció (para la entrada deslizándose). */
  t: number;
  /** Cuadros que sigue visible después de que termina el combo (-1: el combo sigue). */
  hold: number;
  fade: number;
  width: number;
  hitsPop: number;
  iconPop: number;
}

interface ChatLine {
  c: Container;
  bg: Graphics;
  user: Text;
  msg: Text;
  side: 0 | 1;
  time: number;
  slot: number;
  y: number;
}

interface PendingChat {
  side: 0 | 1;
  delay: number;
}

export class LiveShow {
  readonly container = new Container();
  private rng: Rng;
  private frame = 0;
  // Vistas.
  private views: number;
  private floor: number;
  private shownViews: number;
  private calm = 0;
  private viewsPop = 0;
  private viewsColor = 0xffffff;
  private livePill = new Graphics();
  private liveDot = new Graphics();
  private liveText: Text;
  private viewsBg = new Graphics();
  private viewsLabel: Text;
  private viewsNum: Text;
  // Regalos, hype, chat, tendencia y resultado.
  private pills: [GiftPill, GiftPill];
  private hype: Text;
  /** "N GOLPES" sobre el nombre del combo. */
  private hypeHits: Text;
  private hypeT = 0;
  private hypeDur = 0;
  private hypeSide: 0 | 1 = 0;
  private chat: ChatLine[] = [];
  private pendingChat: PendingChat[] = [];
  private chatCount: [number, number] = [0, 0];
  private lastChat = '';
  private trendBand = new Container();
  private trendBandG = new Graphics();
  private trendText: Text;
  private trendT = -1;
  private trendY = 150;
  private superWatch: Array<{ active: boolean; hits: number; t: number }> = [
    { active: false, hits: 0, t: 0 },
    { active: false, hits: 0, t: 0 },
  ];
  private hearts: [number, number] = [0, 0];
  private heartN = 0;
  private result = new Container();
  private resultBg = new Graphics();
  private resultLabel: Text;
  private resultNum: Text;
  private resultT = 0;

  constructor(
    defs: readonly [FighterDef, FighterDef],
    private textures: Record<string, Texture>,
    seed: number,
    /** Hace subir un corazón desde el lado de quien pega (lo dibuja la capa de efectos). */
    private onHeart: (side: 0 | 1, color: number) => void,
  ) {
    this.rng = new Rng((seed * 7919 + 17) >>> 0);
    this.views = 900 + this.rng.int(0, 600);
    this.floor = Math.round(this.views * 0.7);
    this.shownViews = this.views;

    this.liveText = outlinedText('EN VIVO', 6, 0xffffff, 0x7a0a28, 1);
    this.liveText.anchor.set(0, 0.5);
    this.viewsLabel = outlinedText('VISTAS', 6, NEON_CYAN, INK, 1);
    this.viewsNum = outlinedText(formatViews(this.views), 6, 0xffffff, INK, 1);
    for (const t of [this.viewsLabel, this.viewsNum]) t.anchor.set(0, 0.5);
    this.viewsNum.anchor.set(0.5, 0.5);
    this.container.addChild(this.livePill, this.liveDot, this.liveText, this.viewsBg, this.viewsLabel, this.viewsNum);

    this.pills = [this.makePill(0, defs[0], textures), this.makePill(1, defs[1], textures)];

    this.hype = outlinedText('', 16, 0xffffff, NEON_PINK, 3, {
      dropShadow: { color: NEON_CYAN, alpha: 1, angle: Math.PI / 4, distance: 2, blur: 0 },
    });
    this.hype.anchor.set(0.5);
    this.hype.visible = false;
    this.hypeHits = outlinedText('', 8, NEON_YELLOW, INK, 2);
    this.hypeHits.anchor.set(0.5);
    this.hypeHits.visible = false;

    this.trendText = outlinedText('¡TENDENCIA!', 32, 0xffffff, NEON_PINK, 4, {
      dropShadow: { color: NEON_CYAN, alpha: 1, angle: Math.PI / 4, distance: 3, blur: 0 },
    });
    this.trendText.anchor.set(0.5);
    this.trendBand.addChild(this.trendBandG);
    this.trendBand.visible = false;
    this.trendText.visible = false;

    this.resultLabel = outlinedText('', 8, NEON_CYAN, INK, 2);
    this.resultNum = outlinedText('', 8, 0xffffff, INK, 2);
    this.resultLabel.anchor.set(0, 0.5);
    this.resultNum.anchor.set(0, 0.5);
    this.result.addChild(this.resultBg, this.resultLabel, this.resultNum);
    this.result.visible = false;

    for (let i = 0; i < 6; i++) {
      const c = new Container();
      const bg = new Graphics();
      const user = outlinedText('', 7, NEON_CYAN, INK, 2);
      const msg = outlinedText('', 7, 0xffffff, INK, 2);
      c.addChild(bg, user, msg);
      c.visible = false;
      this.chat.push({ c, bg, user, msg, side: 0, time: 0, slot: 0, y: CHAT_Y });
    }

    this.container.addChild(
      ...this.pills.map((p) => p.c), ...this.chat.map((l) => l.c), this.hype, this.hypeHits, this.trendBand, this.trendText, this.result,
    );
  }

  // ---------------------------------------------------------------- armado

  private makePill(side: 0 | 1, def: FighterDef, textures: Record<string, Texture>): GiftPill {
    const c = new Container();
    c.position.set(side === 0 ? PILL_EDGE : VIEW_W - PILL_EDGE, PILL_Y);
    const bg = new Graphics();
    const dir = side === 0 ? 1 : -1;
    const avatar = this.makeAvatar(side, def, textures);
    const name = outlinedText(def.name.toUpperCase(), 6, 0xffffff, INK, 1);
    const hits = outlinedText('', 8, NEON_YELLOW, INK, 2);
    const dmg = outlinedText('', 6, NEON_CYAN, INK, 1);
    const tx = dir * 31;
    for (const [t, y] of [[name, 3], [dmg, 22]] as const) {
      t.anchor.set(side === 0 ? 0 : 1, 0);
      t.position.set(tx, y);
    }
    // Los golpes laten al subir: anclados al centro de su línea para no pisar las otras.
    hits.anchor.set(side === 0 ? 0 : 1, 0.5);
    hits.position.set(tx, 16.5);
    const icon = new Graphics();
    c.addChild(bg, avatar, name, hits, dmg, icon);
    c.visible = false;
    return {
      side, c, bg, avatar, defId: def.id, name, hits, dmg, icon,
      tier: -1, shown: false, t: 0, hold: -1, fade: 0, width: 0, hitsPop: 0, iconPop: 0,
    };
  }

  /** Avatar redondo: el retrato del súper si el luchador tiene uno; si no, un círculo con la inicial. */
  private makeAvatar(side: 0 | 1, def: FighterDef, textures: Record<string, Texture>): Container {
    const dir = side === 0 ? 1 : -1;
    const r = 12;
    const cx = dir * 15;
    const cy = PILL_H / 2;
    const avatar = new Container();
    const portrait = Object.values(def.moves).find((mv) => mv.kind === 'super' && mv.cinematic?.portrait)?.cinematic?.portrait;
    const tex = portrait ? textures[portrait] : undefined;
    const disc = new Graphics().circle(cx, cy, r).fill(def.ui.color);
    avatar.addChild(disc);
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0);
      const k = (2.5 * r) / Math.max(1, tex.width);
      s.scale.set(side === 0 ? k : -k, k);
      s.position.set(cx, cy - r - 1);
      const mask = new Graphics().circle(cx, cy, r).fill(0xffffff);
      s.mask = mask;
      avatar.addChild(s, mask);
    } else {
      const initial = outlinedText(arcade(def.name.trim().charAt(0).toUpperCase() || '?'), 8, 0xffffff, INK, 2);
      initial.anchor.set(0.5);
      initial.position.set(cx, cy + 1);
      avatar.addChild(initial);
    }
    const ring = new Graphics().circle(cx, cy, r).stroke({ color: side === 0 ? NEON_PINK : NEON_CYAN, width: 1.5 });
    avatar.addChild(ring);
    return avatar;
  }

  /**
   * 2 VS 2: el regalo de un lado muestra al luchador que pega (el punto o la
   * ayuda). Cambia el avatar y el nombre sin cortar el combo en curso.
   */
  useFighter(side: 0 | 1, def: FighterDef): void {
    const p = this.pills[side];
    if (p.defId === def.id) return;
    p.defId = def.id;
    const i = p.c.getChildIndex(p.avatar);
    p.avatar.destroy({ children: true });
    p.avatar = this.makeAvatar(side, def, this.textures);
    p.c.addChildAt(p.avatar, i);
    p.name.text = arcade(def.name.toUpperCase());
    p.width = 0;
    if (p.shown) this.layoutPill(p);
  }

  // ---------------------------------------------------------------- eventos

  onEvent(e: SimEvent, m: Match): void {
    const r = this.rng;
    switch (e.type) {
      case 'hit': {
        const c = e.combo;
        this.bump(4 + r.int(0, 4) + (c >= 2 ? c * (3 + r.int(0, 3)) : 0));
        if (this.superWatch[e.side].active) this.superWatch[e.side].hits++;
        if (c < 2) break;
        // Combo nuevo: vuelve a habilitar el chat (hasta 3 mensajes por combo).
        if (c === 2) this.chatCount[e.side] = 0;
        const victim = m.fighters[e.side === 0 ? 1 : 0];
        this.showPill(e.side, c, e.total ?? victim.comboDamage);
        this.hearts[e.side] += Math.min(8, 1 + Math.floor(c / 2));
        if (c === 4 || c === 6 || c === 9) this.queueChat(e.side);
        break;
      }
      case 'block':
        this.bump(1);
        break;
      case 'comboEnd': {
        this.endPill(e.side);
        if (e.hits >= 5) this.bump(e.hits * 12);
        // Nombre del combo (estilo Killer Instinct). Si lo rompieron, el cartel es del COMBO BREAKER.
        if (e.broken) break;
        const name = e.ultra ? ULTRA_COMBO.name : comboNameFor(e.hits)?.name;
        if (name) this.popHype(name, e.side, e.hits, e.ultra ? 'ultra' : 'combo');
        if (e.ultra) this.hearts[e.side] += 24;
        break;
      }
      case 'comboBreaker':
        this.popHype(COMBO_BREAKER.name, e.side, 0, 'breaker');
        this.bump(200 + r.int(0, 120));
        break;
      case 'superFlash':
        this.bump(120 + r.int(0, 120));
        this.superWatch[e.side] = { active: true, hits: 0, t: 0 };
        break;
      case 'powerMode':
        if (e.on) this.bump(60 + r.int(0, 40));
        break;
      case 'guardCancel':
        this.bump(40);
        break;
      case 'launch':
        this.bump(20);
        break;
      case 'taunt':
        this.bump(15 + r.int(0, 20));
        break;
      case 'ko':
        this.bump(700 + r.int(0, 600));
        this.hearts[e.side === 0 ? 1 : 0] += 10;
        break;
      case 'announce':
        if (e.kind === 'perfect') this.bump(500);
        break;
      default:
        break;
    }
  }

  private bump(n: number): void {
    this.views += n;
    this.calm = 0;
    if (n >= 10) this.viewsPop = 8;
  }

  private showPill(side: 0 | 1, hits: number, damage: number): void {
    const p = this.pills[side];
    if (!p.shown) {
      p.shown = true;
      p.t = 0;
      p.c.visible = true;
    }
    p.hold = -1;
    p.fade = 0;
    p.hits.text = `x${hits} GOLPES`;
    p.dmg.text = arcade(`${damage} DE DAÑO`);
    p.hitsPop = 6;
    const tier = tierFor(hits);
    if (tier !== p.tier) {
      p.tier = tier;
      drawPixels(p.icon, GIFTS[tier]);
      p.iconPop = 9;
    }
    this.layoutPill(p);
  }

  /** Fondo y posición del regalo según el texto más largo. */
  private layoutPill(p: GiftPill): void {
    const side = p.side;
    // Ancho según el texto más largo (sin el latido): avatar + textos + espacio + regalo.
    const textW = Math.max(p.name.width, p.hits.width / p.hits.scale.x, p.dmg.width);
    const w = Math.ceil(31 + textW + 16 + 14 + 6);
    if (w !== p.width) {
      p.width = w;
      const x0 = side === 0 ? 0 : -w;
      const g = p.bg;
      g.clear();
      g.roundRect(x0, 0, w, PILL_H, PILL_H / 2).fill({ color: INK, alpha: 0.82 });
      g.roundRect(x0, 0, w, PILL_H, PILL_H / 2).stroke({ color: side === 0 ? NEON_PINK : NEON_CYAN, width: 1.5 });
    }
    p.icon.position.set((side === 0 ? 1 : -1) * (w - 15), PILL_H / 2);
  }

  private endPill(side: 0 | 1): void {
    const p = this.pills[side];
    if (p.shown && p.hold < 0) p.hold = 50;
  }

  /** Cartel del nombre del combo: "N GOLPES" arriba y el nombre en grande (ultra y breaker con su color). */
  private popHype(word: string, side: 0 | 1, hits: number, kind: 'combo' | 'ultra' | 'breaker'): void {
    const st = HYPE_STYLE[kind === 'combo' && hits >= 12 ? 'viral' : kind];
    this.hype.text = arcade(word);
    this.hype.style.fontSize = st.size;
    this.hype.style.fill = st.fill;
    this.hype.style.stroke = { color: st.stroke, width: st.size >= 24 ? 4 : 3, join: 'miter' };
    this.hypeHits.text = hits > 0 ? `${hits} GOLPES` : '';
    this.hypeT = 0;
    this.hypeDur = kind === 'combo' ? 84 : 110;
    this.hypeSide = side;
    this.hype.visible = true;
    this.hypeHits.visible = hits > 0;
  }

  private queueChat(side: 0 | 1): void {
    if (this.chatCount[side] >= 3) return;
    this.chatCount[side]++;
    this.pendingChat.push({ side, delay: this.rng.int(2, 8) });
  }

  private postChat(side: 0 | 1): void {
    const r = this.rng;
    let msg = r.pick(CHAT_LINES);
    if (msg === this.lastChat) msg = r.pick(CHAT_LINES);
    this.lastChat = msg;
    const user = r.pick(CHAT_USERS);
    const color = r.pick(CHAT_COLORS);
    const mine = this.chat.filter((l) => l.c.visible && l.side === side).sort((a, b) => a.slot - b.slot);
    // Como mucho tres líneas por lado: la más vieja se va.
    if (mine.length >= 3) {
      mine[0].c.visible = false;
      mine.shift();
    }
    mine.forEach((l, i) => (l.slot = i));
    const line = this.chat.find((l) => !l.c.visible);
    if (!line) return;
    line.side = side;
    line.slot = mine.length;
    line.time = 0;
    line.y = CHAT_Y + line.slot * CHAT_STEP;
    line.user.text = user;
    line.user.style.fill = color;
    line.msg.text = msg;
    const pad = 3;
    const w = line.user.width + 4 + line.msg.width + pad * 2;
    const x0 = side === 0 ? 0 : -w;
    line.bg.clear();
    line.bg.roundRect(x0, -2, w, 11, 3).fill({ color: INK, alpha: 0.72 });
    line.user.position.set(x0 + pad, 0);
    line.msg.position.set(x0 + pad + line.user.width + 4, 0);
    line.c.visible = true;
  }

  private trend(m: Match): void {
    this.trendT = 0;
    // Bajo el chat; con el K.O. en pantalla va un poco más abajo para no taparlo.
    this.trendY = m.phase === 'ko' ? 172 : 150;
    this.bump(400 + this.rng.int(0, 400));
    const g = this.trendBandG;
    g.clear();
    g.rect(0, -22, VIEW_W, 44).fill({ color: NEON_PINK, alpha: 0.78 });
    g.rect(0, -22, VIEW_W, 3).fill(NEON_CYAN);
    g.rect(0, 19, VIEW_W, 3).fill(NEON_CYAN);
    for (let i = 0; i < 7; i++) g.rect(i * 76 - 20, -16 + (i % 3) * 12, 52, 2).fill({ color: 0xffffff, alpha: 0.45 });
    this.trendBand.visible = true;
    this.trendText.visible = true;
  }

  // ---------------------------------------------------------------- tiempo

  /** Avanza un cuadro de simulación. */
  step(m: Match): void {
    this.frame++;
    // Las vistas bajan de a poco si no pasa nada.
    if (++this.calm > 150 && this.frame % 20 === 0 && this.views > this.floor) {
      this.views = Math.max(this.floor, this.views - Math.max(1, Math.round(this.views * 0.003)));
    }
    const d = this.views - this.shownViews;
    if (d !== 0) this.shownViews += Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * 0.18));
    if (this.viewsPop > 0) this.viewsPop--;

    for (const side of SIDES) {
      // ¿Terminó un súper que conectó? → ¡TENDENCIA!
      const sw = this.superWatch[side];
      if (sw.active) {
        sw.t++;
        const f = m.fighters[side];
        const busy = f.move?.kind === 'super' || m.projectiles.some((p) => !p.dead && p.owner === f);
        if (!busy || sw.t > 300) {
          sw.active = false;
          if (sw.hits > 0) {
            this.trend(m);
            this.hearts[side] += 14;
          }
        }
      }
      // Corazones: un chorro, uno cada dos cuadros.
      if (this.hearts[side] > 0 && this.frame % 2 === side) {
        this.hearts[side]--;
        this.onHeart(side, HEART_COLORS[(this.heartN++ * 5 + side) % HEART_COLORS.length]);
      }
      const p = this.pills[side];
      if (p.shown) {
        p.t++;
        if (p.hitsPop > 0) p.hitsPop--;
        if (p.iconPop > 0) p.iconPop--;
        if (p.hold > 0 && --p.hold === 0) p.fade = 1;
        else if (p.fade > 0 && ++p.fade > 16) {
          p.shown = false;
          p.c.visible = false;
          p.tier = -1;
          p.width = 0;
        }
      }
    }
    for (let i = this.pendingChat.length - 1; i >= 0; i--) {
      const c = this.pendingChat[i];
      if (--c.delay <= 0) {
        this.pendingChat.splice(i, 1);
        this.postChat(c.side);
      }
    }
    for (const l of this.chat) {
      if (!l.c.visible) continue;
      if (++l.time >= CHAT_LIFE) {
        l.c.visible = false;
        for (const o of this.chat) if (o.c.visible && o.side === l.side && o.slot > l.slot) o.slot--;
      }
    }
    if (this.hypeT < this.hypeDur) this.hypeT++;
    else this.hype.visible = this.hypeHits.visible = false;
    if (this.trendT >= 0 && ++this.trendT > 74) {
      this.trendT = -1;
      this.trendBand.visible = false;
      this.trendText.visible = false;
    }
    const ending = ((m.phase === 'ko' || m.phase === 'timeover') && m.phaseFrame >= 100) || m.phase === 'matchEnd';
    this.resultT = ending ? this.resultT + 1 : 0;
  }

  /** Actualiza posiciones, escalas y transparencias (cada render). */
  update(m: Match): void {
    const cx = VIEW_W / 2;
    // "● EN VIVO" y las vistas, bajo el reloj.
    const pw = Math.ceil(this.liveText.width) + 15;
    const px = Math.round(cx - pw / 2);
    this.livePill.clear();
    this.livePill.roundRect(px, 37, pw, 10, 3).fill(NEON_PINK).stroke({ color: 0xffffff, width: 0.5, alpha: 0.6 });
    this.liveDot.clear();
    if (this.frame % 60 < 40) this.liveDot.circle(px + 6, 42, 2).fill(0xffffff);
    this.liveText.position.set(px + 11, 42.5);
    this.viewsNum.text = formatViews(this.shownViews);
    const lw = this.viewsLabel.width;
    const nw = this.viewsNum.width;
    const total = lw + 4 + nw;
    const vx = Math.round(cx - total / 2);
    this.viewsLabel.position.set(vx, 54);
    this.viewsNum.position.set(vx + lw + 4 + nw / 2, 54);
    const pop = this.viewsPop > 0 ? 1 + this.viewsPop * 0.03 : 1;
    this.viewsNum.scale.set(pop);
    const color = this.viewsPop > 4 ? NEON_YELLOW : 0xffffff;
    if (color !== this.viewsColor) {
      this.viewsColor = color;
      this.viewsNum.style.fill = color;
    }
    this.viewsBg.clear();
    this.viewsBg.roundRect(vx - 4, 49, total + 8, 10, 3).fill({ color: INK, alpha: 0.6 });

    // Regalos: entran deslizándose desde su lado y se desvanecen al final.
    for (const p of this.pills) {
      if (!p.shown) continue;
      const k = Math.min(1, p.t / 8);
      const ease = 1 - Math.pow(1 - k, 3);
      const off = (p.width + 12) * (1 - ease);
      p.c.x = p.side === 0 ? PILL_EDGE - off : VIEW_W - PILL_EDGE + off;
      p.c.alpha = p.fade > 0 ? Math.max(0, 1 - p.fade / 16) : 1;
      p.hits.scale.set(1 + p.hitsPop * 0.03);
      p.icon.scale.set(1 + p.iconPop * 0.07);
    }

    // Chat bajo el regalo de cada lado.
    for (const l of this.chat) {
      if (!l.c.visible) continue;
      const target = CHAT_Y + l.slot * CHAT_STEP;
      l.y += (target - l.y) * 0.3;
      const inK = Math.min(1, l.time / 6);
      const slide = (1 - inK) * 16;
      l.c.position.set(l.side === 0 ? PILL_EDGE + 2 - slide : VIEW_W - PILL_EDGE - 2 + slide, Math.round(l.y));
      l.c.alpha = Math.min(inK, l.time > CHAT_LIFE - 20 ? (CHAT_LIFE - l.time) / 20 : 1);
    }

    // Palabra de hype: estira, aplasta y se acomoda, un poco inclinada.
    if (this.hype.visible) {
      const t = this.hypeT;
      const keys: Array<[number, number, number]> = [[0, 1.8, 0.35], [3, 0.8, 1.35], [6, 1.12, 0.9], [9, 0.96, 1.04], [12, 1, 1]];
      let sx = 1;
      let sy = 1;
      for (let i = 0; i < keys.length - 1; i++) {
        const [t0, x0, y0] = keys[i];
        const [t1, x1, y1] = keys[i + 1];
        if (t >= t0 && t < t1) {
          const u = (t - t0) / (t1 - t0);
          sx = x0 + (x1 - x0) * u;
          sy = y0 + (y1 - y0) * u;
        }
      }
      const out = Math.max(0, t - (this.hypeDur - 10)) / 10;
      const dir = this.hypeSide === 0 ? -1 : 1;
      // Al lado del regalo de quien hizo el combo, sin taparlo: centrado en el espacio libre y achicado si no cabe.
      const pill = this.pills[this.hypeSide];
      const used = pill.shown ? PILL_EDGE + pill.width + 6 : 8;
      const x0 = this.hypeSide === 0 ? used : 8;
      const x1 = this.hypeSide === 0 ? VIEW_W - 8 : VIEW_W - used;
      const fit = Math.min(1, (x1 - x0) / Math.max(1, this.hype.width / this.hype.scale.x));
      const k = fit * (1 + out * 0.15);
      const hx = Math.round((x0 + x1) / 2);
      this.hype.scale.set(sx * k, sy * k);
      this.hype.rotation = -dir * 0.04 + Math.sin(t * 0.35) * 0.015;
      this.hype.position.set(hx, 86 - out * 6);
      this.hype.alpha = 1 - out;
      // La cuenta de golpes entra un poco después, sobre el nombre.
      const hk = Math.min(1, Math.max(0, (t - 4) / 6));
      this.hypeHits.position.set(hx, 70 - out * 6);
      this.hypeHits.scale.set(0.6 + hk * 0.4);
      this.hypeHits.alpha = hk * (1 - out);
    }

    // ¡TENDENCIA!: franja neón que destella y el texto que golpea al aparecer.
    if (this.trendT >= 0) {
      const t = this.trendT;
      this.trendBand.position.set(0, this.trendY);
      this.trendBand.scale.y = Math.min(1, 0.15 + t * 0.22);
      this.trendBand.alpha = t < 8 ? 1 : Math.max(0, 1 - (t - 8) / 14);
      const pop = t < 6 ? 2.2 - t * 0.22 : t < 9 ? 0.92 + (t - 6) * 0.027 : 1;
      this.trendText.scale.set(pop);
      this.trendText.position.set(cx, this.trendY);
      this.trendText.rotation = -0.04;
      this.trendText.alpha = t > 62 ? Math.max(0, 1 - (t - 62) / 12) : 1;
    }

    // Vistas al final del round y de la pelea.
    this.result.visible = this.resultT > 0;
    if (this.result.visible) {
      const final = m.phase === 'matchEnd';
      this.resultLabel.text = final ? 'VISTAS FINALES:' : 'VISTAS:';
      this.resultNum.text = formatViews(this.views);
      const w = this.resultLabel.width + 6 + this.resultNum.width;
      const x0 = Math.round(cx - w / 2);
      this.resultLabel.position.set(x0, 0);
      this.resultNum.position.set(x0 + this.resultLabel.width + 6, 0);
      this.resultBg.clear();
      this.resultBg.roundRect(x0 - 8, -8, w + 16, 16, 8).fill({ color: INK, alpha: 0.8 }).stroke({ color: NEON_PINK, width: 1.5 });
      this.result.position.set(0, 142);
      this.result.alpha = Math.min(1, this.resultT / 6);
    }
  }

  /** Resumen para el puente de pruebas. */
  qaState(): object {
    return {
      views: this.views,
      hearts: this.heartN,
      pills: this.pills.map((p) => (p.shown ? { hits: p.hits.text, damage: p.dmg.text, gift: ['corazon', 'rosa', 'corona', 'cohete'][p.tier] ?? null } : null)),
      hype: this.hype.visible ? this.hype.text : null,
      hypeHits: this.hypeHits.visible ? this.hypeHits.text : null,
      chat: this.chat.filter((l) => l.c.visible).map((l) => `${l.user.text} ${l.msg.text}`),
      trend: this.trendT >= 0,
      result: this.result.visible ? `${this.resultLabel.text} ${this.resultNum.text}` : null,
    };
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
