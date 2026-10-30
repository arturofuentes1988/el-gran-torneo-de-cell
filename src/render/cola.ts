// Efectos de bebida con gas y de su "¡run!" (Carlitos Run), dibujados con vectores:
// - 'cola': el chorro de bebida que dispara agitando la botella (cuerpo café, espuma y gotas).
// - 'cajon': el cajón de botellas que lanza, girando.
// - 'letras': las letras R-U-N en llamas que caen sobre el rival en el súper (como los troncos
//   del Vendedor: usa los mismos tiempos de caída, logLandFrame).

import type { Graphics } from 'pixi.js';
import type { Projectile } from '../sim/match';
import { flame, logLandFrame } from './fuego';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

const C_COLA = 0x4a1a08;
const C_COLA_LIGHT = 0x8a3a12;
const C_FOAM = 0xfff6e8;
const C_CRATE = 0x1c1c22;
const C_CRATE_EDGE = 0x3a3a46;
const C_CAP = 0xe02020;
const C_RED = 0xff2a2a;

/** "¡Quiero mi coca colita!": una ola de bebida con espuma adelante y gotas que saltan. */
export function drawCola(base: Graphics, g: Graphics, p: Projectile): void {
  const box = p.def.box;
  const cy = p.y + box.y + box.h / 2;
  const L = box.w * 1.3;
  const R = box.h * 0.5;
  const dir = p.dir;
  const f = p.frame;
  // Chorro: varias capas cafés que ondulan, de atrás (delgado) hacia adelante (grueso).
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = p.x - dir * L * (1 - t) * 0.9;
    const r = R * (0.35 + 0.65 * t) * (1 + Math.sin(f * 0.6 + i) * 0.08);
    base.ellipse(x, cy + Math.sin(f * 0.5 + i * 0.9) * 2, r * 1.3, r).fill({ color: i % 2 ? C_COLA : C_COLA_LIGHT, alpha: 0.92 });
  }
  // Brillo del líquido.
  base.ellipse(p.x - dir * L * 0.25, cy - R * 0.35, L * 0.32, R * 0.16).fill({ color: 0xffc89a, alpha: 0.35 });
  // Espuma blanca en la punta, que burbujea.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + f * 0.3;
    const rr = R * (0.28 + 0.12 * Math.sin(f * 0.8 + i * 2));
    base.circle(p.x + dir * R * 0.55 + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.7, rr).fill({ color: C_FOAM, alpha: 0.95 });
  }
  // Burbujas y gotas que saltan (en la capa que brilla).
  for (let i = 0; i < 7; i++) {
    const x = p.x - dir * rand(0, L);
    const y = cy + rand(-R * 1.4, R * 1.2);
    g.circle(x, y, rand(1.2, 3.2)).stroke({ width: 1, color: C_FOAM, alpha: 0.8 });
  }
  for (let i = 0; i < 4; i++) g.circle(p.x + dir * rand(R * 0.6, R * 1.4), cy + rand(-R, R), rand(1.5, 3)).fill({ color: C_COLA_LIGHT, alpha: 0.9 });
}

/** "¡Regálame todo el cajón!": el cajón de botellas que vuela girando, con líneas de velocidad. */
export function drawCajon(base: Graphics, g: Graphics, p: Projectile): void {
  const box = p.def.box;
  const cy = p.y + box.y + box.h / 2;
  const w = box.w * 0.95;
  const h = box.h * 0.75;
  const dir = p.dir;
  const ang = p.frame * 0.35 * dir;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const pt = (x: number, y: number): [number, number] => [p.x + x * c - y * s, cy + x * s + y * c];
  for (let i = 0; i < 3; i++) {
    const y = cy + (i - 1) * h * 0.4;
    g.moveTo(p.x - dir * w * 0.6, y).lineTo(p.x - dir * w * 1.5, y).stroke({ width: 1.3, color: 0xffffff, alpha: 0.4 });
  }
  const quad = (x0: number, y0: number, x1: number, y1: number, color: number): void => {
    const q = [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)].flat();
    base.poly(q).fill({ color });
  };
  // Botellas asomando por arriba: cuellos cafés con tapitas rojas.
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + w * (0.15 + i * 0.23);
    quad(x - 2.2, -h / 2 - 7, x + 2.2, -h / 2, C_COLA_LIGHT);
    quad(x - 2.6, -h / 2 - 9, x + 2.6, -h / 2 - 7, C_CAP);
  }
  // Cajón plástico negro con borde y huecos de agarre.
  quad(-w / 2, -h / 2, w / 2, h / 2, C_CRATE_EDGE);
  quad(-w / 2 + 2, -h / 2 + 2, w / 2 - 2, h / 2 - 2, C_CRATE);
  quad(-w * 0.18, -h * 0.28, w * 0.18, -h * 0.12, C_CRATE_EDGE);
}

/** Trazos de cada letra en una caja de 1 x 1.4 (y crece hacia abajo). */
const LETRAS: Record<string, number[][]> = {
  R: [[0, 1.4, 0, 0, 0.62, 0, 0.86, 0.18, 0.86, 0.52, 0.62, 0.7, 0, 0.7], [0.34, 0.7, 0.92, 1.4]],
  U: [[0, 0, 0, 1.12, 0.2, 1.4, 0.72, 1.4, 0.92, 1.12, 0.92, 0]],
  N: [[0, 1.4, 0, 0, 0.92, 1.4, 0.92, 0]],
};

function letra(base: Graphics, g: Graphics, ch: string, x: number, y: number, s: number, ang: number, a: number): void {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  for (const [w, color, layer] of [[s * 0.42, 0x2a0606, base], [s * 0.3, C_RED, base], [s * 0.12, 0xfff1c0, g]] as const) {
    for (const tr of LETRAS[ch]) {
      for (let i = 0; i < tr.length; i += 2) {
        const lx = (tr[i] - 0.46) * s;
        const ly = (tr[i + 1] - 1.4) * s;
        const px = x + lx * c - ly * sn;
        const py = y + lx * sn + ly * c;
        if (i === 0) layer.moveTo(px, py);
        else layer.lineTo(px, py);
      }
      layer.stroke({ width: w, color, alpha: a, cap: 'round', join: 'round' });
    }
  }
}

/** "¡Entrando pa' la discoteca!": aviso en el suelo y las letras R, U, N en llamas que caen una tras otra. */
export function drawLetras(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const n = p.def.hits;
  const f = p.frame + after;
  const fade = Math.min(1, (p.life + 1) / 14) * Math.max(0, 1 - after / 16);
  if (fade <= 0) return;
  const top = -300;
  const fall = 12;
  const first = logLandFrame(p, 0);
  if (f < first + 4) {
    const k = Math.min(1, f / Math.max(1, first));
    g.ellipse(p.x, 0, 26 + k * 26, 4 + k * 3).fill({ color: C_RED, alpha: (0.15 + 0.4 * k) * (0.7 + Math.random() * 0.3) });
  }
  const word = 'RUN';
  const s = 34;
  for (let i = 0; i < n; i++) {
    const land = logLandFrame(p, i);
    const start = land - fall;
    if (f < start) continue;
    const x = p.x + (i % 3 - 1) * s * 1.05;
    const ch = word[i % 3];
    if (f < land) {
      const t = (f - start) / fall;
      const y = top + (0 - top) * t * t;
      for (let k = 1; k <= 3; k++) flame(g, x, y - s * 1.4 - k * 3, 30 + k * 6, 9, f * 2 + i * 5 + k, 0.5 * fade);
      letra(base, g, ch, x, y, s, (i % 2 ? 1 : -1) * (1 - t) * 0.6, fade);
    } else {
      // En el suelo, ardiendo.
      letra(base, g, ch, x, 0, s, 0, fade);
      flame(g, x, 0, 22 + Math.sin(f * 0.4 + i) * 4, 14, f + i * 9, 0.75 * fade);
      if (f - land < 6) g.circle(x, -14, 30 * (1 - (f - land) / 6) + 8).fill({ color: 0xffe0a0, alpha: 0.5 * fade });
    }
  }
}
