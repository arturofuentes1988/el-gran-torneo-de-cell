// Teclas dibujadas como teclas de verdad (tapa clara con borde y sombra) y
// líneas de comandos que mezclan texto, flechas y teclas. Las usan las
// pantallas MOVIMIENTOS y CONTROLES. La fuente pixel no tiene flechas, así
// que las direcciones se dibujan como íconos.

import { Container, Graphics } from 'pixi.js';
import { outlinedText, pixelText } from './text';

export const ARROWS: Record<string, number> = { '→': 0, '↘': 45, '↓': 90, '↙': 135, '←': 180, '↖': 225, '↑': 270, '↗': 315 };

/** Flecha dibujada (apunta a la derecha y se rota), del alto de una letra de tamaño `size`. */
export function arrowIcon(deg: number, color: number, size: number, outline = true): Graphics {
  const s = size / 2 + 0.5;
  const g = new Graphics();
  g.poly([-s, -s * 0.32, s * 0.1, -s * 0.32, s * 0.1, -s * 0.85, s, 0, s * 0.1, s * 0.85, s * 0.1, s * 0.32, -s, s * 0.32]).fill(color);
  if (outline) g.stroke({ color: 0x0a0610, width: 1.1 });
  g.rotation = (deg * Math.PI) / 180;
  return g;
}

/** Alto de una tecla para texto de tamaño `size`. */
export function capHeight(size: number): number {
  return size + 5;
}

/** Una tecla con su nombre (A, CTRL, NUM 7, ↓...). Origen arriba a la izquierda. */
export function keycap(label: string, size = 7, accent = false): Container {
  const c = new Container();
  const h = capHeight(size);
  const inner = new Container();
  let w: number;
  if (label.length === 1 && label in ARROWS) {
    const g = arrowIcon(ARROWS[label], 0x1a0a24, size - 1, false);
    g.position.set(0, 0);
    inner.addChild(g);
    w = h;
    g.position.set(w / 2, (h - 2) / 2);
  } else {
    // Interlineado igual al tamaño: así la letra queda centrada en la tapa.
    const t = pixelText(label, size - 1, 0x1a0a24, { lineHeight: size - 1 });
    w = Math.max(h, Math.ceil(t.width) + 6);
    t.position.set(Math.round((w - t.width) / 2), Math.round((h - 2 - (size - 1)) / 2));
    inner.addChild(t);
  }
  const g = new Graphics();
  // Sombra (borde inferior más oscuro) y tapa.
  g.roundRect(0, 0, w, h, 2).fill(accent ? 0xb07a20 : 0x7d6f9c);
  g.roundRect(0, 0, w, h - 2, 2).fill(accent ? 0xffd040 : 0xf2eaff);
  g.roundRect(0, 0, w, h, 2).stroke({ color: 0x0a0610, width: 1 });
  c.addChild(g, inner);
  return c;
}

/** Pieza de una línea de comando. */
export type Token = { text: string; color?: number } | { cap: string; accent?: boolean } | { arrow: string; color?: number } | { gap: number };

/**
 * Arma una línea con texto, flechas y teclas, centradas verticalmente en la
 * altura de una tecla. Devuelve el contenedor (su ancho es el de la línea).
 */
export function tokenLine(tokens: Token[], size = 7, color = 0xe8e0f0): Container {
  const c = new Container();
  const h = capHeight(size);
  let x = 0;
  for (const tk of tokens) {
    if ('gap' in tk) {
      x += tk.gap;
    } else if ('cap' in tk) {
      const k = keycap(tk.cap, size, tk.accent);
      k.position.set(x, 0);
      c.addChild(k);
      x += k.width + 2;
    } else if ('arrow' in tk) {
      const g = arrowIcon(ARROWS[tk.arrow] ?? 0, tk.color ?? color, size);
      g.position.set(x + size / 2 + 0.5, (h - 2) / 2);
      c.addChild(g);
      x += size + 2;
    } else if (tk.text) {
      const t = outlinedText(tk.text, size, tk.color ?? color, 0x0a0610, 2, { lineHeight: size });
      // Un pixel más arriba: la fuente deja su tinta un poco bajo el centro.
      t.position.set(x, Math.round((h - 2 - size) / 2) - 1);
      c.addChild(t);
      x += t.width;
    }
  }
  return c;
}

/** Convierte texto con flechas Unicode en piezas (las flechas como íconos). */
export function textTokens(text: string, color?: number): Token[] {
  const out: Token[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, color });
    buf = '';
  };
  for (const ch of text) {
    if (ch in ARROWS) {
      flush();
      out.push({ arrow: ch, color });
    } else buf += ch;
  }
  flush();
  return out;
}
