// Luces de disco para los súpers con `cinematic.lights = 'disco'` (el "2 SHIPITIA"
// de Loco René): una bola de espejos que baja y gira, focos de colores que barren
// el escenario y cruzan sus haces, manchas de color en el piso, los reflejos de la
// bola recorriendo las paredes y un baño de color que late al ritmo de la canción.
// Todo va detrás de los luchadores, en unidades de pantalla (480x270).

import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { GROUND_SCREEN_Y, VIEW_W } from '../config';

/** Magenta, rojo, violeta, cian y amarillo. */
const COLORS = [0xff2ea6, 0xff3348, 0x9b4dff, 0x2be4f0, 0xffd040];
/** "2 Shipitia" va a 100 bpm: un golpe cada 36 cuadros. */
const BEAT = 36;
const BALL_X = VIEW_W / 2;
/** La bola cuelga bajo el centro del HUD (tiempo, EN VIVO y vistas). */
const BALL_Y = 86;
const BALL_R = 19;
/** Vueltas de la bola por cuadro (radianes); los reflejos giran con ella. */
const SPIN = 0.03;
/** Bandas (latitud) y columnas (longitud) de espejos de la bola. */
const LAT = 9;
const LON = 18;

// ---------------------------------------------------------------- texturas

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, anchor: { x: number; y: number }): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }), defaultAnchor: anchor });
}

let texCache: { dot: Texture; beam: Texture; star: Texture; wash: Texture } | null = null;

function textures(): { dot: Texture; beam: Texture; star: Texture; wash: Texture } {
  if (texCache) return texCache;
  // Punto difuso (reflejos, manchas, brillo de la bola).
  const dot = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }, { x: 0.5, y: 0.5 });
  // Haz de foco: cono angosto arriba que se abre y se apaga hacia abajo, con
  // bordes suaves y algunas vetas de "polvo en la luz".
  const BW = 128;
  const BH = 512;
  const beam = canvasTexture(BW, BH, (ctx) => {
    for (let y = 0; y < BH; y++) {
      const t = y / (BH - 1);
      const half = 2.5 + t * 60;
      const start = Math.min(1, t / 0.03);
      const a = 0.95 * Math.pow(1 - t, 0.6) * start + 0.03;
      const g = ctx.createLinearGradient(BW / 2 - half, 0, BW / 2 + half, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.32, `rgba(255,255,255,${(a * 0.45).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`);
      g.addColorStop(0.68, `rgba(255,255,255,${(a * 0.45).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(BW / 2 - half, y, half * 2, 1);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i++) {
      const end = (Math.random() * 2 - 1) * 52;
      const g = ctx.createLinearGradient(0, 0, 0, BH);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(BW / 2, 0);
      ctx.lineTo(BW / 2 + end, BH);
      ctx.stroke();
    }
  }, { x: 0.5, y: 0 });
  // Destello de 4 puntas (brillos de la bola).
  const star = canvasTexture(64, 64, (ctx) => {
    ctx.globalCompositeOperation = 'lighter';
    const ray = (w: number, h: number, rot: number, alpha: number) => {
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.scale(1, h / w);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    ray(32, 2.2, 0, 1);
    ray(32, 2.2, Math.PI / 2, 1);
    ray(18, 1.6, Math.PI / 4, 0.55);
    ray(18, 1.6, -Math.PI / 4, 0.55);
    ray(8, 8, 0, 1);
  }, { x: 0.5, y: 0.5 });
  // Baño de color desde el techo.
  const wash = canvasTexture(8, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
  }, { x: 0, y: 0 });
  texCache = { dot, beam, star, wash };
  return texCache;
}

// ---------------------------------------------------------------- utilidades

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Número pseudoaleatorio fijo por espejo (0..1). */
function hash(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

// ---------------------------------------------------------------- show

interface Beam {
  view: Sprite;
  flare: Sprite;
  spot: Sprite;
  x: number;
  base: number;
  amp: number;
  speed: number;
  phase: number;
}

interface Reflection {
  view: Sprite;
  lon: number;
  y: number;
  size: number;
  phase: number;
}

interface Glint {
  view: Sprite;
  lat: number;
  lon: number;
  age: number;
  life: number;
}

export class DiscoShow {
  /** Va en la capa del mundo, entre el escenario y los luchadores. */
  readonly container = new Container();
  private wash: Sprite;
  private reflections: Reflection[] = [];
  private beams: Beam[] = [];
  private ballGlow: Sprite;
  private cord = new Graphics();
  private ball = new Graphics();
  private ballShine: Sprite;
  private glints: Glint[] = [];
  /** Intensidad 0..1: sube rápido al empezar y baja suave al terminar. */
  private level = 0;
  private on = false;
  /** Cuadros desde que empezó el show. */
  private t = 0;
  /** Cuadro en que baja la bola (cuando se va el cartel del súper). */
  private dropAt = 0;

  /** colors: paleta de focos y destellos (René: multicolor; Carlitos: neón rojo de discoteca). */
  constructor(private readonly colors: number[] = COLORS) {
    const tex = textures();
    this.wash = new Sprite(tex.wash);
    this.wash.blendMode = 'add';
    this.wash.width = VIEW_W;
    this.wash.height = 190;
    const reflLayer = new Container();
    const beamLayer = new Container();
    const spotLayer = new Container();
    const glintLayer = new Container();
    for (let i = 0; i < 96; i++) {
      const view = new Sprite(tex.dot);
      view.blendMode = 'add';
      const white = Math.random() < 0.6;
      view.tint = white ? 0xffffff : mix(this.colors[i % this.colors.length], 0xffffff, 0.45);
      reflLayer.addChild(view);
      this.reflections.push({ view, lon: Math.random() * Math.PI * 2, y: 6 + Math.random() * 244, size: 1.4 + Math.random() * 1.8, phase: Math.random() * 6.28 });
    }
    // Cinco focos móviles colgados arriba; los de los lados apuntan hacia el centro.
    const xs = [26, 120, 240, 360, 454];
    xs.forEach((x, i) => {
      const view = new Sprite(tex.beam);
      view.blendMode = 'add';
      const flare = new Sprite(tex.dot);
      flare.blendMode = 'add';
      const spot = new Sprite(tex.dot);
      spot.blendMode = 'add';
      beamLayer.addChild(view, flare);
      spotLayer.addChild(spot);
      const base = Math.atan2(BALL_X - x, 230) * 0.55;
      this.beams.push({ view, flare, spot, x, base, amp: 0.42 + (i % 2) * 0.14, speed: 0.021 + i * 0.0043, phase: i * 1.7 });
    });
    this.ballGlow = new Sprite(tex.dot);
    this.ballGlow.blendMode = 'add';
    this.ballShine = new Sprite(tex.dot);
    this.ballShine.blendMode = 'add';
    for (let i = 0; i < 7; i++) {
      const view = new Sprite(tex.star);
      view.blendMode = 'add';
      glintLayer.addChild(view);
      this.glints.push({ view, lat: 0, lon: 0, age: 999, life: 1 });
    }
    this.container.addChild(this.wash, reflLayer, spotLayer, beamLayer, this.ballGlow, this.cord, this.ball, this.ballShine, glintLayer);
    this.container.visible = false;
  }

  /** Prende el show (si ya estaba prendido, sigue sin reiniciar). dropDelay: cuadros antes de que baje la bola. */
  start(dropDelay = 0): void {
    if (this.level <= 0.001) {
      this.t = 0;
      this.dropAt = dropDelay;
    }
    this.on = true;
    this.container.visible = true;
  }

  /** Apaga el show con un fundido suave. */
  stop(): void {
    this.on = false;
  }

  /** Oscuridad extra para el escenario mientras dura el show. */
  get darkness(): number {
    return 0.8 * this.level;
  }

  /** Un cuadro de lógica (60 por segundo): intensidad y reloj del ritmo. */
  step(): void {
    if (!this.on && this.level <= 0) return;
    this.level = this.on ? Math.min(1, this.level + 0.1) : Math.max(0, this.level - 1 / 45);
    this.t++;
    if (this.level <= 0) this.container.visible = false;
  }

  /** Acomoda todo para el cuadro (camOffY: la cámara subió; el piso baja en pantalla). */
  update(camOffY: number): void {
    if (!this.container.visible) return;
    const t = this.t;
    const beat = Math.floor(t / BEAT);
    const k = Math.exp(-((t % BEAT) / BEAT) * 4.5);
    // Cada compás (4 golpes) los focos rotan sus colores; en el primer golpe del compás, un golpe más fuerte.
    const bar = Math.floor(beat / 4);
    const accent = beat % 4 === 0 ? 1.35 : 1;
    this.container.alpha = this.level;

    this.wash.tint = this.colors[beat % this.colors.length];
    this.wash.alpha = 0.1 + 0.18 * k * accent;

    // Bola: baja desde arriba con un pequeño rebote y gira.
    const drop = easeOutBack(Math.min(1, Math.max(0, (t - this.dropAt) / 28)));
    const by = BALL_Y - (1 - drop) * 130;
    const rot = t * SPIN;
    this.drawBall(by, rot, this.colors[beat % this.colors.length], t);
    this.ballGlow.position.set(BALL_X, by);
    this.ballGlow.scale.set((BALL_R * 6.5 * (1 + 0.12 * k)) / 64);
    this.ballGlow.tint = mix(this.colors[beat % this.colors.length], 0xffffff, 0.5);
    this.ballGlow.alpha = 0.32 + 0.3 * k;
    this.ballShine.position.set(BALL_X - BALL_R * 0.38, by - BALL_R * 0.42);
    this.ballShine.scale.set((BALL_R * 1.1) / 64);
    this.ballShine.alpha = 0.75;
    this.cord.clear().moveTo(BALL_X, -4).lineTo(BALL_X, by - BALL_R).stroke({ color: 0x8a8aa0, width: 0.8, alpha: 0.9 });

    // Destellos sobre los espejos: nacen en un espejo visible y giran con la bola.
    for (const g of this.glints) {
      g.age++;
      if (g.age > g.life) {
        g.age = 0;
        g.life = 12 + Math.floor(Math.random() * 10);
        g.lat = (Math.random() * 2 - 1) * 1.1;
        g.lon = -rot + (Math.random() * 2 - 1) * 1.2;
      }
      const lon = g.lon + rot;
      const vis = Math.cos(lon);
      const u = g.age / g.life;
      const s = Math.sin(u * Math.PI);
      g.view.visible = vis > 0.15;
      g.view.position.set(BALL_X + BALL_R * Math.cos(g.lat) * Math.sin(lon), by - BALL_R * Math.sin(g.lat));
      g.view.scale.set((10 + 8 * k) * s / 64 * (0.6 + vis * 0.6));
      g.view.rotation = u * 0.8;
      g.view.alpha = s;
    }

    // Reflejos de la bola: puntos de luz que recorren paredes y piso al girar.
    const yFloor = GROUND_SCREEN_Y + camOffY;
    for (const r of this.reflections) {
      const a = r.lon + rot;
      const c = Math.cos(a);
      const v = r.view;
      v.visible = c > 0;
      if (!v.visible) continue;
      const y = r.y + camOffY * 0.6;
      const onFloor = y > yFloor - 8;
      v.position.set(BALL_X + 430 * Math.sin(a), y);
      const sz = (r.size * (0.8 + 0.3 * k)) / 64 * 4.6;
      v.scale.set(sz * (onFloor ? 1.6 : 1), sz * (onFloor ? 0.5 : 1));
      v.alpha = Math.pow(c, 0.6) * (0.6 + 0.4 * Math.sin(t * 0.28 + r.phase));
    }

    // Focos: barren, se cruzan y dejan su mancha de color en el piso.
    this.beams.forEach((b, i) => {
      const col = this.colors[(i + bar) % this.colors.length];
      const ang = b.base + b.amp * Math.sin(t * b.speed + b.phase);
      const y0 = -8;
      const len = (yFloor + 26 - y0) / Math.cos(ang);
      const v = b.view;
      v.position.set(b.x, y0);
      v.rotation = -ang;
      v.scale.set((78 * (1 + 0.15 * k)) / 128, len / 512);
      v.tint = col;
      v.alpha = (0.38 + 0.32 * k * accent) * (0.85 + 0.15 * Math.sin(t * 0.5 + i));
      b.flare.position.set(b.x, y0 + 6);
      b.flare.scale.set((16 + 10 * k) / 64);
      b.flare.tint = mix(col, 0xffffff, 0.6);
      b.flare.alpha = 0.9;
      const fx = b.x + Math.tan(ang) * (yFloor - y0);
      const sp = b.spot;
      sp.visible = fx > -60 && fx < VIEW_W + 60;
      sp.position.set(fx, yFloor - 2);
      sp.scale.set((92 * (1 + 0.2 * k)) / 64, 22 / 64);
      sp.tint = col;
      sp.alpha = 0.62 + 0.38 * k * accent;
    });
  }

  /** Bola de espejos: espejos en bandas con luz desde arriba a la izquierda, teñidos por el color del golpe. */
  private drawBall(by: number, rot: number, color: number, t: number): void {
    const g = this.ball;
    g.clear();
    g.circle(BALL_X, by, BALL_R + 0.6).fill(0x1c1c28);
    const dLat = Math.PI / LAT;
    const dLon = (Math.PI * 2) / LON;
    const inset = 0.14;
    const L = [-0.45, 0.62, 0.64];
    for (let i = 0; i < LAT; i++) {
      const lat0 = -Math.PI / 2 + i * dLat + dLat * inset;
      const lat1 = -Math.PI / 2 + (i + 1) * dLat - dLat * inset;
      const latC = (lat0 + lat1) / 2;
      for (let j = 0; j < LON; j++) {
        const lonC = j * dLon + rot;
        const cz = Math.cos(lonC) * Math.cos(latC);
        if (cz <= 0.04) continue;
        const lon0 = lonC - dLon * (0.5 - inset);
        const lon1 = lonC + dLon * (0.5 - inset);
        const px = (lat: number, lon: number) => BALL_X + BALL_R * Math.cos(lat) * Math.sin(lon);
        const py = (lat: number) => by - BALL_R * Math.sin(lat);
        const n = [Math.cos(latC) * Math.sin(lonC), Math.sin(latC), cz];
        const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const h = hash(i, j);
        // Algunos espejos "agarran" un foco y destellan un instante.
        const flash = (h * 7.3 + t * 0.021) % 1 < 0.035;
        const b = Math.min(1, 0.18 + 0.62 * diff + 0.28 * h);
        let c = mix(0x2c2f40, 0xeef1ff, b);
        c = mix(c, color, 0.22 + 0.18 * (1 - diff));
        if (flash) c = 0xffffff;
        g.poly([px(lat0, lon0), py(lat0), px(lat0, lon1), py(lat0), px(lat1, lon1), py(lat1), px(lat1, lon0), py(lat1)]).fill({ color: c, alpha: 0.35 + 0.65 * Math.min(1, cz * 1.6) });
      }
    }
    // Borde con un toque de luz del color del golpe.
    g.circle(BALL_X, by, BALL_R).stroke({ color: mix(color, 0xffffff, 0.4), width: 0.7, alpha: 0.6 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
