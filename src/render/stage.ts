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

export class StageView {
  readonly container = new Container();
  /** Oscurece el fondo durante el flash del súper. */
  readonly darken = new Graphics();
  readonly name: string;
  /** Tema musical (clave de public/musica/musica.json), si tiene. */
  readonly music: string | null;
  private layers: Layer[] = [];
  private particles: ParticleField[] = [];
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
    const files = (l: StageLayerDef) => (l.video ? [l.video] : (l.frames ?? (l.src ? [l.src] : [])));
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
    const camRest = (STAGE_W - VIEW_W) / 2;
    for (const l of this.layers) {
      const x = l.left - camLeft * l.fx;
      const y = snap(GROUND_SCREEN_Y + l.top + camOffY * l.fy);
      if (l.strips) {
        for (const s of l.strips) s.view.position.set(VIEW_W / 2 - s.w / 2 - (camLeft - camRest) * s.p, y + s.y);
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
    this.darken.alpha = this.darkAlpha;
  }

  setDarkness(a: number): void {
    this.darkAlpha = a;
  }
}
