// Estelas de los golpes: una medialuna de luz que sigue el camino del puño o del pie, como en los
// juegos de pelea de ahora. Hace que el golpe se lea aunque el video salte de pose y marca la
// diferencia entre los débiles (finos, casi blancos y cortos) y los fuertes (gruesos, del color
// del luchador y con más recorrido). El gancho que lanza deja una medialuna vertical enorme.
// Solo dibujo: no toca la simulación (la forma sale de la caja de golpe del primer cuadro activo).

import { Container, Graphics } from 'pixi.js';
import type { Fighter } from '../sim/fighter';
import type { AnimDef, FighterDef, HitboxDef, SmearKind, Stance } from '../sim/types';

/** Arco en coordenadas del luchador mirando a la derecha (y hacia abajo, origen en los pies). */
interface Arc {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  /** Achatamiento vertical (la barrida va pegada al suelo). */
  ey: number;
  width: number;
}

interface Smear {
  f: Fighter;
  arc: Arc;
  heavy: boolean;
  color: number;
  /** Cuadros que tarda la punta en llegar al golpe. */
  swing: number;
  t: number;
  /** -1 mientras sigue el golpe; si no, cuadros desde que se empezó a apagar. */
  fade: number;
  fadeLen: number;
  facing: number;
  /** Hasta dónde llegó la cola cuando se empezó a apagar (0..1). */
  tail0: number;
}

const SEGMENTS = 18;

/** Qué normal es cada animación (postura y botón), por luchador. */
const normalsCache = new WeakMap<FighterDef, Map<string, { stance: Stance; btn: string }>>();

function normalOf(def: FighterDef, anim: string): { stance: Stance; btn: string } | null {
  let map = normalsCache.get(def);
  if (!map) {
    map = new Map();
    for (const stance of ['stand', 'crouch', 'air'] as Stance[]) {
      for (const [btn, id] of Object.entries(def.normals[stance])) {
        const a = def.moves[id]?.anim;
        if (a && !map.has(a)) map.set(a, { stance, btn });
      }
    }
    normalsCache.set(def, map);
  }
  return map.get(anim) ?? null;
}

function firstActive(anim: AnimDef): number {
  return anim.frames.findIndex((fr) => !!fr.hit?.length);
}

function lastActive(anim: AnimDef): number {
  for (let i = anim.frames.length - 1; i >= 0; i--) if (anim.frames[i].hit?.length) return i;
  return -1;
}

/** Cuadros de juego que faltan para que se vea el primer cuadro activo (0 si ya está). */
function ticksToActive(f: Fighter, a: number): number {
  if (f.frameIdx >= a) return 0;
  const fr = f.anim.frames;
  let n = fr[f.frameIdx].dur - 1 - Math.max(0, f.frameTime);
  for (let i = f.frameIdx + 1; i < a; i++) n += fr[i].dur;
  return n + 1;
}

/** Arco que pasa por la punta del golpe `tx, ty`: centro, radio y ángulos con el achatamiento. */
function arcTo(cx: number, cy: number, tx: number, ty: number, sweep: number, ey: number, width: number): Arc {
  const dx = tx - cx;
  const dy = (ty - cy) / ey;
  const a1 = Math.atan2(dy, dx);
  return { cx, cy, r: Math.hypot(dx, dy), a0: a1 - sweep, a1, ey, width };
}

function shape(kind: SmearKind, hb: HitboxDef, heavy: boolean): Arc {
  const front = hb.x + hb.w;
  switch (kind) {
    case 'recto': {
      // Casi recta: un arco de radio enorme que termina en el puño.
      const ty = hb.y + Math.min(hb.h, 16) / 2;
      const r = 260;
      const len = heavy ? 74 : 48;
      return { cx: front, cy: ty + r, r, a0: -Math.PI / 2 - len / r, a1: -Math.PI / 2, ey: 1, width: heavy ? 10 : 6 };
    }
    case 'baja': {
      const ty = hb.y + hb.h - 5;
      const r = 300;
      const len = heavy ? 80 : 52;
      return { cx: front, cy: ty + r, r, a0: -Math.PI / 2 - len / r, a1: -Math.PI / 2, ey: 1, width: heavy ? 10 : 6 };
    }
    case 'gancho': {
      // Medialuna delante del pecho: el puño viene de atrás y de arriba.
      const ty = hb.y + Math.min(hb.h, 16) / 2;
      return arcTo(front - 34, ty + 22, front, ty, heavy ? 2.5 : 1.6, 0.8, heavy ? 16 : 9);
    }
    case 'patada': {
      // Desde la cadera: el pie sube desde abajo hasta la punta del golpe, sin pasar bajo el suelo.
      const ty = hb.y + hb.h / 2;
      const a = arcTo(2, -72, front, ty, 0, 1, heavy ? 17 : 9);
      const floor = (-2 - a.cy) / a.r;
      a.a0 = a.a1 + (heavy ? 2.3 : 1.3);
      if (floor < 1) a.a0 = Math.max(a.a1 + 0.5, Math.min(a.a0, Math.asin(floor)));
      return a;
    }
    case 'uppercut': {
      // De abajo adelante hasta bien arriba de la cabeza, por delante del cuerpo.
      const tx = hb.x + hb.w * 0.6;
      const ty = hb.y;
      const sx = tx + 8;
      const sy = -20;
      const cx = tx - 40;
      const cy = (ty + sy) / 2;
      return {
        cx, cy, r: Math.hypot(tx - cx, ty - cy), a0: Math.atan2(sy - cy, sx - cx), a1: Math.atan2(ty - cy, tx - cx), ey: 1, width: 26,
      };
    }
    case 'barrida': {
      // Pegada al suelo: un óvalo achatado que pasa por delante de los pies.
      const ty = Math.min(-3, hb.y + hb.h - 3);
      const cx = front * 0.25;
      return { cx, cy: ty, r: front - cx, a0: Math.PI - 0.35, a1: 0, ey: 0.3, width: heavy ? 30 : 20 };
    }
    case 'aire':
    default: {
      // En el aire el golpe baja hacia adelante.
      const ty = hb.y + hb.h / 2;
      return arcTo(0, -84, front, ty, heavy ? 1.9 : 1.2, 1, heavy ? 15 : 8);
    }
  }
}

function kindOf(f: Fighter): { kind: SmearKind; heavy: boolean } | null {
  const mv = f.move;
  if (!mv || mv.kind !== 'normal') return null;
  if (mv.smear === 'ninguna') return null;
  const n = normalOf(f.def, mv.anim);
  const heavy = n ? n.btn === 'hp' || n.btn === 'hk' : mv.hit.spark === 'heavy' || mv.hit.damage >= 60;
  if (mv.smear) return { kind: mv.smear, heavy };
  if (!n) return null;
  const punch = n.btn === 'lp' || n.btn === 'hp';
  if (n.stance === 'air') return { kind: 'aire', heavy };
  if (n.stance === 'crouch') {
    if (n.btn === 'hp' && f.moveId === f.launcherId) return { kind: 'uppercut', heavy: true };
    if (punch) return { kind: heavy ? 'gancho' : 'recto', heavy };
    return { kind: heavy ? 'barrida' : 'baja', heavy };
  }
  if (punch) return { kind: heavy ? 'gancho' : 'recto', heavy };
  return { kind: 'patada', heavy };
}

export class Smears {
  readonly view = new Container();
  private g = new Graphics();
  private list: Smear[] = [];
  /** Último golpe revisado por luchador (cada golpe deja una sola estela). */
  private seen = new WeakMap<Fighter, number>();

  constructor() {
    this.view.addChild(this.g);
    this.g.blendMode = 'add';
  }

  /** Por cuadro de simulación. */
  step(fighters: Iterable<Fighter>): void {
    for (const f of fighters) {
      if (f.state !== 'attack' || !f.move || this.seen.get(f) === f.attackSerial) continue;
      const anim = f.anim;
      const a = firstActive(anim);
      if (a < 0) {
        this.seen.set(f, f.attackSerial);
        continue;
      }
      if (f.frameIdx > lastActive(anim)) {
        this.seen.set(f, f.attackSerial);
        continue;
      }
      const k = kindOf(f);
      if (!k) {
        this.seen.set(f, f.attackSerial);
        continue;
      }
      const swing = k.kind === 'uppercut' ? 7 : k.heavy ? 6 : 4;
      const left = ticksToActive(f, a);
      if (left > swing) continue;
      this.seen.set(f, f.attackSerial);
      // La forma sale de la caja más grande del golpe: el primer cuadro activo a veces solo
      // alcanza a tener la punta del pie que avanza (el golpe fuerte del Vendedor y de Carlitos).
      let hb = anim.frames[a].hit![0];
      for (let i = a; i <= lastActive(anim); i++) {
        for (const b of anim.frames[i].hit ?? []) if (b.w * b.h > hb.w * hb.h) hb = b;
      }
      this.list.push({
        f, arc: shape(k.kind, hb, k.heavy), heavy: k.heavy, color: f.def.ui.fx, swing, t: swing - left,
        fade: -1, fadeLen: k.kind === 'uppercut' ? 14 : k.heavy ? 10 : 7, facing: f.facing, tail0: 0,
      });
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      // En el congelamiento del impacto la estela también se congela.
      if (s.f.hitstop > 0 && s.f.state === 'attack') continue;
      if (s.fade < 0) {
        s.t++;
        const over = s.f.state !== 'attack' || s.f.frameIdx > lastActive(s.f.anim);
        if (s.t >= s.swing + 2 && (over || s.t > s.swing + 14)) {
          s.fade = 0;
          s.tail0 = this.tail(s);
        }
      } else if (++s.fade >= s.fadeLen) {
        this.list.splice(i, 1);
      }
    }
  }

  private head(s: Smear): number {
    const p = Math.min(1, s.t / s.swing);
    return 1 - (1 - p) * (1 - p);
  }

  private tail(s: Smear): number {
    return Math.max(0, this.head(s) - 0.8);
  }

  /** Por cuadro dibujado. */
  draw(): void {
    const g = this.g;
    g.clear();
    for (const s of this.list) {
      const head = this.head(s);
      const k = s.fade < 0 ? 0 : s.fade / s.fadeLen;
      // Al apagarse la cola alcanza a la punta y todo se desvanece.
      const tail = s.fade < 0 ? this.tail(s) : s.tail0 + (head - s.tail0) * k;
      const alpha = 1 - k * k;
      if (head - tail < 0.02 || alpha <= 0) continue;
      const glow = s.heavy ? s.color : mix(s.color, 0xffffff, 0.6);
      this.band(s, tail, head, 1, glow, (s.heavy ? 0.62 : 0.4) * alpha);
      this.band(s, tail, head, 0.42, 0xffffff, (s.heavy ? 0.95 : 0.8) * alpha);
    }
  }

  /** Una medialuna de `tail` a `head` (fracciones del arco), con grosor `w` del total. */
  private band(s: Smear, tail: number, head: number, w: number, color: number, alpha: number): void {
    const { cx, cy, r, a0, a1, ey, width } = s.arc;
    const x = s.f.x;
    const y = s.f.y;
    const outer: number[] = [];
    const inner: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS;
      const a = a0 + (a1 - a0) * (tail + (head - tail) * u);
      // Gruesa en la punta, en punta de aguja en la cola.
      const ww = width * w * (0.08 + 0.92 * Math.pow(u, 1.3));
      const ro = r + ww * 0.3;
      const ri = r - ww * 0.7;
      const c = Math.cos(a);
      const sn = Math.sin(a) * ey;
      outer.push(x + s.facing * (cx + c * ro), y + cy + sn * ro);
      inner.push(x + s.facing * (cx + c * ri), y + cy + sn * ri);
    }
    const pts = outer;
    for (let i = inner.length - 2; i >= 0; i -= 2) pts.push(inner[i], inner[i + 1]);
    this.g.poly(pts).fill({ color, alpha });
  }

  clear(): void {
    this.list = [];
    this.g.clear();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}
