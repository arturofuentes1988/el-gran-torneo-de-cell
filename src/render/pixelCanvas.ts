import { CanvasSource, Texture } from 'pixi.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function abgr(rgb: number, a = 255): number {
  return (((a & 255) << 24) | ((rgb & 255) << 16) | (((rgb >> 8) & 255) << 8) | ((rgb >> 16) & 255)) >>> 0;
}

/** Mezcla dos colores 0xRRGGBB. */
export function mixRgb(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Lienzo para pintar pixel art a mano (sin antialiasing). */
export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  readonly buf: Uint32Array;

  constructor(readonly w: number, readonly h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    this.ctx = ctx;
    this.img = ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  set(x: number, y: number, rgb: number, a = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.buf[y * this.w + x] = abgr(rgb, a);
  }

  isSet(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.buf[(y | 0) * this.w + (x | 0)] !== 0;
  }

  rect(x: number, y: number, w: number, h: number, rgb: number, a = 255): void {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0);
    const y1 = Math.min(this.h, (y + h) | 0);
    const c = abgr(rgb, a);
    for (let yy = y0; yy < y1; yy++) this.buf.fill(c, yy * this.w + x0, yy * this.w + x1);
  }

  /** Mezcla con tramado ordenado entre dos colores (t = 0 → a, 1 → b). */
  dither(x: number, y: number, a: number, b: number, t: number): void {
    const th = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
    this.set(x, y, t > th ? b : a);
  }

  /** Degradado vertical con tramado entre varias paradas de color. */
  vgrad(x: number, y0: number, w: number, y1: number, stops: number[]): void {
    const n = stops.length - 1;
    for (let y = y0; y < y1; y++) {
      const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * n;
      const i = Math.min(n - 1, Math.floor(t));
      const ft = t - i;
      for (let xx = x; xx < x + w; xx++) this.dither(xx, y, stops[i], stops[i + 1], ft);
    }
  }

  circle(cx: number, cy: number, r: number, rgb: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, rgb);
      }
    }
  }

  texture(): Texture {
    this.ctx.putImageData(this.img, 0, 0);
    return new Texture({ source: new CanvasSource({ resource: this.canvas, scaleMode: 'nearest' }) });
  }
}
