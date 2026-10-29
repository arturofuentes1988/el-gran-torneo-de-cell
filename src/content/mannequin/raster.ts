// Rasterizador de pixel art para los maniquíes: pinta cada pieza del
// esqueleto pixel a pixel (sin antialiasing), con sombreado por tonos,
// líneas internas entre piezas superpuestas y contorno oscuro de 1 px.

import { DIM, limbDir, lerpV, upDir, type Face, type Skeleton, type V2 } from './rig';

/** Cabeza dibujada a mano: una grilla de letras por expresión ('.' = transparente) y su paleta. */
export interface HeadSprite {
  w: number;
  h: number;
  /** Centro del cráneo dentro de la grilla (coincide con el centro de la cabeza del esqueleto). */
  pivot: [number, number];
  faces: Record<Face, string[]>;
  palette: Record<string, number>;
}

export type BaseMat = 'skin' | 'top' | 'pants' | 'belt' | 'glove' | 'shoe' | 'hair' | 'band';
/** Materiales opcionales para ropa con detalles (chaquetas, cadenas). */
export type ExtraMat = 'accent' | 'trim' | 'chain';
export type Mat = BaseMat | ExtraMat;
/** Rampa de 5 tonos, de oscuro a claro (0xRRGGBB). */
export type Ramp = [number, number, number, number, number];

export interface FighterStyle {
  ramps: Record<BaseMat, Ramp> & Partial<Record<ExtraMat, Ramp>>;
  outline: number;
  eye: number;
  hair: 'spiky' | 'cap' | 'none';
  bareFeet: boolean;
  /** Talla (escala del esqueleto), contextura (grosor de las piezas) y largo de piernas. */
  body?: { scale: number; girth: number; legs?: number };
  /** Cabeza dibujada a mano: reemplaza la cabeza y el pelo procedurales. */
  head?: HeadSprite;
  /** Chaqueta: torso y mangas 'top', hombros 'accent', cuello 'trim', cierre 'band', puños y basta 'belt'. */
  jacket?: { chain?: boolean };
  /** Jeans rotos: hilos claros y piel a la vista en muslos y canillas. */
  rips?: boolean;
}

const MATS: Mat[] = ['skin', 'top', 'pants', 'belt', 'glove', 'shoe', 'hair', 'band', 'accent', 'trim', 'chain'];
/** Marca de pixel con color directo (cabeza dibujada a mano). */
const DIRECT = 127;
const DEG = Math.PI / 180;

// Luz desde arriba a la izquierda y hacia la cámara.
const LX = -0.5;
const LY = -0.68;
const LZ = 0.54;

type Shape =
  | { kind: 'cap'; a: V2; b: V2; ra: number; rb: number }
  | { kind: 'circle'; c: V2; r: number }
  | { kind: 'sprite'; c: V2; ang: number; sprite: HeadSprite; face: Face };

/** Zona de ropa: el material de cada pixel depende de su posición en la pieza. */
type Zone = 'torso' | 'collar' | 'upperArm' | 'foreArm' | 'thigh' | 'shin';

interface Part {
  shape: Shape;
  mat: Mat;
  group: number;
  /** -1 para piezas traseras (un tono más oscuro). */
  shade: number;
  /** Material alternativo según la posición local de la cabeza. */
  head?: boolean;
  zone?: Zone;
}

// Grupos: las líneas internas solo se dibujan entre grupos distintos.
const G_LEG_B = 0;
const G_ARM_B = 1;
const G_TORSO = 2;
const G_HEAD = 3;
const G_LEG_F = 4;
const G_ARM_F = 5;

function cap(a: V2, b: V2, ra: number, rb: number, mat: Mat, group: number, shade = 0, zone?: Zone): Part {
  return { shape: { kind: 'cap', a, b, ra, rb }, mat, group, shade, zone };
}

function circle(c: V2, r: number, mat: Mat, group: number, shade = 0): Part {
  return { shape: { kind: 'circle', c, r }, mat, group, shade };
}

const along = (p: V2, d: V2, k: number): V2 => ({ x: p.x + d.x * k, y: p.y + d.y * k });

/** Convierte coordenadas locales de la cabeza (adelante, arriba) a coordenadas del sprite. */
function headPoint(sk: Skeleton, f: number, u: number): V2 {
  const up = upDir(sk.headAng);
  const fw = { x: -up.y, y: up.x };
  return { x: sk.headC.x + fw.x * f + up.x * u, y: sk.headC.y + fw.y * f + up.y * u };
}

function buildParts(sk: Skeleton, st: FighterStyle): Part[] {
  const parts: Part[] = [];
  const k = sk.scale;
  const girth = st.body?.girth ?? 1;
  // Los radios crecen con la talla y con la contextura.
  const R = (r: number) => r * k * girth;
  const tu = upDir(sk.torsoAng);
  const tf = { x: -tu.y, y: tu.x };
  const footMat: Mat = st.bareFeet ? 'skin' : 'shoe';
  const sleeve: Mat = st.jacket ? 'top' : 'skin';

  const leg = (hp: V2, kn: V2, an: V2, to: V2, g: number, sh: number) => {
    parts.push(cap(hp, kn, R(9.6), R(7.4), 'pants', g, sh, 'thigh'));
    parts.push(cap(kn, an, R(7.2), R(5.4), 'pants', g, sh, 'shin'));
    parts.push(cap(an, to, R(4.6), R(3.8), footMat, g, sh));
  };
  const arm = (shp: V2, el: V2, ha: V2, g: number, sh: number) => {
    parts.push(cap(shp, el, R(7.4), R(6.0), sleeve, g, sh, 'upperArm'));
    parts.push(cap(el, ha, R(6.0), R(5.0), sleeve, g, sh, 'foreArm'));
    if (sk.point) {
      // Pistolita: puño chico, índice estirado y pulgar hacia arriba.
      const len = Math.hypot(ha.x - el.x, ha.y - el.y) || 1;
      const d = { x: (ha.x - el.x) / len, y: (ha.y - el.y) / len };
      const up = { x: d.y, y: -d.x };
      parts.push(circle(ha, R(4.6), 'glove', g, sh));
      parts.push(cap(ha, along(ha, d, 8.5 * k), R(1.9), R(1.6), 'glove', g, sh));
      parts.push(cap(ha, along(along(ha, up, 5 * k), d, 1.5 * k), R(1.8), R(1.5), 'glove', g, sh));
    } else if (sk.open) parts.push(circle(ha, R(5.4), 'skin', g, sh));
    else parts.push(circle(ha, R(DIM.fistR), 'glove', g, sh));
  };

  leg(sk.hpB, sk.knB, sk.anB, sk.toB, G_LEG_B, -1);
  if (!sk.armsFront) arm(sk.shB, sk.elB, sk.haB, G_ARM_B, -1);

  // Torso: pelvis, abdomen, pecho y cinturón. El volumen va un poco hacia
  // adelante de la línea central (pecho), para que la espalda no parezca joroba.
  const fwd = (p: V2, kk: number): V2 => ({ x: p.x + tf.x * kk * k, y: p.y + tf.y * kk * k });
  const mid = lerpV(sk.hip, sk.neck, 0.45);
  const chestTop = { x: sk.neck.x - tu.x * 2 * k, y: sk.neck.y - tu.y * 2 * k };
  parts.push(cap(sk.hpB, sk.hpF, R(11), R(11), 'pants', G_TORSO));
  parts.push(cap(fwd(sk.hip, 1), fwd(mid, 2.5), R(12), R(13.5), 'top', G_TORSO, 0, 'torso'));
  parts.push(cap(fwd(mid, 2.5), fwd(chestTop, 3.5), R(14.5), R(15), 'top', G_TORSO, 0, 'torso'));
  if (!st.jacket) {
    const beltC = { x: sk.hip.x + tu.x * 4 * k, y: sk.hip.y + tu.y * 4 * k };
    parts.push(cap(along(beltC, tf, -10 * k * girth), along(beltC, tf, 10 * k * girth), R(2.7), R(2.7), 'belt', G_TORSO));
  }

  const nu = upDir(sk.headAng);
  if (st.head) {
    // Cuello, cuello de la chaqueta encima y la cabeza dibujada a mano.
    parts.push(cap(sk.neck, along(sk.neck, nu, 7 * k), R(5.6), R(5.6), 'skin', G_HEAD));
    if (st.jacket) parts.push(cap(along(sk.neck, tu, -3 * k), along(sk.neck, tu, 2.5 * k), R(6.4), R(6.0), 'trim', G_TORSO, 0, 'collar'));
    parts.push({ shape: { kind: 'sprite', c: sk.headC, ang: sk.headAng, sprite: st.head, face: sk.face }, mat: 'skin', group: G_HEAD, shade: 0 });
  } else {
    // Cabeza procedural: cintas por detrás, cuello, cabeza + mandíbula, pelo / gorro.
    if (st.hair === 'spiky') {
      const t1 = headPoint(sk, -9, 5.5);
      const d1 = limbDir(sk.tail);
      const d2 = limbDir(sk.tail + 16);
      parts.push(cap(t1, { x: t1.x + d1.x * 14, y: t1.y + d1.y * 14 }, 2, 1.4, 'band', G_HEAD));
      const t2 = headPoint(sk, -9, 4.2);
      parts.push(cap(t2, { x: t2.x + d2.x * 10, y: t2.y + d2.y * 10 }, 1.7, 1.2, 'band', G_HEAD));
    }
    parts.push(cap(sk.neck, { x: sk.neck.x + nu.x * 7, y: sk.neck.y + nu.y * 7 }, 5.6, 5.6, 'skin', G_HEAD));
    parts.push({ ...circle(sk.headC, DIM.headR, 'skin', G_HEAD), head: true });
    parts.push({ ...circle(headPoint(sk, 3.8, -4.8), 7.6, 'skin', G_HEAD), head: true });
    if (st.hair === 'spiky') {
      const spikes: Array<[number, number, number, number, number]> = [
        [-2, 8, -7, 16, 2.4],
        [-7, 6, -15, 10, 2.3],
        [2, 8.5, 1, 15.5, 2.0],
        [-10, 2, -16, 0, 2.0],
        [5, 7, 8, 11, 1.6],
      ];
      for (const [f0, u0, f1, u1, r] of spikes) {
        parts.push(cap(headPoint(sk, f0, u0), headPoint(sk, f1, u1), r, r * 0.6, 'hair', G_HEAD));
      }
    } else if (st.hair === 'cap') {
      parts.push(cap(headPoint(sk, -7, 3.5), headPoint(sk, -16, 2), 2.4, 2.2, 'band', G_HEAD));
      parts.push(circle(headPoint(sk, -8.5, -3), 3.4, 'hair', G_HEAD));
    }
  }

  leg(sk.hpF, sk.knF, sk.anF, sk.toF, G_LEG_F, 0);
  if (sk.armsFront) arm(sk.shB, sk.elB, sk.haB, G_ARM_B, 0);
  arm(sk.shF, sk.elF, sk.haF, G_ARM_F, 0);
  return parts;
}

/** Material de un pixel de la cabeza procedural según su posición local. */
function headMat(st: FighterStyle, f: number, u: number): Mat {
  if (st.hair === 'spiky') {
    if (u > 7.2) return 'hair';
    if (u > 4 && u <= 7.2) return 'band';
    if (f < -6.5 && u > -3) return 'hair';
    return 'skin';
  }
  if (u > 2.4) return 'band';
  if (f < -7.5 && u > -5) return 'hair';
  return 'skin';
}

/** Rajas de los jeans rotos: posición a lo largo del muslo / la canilla (0..1). */
const RIPS: Record<'thigh' | 'shin', number[]> = { thigh: [0.5, 0.66, 0.76], shin: [0.14, 0.24] };

/**
 * Material de un pixel de ropa con detalles.
 * t: posición a lo largo de la pieza (0..1); side: distancia al eje (positiva
 * hacia adelante); r: radio de la pieza en ese punto; len: largo de la pieza.
 */
function zoneMat(st: FighterStyle, sk: Skeleton, zone: Zone, base: Mat, t: number, side: number, r: number, len: number, lx: number, ly: number): Mat {
  const k = sk.scale;
  if (st.jacket) {
    if (zone === 'torso') {
      const tu = upDir(sk.torsoAng);
      const rx = lx - sk.hip.x;
      const ry = ly - sk.hip.y;
      const u = rx * tu.x + ry * tu.y; // pixeles hacia el cuello
      const f = rx * -tu.y + ry * tu.x; // pixeles hacia adelante
      const L = Math.hypot(sk.neck.x - sk.hip.x, sk.neck.y - sk.hip.y);
      const zipF = 7.5 * k * (st.body?.girth ?? 1);
      if (st.jacket.chain) {
        // Cadena: arco que cuelga del cuello sobre el pecho.
        const cu = L * 1.02;
        const cr = 12 * k;
        const dd = Math.hypot(f - zipF + 2 * k, u - cu);
        if (u < cu && Math.abs(dd - cr) < 0.9) return 'chain';
      }
      if (u > L * 0.86) return 'accent';
      if (Math.abs(f - zipF) < 0.6) return 'band';
      if (u < L * 0.08) return 'belt';
      return 'top';
    }
    if (zone === 'collar') return t > 0.42 && t < 0.62 ? 'accent' : 'trim';
    if (zone === 'upperArm') return t < 0.3 ? 'accent' : 'top';
    if (zone === 'foreArm') return t > 0.8 ? 'belt' : 'top';
  }
  if (st.rips && (zone === 'thigh' || zone === 'shin')) {
    // Rajas horizontales al frente: hilos blancos con piel entre medio y un borde deshilachado.
    if (side > -0.25 * r && side < 0.62 * r) {
      const d = t * len;
      for (const s0 of RIPS[zone]) {
        const off = d - s0 * len;
        if (Math.abs(off) < 0.5) return Math.floor(side + 8) % 2 ? 'skin' : 'trim';
        if (Math.abs(off - 1) < 0.5 && Math.floor(side + 8) % 3 === 0) return 'trim';
      }
    }
  }
  return base;
}

function toABGR(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Pinta el esqueleto en `out` (ABGR, ancho outW) dentro del rectángulo
 * (dx, dy, w, h), con los pies en (dx + ox, dy + oy).
 */
export function rasterize(
  sk: Skeleton,
  st: FighterStyle,
  out: Uint32Array,
  outW: number,
  dx: number,
  dy: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
): void {
  const parts = buildParts(sk, st);
  const n = w * h;
  const order = new Int16Array(n).fill(-1);
  const group = new Int8Array(n).fill(-1);
  const mat = new Int8Array(n).fill(-1);
  const level = new Int8Array(n);
  const direct = new Uint32Array(n);
  const hup = upDir(sk.headAng);
  const hfw = { x: -hup.y, y: hup.x };

  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi];
    const s = p.shape;
    if (s.kind === 'sprite') {
      stampSprite(s, pi, p.group, order, group, mat, direct, w, h, ox, oy);
      continue;
    }
    let minX: number, maxX: number, minY: number, maxY: number;
    if (s.kind === 'cap') {
      const r = Math.max(s.ra, s.rb);
      minX = Math.min(s.a.x, s.b.x) - r;
      maxX = Math.max(s.a.x, s.b.x) + r;
      minY = Math.min(s.a.y, s.b.y) - r;
      maxY = Math.max(s.a.y, s.b.y) + r;
    } else {
      minX = s.c.x - s.r;
      maxX = s.c.x + s.r;
      minY = s.c.y - s.r;
      maxY = s.c.y + s.r;
    }
    const px0 = Math.max(0, Math.floor(minX + ox));
    const px1 = Math.min(w - 1, Math.ceil(maxX + ox));
    const py0 = Math.max(0, Math.floor(minY + oy));
    const py1 = Math.min(h - 1, Math.ceil(maxY + oy));
    const matBase = MATS.indexOf(p.mat);

    for (let py = py0; py <= py1; py++) {
      const ly = py + 0.5 - oy;
      for (let px = px0; px <= px1; px++) {
        const lx = px + 0.5 - ox;
        let cx: number, cy: number, r: number;
        let t = 0;
        let side = 0;
        let len = 0;
        if (s.kind === 'cap') {
          const ex = s.b.x - s.a.x;
          const ey = s.b.y - s.a.y;
          const len2 = ex * ex + ey * ey;
          t = len2 > 0 ? ((lx - s.a.x) * ex + (ly - s.a.y) * ey) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          cx = s.a.x + ex * t;
          cy = s.a.y + ey * t;
          r = s.ra + (s.rb - s.ra) * t;
          if (p.zone) {
            len = Math.sqrt(len2) || 1;
            side = ((lx - cx) * ey - (ly - cy) * ex) / len;
          }
        } else {
          cx = s.c.x;
          cy = s.c.y;
          r = s.r;
        }
        const ddx = lx - cx;
        const ddy = ly - cy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > r * r) continue;
        const nx = ddx / r;
        const ny = ddy / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const I = nx * LX + ny * LY + nz * LZ;
        let lv = I > 0.8 ? 4 : I > 0.48 ? 3 : I > 0.12 ? 2 : I > -0.28 ? 1 : 0;
        lv = Math.max(0, Math.min(4, lv + p.shade));
        let m = matBase;
        if (p.head) {
          const hx = lx - sk.headC.x;
          const hy = ly - sk.headC.y;
          m = MATS.indexOf(headMat(st, hx * hfw.x + hy * hfw.y, hx * hup.x + hy * hup.y));
        } else if (p.zone) {
          m = MATS.indexOf(zoneMat(st, sk, p.zone, p.mat, t, side, r, len, lx, ly));
        }
        const i = py * w + px;
        order[i] = pi;
        group[i] = p.group;
        mat[i] = m;
        level[i] = lv;
      }
    }
  }

  // Ojo, ceja y boca de la cabeza procedural (en coordenadas locales de la cabeza).
  const marks = new Uint8Array(n);
  if (!st.head) {
    const eyeMarks: Array<[number, number, number]> = [
      [5.2, 0.6, -2],
      [6.4, 0.6, -2],
      [3.6, 3.0, -3],
      [4.8, 3.2, -3],
      [6.0, 3.0, -3],
      [7.4, -5.2, -4],
    ];
    // 0 = sin marca, 1 = ojo/boca, 2 = ceja.
    const skinIdx = MATS.indexOf('skin');
    for (const [f, u, kind] of eyeMarks) {
      const px = Math.floor(sk.headC.x + hfw.x * f + hup.x * u + ox);
      const py = Math.floor(sk.headC.y + hfw.y * f + hup.y * u + oy);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = py * w + px;
      if (group[i] === G_HEAD && mat[i] === skinIdx) marks[i] = kind === -3 ? 2 : 1;
    }
  }

  // Líneas internas: el pixel de atrás que toca una pieza de adelante se oscurece.
  const line = new Uint8Array(n);
  const inFront = (j: number, o: number, g: number) => order[j] > o && group[j] !== g && group[j] >= 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = order[i];
      if (o < 0) continue;
      const g = group[i];
      if (
        (x > 0 && inFront(i - 1, o, g)) ||
        (x < w - 1 && inFront(i + 1, o, g)) ||
        (y > 0 && inFront(i - w, o, g)) ||
        (y < h - 1 && inFront(i + w, o, g))
      ) {
        line[i] = 1;
      }
    }
  }

  const outline = toABGR(st.outline);
  const eye = toABGR(st.eye);
  const ramps = MATS.map((mk) => (st.ramps[mk] ?? st.ramps.top).map(toABGR));
  const brow = ramps[MATS.indexOf('hair')][0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oi = (dy + y) * outW + dx + x;
      if (order[i] >= 0) {
        if (mat[i] === DIRECT) {
          out[oi] = line[i] ? outline : direct[i];
          continue;
        }
        const mark = marks[i];
        if (mark === 1) out[oi] = eye;
        else if (mark === 2) out[oi] = brow;
        else if (line[i]) out[oi] = ramps[mat[i]][0];
        else out[oi] = ramps[mat[i]][level[i]];
        continue;
      }
      // Contorno exterior.
      if (
        (x > 0 && order[i - 1] >= 0) ||
        (x < w - 1 && order[i + 1] >= 0) ||
        (y > 0 && order[i - w] >= 0) ||
        (y < h - 1 && order[i + w] >= 0)
      ) {
        out[oi] = outline;
      }
    }
  }
}

/**
 * Estampa la cabeza dibujada a mano. Inclinaciones chicas se ignoran para
 * mantener el pixel art intacto; las grandes (golpes, caídas) se rotan con
 * supermuestreo 3x3 y voto de mayoría, para que no queden pixeles sueltos.
 */
function stampSprite(
  s: Extract<Shape, { kind: 'sprite' }>,
  pi: number,
  g: number,
  order: Int16Array,
  group: Int8Array,
  mat: Int8Array,
  direct: Uint32Array,
  w: number,
  h: number,
  ox: number,
  oy: number,
): void {
  const sp = s.sprite;
  const grid = sp.faces[s.face];
  const colors: Record<string, number> = {};
  for (const [ch, rgb] of Object.entries(sp.palette)) colors[ch] = toABGR(rgb);
  const put = (px: number, py: number, ch: string) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const i = py * w + px;
    order[i] = pi;
    group[i] = g;
    mat[i] = DIRECT;
    direct[i] = colors[ch];
  };

  const ang = Math.abs(s.ang) < 12 ? 0 : s.ang;
  if (ang === 0) {
    const x0 = Math.round(s.c.x + ox - sp.pivot[0]);
    const y0 = Math.round(s.c.y + oy - sp.pivot[1]);
    for (let gy = 0; gy < sp.h; gy++) {
      for (let gx = 0; gx < sp.w; gx++) {
        const ch = grid[gy][gx];
        if (ch !== '.') put(x0 + gx, y0 + gy, ch);
      }
    }
    return;
  }

  const ca = Math.cos(ang * DEG);
  const sa = Math.sin(ang * DEG);
  const rad = Math.ceil(Math.hypot(sp.w, sp.h) / 2) + 2;
  const cx = s.c.x + ox;
  const cy = s.c.y + oy;
  const SUB = [-1 / 3, 0, 1 / 3];
  const sample: string[] = [];
  for (let py = Math.floor(cy - rad); py <= Math.ceil(cy + rad); py++) {
    for (let px = Math.floor(cx - rad); px <= Math.ceil(cx + rad); px++) {
      sample.length = 0;
      for (const sy of SUB) {
        for (const sx of SUB) {
          const ddx = px + 0.5 + sx - cx;
          const ddy = py + 0.5 + sy - cy;
          const gx = Math.floor(ddx * ca + ddy * sa + sp.pivot[0]);
          const gy = Math.floor(-ddx * sa + ddy * ca + sp.pivot[1]);
          if (gx >= 0 && gy >= 0 && gx < sp.w && gy < sp.h && grid[gy][gx] !== '.') sample.push(grid[gy][gx]);
        }
      }
      if (sample.length < 5) continue;
      let best = sample[0];
      let bestN = 0;
      for (const ch of sample) {
        let c = 0;
        for (const o of sample) if (o === ch) c++;
        if (c > bestN) {
          bestN = c;
          best = ch;
        }
      }
      put(px, py, best);
    }
  }
}
