// Texturas de las bolas de energía (generadas por código).

import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { Ramp } from './mannequin/raster';

function toABGR(rgb: number): number {
  return ((255 << 24) | ((rgb & 255) << 16) | (((rgb >> 8) & 255) << 8) | ((rgb >> 16) & 255)) >>> 0;
}

/**
 * Bola de energía con cola de fuego, `count` cuadros animados, de `w` x `h`
 * unidades de mundo. Con `res` mayor que 1 se pinta `res` veces más fina
 * (filtrado lineal): el proyectil que la use debe llevar `texScale: 1 / res`.
 * Devuelve los nombres de textura registrados en `out`.
 */
export function makeEnergyFrames(
  id: string,
  ramp: Ramp,
  w: number,
  h: number,
  count: number,
  out: Record<string, Texture>,
  res = 1,
): string[] {
  const tw = Math.round(w * res);
  const th = Math.round(h * res);
  const canvas = document.createElement('canvas');
  canvas.width = tw * count;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const img = ctx.createImageData(canvas.width, th);
  const buf = new Uint32Array(img.data.buffer);
  const cols = ramp.map(toABGR);
  const outline = toABGR(0x1a0a14);
  const cx = w * 0.64;
  const cy = h / 2;
  const rb = h * 0.42;
  const names: string[] = [];

  for (let f = 0; f < count; f++) {
    const ph = (f / count) * Math.PI * 2;
    const field = new Float32Array(tw * th);
    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        // Coordenadas en unidades de mundo (la forma no depende de la resolución).
        const x = (px + 0.5) / res;
        const y = (py + 0.5) / res;
        const dx = x - cx;
        const dy = y - cy;
        const wob = Math.sin(dy * 0.8 + ph * 2 + x * 0.45) * 1.4 + Math.sin(x * 0.9 - ph * 3) * 0.8;
        // Bola
        let v = 1 - Math.hypot(dx * 0.95, dy) / (rb + wob * 0.4);
        // Cola: se adelgaza hacia atrás.
        if (dx < 0) {
          const t = 1 + dx / (cx - 1);
          const thick = rb * t * (0.85 + 0.15 * Math.sin(ph + x * 0.6));
          const tv = (1 - Math.abs(dy + Math.sin(x * 0.5 + ph * 2) * 1.6) / Math.max(0.5, thick + wob)) * (0.4 + 0.6 * t);
          v = Math.max(v, tv);
        }
        field[py * tw + px] = v;
      }
    }
    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        const v = field[py * tw + px];
        const oi = py * canvas.width + f * tw + px;
        if (v > 0) {
          const k = v > 0.72 ? 4 : v > 0.5 ? 3 : v > 0.3 ? 2 : v > 0.12 ? 1 : 0;
          buf[oi] = cols[k];
        } else {
          const n =
            (px > 0 && field[py * tw + px - 1] > 0) ||
            (px < tw - 1 && field[py * tw + px + 1] > 0) ||
            (py > 0 && field[(py - 1) * tw + px] > 0) ||
            (py < th - 1 && field[(py + 1) * tw + px] > 0);
          if (n) buf[oi] = outline;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const source = new CanvasSource({ resource: canvas, scaleMode: res > 1 ? 'linear' : 'nearest' });
  for (let f = 0; f < count; f++) {
    const name = `${id}/${f}`;
    out[name] = new Texture({
      source,
      frame: new Rectangle(f * tw, 0, tw, th),
      defaultAnchor: { x: cx / w, y: cy / h },
    });
    names.push(name);
  }
  return names;
}
