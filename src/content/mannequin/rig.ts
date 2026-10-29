// Esqueleto 2D del maniquí provisorio. Las poses se definen con objetivos
// (cadera, puños, tobillos) y la cinemática inversa resuelve codos y rodillas.
// Coordenadas: relativas a los pies, mirando a la derecha, y negativa hacia arriba.

export interface V2 {
  x: number;
  y: number;
}

export interface PoseSpec {
  hip: [number, number];
  /** Inclinación del torso en grados: 0 = vertical, positivo = hacia adelante. */
  torso: number;
  /** Ángulo absoluto de la cabeza (por defecto sigue al torso). */
  head?: number;
  /** Objetivos de los puños (delantero / trasero). */
  hF: [number, number];
  hB: [number, number];
  /** Objetivos de los tobillos. */
  fF: [number, number];
  fB: [number, number];
  /** Ángulo de los pies (0 = abajo, 90 = adelante). */
  fAF?: number;
  fAB?: number;
  /** Dirección de flexión de codos y rodillas (1 o -1). */
  eF?: 1 | -1;
  eB?: 1 | -1;
  kF?: 1 | -1;
  kB?: 1 | -1;
  /** Dibuja el brazo trasero delante del torso (golpes a dos manos). */
  armsFront?: boolean;
  /** Manos abiertas (palmas). */
  open?: boolean;
  /** Ángulo de las cintas del cintillo / gorro (convención de extremidades). */
  tail?: number;
  /** Expresión de la cara (solo personajes con cabeza dibujada a mano). */
  face?: Face;
  /** Manos en "pistolita": índice estirado y pulgar arriba. */
  point?: boolean;
}

export type Face = 'neutral' | 'grin' | 'shout' | 'hurt';

export interface Skeleton {
  hip: V2;
  neck: V2;
  headC: V2;
  headAng: number;
  torsoAng: number;
  shF: V2;
  elF: V2;
  haF: V2;
  shB: V2;
  elB: V2;
  haB: V2;
  hpF: V2;
  knF: V2;
  anF: V2;
  toF: V2;
  hpB: V2;
  knB: V2;
  anB: V2;
  toB: V2;
  open: boolean;
  armsFront: boolean;
  tail: number;
  face: Face;
  point: boolean;
  /** Escala del cuerpo respecto de las proporciones base. */
  scale: number;
}

/** Proporciones (pixeles de la capa 480x270): unos 155 px de alto. */
export const DIM = {
  torso: 46,
  neck: 6,
  headR: 11.2,
  upperArm: 25,
  foreArm: 23,
  fistR: 6.4,
  thigh: 37,
  shin: 36,
  foot: 13,
  shoulderDrop: 7,
  shoulderHalf: 5,
  hipHalf: 4.5,
};

export type Dims = typeof DIM;

/** Proporciones escaladas (para luchadores más bajos o más altos). */
export function scaleDims(s: number): Dims {
  const out = { ...DIM };
  for (const k of Object.keys(out) as Array<keyof Dims>) out[k] = DIM[k] * s;
  return out;
}

const DEG = Math.PI / 180;

/** Dirección de extremidad: 0 = abajo, 90 = adelante, 180 = arriba. */
export function limbDir(deg: number): V2 {
  return { x: Math.sin(deg * DEG), y: Math.cos(deg * DEG) };
}

/** Dirección de torso/cabeza: 0 = arriba, positivo = hacia adelante. */
export function upDir(deg: number): V2 {
  return { x: Math.sin(deg * DEG), y: -Math.cos(deg * DEG) };
}

const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
const v = (p: [number, number]): V2 => ({ x: p[0], y: p[1] });

export function lerpV(a: V2, b: V2, t: number): V2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Cinemática inversa de dos huesos. arm=true: codo hacia abajo; false: rodilla hacia adelante. */
function ik2(root: V2, target: V2, l1: number, l2: number, bend: number, arm: boolean): { mid: V2; end: V2 } {
  let dx = target.x - root.x;
  let dy = target.y - root.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    dx = 0;
    dy = 1;
    d = 1;
  }
  const ux = dx / d;
  const uy = dy / d;
  const dc = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(l1 + l2 - 0.01, d));
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const nx = (arm ? -uy : uy) * bend;
  const ny = (arm ? ux : -ux) * bend;
  return {
    mid: { x: root.x + ux * a + nx * h, y: root.y + uy * a + ny * h },
    end: { x: root.x + ux * dc, y: root.y + uy * dc },
  };
}

/**
 * Resuelve el esqueleto. Con `scale` distinto de 1 la pose y las proporciones
 * se escalan juntas, así las poses de la biblioteca sirven para cualquier talla.
 * `legs` acorta (o alarga) las piernas: la cadera y las manos bajan en la misma
 * proporción, para que los pies sigan en su lugar.
 */
export function solve(pose: PoseSpec, scale = 1, legs = 1): Skeleton {
  let p = scale === 1 ? pose : scalePose(pose, scale);
  const D = scale === 1 && legs === 1 ? DIM : scaleDims(scale);
  if (legs !== 1) {
    const dy = p.hip[1] * (1 - legs);
    const down = (q: [number, number]): [number, number] => [q[0], q[1] - dy];
    p = { ...p, hip: down(p.hip), hF: down(p.hF), hB: down(p.hB) };
    D.thigh *= legs;
    D.shin *= legs;
  }
  const hip = v(p.hip);
  const tu = upDir(p.torso);
  const tf: V2 = { x: -tu.y, y: tu.x };
  const neck = add(hip, mul(tu, D.torso));
  const headAng = p.head ?? p.torso * 0.6;
  const headC = add(neck, mul(upDir(headAng), D.neck + D.headR));
  const shF = add(add(neck, mul(tf, D.shoulderHalf)), mul(tu, -D.shoulderDrop));
  const shB = add(add(neck, mul(tf, -D.shoulderHalf)), mul(tu, -D.shoulderDrop + 1));
  const hpF = add(add(hip, mul(tf, D.hipHalf)), mul(tu, -2));
  const hpB = add(add(hip, mul(tf, -D.hipHalf)), mul(tu, -2));
  const armF = ik2(shF, v(p.hF), D.upperArm, D.foreArm, p.eF ?? 1, true);
  const armB = ik2(shB, v(p.hB), D.upperArm, D.foreArm, p.eB ?? 1, true);
  const legF = ik2(hpF, v(p.fF), D.thigh, D.shin, p.kF ?? 1, false);
  const legB = ik2(hpB, v(p.fB), D.thigh, D.shin, p.kB ?? 1, false);
  return {
    hip,
    neck,
    headC,
    headAng,
    torsoAng: p.torso,
    shF,
    elF: armF.mid,
    haF: armF.end,
    shB,
    elB: armB.mid,
    haB: armB.end,
    hpF,
    knF: legF.mid,
    anF: legF.end,
    toF: add(legF.end, mul(limbDir(p.fAF ?? 90), D.foot)),
    hpB,
    knB: legB.mid,
    anB: legB.end,
    toB: add(legB.end, mul(limbDir(p.fAB ?? 80), D.foot)),
    open: !!p.open,
    armsFront: !!p.armsFront,
    tail: p.tail ?? -105,
    face: p.face ?? 'neutral',
    point: !!p.point,
    scale,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp2 = (a: [number, number], b: [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Interpola dos poses (para cuadros intermedios). */
export function mixPose(a: PoseSpec, b: PoseSpec, t: number): PoseSpec {
  const pick = <T>(x: T, y: T): T => (t < 0.5 ? x : y);
  return {
    hip: lerp2(a.hip, b.hip, t),
    torso: lerp(a.torso, b.torso, t),
    head: lerp(a.head ?? a.torso * 0.6, b.head ?? b.torso * 0.6, t),
    hF: lerp2(a.hF, b.hF, t),
    hB: lerp2(a.hB, b.hB, t),
    fF: lerp2(a.fF, b.fF, t),
    fB: lerp2(a.fB, b.fB, t),
    fAF: lerp(a.fAF ?? 90, b.fAF ?? 90, t),
    fAB: lerp(a.fAB ?? 80, b.fAB ?? 80, t),
    eF: pick(a.eF, b.eF),
    eB: pick(a.eB, b.eB),
    kF: pick(a.kF, b.kF),
    kB: pick(a.kB, b.kB),
    armsFront: pick(a.armsFront, b.armsFront),
    open: pick(a.open, b.open),
    tail: lerp(a.tail ?? -105, b.tail ?? -105, t),
    face: pick(a.face, b.face),
    point: pick(a.point, b.point),
  };
}

/** Desplaza una pose completa. */
export function shiftPose(p: PoseSpec, dx: number, dy: number): PoseSpec {
  const sh = (q: [number, number]): [number, number] => [q[0] + dx, q[1] + dy];
  return { ...p, hip: sh(p.hip), hF: sh(p.hF), hB: sh(p.hB), fF: sh(p.fF), fB: sh(p.fB) };
}

/** Escala una pose completa respecto de los pies. */
export function scalePose(p: PoseSpec, s: number): PoseSpec {
  const sc = (q: [number, number]): [number, number] => [q[0] * s, q[1] * s];
  return { ...p, hip: sc(p.hip), hF: sc(p.hF), hB: sc(p.hB), fF: sc(p.fF), fB: sc(p.fB) };
}
