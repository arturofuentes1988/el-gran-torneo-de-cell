import { Text, type TextStyleOptions } from 'pixi.js';
import { GAME_FONT } from '../config';

// Todo el texto usa la fuente del juego (Oswald, gruesa y moderna). Se dibuja a la
// resolución de pantalla (escala × densidad) para que se vea nítido aunque el HUD esté escalado.
// Los tamaños del código venían pensados para la fuente pixel (letras anchas y del alto
// completo); FONT_SCALE los agranda para que la nueva se vea del mismo porte.

const registry = new Set<Text>();
let resolution = 1;

const FONT_SCALE = 1.45;

/**
 * Antes la fuente pixel no tenía mayúsculas con tilde y se las quitaba; la fuente
 * nueva sí las tiene, así que el texto queda tal cual (se mantiene la función para
 * los lugares que la usan al cambiar el texto de un Text ya creado).
 */
export function arcade(s: string): string {
  return s;
}

export function pixelText(text: string, size: number, fill: number, style: Partial<TextStyleOptions> = {}): Text {
  const t = new Text({
    text: arcade(text),
    style: {
      fontFamily: GAME_FONT,
      fontWeight: '700',
      fontSize: Math.round(size * FONT_SCALE),
      fill,
      letterSpacing: Math.max(0, size * 0.04),
      lineHeight: Math.round(size * FONT_SCALE * 1.15),
      ...style,
    },
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
