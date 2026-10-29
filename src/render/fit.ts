import type { Texture } from 'pixi.js';

/**
 * Escala para que todos los cuadros de una animación quepan, desde los pies
 * (el ancla), en `h` unidades de alto y `w` de ancho centradas en el ancla. Así
 * un luchador más alto o con el chaquetón abierto igual entra en su tarjeta.
 */
export function fitScale(frames: ReadonlyArray<{ tex: Texture }>, h: number, w: number): number {
  let k = Infinity;
  for (const { tex } of frames) {
    const ax = tex.defaultAnchor?.x ?? 0.5;
    const ay = tex.defaultAnchor?.y ?? 1;
    k = Math.min(k, h / (tex.height * ay), w / 2 / (tex.width * Math.max(ax, 1 - ax)));
  }
  return Number.isFinite(k) ? k : 1;
}
