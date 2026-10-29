import { Text, type TextStyleOptions } from 'pixi.js';
import { PIXEL_FONT } from '../config';

// Todo el texto usa la fuente pixel. Se dibuja a la resolución de pantalla
// (escala × densidad) para que se vea nítido aunque el HUD esté escalado.

const registry = new Set<Text>();
let resolution = 1;

const PLAIN: Record<string, string> = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U' };

/**
 * La fuente pixel dibuja las mayúsculas con tilde del tamaño de una minúscula,
 * así que en pantalla van sin tilde, como en los arcades. Usar también al
 * cambiar el texto de un Text ya creado.
 */
export function arcade(s: string): string {
  return s.replace(/[ÁÉÍÓÚÜ]/g, (c) => PLAIN[c] ?? c);
}

export function pixelText(text: string, size: number, fill: number, style: Partial<TextStyleOptions> = {}): Text {
  const t = new Text({
    text: arcade(text),
    style: { fontFamily: PIXEL_FONT, fontSize: size, fill, lineHeight: size + Math.round(size / 2), ...style },
    resolution,
  });
  t.roundPixels = true;
  registry.add(t);
  t.on('destroyed', () => registry.delete(t));
  return t;
}

/** Texto con contorno (para leer sobre cualquier fondo). */
export function outlinedText(text: string, size: number, fill: number, stroke = 0x0a0610, width = 2, style: Partial<TextStyleOptions> = {}): Text {
  return pixelText(text, size, fill, {
    stroke: { color: stroke, width, join: 'miter' },
    dropShadow: { color: 0x000000, alpha: 0.85, angle: Math.PI / 2, distance: Math.max(1, Math.round(size / 8)), blur: 0 },
    ...style,
  });
}

export function setTextResolution(r: number): void {
  resolution = r;
  for (const t of registry) t.resolution = r;
}
