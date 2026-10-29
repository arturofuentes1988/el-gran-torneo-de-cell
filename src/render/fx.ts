// Capa de efectos HD (resolución de pantalla): chispas, polvo, destellos,
// brillos aditivos, animaciones de efecto con texturas propias y bloom.
// Usa coordenadas de mundo; la cámara mueve el contenedor.
// Aquí sí se usa Math.random: es solo decorativo y no afecta la simulación.

import { AdvancedBloomFilter } from 'pixi-filters';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { SparkKind } from '../sim/types';

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  drag: number;
  grav: number;
  /** Estira el sprite en la dirección de la velocidad (chispas). */
  stretch: number;
  spin: number;
  /** Vaivén horizontal (corazones): amplitud, frecuencia por cuadro y fase. */
  sway?: number;
  swayF?: number;
  ph?: number;
  /** Fracción de la vida con opacidad completa antes de empezar a desvanecerse. */
  hold?: number;
}

/** Efecto animado con cuadros propios (por ejemplo, un impacto dibujado con IA). */
interface SheetFx {
  sprite: Sprite;
  frames: Texture[];
  frameDur: number;
  t: number;
}

export interface SheetOptions {
  /** Unidades de mundo por pixel de textura (arte HD: ~0.25 a 0.35). */
  scale?: number;
  /** Cuadros de simulación por cuadro de animación. */
  frameDur?: number;
  /** Espejar (para efectos que miran hacia un lado). */
  flip?: boolean;
  /** Mezcla aditiva con bloom (energía, destellos). */
  additive?: boolean;
  tint?: number;
}

function makeTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  draw(ctx, size);
  return new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }), defaultAnchor: { x: 0.5, y: 0.5 } });
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Corazón pixel (como los "me gusta" de un live): contorno oscuro y brillo blanco. */
const HEART = [
  '..ooo...ooo..',
  '.oCCCo.oCCCo.',
  'oCWWCCoCCCCCo',
  'oCWCCCCCCCCCo',
  'oCCCCCCCCCCCo',
  'oCCCCCCCCCCdo',
  '.oCCCCCCCCdo.',
  '..oCCCCCCdo..',
  '...oCCCCdo...',
  '....oCCdo....',
  '.....odo.....',
  '......o......',
];

function heartTexture(color: number): Texture {
  const c = document.createElement('canvas');
  c.width = HEART[0].length;
  c.height = HEART.length;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const dark = ((color >> 1) & 0x7f7f7f) | 0;
  const pal: Record<string, string> = { o: '#1a0820', C: hex(color), d: hex(dark), W: '#ffffff' };
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'nearest' }), defaultAnchor: { x: 0.5, y: 0.5 } });
}

export class FxLayer {
  readonly container = new Container();
  private glowLayer = new Container();
  private normalLayer = new Container();
  private pool: Sprite[] = [];
  private live: Particle[] = [];
  private sheets: SheetFx[] = [];
  private hearts = new Map<number, Texture>();
  readonly tex: { dot: Texture; spark: Texture; ring: Texture; star: Texture };

  constructor() {
    this.tex = {
      dot: makeTexture(64, (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }),
      spark: makeTexture(64, (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.7, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, s / 2 - 3, s, 6);
      }),
      ring: makeTexture(128, (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }),
      star: makeTexture(96, (ctx, s) => {
        const c = s / 2;
        for (const [w, h] of [[s, 5], [5, s]] as const) {
          const g = ctx.createRadialGradient(c, c, 0, c, c, c);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(c - w / 2, c - h / 2, w, h);
        }
        const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.22);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }),
    };
    this.glowLayer.filters = [new AdvancedBloomFilter({ threshold: 0.25, bloomScale: 1.2, brightness: 1, blur: 6, quality: 5 })];
    this.container.addChild(this.normalLayer, this.glowLayer);
  }

  private spawn(tex: Texture, glow: boolean, p: Omit<Particle, 'sprite'>, tint: number, rot = 0): void {
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = tex;
    sprite.anchor.set(0.5);
    sprite.tint = tint;
    sprite.blendMode = glow ? 'add' : 'normal';
    sprite.rotation = rot;
    sprite.visible = true;
    (glow ? this.glowLayer : this.normalLayer).addChild(sprite);
    this.live.push({ ...p, sprite });
  }

  private flash(x: number, y: number, size: number, color: number, life: number, tex = this.tex.star): void {
    this.spawn(tex, true, { x, y, vx: 0, vy: 0, life, max: life, s0: size * 0.6, s1: size, a0: 1, a1: 0, drag: 1, grav: 0, stretch: 0, spin: 0 }, color, Math.random() * 0.6);
  }

  private ring(x: number, y: number, s0: number, s1: number, color: number, life: number): void {
    this.spawn(this.tex.ring, true, { x, y, vx: 0, vy: 0, life, max: life, s0, s1, a0: 0.9, a1: 0, drag: 1, grav: 0, stretch: 0, spin: 0 }, color);
  }

  private sparks(x: number, y: number, n: number, dir: number, spread: number, speed: [number, number], color: number, life: [number, number], size = 0.35): void {
    for (let i = 0; i < n; i++) {
      const base = dir >= 0 ? 0 : Math.PI;
      const a = base + rand(-spread, spread);
      const v = rand(speed[0], speed[1]);
      const l = Math.round(rand(life[0], life[1]));
      this.spawn(this.tex.spark, true, {
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l,
        s0: size, s1: size * 0.3, a0: 1, a1: 0, drag: 0.86, grav: 0.08, stretch: 1, spin: 0,
      }, color);
    }
  }

  hit(x: number, y: number, dir: number, kind: SparkKind): void {
    if (kind === 'light') {
      this.flash(x, y, 0.55, 0xfff2c0, 8);
      this.ring(x, y, 0.08, 0.38, 0xffe08a, 10);
      this.sparks(x, y, 7, dir, 1.1, [2.5, 5], 0xfff0a0, [8, 13]);
    } else if (kind === 'heavy') {
      this.flash(x, y, 0.95, 0xffd080, 10);
      this.ring(x, y, 0.1, 0.62, 0xff9a40, 13);
      this.sparks(x, y, 12, dir, 1.3, [3, 7], 0xffb050, [10, 16], 0.45);
      this.sparks(x, y, 5, dir, 0.5, [5, 9], 0xffffff, [6, 10], 0.5);
    } else {
      this.flash(x, y, 1.3, 0xffffff, 12);
      this.ring(x, y, 0.15, 0.9, 0x9ae0ff, 16);
      this.sparks(x, y, 16, dir, 1.6, [3, 8], 0xffe070, [12, 20], 0.5);
    }
  }

  block(x: number, y: number, dir: number): void {
    this.flash(x, y, 0.5, 0xa8e4ff, 7);
    this.ring(x, y, 0.12, 0.42, 0x6ac8ff, 11);
    this.sparks(x, y, 7, -dir, 0.9, [2, 4.5], 0xc8f0ff, [6, 10], 0.3);
  }

  dust(x: number, y: number, n: number, big: boolean): void {
    for (let i = 0; i < n; i++) {
      const l = Math.round(rand(18, 30));
      const s = big ? rand(0.25, 0.45) : rand(0.15, 0.28);
      this.spawn(this.tex.dot, false, {
        x: x + rand(-14, 14), y: y + rand(-3, 1), vx: rand(-1.4, 1.4), vy: rand(-0.9, -0.2),
        life: l, max: l, s0: s, s1: s * 2.2, a0: 0.55, a1: 0, drag: 0.92, grav: -0.01, stretch: 0, spin: 0,
      }, 0xd8a878);
    }
  }

  explosion(x: number, y: number, color: number, big: boolean): void {
    this.flash(x, y, big ? 1.6 : 0.9, 0xffffff, big ? 14 : 10);
    this.ring(x, y, 0.1, big ? 1.4 : 0.7, color, big ? 18 : 12);
    for (let i = 0; i < (big ? 22 : 12); i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(1, big ? 5 : 3.5);
      const l = Math.round(rand(12, 24));
      this.spawn(this.tex.dot, true, {
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l,
        s0: rand(0.15, 0.3), s1: 0.05, a0: 1, a1: 0, drag: 0.9, grav: 0, stretch: 0, spin: 0,
      }, color);
    }
  }

  clash(x: number, y: number): void {
    this.flash(x, y, 1.2, 0xffffff, 12);
    this.ring(x, y, 0.1, 1, 0xffffff, 14);
    this.sparks(x, y, 10, 1, Math.PI, [2, 6], 0xfff4c0, [10, 16]);
  }

  /** Estela de proyectil (llamar cada cuadro). */
  trail(x: number, y: number, color: number, size: number): void {
    const l = Math.round(rand(10, 16));
    this.spawn(this.tex.dot, true, {
      x: x + rand(-3, 3), y: y + rand(-4, 4), vx: rand(-0.3, 0.3), vy: rand(-0.4, 0.1), life: l, max: l,
      s0: size * rand(0.008, 0.012), s1: 0.02, a0: 0.8, a1: 0, drag: 0.95, grav: 0, stretch: 0, spin: 0,
    }, color);
  }

  superBurst(x: number, y: number, color: number): void {
    this.flash(x, y, 2.2, 0xffffff, 26);
    this.ring(x, y, 0.2, 2.4, color, 30);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const l = 28;
      this.spawn(this.tex.spark, true, {
        x, y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: l, max: l,
        s0: 1.2, s1: 0.4, a0: 0.9, a1: 0, drag: 0.9, grav: 0, stretch: 1, spin: 0,
      }, color);
    }
  }

  /** Partículas que suben alrededor de quien carga un súper. */
  aura(x: number, y: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      const l = Math.round(rand(14, 24));
      this.spawn(this.tex.dot, true, {
        x: x + rand(-22, 22), y: y + rand(-10, 60), vx: rand(-0.2, 0.2), vy: rand(-3, -1.5), life: l, max: l,
        s0: rand(0.12, 0.22), s1: 0.02, a0: 1, a1: 0, drag: 0.97, grav: 0, stretch: 0, spin: 0,
      }, color);
    }
  }

  /** Aura del Modo Poder: llamas que suben alrededor del cuerpo (llamar cada cuadro). y = pies. */
  powerAura(x: number, y: number, color: number, t: number): void {
    for (let i = 0; i < 2; i++) {
      const l = Math.round(rand(16, 26));
      this.spawn(this.tex.dot, true, {
        x: x + rand(-20, 20), y: y + rand(-125, -10), vx: rand(-0.3, 0.3), vy: rand(-2.6, -1.2), life: l, max: l,
        s0: rand(0.22, 0.36), s1: 0.04, a0: 0.9, a1: 0, drag: 0.96, grav: -0.02, stretch: 0, spin: 0,
      }, color);
    }
    if (t % 3 === 0) {
      this.spawn(this.tex.spark, true, {
        x: x + rand(-16, 16), y: y + rand(-115, -20), vx: 0, vy: rand(-3.2, -2), life: 14, max: 14,
        s0: 0.35, s1: 0.1, a0: 1, a1: 0, drag: 0.95, grav: 0, stretch: 1, spin: 0,
      }, 0xffffff);
    }
  }

  /** Lanzador que conecta: anillo y chispas hacia arriba. */
  launch(x: number, y: number): void {
    this.flash(x, y, 1, 0xffffff, 10);
    this.ring(x, y, 0.1, 0.8, 0x9ae0ff, 14);
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + rand(-0.5, 0.5);
      const v = rand(4, 8);
      const l = Math.round(rand(10, 16));
      this.spawn(this.tex.spark, true, {
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l,
        s0: 0.45, s1: 0.15, a0: 1, a1: 0, drag: 0.88, grav: 0.05, stretch: 1, spin: 0,
      }, 0xc8f0ff);
    }
  }

  ko(x: number, y: number): void {
    this.flash(x, y, 3, 0xffffff, 30);
    this.ring(x, y, 0.2, 3, 0xffe0a0, 34);
    this.ring(x, y, 0.1, 2, 0xff8040, 26);
  }

  /**
   * Corazón que sube meciéndose, con un brillo aditivo detrás (el corazón pixel
   * va en la capa normal y el brillo en la de bloom, con el mismo movimiento).
   */
  heart(x: number, y: number, color: number): void {
    let tex = this.hearts.get(color);
    if (!tex) {
      tex = heartTexture(color);
      this.hearts.set(color, tex);
    }
    const l = Math.round(rand(70, 92));
    const motion = {
      x, y, vx: rand(-0.12, 0.12), vy: rand(-1.9, -1.35), life: l, max: l, drag: 0.996, grav: 0.003,
      stretch: 0, spin: 0, sway: rand(3, 7), swayF: rand(0.08, 0.13), ph: rand(0, Math.PI * 2), hold: 0.55,
    };
    this.spawn(tex, false, { ...motion, s0: 0.6, s1: 1.15, a0: 1, a1: 0 }, 0xffffff, rand(-0.2, 0.2));
    this.spawn(this.tex.dot, true, { ...motion, s0: 0.22, s1: 0.4, a0: 0.5, a1: 0 }, color);
  }

  /** Chispas flotantes para el título. */
  ember(x: number, y: number): void {
    const l = Math.round(rand(60, 120));
    this.spawn(this.tex.dot, true, {
      x, y, vx: rand(-0.25, 0.25), vy: rand(-0.9, -0.35), life: l, max: l,
      s0: rand(0.08, 0.16), s1: 0.02, a0: 0.9, a1: 0, drag: 0.995, grav: 0, stretch: 0, spin: 0,
    }, Math.random() < 0.5 ? 0xffb050 : 0xffe080);
  }

  /** Brillo persistente (lo posiciona quien lo pide; ej. proyectiles). */
  makeGlow(color: number, size: number): Sprite {
    const s = new Sprite(this.tex.dot);
    s.anchor.set(0.5);
    s.tint = color;
    s.blendMode = 'add';
    s.scale.set(size / 32);
    s.alpha = 0.85;
    this.glowLayer.addChild(s);
    return s;
  }

  releaseGlow(s: Sprite): void {
    s.parent?.removeChild(s);
    s.destroy();
  }

  /**
   * Reproduce una vez una animación de efecto con cuadros propios (texturas HD
   * de cualquier resolución) en (x, y) de mundo. El anchor de cada textura es su centro.
   */
  playSheet(frames: Texture[], x: number, y: number, o: SheetOptions = {}): void {
    if (!frames.length) return;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(frames[0].defaultAnchor?.x ?? 0.5, frames[0].defaultAnchor?.y ?? 0.5);
    const k = o.scale ?? 1;
    sprite.scale.set(o.flip ? -k : k, k);
    sprite.tint = o.tint ?? 0xffffff;
    sprite.blendMode = o.additive ? 'add' : 'normal';
    sprite.position.set(x, y);
    (o.additive ? this.glowLayer : this.normalLayer).addChild(sprite);
    this.sheets.push({ sprite, frames, frameDur: Math.max(1, o.frameDur ?? 3), t: 0 });
  }

  /** Avanza un cuadro. */
  step(): void {
    for (let i = this.sheets.length - 1; i >= 0; i--) {
      const s = this.sheets[i];
      if (++s.t >= s.frames.length * s.frameDur) {
        s.sprite.destroy();
        this.sheets.splice(i, 1);
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life--;
      if (p.life <= 0) {
        p.sprite.visible = false;
        p.sprite.parent?.removeChild(p.sprite);
        this.pool.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.grav;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  /** Actualiza los sprites (cada render). */
  sync(): void {
    for (const s of this.sheets) s.sprite.texture = s.frames[Math.min(s.frames.length - 1, Math.floor(s.t / s.frameDur))];
    for (const p of this.live) {
      const t = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * t;
      const sp = p.sprite;
      sp.x = p.sway ? p.x + Math.sin((p.max - p.life) * (p.swayF ?? 0.1) + (p.ph ?? 0)) * p.sway : p.x;
      sp.y = p.y;
      const ta = p.hold ? Math.max(0, (t - p.hold) / (1 - p.hold)) : t;
      sp.alpha = p.a0 + (p.a1 - p.a0) * ta;
      if (p.stretch) {
        const v = Math.hypot(p.vx, p.vy);
        sp.rotation = Math.atan2(p.vy, p.vx);
        sp.scale.set(s * (0.6 + v * 0.25), s * 0.6);
      } else {
        sp.scale.set(s);
      }
    }
  }

  clear(): void {
    for (const p of this.live) {
      p.sprite.visible = false;
      p.sprite.parent?.removeChild(p.sprite);
      this.pool.push(p.sprite);
    }
    this.live.length = 0;
    for (const s of this.sheets) s.sprite.destroy();
    this.sheets.length = 0;
  }
}
