// Escenarios. Dos fuentes:
//  - HD: capas de imágenes (arte final) descritas en un JSON (StageDef), con
//    paralaje por capa, repetición horizontal, desplazamiento automático y
//    capas animadas. Se cargan con StageView.load().
//  - "Escenario de prueba" (respaldo): fondo provisorio pintado pixel a pixel
//    al cargar (atardecer, montañas, mesetas y piso de tierra), determinista.

import { Assets, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { FRAME_MS, GROUND_SCREEN_Y, STAGE_W, VIEW_H, VIEW_W } from '../config';
import { Rng } from '../sim/rng';
import type { TexFilter } from '../sim/types';
import { PixelCanvas } from './pixelCanvas';
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
  type: 'polvo' | 'lluvia' | 'nieve' | 'brasas';
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
      view.tint = def.color;
      view.blendMode = 'add';
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
      if (this.def.type === 'nieve') p.x += Math.sin((p.age + p.seed) / 40) * 0.12 * dt;
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

function heightmap(rng: Rng, w: number, min: number, max: number, rough: number): number[] {
  // Desplazamiento de punto medio.
  let size = 1;
  while (size < w) size *= 2;
  const h = new Array<number>(size + 1).fill(0);
  h[0] = min + rng.next() * (max - min);
  h[size] = min + rng.next() * (max - min);
  let step = size;
  let amp = (max - min) * 0.7;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < size; i += step) {
      h[i] = (h[i - half] + h[i + half]) / 2 + (rng.next() * 2 - 1) * amp;
      h[i] = Math.max(min * 0.6, Math.min(max * 1.1, h[i]));
    }
    step = half;
    amp *= rough;
  }
  return h.slice(0, w);
}

/** Cielo de atardecer: su borde inferior es el horizonte (y = -100 de mundo). */
function paintSky(): Texture {
  const W = VIEW_W;
  const H = 290;
  const c = new PixelCanvas(W, H);
  c.vgrad(0, 0, W, H, [0x140a2e, 0x2a1450, 0x4e2264, 0x86306c, 0xc44a5e, 0xee7048, 0xffa850, 0xffd884]);
  const rng = new Rng(7);
  for (let i = 0; i < 70; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, 110);
    const b = rng.next();
    c.set(x, y, b > 0.85 ? 0xffffff : b > 0.5 ? 0xc8b8ff : 0x8a78c8);
  }
  // Sol del atardecer con franjas (estilo retro), asomando sobre las montañas.
  const sx = 336;
  const sy = H - 82;
  const r = 30;
  for (let y = Math.floor(sy - r); y <= Math.ceil(sy + r); y++) {
    const rel = (y - (sy - r)) / (2 * r);
    // Franjas que se ensanchan hacia abajo en la mitad inferior.
    if (rel > 0.55) {
      const band = Math.floor((rel - 0.55) * 40);
      if ((y + band) % 5 < Math.min(3, 1 + band / 3)) continue;
    }
    for (let x = Math.floor(sx - r); x <= Math.ceil(sx + r); x++) {
      const dx = x + 0.5 - sx;
      const dy = y + 0.5 - sy;
      if (dx * dx + dy * dy > r * r) continue;
      c.dither(x, y, 0xfff2b0, 0xff8a3a, rel);
    }
  }
  return c.texture();
}

function paintMountains(seed: number, w: number, h: number, min: number, max: number, body: number, lit: number, snow: number, snowShade: number, haze: number): Texture {
  const c = new PixelCanvas(w, h);
  const rng = new Rng(seed);
  const hm = heightmap(rng, w + 1, min, max, 0.55);
  const snowLine = min + (max - min) * 0.55;
  for (let x = 0; x < w; x++) {
    const top = Math.round(h - hm[x]);
    const litSide = hm[x + 1] < hm[x] - 0.2;
    const snowDepth = hm[x] > snowLine ? Math.round((hm[x] - snowLine) * 0.45 + 2 + rng.next() * 2) : 0;
    for (let y = Math.max(0, top); y < h; y++) {
      const d = y - top;
      const t = d / Math.max(1, h - top);
      let col = litSide ? lit : body;
      if (d < snowDepth) col = litSide ? snow : snowShade;
      c.dither(x, y, col, haze, t * 0.85);
    }
  }
  return c.texture();
}

function paintMesas(): Texture {
  const W = 760;
  const H = 82;
  const c = new PixelCanvas(W, H);
  const rng = new Rng(21);
  const strata = [0x9c4a2c, 0xb05a34, 0x8e4028, 0xa85232];
  const litStrata = [0xd27848, 0xe08a52, 0xc86c40, 0xda8050];
  let x = -20;
  while (x < W) {
    const mw = rng.int(70, 170);
    const mh = rng.int(22, 58);
    const top = H - mh;
    for (let y = top; y < H; y++) {
      const slope = Math.round((y - top) * 0.9);
      const x0 = x - slope;
      const x1 = x + mw + slope;
      const si = Math.floor((y - top) / 5) % strata.length;
      for (let xx = x0; xx < x1; xx++) {
        const right = xx > x1 - 1 - Math.max(3, slope + 3);
        const col = right ? litStrata[si] : strata[si];
        c.dither(xx, y, col, 0xc8746a, ((y - top) / mh) * 0.5);
      }
    }
    x += mw + rng.int(30, 90);
  }
  return c.texture();
}

/** Arena de fondo y piso de tierra apisonada. Cubre de y=-100 a y=+80 (mundo). */
function paintFloor(): Texture {
  const W = STAGE_W;
  const H = 180;
  const TOP = -100;
  const row = (worldY: number) => worldY - TOP;
  const c = new PixelCanvas(W, H);
  const rng = new Rng(33);
  // Arena del fondo.
  c.vgrad(0, 0, W, row(-14), [0xd28a62, 0xc87650, 0xbc6844, 0xb05e3c]);
  for (let i = 0; i < 900; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, row(-14) - 1);
    c.set(x, y, rng.chance(0.5) ? 0xa85634 : 0xe2a074);
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(10, row(-14) - 6);
    const rw = rng.int(2, 6);
    c.rect(x, y, rw, 2, 0x7a3e2a);
    c.rect(x, y - 1, rw - 1, 1, 0xc0805a);
  }
  // Piso de pelea: una franja de tierra apisonada, más clara y pareja.
  const g0 = row(-14);
  const g1 = row(6);
  c.vgrad(0, g0, W, g1, [0x9a5a3c, 0xb06c4a, 0xc07c58, 0xb87452]);
  for (let x = 0; x < W; x++) c.set(x, g0, 0x7a4430);
  for (let i = 0; i < 500; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(g0 + 1, g1 - 1);
    c.set(x, y, rng.chance(0.5) ? 0x8e5034 : 0xd09068);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(g0 + 2, g1 - 2);
    c.rect(x, y, rng.int(6, 22), 1, 0xa86444);
  }
  // Borde delantero y tierra más oscura hacia el espectador.
  for (let x = 0; x < W; x++) c.set(x, g1, 0xd49470);
  c.vgrad(0, g1 + 1, W, H, [0x8a4a2e, 0x7a4028, 0x6a3622, 0x5a2c1c]);
  for (let i = 0; i < 400; i++) c.set(rng.int(0, W - 1), rng.int(g1 + 1, H - 1), rng.chance(0.5) ? 0x4e2618 : 0x9a5636);
  return c.texture();
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

  /** Sin argumentos: escenario de prueba procedural. Con capas: escenario HD (ver StageView.load). */
  constructor(hd?: { name: string; layers: Array<{ def: StageLayerDef; textures: Texture[] }>; particles?: StageParticlesDef[]; music?: string }) {
    this.music = hd?.music ?? null;
    if (hd) {
      this.name = hd.name;
      for (const { def, textures } of hd.layers) this.addHd(def, textures);
      for (const p of hd.particles ?? []) {
        const field = new ParticleField(p);
        this.particles.push(field);
        this.container.addChild(field.container);
      }
    } else {
      this.name = 'Escenario de prueba';
      const add = (tex: Texture, fx: number, fy: number, top: number) => {
        const view = new Sprite(tex);
        this.container.addChild(view);
        this.layers.push({ view, fx, fy, top, left: 0, frames: null, frameDur: 1, scrollX: 0, alpha: 1, pulse: null, strips: null });
      };
      add(paintSky(), 0, 0.2, -390);
      add(paintMountains(3, 580, 150, 40, 120, 0x3a2452, 0x5c3474, 0xf6d4dc, 0xb69ac8, 0xc86a6a), 0.12, 0.4, -245);
      add(paintMountains(11, 640, 110, 22, 78, 0x4a2440, 0x7a3a52, 0xf0c8c4, 0xb08090, 0xb85a4e), 0.25, 0.55, -205);
      add(paintMesas(), 0.5, 0.75, -170);
      add(paintFloor(), 1, 1, -100);
    }
    this.darken.rect(0, 0, VIEW_W, VIEW_H).fill(0x05020c);
    this.darken.alpha = 0;
    this.container.addChild(this.darken);
  }

  /** Carga un escenario HD desde su JSON (StageDef); las imágenes se buscan junto al JSON. */
  static async load(url: string): Promise<StageView> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar el escenario ${url}`);
    const def = (await res.json()) as StageDef;
    const base = new URL(url, location.href);
    const scaleMode = def.filter ?? 'linear';
    const load = (src: string) =>
      Assets.load<Texture>({ src: new URL(src, base).href, data: { scaleMode, autoGenerateMipmaps: scaleMode === 'linear' } });
    // Video en loop, mudo (así el navegador lo deja reproducirse solo). Sin mipmaps: se regenerarían en cada cuadro.
    const loadVideo = async (src: string): Promise<Texture[]> => {
      try {
        const tex = await Assets.load<Texture>({
          src: new URL(src, base).href,
          data: { autoPlay: true, loop: true, muted: true, playsinline: true, preload: true, scaleMode: 'linear', autoGenerateMipmaps: false },
        });
        return [tex];
      } catch (err) {
        console.warn(`No se pudo cargar el video ${src}; queda la imagen fija.`, err);
        return [];
      }
    };
    const layers = await Promise.all(
      def.layers.map(async (l) => ({
        def: l,
        textures: l.video ? await loadVideo(l.video) : await Promise.all((l.frames ?? (l.src ? [l.src] : [])).map(load)),
      })),
    );
    return new StageView({ name: def.name, layers, particles: def.particles, music: def.music });
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
