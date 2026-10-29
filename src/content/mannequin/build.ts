// "Hornea" las animaciones del maniquí: rasteriza cada pose en un atlas y
// genera los FrameDef (con cajas de daño y de golpe calculadas desde el
// esqueleto). El resultado tiene exactamente el mismo formato que usarán los
// sprites definitivos, así que el motor no distingue unos de otros.

import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { AnimDef, Box, FrameDef, HitProps } from '../../sim/types';
import { rasterize, type FighterStyle } from './raster';
import { DIM, lerpV, solve, type Face, type PoseSpec, type Skeleton, type V2 } from './rig';

/** Extremidad que golpea en un cuadro activo. */
export type HitLimb = 'hF' | 'hB' | 'fF' | 'fB' | 'hands' | 'body' | 'knee';

export interface PFrame {
  pose: PoseSpec;
  dur: number;
  hit?: HitLimb;
  group?: number;
  props?: Partial<HitProps>;
  extra?: Omit<Partial<FrameDef>, 'tex' | 'dur' | 'hurt' | 'hit'>;
}

export interface AnimSpec {
  frames: PFrame[];
  loop?: boolean;
}

/** Tamaño de cada cuadro en el atlas y posición de los pies dentro de él. */
const FW = 208;
const FH = 216;
const OX = 104;
const OY = 206;
const COLS = 12;

export interface BakedFighter {
  textures: Record<string, Texture>;
  anims: Record<string, AnimDef>;
  atlas: HTMLCanvasElement;
}

function aabb(points: V2[], padX: number, padY: number): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const x = Math.round(x0 - padX);
  const y = Math.round(y0 - padY);
  return { x, y, w: Math.round(x1 + padX) - x, h: Math.round(y1 + padY) - y };
}

function hurtFrom(sk: Skeleton): Box[] {
  const boxes = [
    aabb([sk.headC], 10, 11),
    aabb([sk.hip, sk.neck], 13, 4),
    aabb([sk.hpF, sk.hpB, sk.knF, sk.knB, sk.anF, sk.anB], 6, 4),
  ];
  // Los brazos estirados también se pueden golpear.
  if (Math.abs(sk.haF.x - sk.neck.x) > 22) boxes.push(aabb([sk.elF, sk.haF], 4, 4));
  if (Math.abs(sk.haB.x - sk.neck.x) > 22) boxes.push(aabb([sk.elB, sk.haB], 4, 4));
  return boxes;
}

function hitFrom(sk: Skeleton, limb: HitLimb): Box {
  const fr = DIM.fistR + 1.5;
  switch (limb) {
    case 'hF':
      return aabb([lerpV(sk.elF, sk.haF, 0.35), sk.haF], fr, fr);
    case 'hB':
      return aabb([lerpV(sk.elB, sk.haB, 0.35), sk.haB], fr, fr);
    case 'hands':
      return aabb([sk.haF, sk.haB], 8, 8);
    case 'fF':
      return aabb([lerpV(sk.knF, sk.anF, 0.25), sk.anF, sk.toF], 5, 5);
    case 'fB':
      return aabb([lerpV(sk.knB, sk.anB, 0.25), sk.anB, sk.toB], 5, 5);
    case 'knee':
      return aabb([sk.knF], 8, 8);
    case 'body': {
      const b = aabb([sk.hip, sk.neck, sk.haF], 10, 6);
      return { ...b, w: b.w + 8 };
    }
  }
}

const HURT_ANIMS = new Set(['hitHigh', 'hitLow', 'hitCrouch', 'airHit', 'fall', 'knockdown', 'lose', 'blockStand', 'blockCrouch']);
const GRIN_ANIMS = new Set(['taunt', 'win', 'intro']);

/**
 * Expresión de cada cuadro (solo cabezas dibujadas a mano): dolor al recibir,
 * sonrisa en burla y victoria, grito al pegar hasta el último cuadro activo.
 */
function faceFor(anim: string, i: number, frames: PFrame[]): Face {
  const own = frames[i].pose.face;
  if (own) return own;
  if (HURT_ANIMS.has(anim) || (anim === 'getup' && i < 2)) return 'hurt';
  if (GRIN_ANIMS.has(anim)) return 'grin';
  if (anim === 'throwGrab' || anim === 'throwToss' || anim === 'super') return 'shout';
  let last = -1;
  frames.forEach((f, j) => {
    if (f.hit || f.extra?.spawn) last = j;
  });
  return i <= last ? 'shout' : 'neutral';
}

export function bakeFighter(id: string, style: FighterStyle, specs: Record<string, AnimSpec>): BakedFighter {
  // Poses únicas (una pose reutilizada se rasteriza una sola vez por expresión).
  const index = new Map<PoseSpec, Map<Face, number>>();
  const poses: PoseSpec[] = [];
  const slot = (pose: PoseSpec, face: Face): number => {
    let byFace = index.get(pose);
    if (!byFace) index.set(pose, (byFace = new Map()));
    let k = byFace.get(face);
    if (k === undefined) {
      k = poses.length;
      byFace.set(face, k);
      poses.push({ ...pose, face });
    }
    return k;
  };
  const frameSlots: Record<string, number[]> = {};
  for (const [name, spec] of Object.entries(specs)) {
    frameSlots[name] = spec.frames.map((f, i) => slot(f.pose, style.head ? faceFor(name, i, spec.frames) : 'neutral'));
  }
  const skeletons = poses.map((p) => solve(p, style.body?.scale, style.body?.legs));

  const canvas = document.createElement('canvas');
  canvas.width = COLS * FW;
  canvas.height = Math.ceil(poses.length / COLS) * FH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el canvas del atlas');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const buf = new Uint32Array(img.data.buffer);
  skeletons.forEach((sk, i) => {
    rasterize(sk, style, buf, canvas.width, (i % COLS) * FW, Math.floor(i / COLS) * FH, FW, FH, OX, OY);
  });
  ctx.putImageData(img, 0, 0);

  const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
  const textures: Record<string, Texture> = {};
  poses.forEach((_, i) => {
    textures[`${id}/${i}`] = new Texture({
      source,
      frame: new Rectangle((i % COLS) * FW, Math.floor(i / COLS) * FH, FW, FH),
      defaultAnchor: { x: OX / FW, y: OY / FH },
    });
  });

  const anims: Record<string, AnimDef> = {};
  for (const [name, spec] of Object.entries(specs)) {
    anims[name] = {
      loop: spec.loop,
      frames: spec.frames.map((f, fi) => {
        const pi = frameSlots[name][fi];
        const sk = skeletons[pi];
        const fr: FrameDef = { tex: `${id}/${pi}`, dur: f.dur, hurt: hurtFrom(sk), ...f.extra };
        if (f.hit) fr.hit = [{ ...hitFrom(sk, f.hit), group: f.group ?? 0, props: f.props }];
        return fr;
      }),
    };
  }
  return { textures, anims, atlas: canvas };
}
