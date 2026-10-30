import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { STAGE_W, VIEW_H, VIEW_W } from '../config';
import type { Game } from '../app/game';
import type { StageView } from '../render/stage';
import { loadTitleArena } from './titleArena';

// Fondo de las pantallas de menú (ELIGE MODO, ELIGE LUCHADOR, …): el ring del
// torneo con el templo (el mismo del título), teñido de morado, con dos focos
// que barren y un piso de neón que avanza hacia la pantalla. Mientras el ring
// carga (o si no carga) se ve un cielo morado con estrellas. Es uno solo y
// sigue donde iba al pasar de una pantalla a otra.

/** Línea del horizonte: ahí empieza el piso del ring (y donde nace el neón). */
const HORIZON_Y = 194;
const N_STARS = 46;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
}

interface Star {
  x: number;
  y: number;
  r: number;
  f: number;
  ph: number;
}

class MenuBackdrop {
  private root = new Container();
  private built = false;
  private spots: Sprite[] = [];
  private grid = new Graphics();
  private stars = new Graphics();
  private starList: Star[] = [];
  /** El ring del torneo; lo comparte con el título, que lo saca de aquí mientras se muestra. */
  private arena: StageView | null = null;
  private arenaHolder = new Container();
  private sky: Sprite | null = null;
  /** Segundos de animación. */
  private t = 0;
  private last = 0;

  private build(): void {
    this.built = true;
    // Cielo y piso: degradados a doble resolución para que no se noten escalones.
    const sky = new Sprite(
      canvasTexture(VIEW_W * 2, VIEW_H * 2, (ctx) => {
        const h = HORIZON_Y * 2;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#05020c');
        g.addColorStop(0.55, '#140626');
        g.addColorStop(1, '#3b0d4e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, VIEW_W * 2, h);
        const f = ctx.createLinearGradient(0, h, 0, VIEW_H * 2);
        f.addColorStop(0, '#1e0732');
        f.addColorStop(1, '#050109');
        ctx.fillStyle = f;
        ctx.fillRect(0, h, VIEW_W * 2, VIEW_H * 2 - h);
      }),
    );
    sky.scale.set(0.5);
    this.sky = sky;
    loadTitleArena().then(
      (arena) => {
        this.arena = arena;
      },
      () => undefined,
    );
    // Velo morado sobre el ring: lo tiñe y deja leer los menús.
    const veil = new Sprite(
      canvasTexture(4, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, 'rgba(26,6,48,0.55)');
        g.addColorStop(0.62, 'rgba(48,10,78,0.38)');
        g.addColorStop(1, 'rgba(14,3,26,0.7)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 256);
      }),
    );
    veil.width = VIEW_W;
    veil.height = VIEW_H;

    // Focos: un cono de luz difuso, uno rosado y uno celeste, que barren desde arriba.
    const cone = canvasTexture(128, 512, (ctx) => {
      ctx.filter = 'blur(8px)';
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(56, 0);
      ctx.lineTo(72, 0);
      ctx.lineTo(118, 512);
      ctx.lineTo(10, 512);
      ctx.closePath();
      ctx.fill();
    });
    for (const [x, tint] of [
      [70, 0xff4cc0],
      [VIEW_W - 70, 0x4cc8ff],
    ] as const) {
      const s = new Sprite(cone);
      s.anchor.set(0.5, 0);
      s.position.set(x, -14);
      s.scale.set(0.9, 0.62);
      s.tint = tint;
      s.alpha = 0.22;
      s.blendMode = 'add';
      this.spots.push(s);
    }

    // Brillo del horizonte, donde el piso de neón se pierde.
    const glow = new Sprite(
      canvasTexture(256, 64, (ctx) => {
        const g = ctx.createRadialGradient(128, 32, 0, 128, 32, 128);
        g.addColorStop(0, 'rgba(255,90,210,0.9)');
        g.addColorStop(0.5, 'rgba(160,60,255,0.35)');
        g.addColorStop(1, 'rgba(160,60,255,0)');
        ctx.setTransform(1, 0, 0, 0.25, 0, 24);
        ctx.fillStyle = g;
        ctx.fillRect(0, -96, 256, 256);
      }),
    );
    glow.anchor.set(0.5);
    glow.position.set(VIEW_W / 2, HORIZON_Y);
    glow.width = VIEW_W * 1.3;
    glow.height = 70;
    glow.blendMode = 'add';

    for (let i = 0; i < N_STARS; i++) {
      this.starList.push({
        x: Math.random() * VIEW_W,
        y: Math.random() * (HORIZON_Y - 20),
        r: 0.35 + Math.random() * 0.6,
        f: 0.8 + Math.random() * 2.2,
        ph: Math.random() * Math.PI * 2,
      });
    }
    this.grid.blendMode = 'add';
    this.root.addChild(sky, this.stars, this.arenaHolder, veil, ...this.spots, this.grid, glow);
  }

  /** Pone el fondo en el mundo (al entrar a una pantalla de menú). */
  attach(game: Game): void {
    if (!this.built) this.build();
    game.display.world.addChildAt(this.root, 0);
    this.last = performance.now();
  }

  /** Lo saca del mundo (al salir de la pantalla). */
  detach(game: Game): void {
    game.display.world.removeChild(this.root);
  }

  /** Cada cuadro de pantalla: mueve los focos, hace titilar las estrellas y avanza el piso. */
  render(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t;
    // El título se lleva el ring a su pantalla; al volver a un menú se recupera.
    if (this.arena) {
      if (this.arena.container.parent !== this.arenaHolder) this.arenaHolder.addChild(this.arena.container);
      this.arena.setDarkness(0);
      this.arena.update((STAGE_W - VIEW_W) / 2, 0);
      this.stars.visible = false;
      if (this.sky) this.sky.visible = false;
    }
    this.spots[0].rotation = -0.42 + Math.sin(t * 0.55) * 0.32;
    this.spots[1].rotation = 0.42 + Math.sin(t * 0.55 + 2.2) * 0.32;

    this.stars.clear();
    if (!this.arena) for (const s of this.starList) {
      this.stars.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha: 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.f + s.ph)) });
    }

    // Piso: líneas que salen del punto de fuga y franjas que avanzan hacia la pantalla.
    const g = this.grid;
    g.clear();
    const vx = VIEW_W / 2;
    const depth = VIEW_H - HORIZON_Y;
    for (let i = -16; i <= 16; i++) g.moveTo(vx + i * 6, HORIZON_Y).lineTo(vx + i * 62, VIEW_H);
    g.stroke({ color: 0xff3cc8, width: 0.6, alpha: 0.32 });
    const phase = (t * 0.45) % 1;
    const N = 9;
    for (let j = 0; j < N; j++) {
      const z = (j + phase) / N;
      const y = HORIZON_Y + depth * z * z;
      g.moveTo(0, y).lineTo(VIEW_W, y).stroke({ color: 0xff3cc8, width: 0.4 + z * 0.8, alpha: 0.08 + z * 0.5 });
    }
  }
}

/** Un solo fondo para todas las pantallas de menú. */
export const backdrop = new MenuBackdrop();
