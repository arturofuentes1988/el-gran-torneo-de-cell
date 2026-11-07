// Escenarios: capas de imágenes (arte final) descritas en un JSON (StageDef), con
// paralaje por capa, repetición horizontal, desplazamiento automático, capas
// animadas y video de fondo. Se cargan con StageView.load().

import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { dibujo, type Calidad } from '../content/calidad';
import { bajarJson, bajarTextura, bajarVideo, type Progreso } from '../content/descargas';
import { FRAME_MS, GROUND_SCREEN_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';
import type { TexFilter } from '../sim/types';
import { snap } from './scale';

/** Una capa de un escenario HD (JSON). Ver docs/FORMATO_SPRITES.md. */
export interface StageLayerDef {
  /** Imagen de la capa (ruta relativa al JSON del escenario). */
  src?: string;
  /** Capa animada: imágenes que se alternan cada `frameDur` cuadros (60 por segundo). */
  frames?: string[];
  frameDur?: number;
  /** Capa de video en loop (MP4, sin sonido): el fondo animado. Va encima de su imagen fija de respaldo. */
  video?: string;
  /** Unidades de mundo por pixel de imagen (0.25 = imagen pensada para 1920x1080). */
  scale: number;
  /** Paralaje [horizontal, vertical]: 0 = fija en pantalla, 1 = se mueve con el piso. */
  parallax: [number, number];
  /** y de mundo del borde superior (0 = suelo, negativo hacia arriba), con la cámara en reposo. */
  top: number;
  /** x en pantalla del borde izquierdo cuando la cámara está en el extremo izquierdo. */
  left?: number;
  /** Repetir horizontalmente (cielos, nubes). */
  repeatX?: boolean;
  /** Desplazamiento automático en unidades de mundo por cuadro (solo con repeatX). */
  scrollX?: number;
  /** Mezcla aditiva (luces, brillos) y transparencia. */
  additive?: boolean;
  alpha?: number;
  /**
   * Piso con perspectiva: la imagen se dibuja en franjas horizontales. El
   * paralaje horizontal va de parallax[0] en el borde superior a 1 en el suelo
   * (y = 0) y sigue creciendo hacia abajo; cada franja se estira lo justo para
   * cubrir todo el recorrido de la cámara.
   */
  floor?: { strips?: number };
  /** Luz que late: el alpha va de min a max cada `period` cuadros (60 = 1 s). */
  pulse?: StagePulseDef;
  /** Calidad liviana (celulares): las mismas imágenes a la mitad, con su escala (herramientas/escenario_liviano.py). */
  liviano?: Pick<StageLayerDef, 'src' | 'video' | 'frames' | 'scale'>;
  /**
   * Capa de vida: autos, micros y gente que cruzan el escenario de un lado al otro, cada tanto (ver
   * StageActorDef). Va en el orden de las capas (las que siguen, como el piso, quedan delante). Usa
   * `parallax`, `left` y `width` de esta capa; `top` no se usa.
   */
  actors?: StageActorDef[];
  /** Ancho en unidades de la capa de vida: los actores entran por x < 0 y salen por x > width. */
  width?: number;
}

/** Un auto, una micro o una persona que pasa por el fondo (capa `actors`). */
export interface StageActorDef {
  /** Cuadros (rutas relativas al JSON, mirando a la derecha); varios = animación (el paso). */
  frames: string[];
  /** Cuadros de 60 por segundo que dura cada imagen (por defecto 4). */
  frameDur?: number;
  /** Unidades de mundo por pixel de imagen. */
  scale: number;
  /** y de mundo de los pies o las ruedas, con la cámara en reposo (0 = suelo, negativo hacia arriba). */
  y: number;
  /** Velocidad en unidades por cuadro (60 por segundo): [mínima, máxima]. */
  speed: [number, number];
  /** Espera entre una pasada y la siguiente, en segundos: [mínima, máxima]. */
  wait: [number, number];
  /** Hacia dónde va: 'ambas' (al azar, por defecto), 'derecha' o 'izquierda'. */
  dir?: 'ambas' | 'derecha' | 'izquierda';
  /** Vaivén vertical en unidades (el motor de la micro). */
  bob?: number;
  /** Sombra bajo el actor (ancho en unidades). */
  shadow?: number;
  /**
   * Tramo que recorre, en x de la capa: [inicio, fin]. Por defecto de borde a borde, fuera de la pantalla. Así un
   * auto entra por la izquierda y dobla por una avenida, o alguien camina solo por una vereda.
   */
  range?: [number, number];
  /** Unidades antes de `range[1]` en que se desvanece (dobla por la avenida y se aleja; se mete entre los toldos). */
  fade?: number;
  /** Mientras se desvanece se achica a esta fracción y sube `rise` unidades (se aleja hacia el fondo). */
  shrink?: number;
  rise?: number;
  /** Lo mismo en el otro extremo (`range[0]`), solo el desvanecido: alguien que se pierde entre los toldos. */
  fadeStart?: number;
  /**
   * Camino en vez de `range`: puntos [x de la capa, y de mundo, escala, ancho] de un extremo al otro. Así un auto
   * entra por el borde de la pantalla, dobla por una avenida y se aleja achicándose hasta perderse en la
   * distancia (`ancho` < 1 lo angosta al doblar: se le ve de atrás). Al revés, viene desde lo lejos. Con `dir`:
   * 'derecha' = del primer punto al último, 'izquierda' = al revés, 'ambas' = al azar. La velocidad baja con la
   * escala (lo lejano se mueve más lento) y solo se desvanece donde es diminuto (escala < 0,2).
   */
  path?: Array<[number, number, number, number]>;
  /**
   * Público quieto: siempre en este punto [x de la capa, y de mundo de los pies], repitiendo sus cuadros (alentando).
   * No entra ni sale: está ahí toda la pelea. `flip` lo da vuelta (el grupo del otro lado mira hacia el centro).
   */
  at?: [number, number];
  flip?: boolean;
  /**
   * Con `at`: paralaje del suelo bajo sus pies (si está parado en el piso con perspectiva, que se desplaza más rápido
   * mientras más cerca está). Así no patina sobre la vereda cuando la cámara se mueve. Sin esto usa el de la capa.
   */
  parallax?: number;
  /**
   * Con `at`: celebra a su ritmo. Pasa sus cuadros una vez (de pie, alienta, vuelve a quedar de pie) y descansa entre
   * estos segundos [mínimo, máximo] antes de la siguiente; cada vuelta va un poco más lenta o más rápida. Cuando un
   * golpe conecta, los que descansan saltan a alentar (StageView.alentar). Sin esto repite sus cuadros sin parar.
   */
  pausa?: [number, number];
}

export interface StagePulseDef {
  min: number;
  max: number;
  period: number;
  /** Desfase en cuadros. */
  phase?: number;
  /** 'beat': golpe y caída (al ritmo de la música); 'sine': ondulación suave. */
  shape?: 'beat' | 'sine';
  /** Probabilidad por cuadro de un parpadeo (neón que falla). */
  flicker?: number;
}

/** Partículas decorativas del escenario (detrás de los luchadores). */
export interface StageParticlesDef {
  /** 'confeti': papelitos de colores que caen girando (el color de cada uno sale de una paleta, no de `color`). */
  type: 'polvo' | 'lluvia' | 'nieve' | 'brasas' | 'confeti';
  count: number;
  color: number;
  alpha?: number;
  /** Tamaño en unidades de mundo. */
  size?: number;
  /** Zona donde aparecen, en y de mundo (0 = suelo, negativo hacia arriba): [arriba, abajo]. */
  band?: [number, number];
  /** Paralaje horizontal (1 = se mueven con el piso). */
  parallax?: number;
}

export interface StageDef {
  id: string;
  name: string;
  /** Filtrado de las imágenes (por defecto 'linear'). */
  filter?: TexFilter;
  /** Capas de atrás hacia adelante (todas detrás de los luchadores). */
  layers: StageLayerDef[];
  particles?: StageParticlesDef[];
  /** Tema musical del escenario (clave de public/musica/musica.json). */
  music?: string;
}

/** Una franja del piso con perspectiva. */
interface Strip {
  view: Sprite;
  /** Paralaje de la franja, ancho en unidades y y relativa al borde superior de la capa. */
  p: number;
  w: number;
  y: number;
}

interface Layer {
  view: Sprite | TilingSprite | Container;
  /** Paralaje horizontal y vertical. */
  fx: number;
  fy: number;
  /** Coordenada y de mundo del borde superior. */
  top: number;
  left: number;
  frames: Texture[] | null;
  frameDur: number;
  scrollX: number;
  alpha: number;
  pulse: StagePulseDef | null;
  strips: Strip[] | null;
}

/** Recorrido horizontal de la cámara más un margen por el temblor de pantalla. */
const CAM_RANGE = STAGE_W - VIEW_W + 16;
/** camLeft con la cámara en reposo (al centro). */
const CAM_REST = (STAGE_W - VIEW_W) / 2;

/** Nivel (0..1) de una luz que late, en el cuadro t. */
function pulseLevel(p: StagePulseDef, t: number): number {
  const ph = ((((t + (p.phase ?? 0)) % p.period) + p.period) % p.period) / p.period;
  let k = p.shape === 'beat' ? Math.exp(-ph * 5) : 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
  if (p.flicker && Math.random() < p.flicker) k *= 0.25;
  return p.min + (p.max - p.min) * k;
}

let dotTex: Texture | null = null;
let streakTex: Texture | null = null;

/** Punto difuso blanco (polvo, nieve, brasas). */
function dotTexture(): Texture {
  if (!dotTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    dotTex = Texture.from(c);
  }
  return dotTex;
}

/** Trazo vertical que se desvanece arriba (gota de lluvia). */
function streakTexture(): Texture {
  if (!streakTex) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = grd;
    g.fillRect(1, 0, 2, 64);
    streakTex = Texture.from(c);
  }
  return streakTex;
}

interface Particle {
  view: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  seed: number;
}

/** Colores del confeti. */
const CONFETI = [0xff3fa4, 0x3fe0ff, 0xffe14a, 0xb46bff, 0x5dff8a, 0xff8a3d];

/** Partículas decorativas: avanzan con el reloj (no con la simulación). */
class ParticleField {
  readonly container = new Container();
  private parts: Particle[] = [];
  private readonly band: [number, number];
  private readonly wrapW = VIEW_W + 60;

  constructor(private def: StageParticlesDef) {
    this.band = def.band ?? [-240, 10];
    const tex = def.type === 'lluvia' ? streakTexture() : dotTexture();
    for (let i = 0; i < def.count; i++) {
      const view = new Sprite(tex);
      view.anchor.set(0.5, def.type === 'lluvia' ? 1 : 0.5);
      view.tint = def.type === 'confeti' ? CONFETI[i % CONFETI.length] : def.color;
      view.blendMode = def.type === 'confeti' ? 'normal' : 'add';
      this.container.addChild(view);
      const p: Particle = { view, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, seed: Math.random() * 1000 };
      this.spawn(p, true);
      this.parts.push(p);
    }
  }

  private spawn(p: Particle, anywhere: boolean): void {
    const [top, bottom] = this.band;
    const size = this.def.size ?? 1.6;
    p.x = Math.random() * this.wrapW;
    p.age = 0;
    switch (this.def.type) {
      case 'lluvia':
        p.y = anywhere ? top + Math.random() * (bottom - top) : top - Math.random() * 40;
        p.vx = -1.2;
        p.vy = 6 + Math.random() * 2.5;
        p.life = 9999;
        p.view.scale.set(size * 0.12, (10 + Math.random() * 8) / 64);
        break;
      case 'confeti':
      case 'nieve':
        p.y = anywhere ? top + Math.random() * (bottom - top) : top - Math.random() * 30;
        p.vx = -0.15 + Math.random() * 0.3;
        p.vy = 0.25 + Math.random() * 0.35;
        p.life = 9999;
        p.view.scale.set((size * (0.6 + Math.random() * 0.8)) / 16);
        break;
      case 'brasas':
        p.y = anywhere ? top + Math.random() * (bottom - top) : bottom;
        p.vx = -0.1 + Math.random() * 0.2;
        p.vy = -(0.3 + Math.random() * 0.5);
        p.life = 120 + Math.random() * 180;
        p.view.scale.set((size * (0.5 + Math.random() * 0.8)) / 16);
        break;
      default:
        p.y = top + Math.random() * (bottom - top);
        p.vx = -0.06 + Math.random() * 0.12;
        p.vy = -0.05 + Math.random() * 0.06;
        p.life = 240 + Math.random() * 300;
        p.view.scale.set((size * (0.5 + Math.random())) / 16);
    }
    if (anywhere) p.age = Math.random() * Math.min(p.life, 300);
  }

  update(camLeft: number, camOffY: number, dt: number): void {
    const par = this.def.parallax ?? 1;
    const [top, bottom] = this.band;
    const base = this.def.alpha ?? 0.6;
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (this.def.type === 'nieve' || this.def.type === 'confeti') p.x += Math.sin((p.age + p.seed) / 40) * 0.12 * dt;
      // El papelito gira: se angosta y se ensancha.
      if (this.def.type === 'confeti') p.view.scale.x = p.view.scale.y * (0.25 + 0.75 * Math.abs(Math.sin((p.age + p.seed) / 7)));
      const out = p.age > p.life || p.y > bottom + 4 || p.y < top - 60;
      if (out) this.spawn(p, false);
      let a = base;
      if (this.def.type === 'polvo' || this.def.type === 'brasas') {
        // Aparecen y se apagan suave, con un leve titileo.
        const k = Math.min(1, p.age / 40, (p.life - p.age) / 40);
        a *= Math.max(0, k) * (0.6 + 0.4 * Math.sin((p.age + p.seed) / 9));
      }
      p.view.alpha = a;
      const sx = ((((p.x - camLeft * par) % this.wrapW) + this.wrapW) % this.wrapW) - 30;
      p.view.position.set(sx, GROUND_SCREEN_Y + p.y + camOffY);
    }
  }
}

interface Actor {
  def: StageActorDef;
  /** Largo de cada tramo del camino y el total (si tiene camino) y cuánto lleva recorrido. */
  segs: number[];
  total: number;
  s: number;
  frames: Texture[];
  view: Sprite;
  shadow: Graphics | null;
  /** x de la capa (unidades), dirección y velocidad de la pasada en curso; `wait` cuadros hasta la próxima. */
  x: number;
  dir: 1 | -1;
  speed: number;
  wait: number;
  seed: number;
  /** Público que celebra a su ritmo (con `pausa`): cuadro en curso, cuadros de 60 por imagen en esta vuelta. */
  k: number;
  dur: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Capa de vida: los actores cruzan de un borde al otro y esperan un rato antes de volver a pasar. */
class ActorField {
  readonly container = new Container();
  private actors: Actor[] = [];

  constructor(private def: StageLayerDef, textures: Texture[]) {
    let i = 0;
    for (const a of def.actors ?? []) {
      const frames = textures.slice(i, i + a.frames.length);
      i += a.frames.length;
      if (!frames.length) continue;
      let shadow: Graphics | null = null;
      if (a.shadow) {
        shadow = new Graphics().ellipse(0, 0, a.shadow / 2, Math.max(1.5, a.shadow * 0.05)).fill({ color: 0x1a1410, alpha: 0.3 });
        this.container.addChild(shadow);
      }
      const view = new Sprite(frames[0]);
      view.anchor.set(0.5, 1);
      view.visible = false;
      this.container.addChild(view);
      // La primera pasada sale pronto, escalonada entre los actores.
      const segs: number[] = [];
      const pts = a.path ?? [];
      for (let k = 1; k < pts.length; k++) segs.push(Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const total = segs.reduce((x, y) => x + y, 0);
      const actor: Actor = { def: a, frames, view, shadow, segs, total, s: 0, x: 0, dir: 1, speed: 0, wait: rnd(0.5, Math.max(1, a.wait[0])) * 60, seed: Math.random() * 1000, k: 0, dur: a.frameDur ?? 4 };
      // El público parte desfasado: unos a media celebración, otros descansando.
      if (a.at && a.pausa) {
        actor.k = Math.random() < 0.5 ? Math.random() * frames.length : 0;
        actor.wait = actor.k > 0 ? 0 : rnd(0, a.pausa[1]) * 60;
      }
      this.actors.push(actor);
    }
  }

  /** Un golpe conectó: el público que descansa se pone a alentar casi al tiro (cada uno con su reacción). */
  alentar(): void {
    for (const a of this.actors) if (a.def.at && a.def.pausa && a.wait > 0) a.wait = Math.min(a.wait, rnd(2, 16));
  }

  update(camLeft: number, camOffY: number, dt: number, t: number): void {
    const w = this.def.width ?? STAGE_W;
    const x0 = (this.def.left ?? 0) - camLeft * this.def.parallax[0];
    const fy = this.def.parallax[1];
    for (const a of this.actors) {
      if (a.def.at) {
        let cuadro: number;
        let respira = 1;
        if (a.def.pausa) {
          if (a.wait > 0) {
            // Descansa de pie, respirando apenas.
            a.wait -= dt;
            cuadro = 0;
            respira = 1 + 0.006 * Math.sin(t * 0.06 + a.seed);
          } else {
            a.k += dt / a.dur;
            if (a.k >= a.frames.length) {
              a.k = 0;
              a.wait = rnd(a.def.pausa[0], a.def.pausa[1]) * 60;
              a.dur = (a.def.frameDur ?? 4) * rnd(0.85, 1.2);
            }
            cuadro = Math.floor(a.k);
          }
        } else {
          cuadro = Math.floor((t + a.seed) / Math.max(1, a.def.frameDur ?? 4)) % a.frames.length;
        }
        a.view.texture = a.frames[cuadro];
        a.view.visible = true;
        a.view.alpha = 1;
        a.view.scale.set(a.def.scale * (a.def.flip ? -1 : 1), a.def.scale * respira);
        // Parado en el piso con perspectiva: se mueve como la franja de piso bajo sus pies (igual que addFloor).
        const pa = a.def.parallax;
        const ancho = VIEW_W + CAM_RANGE * (pa ?? 0);
        const sx = snap(
          pa === undefined ? x0 + a.def.at[0] : VIEW_W / 2 - ancho / 2 - (camLeft - CAM_REST) * pa + (a.def.at[0] / w) * ancho,
        );
        const sy = snap(GROUND_SCREEN_Y + a.def.at[1] + camOffY * fy);
        a.view.position.set(sx, sy);
        if (a.shadow) {
          a.shadow.visible = true;
          a.shadow.position.set(sx, sy);
        }
        continue;
      }
      if (a.def.path && a.total > 0) {
        this.updatePath(a, x0, camOffY * fy, dt, t);
        continue;
      }
      const margen = (a.frames[0].width * a.def.scale) / 2 + 10;
      const [r0, r1] = a.def.range ?? [-margen, w + margen];
      if (a.wait > 0) {
        a.wait -= dt;
        a.view.visible = false;
        if (a.shadow) a.shadow.visible = false;
        if (a.wait > 0) continue;
        const d = a.def.dir ?? 'ambas';
        a.dir = d === 'derecha' ? 1 : d === 'izquierda' ? -1 : Math.random() < 0.5 ? 1 : -1;
        a.speed = rnd(a.def.speed[0], a.def.speed[1]);
        a.x = a.dir > 0 ? r0 : r1;
      }
      a.x += a.dir * a.speed * dt;
      if ((a.dir > 0 && a.x > r1) || (a.dir < 0 && a.x < r0)) {
        a.wait = rnd(a.def.wait[0], a.def.wait[1]) * 60;
        continue;
      }
      const tex = a.frames[Math.floor((t + a.seed) / Math.max(1, a.def.frameDur ?? 4)) % a.frames.length];
      a.view.texture = tex;
      a.view.visible = true;
      // Cerca del final del tramo se desvanece, se achica y sube: se aleja por la avenida.
      const k = a.def.fade ? Math.min(1, Math.max(0, (a.x - (r1 - a.def.fade)) / a.def.fade)) : 0;
      const esc = a.def.scale * (1 - k * (1 - (a.def.shrink ?? 1)));
      a.view.scale.set(esc * a.dir, esc);
      const k0 = a.def.fadeStart ? Math.min(1, Math.max(0, (r0 + a.def.fadeStart - a.x) / a.def.fadeStart)) : 0;
      a.view.alpha = (1 - k) * (1 - k0);
      const bob = a.def.bob ? Math.sin((t + a.seed) * 0.9) * a.def.bob : 0;
      const sx = snap(x0 + a.x);
      const sy = GROUND_SCREEN_Y + a.def.y - k * (a.def.rise ?? 0) + camOffY * fy;
      a.view.position.set(sx, snap(sy + bob));
      if (a.shadow) {
        a.shadow.visible = true;
        a.shadow.alpha = (1 - k) * (1 - k0);
        a.shadow.scale.set(esc / a.def.scale);
        a.shadow.position.set(sx, snap(sy));
      }
    }
  }

  /** Un actor con camino: avanza a lo largo de sus puntos, con la escala y el ancho de cada tramo. */
  private updatePath(a: Actor, x0: number, offY: number, dt: number, t: number): void {
    const pts = a.def.path!;
    if (a.wait > 0) {
      a.wait -= dt;
      a.view.visible = false;
      if (a.shadow) a.shadow.visible = false;
      if (a.wait > 0) return;
      const d = a.def.dir ?? 'ambas';
      a.dir = d === 'derecha' ? 1 : d === 'izquierda' ? -1 : Math.random() < 0.5 ? 1 : -1;
      a.speed = rnd(a.def.speed[0], a.def.speed[1]);
      a.s = a.dir > 0 ? 0 : a.total;
    }
    // Dónde va: tramo y fracción del tramo.
    let rest = Math.min(a.total, Math.max(0, a.s));
    let i = 0;
    while (i < a.segs.length - 1 && rest > a.segs[i]) rest -= a.segs[i++];
    const f = a.segs[i] > 0 ? rest / a.segs[i] : 0;
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const lerp = (u: number, v: number) => u + (v - u) * f;
    const x = lerp(p0[0], p1[0]);
    const y = lerp(p0[1], p1[1]);
    const sc = lerp(p0[2], p1[2]);
    const an = lerp(p0[3], p1[3]);
    // Lo lejano avanza más lento en pantalla.
    a.s += a.dir * a.speed * Math.max(0.15, sc) * dt;
    if (a.s < 0 || a.s > a.total) {
      a.wait = rnd(a.def.wait[0], a.def.wait[1]) * 60;
      a.view.visible = false;
      if (a.shadow) a.shadow.visible = false;
      return;
    }
    // Hacia dónde mira: hacia donde se mueve en x (al alejarse casi no se nota).
    const mira = (p1[0] - p0[0]) * a.dir >= 0 ? 1 : -1;
    const tex = a.frames[Math.floor((t + a.seed) / Math.max(1, a.def.frameDur ?? 4)) % a.frames.length];
    a.view.texture = tex;
    a.view.visible = true;
    const esc = a.def.scale * sc;
    a.view.scale.set(esc * an * mira, esc);
    // Solo se desvanece donde ya es diminuto: se pierde en la distancia.
    a.view.alpha = Math.min(1, Math.max(0, (sc - 0.12) / 0.1));
    const bob = a.def.bob ? Math.sin((t + a.seed) * 0.9) * a.def.bob * sc : 0;
    const sx = snap(x0 + x);
    const sy = GROUND_SCREEN_Y + y + offY;
    a.view.position.set(sx, snap(sy + bob));
    if (a.shadow) {
      a.shadow.visible = true;
      a.shadow.alpha = a.view.alpha;
      a.shadow.scale.set(sc * Math.max(0.4, an), sc);
      a.shadow.position.set(sx, snap(sy));
    }
  }
}

export class StageView {
  readonly container = new Container();
  /** Oscurece el fondo durante el flash del súper. */
  readonly darken = new Graphics();
  readonly name: string;
  /** Tema musical (clave de public/musica/musica.json), si tiene. */
  readonly music: string | null;
  private layers: Layer[] = [];
  private particles: ParticleField[] = [];
  private actors: ActorField[] = [];
  private darkAlpha = 0;
  private lastTime = performance.now();
  /** Las texturas que bajó este escenario (las únicas que suelta al destruirse). */
  private own: Texture[];

  /** Escenario HD ya cargado (ver StageView.load). */
  constructor(hd: { name: string; layers: Array<{ def: StageLayerDef; textures: Texture[] }>; particles?: StageParticlesDef[]; music?: string }) {
    this.music = hd.music ?? null;
    this.name = hd.name;
    this.own = hd.layers.flatMap((l) => l.textures);
    for (const { def, textures } of hd.layers) this.addHd(def, textures);
    for (const p of hd.particles ?? []) {
      const field = new ParticleField(p);
      this.particles.push(field);
      this.container.addChild(field.container);
    }
    this.darken.rect(0, 0, VIEW_W, VIEW_H).fill(0x05020c);
    this.darken.alpha = 0;
    this.container.addChild(this.darken);
  }

  /**
   * Carga un escenario HD desde su JSON (StageDef); las imágenes se buscan junto al JSON. En
   * calidad liviana usa las versiones chicas de cada capa (si las tiene). `prog` anota lo bajado.
   */
  static async load(url: string, calidad: Calidad = 'hd', prog?: Progreso): Promise<StageView> {
    const def = await bajarJson<StageDef>(url, prog);
    const base = new URL(url, location.href);
    const abs = (src: string) => new URL(src, base).href;
    const scaleMode = def.filter ?? 'linear';
    const op = { scaleMode, mipmaps: calidad === 'hd' && scaleMode === 'linear' };
    // Gráficos BAJA: sin videos de fondo (queda la imagen fija que va debajo de cada uno).
    const conVideo = dibujo().video;
    const layers = def.layers
      .map((l) => (calidad === 'liviano' && l.liviano ? { ...l, ...l.liviano } : l))
      .filter((l) => conVideo || !l.video);
    const files = (l: StageLayerDef) =>
      l.actors ? l.actors.flatMap((a) => a.frames) : l.video ? [l.video] : (l.frames ?? (l.src ? [l.src] : []));
    if (prog) for (const l of layers) for (const f of files(l)) prog.esperar(abs(f));
    // Video en loop, mudo (así el navegador lo deja reproducirse solo); si no parte, queda la imagen fija.
    const loaded = await Promise.all(
      layers.map(async (l) => ({
        def: l,
        textures: l.video
          ? [await bajarVideo(abs(l.video), prog).catch(() => null)].filter((t): t is Texture => !!t)
          : await Promise.all(files(l).map((f) => bajarTextura(abs(f), op, prog))),
      })),
    );
    return new StageView({ name: def.name, layers: loaded, particles: def.particles, music: def.music });
  }

  /** Libera sus texturas y videos (para no llenar la memoria de un celular con escenarios que ya no se usan). */
  destroy(): void {
    if (this.videoWatch !== null) clearInterval(this.videoWatch);
    this.videoWatch = null;
    for (const v of this.videos) {
      v.pause();
      v.removeAttribute('src');
      v.querySelectorAll('source').forEach((el) => {
        if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src);
        el.remove();
      });
      v.load();
    }
    this.videos = [];
    // Solo sus propias texturas: las de las partículas (punto y estela de lluvia) son una para todos
    // los escenarios. Antes se destruían también, y el escenario que seguía en pantalla quedaba con
    // partículas rotas: el dibujo fallaba en cada cuadro y la imagen se congelaba (celulares en
    // calidad liviana, que sueltan escenarios en casi cada pelea).
    this.container.destroy({ children: true });
    for (const t of this.own) t.destroy(true);
    this.own = [];
  }

  /** Videos del escenario: se reproducen solo mientras el escenario se está dibujando. */
  private videos: HTMLVideoElement[] = [];
  private lastDraw = 0;
  private videoWatch: number | null = null;

  private trackVideo(tex: Texture): void {
    const el = (tex.source as unknown as { resource?: unknown }).resource;
    if (!(el instanceof HTMLVideoElement)) return;
    el.muted = true;
    el.loop = true;
    this.videos.push(el);
    // Si nadie dibuja el escenario por un rato (menús, otro escenario), se pausa.
    this.videoWatch ??= window.setInterval(() => {
      if (performance.now() - this.lastDraw > 800) for (const v of this.videos) if (!v.paused) v.pause();
    }, 500);
  }

  private addHd(def: StageLayerDef, textures: Texture[]): void {
    if (def.actors) {
      const field = new ActorField(def, textures);
      this.actors.push(field);
      this.container.addChild(field.container);
      return;
    }
    const tex = textures[0];
    if (!tex) return;
    if (def.floor) {
      this.addFloor(def, tex);
      return;
    }
    let view: Sprite | TilingSprite;
    if (def.repeatX) {
      // Cubre todo el ancho de la pantalla; la imagen se repite.
      view = new TilingSprite({ texture: tex, width: VIEW_W, height: tex.height * def.scale });
      view.tileScale.set(def.scale);
    } else {
      view = new Sprite(tex);
      view.scale.set(def.scale);
    }
    if (def.additive) view.blendMode = 'add';
    view.alpha = def.alpha ?? 1;
    if (def.video) this.trackVideo(tex);
    this.container.addChild(view);
    this.layers.push({
      view,
      fx: def.parallax[0],
      fy: def.parallax[1],
      top: def.top,
      left: def.left ?? 0,
      frames: textures.length > 1 ? textures : null,
      frameDur: Math.max(1, def.frameDur ?? 8),
      scrollX: def.repeatX ? def.scrollX ?? 0 : 0,
      alpha: def.alpha ?? 1,
      pulse: def.pulse ?? null,
      strips: null,
    });
  }

  /**
   * Piso con perspectiva ("line scroll" de los arcades): franjas horizontales
   * de la misma imagen, cada una con su paralaje. Con la cámara al centro la
   * imagen queda centrada; al moverse, lo de más cerca se desplaza más rápido.
   */
  private addFloor(def: StageLayerDef, tex: Texture): void {
    const view = new Container();
    const strips: Strip[] = [];
    const n = Math.max(2, def.floor?.strips ?? 64);
    const { x: fx0, y: fy0, width: fw, height: fh } = tex.frame;
    const pTop = def.parallax[0];
    for (let i = 0; i < n; i++) {
      const r0 = Math.floor((i * fh) / n);
      const r1 = Math.floor(((i + 1) * fh) / n);
      if (r1 <= r0) continue;
      // Un pixel de más hacia abajo para que no se vean uniones entre franjas.
      const frame = new Rectangle(fx0, fy0 + r0, fw, Math.min(fh - r0, r1 - r0 + 1));
      const s = new Sprite(new Texture({ source: tex.source, frame }));
      const yMid = def.top + ((r0 + r1) / 2) * def.scale;
      const p = def.top < 0 ? 1 + (pTop - 1) * (yMid / def.top) : 1;
      const w = VIEW_W + CAM_RANGE * p;
      s.scale.set(w / fw, def.scale);
      view.addChild(s);
      strips.push({ view: s, p, w, y: r0 * def.scale });
    }
    view.alpha = def.alpha ?? 1;
    this.container.addChild(view);
    this.layers.push({
      view,
      fx: pTop,
      fy: def.parallax[1],
      top: def.top,
      left: 0,
      frames: null,
      frameDur: 1,
      scrollX: 0,
      alpha: def.alpha ?? 1,
      pulse: def.pulse ?? null,
      strips,
    });
  }

  /** camLeft: x de mundo del borde izquierdo; camOffY: desplazamiento vertical de la cámara. */
  update(camLeft: number, camOffY: number): void {
    // Las animaciones del fondo son decorativas: avanzan con el reloj, no con la simulación.
    const now = performance.now();
    const t = now / FRAME_MS;
    const dt = Math.min(3, (now - this.lastTime) / FRAME_MS);
    this.lastTime = now;
    this.lastDraw = now;
    for (const v of this.videos) if (v.paused) void v.play().catch(() => undefined);
    for (const l of this.layers) {
      const x = l.left - camLeft * l.fx;
      const y = snap(GROUND_SCREEN_Y + l.top + camOffY * l.fy);
      if (l.strips) {
        for (const s of l.strips) s.view.position.set(VIEW_W / 2 - s.w / 2 - (camLeft - CAM_REST) * s.p, y + s.y);
      } else if (l.frames) {
        (l.view as Sprite | TilingSprite).texture = l.frames[Math.floor(t / l.frameDur) % l.frames.length];
      }
      if (l.view instanceof TilingSprite) {
        l.view.position.set(0, y);
        l.view.tilePosition.x = snap(x + t * l.scrollX);
      } else if (!l.strips) {
        l.view.position.set(snap(x), y);
      }
      if (l.pulse) l.view.alpha = l.alpha * pulseLevel(l.pulse, t);
    }
    for (const p of this.particles) p.update(camLeft, camOffY, dt);
    for (const a of this.actors) a.update(camLeft, camOffY, dt, t);
    this.darken.alpha = this.darkAlpha;
  }

  setDarkness(a: number): void {
    this.darkAlpha = a;
  }

  /** Un golpe conectó: el público del escenario (si tiene) celebra. */
  alentar(): void {
    for (const a of this.actors) a.alentar();
  }
}
