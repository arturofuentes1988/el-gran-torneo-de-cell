// Efectos de fuego de leña y viento del silbido (el Vendedor de Leña), dibujados con
// vectores para que se vean nítidos en HD:
// - Dibujos de proyectil (los usa ProjectileLook): 'silbido' (remolino de viento con notas
//   doradas), 'tronco' (el tronco lanzado del leñazo), 'troncos' (troncos ardiendo que caen del cielo) y
//   'sonico' (el rayo plateado del súper).
// - drawRemolino (fuego que gira alrededor del rival en "¡Te paseo!"), drawMareo (estrellitas
//   del mareo) y Grieta (la pantalla que se triza con el remate del súper), en el mundo.
// - UltraShow (cinematic.lights = 'ultrainstinto') y PartyShow ('fiesta'), detrás de los
//   luchadores, en unidades de pantalla (480x270).

import { Container, Graphics } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Projectile } from '../sim/match';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

const C_FIRE_OUT = 0xff4a12;
const C_FIRE_MID = 0xff9a22;
const C_FIRE_CORE = 0xfff1a8;
const C_WIND = 0xf4fbff;
const C_NOTE = 0xffd24a;
const C_NOTE_DARK = 0x5a3a08;
const C_SILVER = 0xd8e6ff;
const C_WOOD = 0x7a4a24;
const C_WOOD_DARK = 0x3a200e;
const C_WOOD_END = 0xd8a868;

/** Llama (lengua de fuego) con base en (x, y) que sube `h` unidades: capas roja, naranja y amarilla. */
export function flame(g: Graphics, x: number, y: number, h: number, w: number, t: number, a = 1): void {
  const layers: Array<[number, number, number]> = [
    [1, C_FIRE_OUT, 0.55],
    [0.7, C_FIRE_MID, 0.75],
    [0.38, C_FIRE_CORE, 0.9],
  ];
  for (const [k, color, alpha] of layers) {
    const hh = h * (0.55 + 0.45 * k);
    const ww = w * k;
    const sway = Math.sin(t * 0.45 + x * 0.05) * ww * 0.5;
    const pts: number[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const wob = Math.sin(t * 0.7 + s * 6 + k * 3) * ww * 0.18;
      pts.push(x - ww * (1 - s) ** 0.8 + wob + sway * s * s, y - hh * s);
    }
    for (let i = n; i >= 0; i--) {
      const s = i / n;
      const wob = Math.sin(t * 0.6 + s * 5 + k * 2) * ww * 0.18;
      pts.push(x + ww * (1 - s) ** 0.8 + wob + sway * s * s, y - hh * s);
    }
    g.poly(pts, true).fill({ color, alpha: alpha * a });
  }
}

/** Tronco de leña de largo `len` y grosor `r`, centrado en (x, y) y girado `ang` (capa normal). */
export function drawLog(g: Graphics, x: number, y: number, len: number, r: number, ang: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const hx = (c * len) / 2;
  const hy = (s * len) / 2;
  const nx = -s * r;
  const ny = c * r;
  g.poly([x - hx + nx, y - hy + ny, x + hx + nx, y + hy + ny, x + hx - nx, y + hy - ny, x - hx - nx, y - hy - ny], true)
    .fill({ color: C_WOOD })
    .stroke({ width: 1.4, color: C_WOOD_DARK });
  // Vetas de la corteza.
  for (let i = -1; i <= 1; i++) {
    const o = i * 0.45;
    g.moveTo(x - hx * 0.85 + nx * o, y - hy * 0.85 + ny * o).lineTo(x + hx * 0.7 + nx * o, y + hy * 0.7 + ny * o);
  }
  g.stroke({ width: 1, color: C_WOOD_DARK, alpha: 0.7 });
  // La punta cortada, con sus anillos.
  g.ellipse(x + hx, y + hy, r * 0.55, r).fill({ color: C_WOOD_END }).stroke({ width: 1.2, color: C_WOOD_DARK });
  g.ellipse(x + hx, y + hy, r * 0.3, r * 0.55).stroke({ width: 0.8, color: 0xa87038 });
}

/** Nota musical (corchea) dorada con contorno oscuro, de tamaño `s` (capa normal). */
function note(g: Graphics, x: number, y: number, s: number, tilt: number): void {
  g.ellipse(x, y, 3.2 * s, 2.4 * s).fill({ color: C_NOTE }).stroke({ width: 1, color: C_NOTE_DARK });
  const sx = x + 2.8 * s;
  g.moveTo(sx, y).lineTo(sx + tilt, y - 10 * s).stroke({ width: 1.6 * s, color: C_NOTE_DARK });
  g.moveTo(sx + tilt, y - 10 * s).quadraticCurveTo(sx + tilt + 5 * s, y - 7 * s, sx + tilt + 3.5 * s, y - 3 * s).stroke({ width: 1.5 * s, color: C_NOTE });
}

/** Destello de cuatro puntas (capa que brilla). */
function sparkle(g: Graphics, x: number, y: number, r: number, color: number, a: number): void {
  g.poly([x, y - r, x + r * 0.22, y - r * 0.22, x + r, y, x + r * 0.22, y + r * 0.22, x, y + r, x - r * 0.22, y + r * 0.22, x - r, y, x - r * 0.22, y - r * 0.22], true)
    .fill({ color, alpha: a });
}

/** "¡Un silbidito!": remolino de viento que avanza, con notas doradas que giran y destellos. */
export function drawSilbido(base: Graphics, g: Graphics, p: Projectile): void {
  const box = p.def.box;
  const cy = p.y + box.y + box.h / 2;
  const R = box.h * 0.6;
  const f = p.frame;
  const dir = p.dir;
  const grow = Math.min(1, (f + 2) / 8);
  const fade = Math.min(1, p.life / 12);
  const a = grow * fade;
  // Líneas de velocidad detrás.
  for (let i = 0; i < 5; i++) {
    const y = cy + (i - 2) * R * 0.32;
    const len = R * (1.4 + 0.5 * Math.sin(f * 0.3 + i));
    g.moveTo(p.x - dir * R * 0.4, y).lineTo(p.x - dir * (R * 0.4 + len), y).stroke({ width: 1.4, color: C_WIND, alpha: 0.35 * a });
  }
  // Tres brazos de viento en espiral que giran.
  for (let arm = 0; arm < 3; arm++) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const ang = f * 0.42 * dir + arm * 2.094 + t * 5.2;
      const r = R * (0.12 + t * 0.88) * grow;
      pts.push([p.x + Math.cos(ang) * r * 0.75, cy + Math.sin(ang) * r * 0.62]);
    }
    for (let w = 0; w < 2; w++) {
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.stroke({ width: w === 0 ? 5 : 1.8, color: w === 0 ? 0xbfe6ff : C_WIND, alpha: (w === 0 ? 0.28 : 0.8) * a, cap: 'round', join: 'round' });
    }
  }
  g.circle(p.x, cy, R * 0.32 * grow).fill({ color: 0xffffff, alpha: 0.35 * a });
  // Notas doradas que giran alrededor.
  const s = Math.max(0.8, R / 26);
  for (let i = 0; i < 4; i++) {
    const ang = f * 0.18 * dir + i * 1.57;
    note(base, p.x + Math.cos(ang) * R * 1.05, cy + Math.sin(ang) * R * 0.75 + Math.sin(f * 0.3 + i) * 3, s, i % 2 ? 1 : -1);
  }
  for (let i = 0; i < 4; i++) sparkle(g, p.x + rand(-R, R), cy + rand(-R, R) * 0.8, rand(2, 4.5), 0xfff4c0, 0.9 * a);
}

/** "¡Leñazo!": el tronco lanzado que vuela girando, con líneas de velocidad (sin fuego). */
export function drawTronco(base: Graphics, g: Graphics, p: Projectile): void {
  const box = p.def.box;
  const cy = p.y + box.y + box.h / 2;
  const len = box.w * 1.05;
  const r = box.h * 0.27;
  const dir = p.dir;
  // Líneas de velocidad detrás (blancas, como de viento).
  for (let i = 0; i < 4; i++) {
    const y = cy + (i - 1.5) * r * 0.9;
    const l = len * (0.7 + 0.3 * Math.sin(p.frame * 0.5 + i * 1.7));
    g.moveTo(p.x - dir * len * 0.45, y).lineTo(p.x - dir * (len * 0.45 + l), y).stroke({ width: 1.3, color: 0xffffff, alpha: 0.4 });
  }
  drawLog(base, p.x, cy, len, r, p.frame * 0.42 * dir);
}

/** Dónde cae cada tronco (corrimiento desde el rival) y su giro. */
const LOG_X = [-30, 30, -6, 44, -46, 16];
/** Cómo quedan tirados en el suelo (casi acostados). */
const LOG_REST = [-0.14, 0.2, -0.3, 0.08, 0.26, -0.05];

/** Cuadro en que cae el tronco i (los golpes: el primero al terminar la espera, luego cada intervalo). */
export function logLandFrame(p: Projectile, i: number): number {
  return (p.def.delay ?? 0) + i * (p.def.hitInterval ?? 10);
}

/** "¡Llegó la leña!": aviso en el suelo y troncos ardiendo que caen del cielo uno tras otro. */
export function drawTroncos(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const n = p.def.hits;
  const f = p.frame + after;
  const fade = Math.min(1, (p.life + 1) / 14) * Math.max(0, 1 - after / 16);
  if (fade <= 0) return;
  const top = -300;
  const fall = 12;
  // La sombra en el suelo avisa dónde van a caer.
  const first = logLandFrame(p, 0);
  if (f < first + 4) {
    const k = Math.min(1, f / Math.max(1, first));
    g.ellipse(p.x, 0, 22 + k * 22, 4 + k * 3).fill({ color: C_FIRE_MID, alpha: (0.15 + 0.4 * k) * (0.7 + Math.random() * 0.3) });
  }
  for (let i = 0; i < n; i++) {
    const land = logLandFrame(p, i);
    const start = land - fall;
    if (f < start) continue;
    const x = p.x + (LOG_X[i % LOG_X.length] * p.def.box.w) / 68;
    const len = 44 + (i % 3) * 6;
    const r = 8 + (i % 2) * 2;
    if (f < land) {
      // Cayendo: gira y deja una estela de fuego hacia arriba.
      const t = (f - start) / fall;
      const y = top + (-r - top) * t * t;
      const ang = (i % 2 ? 1 : -1) * (t * 4 + i);
      for (let k = 1; k <= 3; k++) flame(g, x, y - k * 2, 26 + k * 6, 7, f * 2 + i * 5 + k, 0.55 * fade);
      drawLog(base, x, y, len, r, ang);
    } else {
      // En el suelo, ardiendo: quedan tirados con llamitas.
      const ang = LOG_REST[i % LOG_REST.length];
      drawLog(base, x, -r + 1, len, r, ang);
      flame(g, x, -r, 16 + Math.sin(f * 0.4 + i) * 3, 9, f + i * 9, 0.8 * fade);
      if (f - land < 6) g.circle(x, -4, 24 * (1 - (f - land) / 6) + 6).fill({ color: C_FIRE_CORE, alpha: 0.5 * fade });
    }
  }
}

/** El rayo plateado del súper: carga en la boca, haz con ondas de sonido y destellos. */
export function drawSonico(g: Graphics, p: Projectile, after: number): void {
  const box = p.def.box;
  const cy = p.y + box.y + box.h / 2;
  const delay = p.def.delay ?? 0;
  const dir = p.dir;
  const f = p.frame + after;
  const fade = Math.min(1, p.life / 16) * Math.max(0, 1 - after / 20);
  if (fade <= 0) return;
  if (p.frame < delay && !after) {
    const k = (p.frame + 1) / Math.max(1, delay);
    g.circle(p.x, cy, 6 + k * 14).fill({ color: C_SILVER, alpha: 0.35 + k * 0.4 });
    g.circle(p.x, cy, 3 + k * 6).fill({ color: 0xffffff, alpha: 0.9 });
    return;
  }
  const L = box.w * Math.min(1, (p.frame - delay + 2) / 8);
  const x1 = p.x + dir * L;
  const wob = Math.sin(f * 0.9) * 3;
  // Halo ancho, cuerpo plateado y núcleo blanco.
  g.moveTo(p.x, cy).lineTo(x1, cy).stroke({ width: 70 + wob * 2, color: 0x9fb8ff, alpha: 0.18 * fade });
  g.moveTo(p.x, cy).lineTo(x1, cy).stroke({ width: 34 + wob, color: C_SILVER, alpha: 0.45 * fade });
  g.moveTo(p.x, cy).lineTo(x1, cy).stroke({ width: 12, color: 0xffffff, alpha: 0.95 * fade });
  // Ondas de sonido que viajan por el haz.
  for (let k = 0; k < 9; k++) {
    const d = (f * 9 + k * 50) % Math.max(1, L);
    const ry = 26 + (d / Math.max(1, L)) * 34;
    g.ellipse(p.x + dir * d, cy, 5, ry).stroke({ width: 2.2, color: 0xffffff, alpha: 0.75 * fade * (1 - d / Math.max(1, L) * 0.5) });
  }
  for (let i = 0; i < 10; i++) sparkle(g, p.x + dir * rand(0, L), cy + rand(-40, 40), rand(2, 5), 0xffffff, 0.9 * fade);
  g.circle(p.x, cy, 22 + wob).fill({ color: 0xffffff, alpha: 0.6 * fade });
}

/** Fuego que gira alrededor del rival mientras lo pasea ("¡Te paseo!"): anillo de llamas. */
export function drawRemolino(g: Graphics, x: number, top: number, bottom: number, t: number): void {
  const h = bottom - top;
  const cy = top + h * 0.55;
  const rx = 34;
  const ry = h * 0.42;
  for (let i = 0; i < 10; i++) {
    const ang = t * 0.35 + (i / 10) * Math.PI * 2;
    const px = x + Math.cos(ang) * rx;
    const py = cy + Math.sin(ang) * ry * 0.35 - Math.sin(ang * 0.5 + t * 0.1) * ry * 0.5;
    // Las de adelante (abajo de la elipse) más fuertes.
    const front = Math.sin(ang) > 0 ? 1 : 0.55;
    flame(g, px, py + 10, 22, 7, t + i * 4, 0.75 * front);
  }
  g.ellipse(x, cy, rx * 1.1, ry * 0.3).stroke({ width: 3, color: C_FIRE_MID, alpha: 0.5 });
}

/** Estrellitas del mareo que giran sobre la cabeza (capa normal, con contorno). */
export function drawMareo(g: Graphics, x: number, y: number, t: number): void {
  for (let i = 0; i < 3; i++) {
    const ang = t * 0.2 + (i / 3) * Math.PI * 2;
    const sx = x + Math.cos(ang) * 16;
    const sy = y - 6 + Math.sin(ang) * 4;
    const r = 4.5;
    const pts: number[] = [];
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2 + t * 0.15;
      pts.push(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    g.poly(pts, true).fill({ color: 0xffe14a }).stroke({ width: 1, color: 0x5a3a08 });
  }
}

/** La pantalla que se triza con el remate del súper: grietas desde el impacto que se desvanecen. */
export class Grieta {
  readonly g = new Graphics();
  private segs: Array<[number, number, number, number, number]> = [];
  private shards: number[][] = [];
  private t = 0;
  private x = 0;
  private y = 0;

  /** Triza desde (x, y) de mundo. */
  start(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.t = 46;
    this.segs = [];
    this.shards = [];
    const rays = 11;
    for (let i = 0; i < rays; i++) {
      let ang = (i / rays) * Math.PI * 2 + rand(-0.15, 0.15);
      let px = x;
      let py = y;
      let w = 2.4;
      const len = rand(160, 300);
      for (let d = 0; d < len; ) {
        const step = rand(14, 30);
        ang += rand(-0.35, 0.35);
        const nx = px + Math.cos(ang) * step;
        const ny = py + Math.sin(ang) * step;
        this.segs.push([px, py, nx, ny, w]);
        if (Math.random() < 0.3) {
          const ba = ang + rand(-1, 1);
          this.segs.push([nx, ny, nx + Math.cos(ba) * rand(12, 40), ny + Math.sin(ba) * rand(12, 40), w * 0.6]);
        }
        px = nx;
        py = ny;
        d += step;
        w = Math.max(0.8, w * 0.9);
      }
    }
    // Trozos de vidrio (triángulos más claros) cerca del centro.
    for (let i = 0; i < 9; i++) {
      const a = rand(0, Math.PI * 2);
      const r0 = rand(6, 30);
      const r1 = r0 + rand(16, 46);
      const da = rand(0.2, 0.5);
      this.shards.push([x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a + da) * r1, y + Math.sin(a + da) * r1, x + Math.cos(a - da * 0.4) * r1, y + Math.sin(a - da * 0.4) * r1]);
    }
  }

  step(): void {
    if (this.t > 0) this.t--;
  }

  render(): void {
    const g = this.g;
    g.clear();
    if (this.t <= 0) return;
    const a = Math.min(1, this.t / 16);
    if (this.t > 40) g.circle(this.x, this.y, 60 + (46 - this.t) * 30).fill({ color: 0xffffff, alpha: 0.35 * ((this.t - 40) / 6) });
    for (const s of this.shards) g.poly(s, true).fill({ color: 0xe8f2ff, alpha: 0.28 * a }).stroke({ width: 1, color: 0xffffff, alpha: 0.6 * a });
    for (const [x0, y0, x1, y1, w] of this.segs) g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w + 1.6, color: 0x1a2440, alpha: 0.45 * a });
    for (const [x0, y0, x1, y1, w] of this.segs) g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: w, color: 0xffffff, alpha: 0.95 * a });
  }

  destroy(): void {
    this.g.destroy();
  }
}

interface Mote {
  x: number;
  y: number;
  v: number;
  r: number;
}

/** "SILBIDO DE LA MUERTE: ULTRA INSTINTO": pantalla oscura azulada, haces y destellos plateados que suben. */
export class UltraShow {
  readonly container = new Container();
  private bg = new Graphics();
  private glow = new Graphics();
  private motes: Mote[] = [];
  private level = 0;
  private on = false;
  private t = 0;
  private flash = 0;

  constructor() {
    this.glow.blendMode = 'add';
    this.container.addChild(this.bg, this.glow);
    for (let i = 0; i < 60; i++) this.motes.push({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), v: rand(0.4, 1.6), r: rand(0.6, 2) });
    this.container.visible = false;
  }

  start(): void {
    this.on = true;
    this.t = 0;
    this.flash = 1;
  }

  stop(): void {
    this.on = false;
  }

  get darkness(): number {
    return this.level * 0.7;
  }

  /** Destello plateado a pedido (el remate). */
  strike(): void {
    this.flash = 1;
  }

  step(): void {
    this.level += ((this.on ? 1 : 0) - this.level) * (this.on ? 0.14 : 0.05);
    const active = this.level > 0.02 || this.flash > 0.03;
    this.container.visible = active;
    if (!active) {
      this.level = 0;
      return;
    }
    this.t++;
    this.flash *= 0.85;
    for (const m of this.motes) {
      m.y -= m.v;
      m.x += Math.sin((m.y + this.t) * 0.03) * 0.3;
      if (m.y < -4) {
        m.y = VIEW_H + 4;
        m.x = rand(0, VIEW_W);
      }
    }
  }

  update(camOffY: number): void {
    if (!this.container.visible) return;
    const L = this.level;
    this.container.y = -camOffY * 0.2;
    this.bg.clear();
    this.bg.rect(0, -20, VIEW_W, VIEW_H + 40).fill({ color: 0x050a1e, alpha: 0.5 * L });
    this.glow.clear();
    // Haces verticales que suben y laten.
    for (let i = 0; i < 7; i++) {
      const x = ((i * 79 + this.t * 0.6) % (VIEW_W + 60)) - 30;
      const w = 10 + 8 * Math.sin(this.t * 0.07 + i);
      this.glow.rect(x - w / 2, -20, w, VIEW_H + 40).fill({ color: 0x9fb8ff, alpha: 0.07 * L });
    }
    for (const m of this.motes) {
      this.glow.circle(m.x, m.y, m.r).fill({ color: C_SILVER, alpha: 0.8 * L });
      if (m.r > 1.6) sparkle(this.glow, m.x, m.y, m.r * 2.5, 0xffffff, 0.6 * L);
    }
    if (this.flash > 0.02) this.glow.rect(0, -20, VIEW_W, VIEW_H + 40).fill({ color: 0xeaf2ff, alpha: this.flash * 0.45 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

interface Confeti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: number;
}

interface Chispa {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
}

const PARTY = [0xff3a5a, 0xffd23a, 0x3ad0ff, 0x7aff5a, 0xff7ae0, 0xffffff, 0xff8a1e];

/** "¡EL NÚMERO UNO DEL PARTY!": focos de colores que barren, confeti y fuegos artificiales. */
export class PartyShow {
  readonly container = new Container();
  private bg = new Graphics();
  private beams = new Graphics();
  private conf = new Graphics();
  private fire = new Graphics();
  private confeti: Confeti[] = [];
  private sparks: Chispa[] = [];
  private level = 0;
  private on = false;
  private t = 0;
  private next = 0;

  constructor() {
    this.beams.blendMode = 'add';
    this.fire.blendMode = 'add';
    this.container.addChild(this.bg, this.beams, this.conf, this.fire);
    this.container.visible = false;
  }

  start(): void {
    this.on = true;
    this.t = 0;
    this.next = 6;
    this.confeti = [];
    for (let i = 0; i < 90; i++) this.addConfeti(rand(-VIEW_H, 0));
  }

  stop(): void {
    this.on = false;
  }

  get darkness(): number {
    return this.level * 0.5;
  }

  private addConfeti(y: number): void {
    this.confeti.push({
      x: rand(0, VIEW_W), y, vx: rand(-0.4, 0.4), vy: rand(0.8, 1.8), rot: rand(0, 6), vr: rand(-0.25, 0.25),
      color: PARTY[Math.floor(Math.random() * PARTY.length)],
    });
  }

  /** Fuego artificial que estalla en (x, y) de pantalla. */
  burst(x: number, y: number, big = false): void {
    const color = PARTY[Math.floor(Math.random() * (PARTY.length - 1))];
    const n = big ? 46 : 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const v = rand(big ? 2.4 : 1.6, big ? 4.2 : 3);
      const l = Math.round(rand(26, 40));
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, color: Math.random() < 0.2 ? 0xffffff : color });
    }
  }

  step(): void {
    this.level += ((this.on ? 1 : 0) - this.level) * (this.on ? 0.14 : 0.05);
    const active = this.level > 0.02 || this.sparks.length > 0;
    this.container.visible = active;
    if (!active) {
      this.level = 0;
      return;
    }
    this.t++;
    if (this.on && this.t >= this.next) {
      this.next = this.t + Math.round(rand(14, 28));
      this.burst(rand(40, VIEW_W - 40), rand(30, 110));
    }
    for (const c of this.confeti) {
      c.x += c.vx + Math.sin((c.y + c.rot * 20) * 0.05) * 0.4;
      c.y += c.vy;
      c.rot += c.vr;
      if (c.y > VIEW_H + 6 && this.on) {
        c.y = -6;
        c.x = rand(0, VIEW_W);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.vx *= 0.96;
      s.vy = s.vy * 0.96 + 0.05;
      s.x += s.vx;
      s.y += s.vy;
      if (--s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  update(camOffY: number): void {
    if (!this.container.visible) return;
    const L = this.level;
    this.container.y = -camOffY * 0.2;
    this.bg.clear();
    this.bg.rect(0, -20, VIEW_W, VIEW_H + 40).fill({ color: 0x14061e, alpha: 0.4 * L });
    // Resplandor de fogata abajo.
    for (let i = 0; i < 5; i++) this.bg.rect(0, VIEW_H - 18 - i * 10, VIEW_W, 12).fill({ color: 0xff6a1a, alpha: (0.12 - i * 0.02) * L * (0.8 + 0.2 * Math.sin(this.t * 0.3 + i)) });
    this.beams.clear();
    // Cuatro focos que barren desde arriba.
    for (let i = 0; i < 4; i++) {
      const x0 = 60 + i * 120;
      const ang = Math.sin(this.t * 0.035 + i * 1.7) * 0.6;
      const len = VIEW_H + 40;
      const x1 = x0 + Math.sin(ang) * len;
      const w = 40;
      this.beams.poly([x0 - 4, -10, x0 + 4, -10, x1 + w, len, x1 - w, len], true).fill({ color: PARTY[i], alpha: 0.13 * L });
    }
    this.conf.clear();
    for (const c of this.confeti) {
      const cs = Math.cos(c.rot) * 2.6;
      const sn = Math.sin(c.rot) * 1.4;
      this.conf.poly([c.x - cs, c.y - sn, c.x + sn, c.y - cs * 0.5, c.x + cs, c.y + sn, c.x - sn, c.y + cs * 0.5], true).fill({ color: c.color, alpha: 0.95 * L });
    }
    this.fire.clear();
    for (const s of this.sparks) {
      const a = s.life / s.max;
      this.fire.moveTo(s.x, s.y).lineTo(s.x - s.vx * 3, s.y - s.vy * 3).stroke({ width: 1.6, color: s.color, alpha: a });
      this.fire.circle(s.x, s.y, 1.3).fill({ color: 0xffffff, alpha: a });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
