// Efectos de Papi Micky: luces de neón de set de TV, oro y estrellas. Todo dibujado con vectores
// (en la capa que brilla, con bloom):
// - 'paaa': su "¡PAAA!" revienta una onda de neón alrededor suyo: anillos rosados y celestes que se
//   abren, rayos de luz, estrellas y un destello en el piso.
// - 'monedas': "Todo es gratis, papito": una lluvia de monedas de oro que cae girando sobre el rival,
//   con brillos y un anillo dorado de aviso en el suelo.
// - 'oro': el súper "¡Dios es el dueño del oro!": se abre el cielo (una columna de luz dorada con
//   rayos) y caen lingotes de oro, monedas de plata y estrellas que estallan al tocar el suelo.

import type { Graphics } from 'pixi.js';
import type { Projectile } from '../sim/match';
import { logLandFrame } from './fuego';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

const ROSA = 0xff3fa4;
const CELESTE = 0x3fe0ff;
const AMARILLO = 0xffe14a;
const MORADO = 0xb46bff;
const ORO = 0xffcf3a;
const ORO_OSCURO = 0xb07a10;
const ORO_CLARO = 0xfff2a8;
const PLATA = 0xdfe8f4;

/** Estrella de cinco puntas. */
function estrella(g: Graphics, x: number, y: number, r: number, ang: number, color: number, alpha: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = ang + (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill({ color, alpha });
}

/** Destello de cuatro puntas (brillo). */
function destello(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  g.poly([x, y - r, x + r * 0.18, y - r * 0.18, x + r, y, x + r * 0.18, y + r * 0.18, x, y + r, x - r * 0.18, y + r * 0.18, x - r, y, x - r * 0.18, y - r * 0.18])
    .fill({ color, alpha });
}

/** "¡PAAA!": anillos de neón que se abren desde su pecho, rayos de luz, estrellas y brillo en el piso. */
export function drawPaaa(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const f = p.frame + after;
  const total = p.def.life + 16;
  const fade = Math.max(0, 1 - after / 16);
  if (fade <= 0) return;
  const big = p.def.hits > 1;
  const cx = p.x;
  const cy = p.y - 70;
  const maxR = (big ? 190 : 145) * (p.def.box.w / 124);
  // Piso: un óvalo de luz que late.
  const k0 = Math.min(1, f / 6);
  g.ellipse(cx, p.y, maxR * 0.9 * k0, 10 * k0).fill({ color: ROSA, alpha: 0.35 * fade });
  g.ellipse(cx, p.y, maxR * 0.55 * k0, 6 * k0).fill({ color: 0xffffff, alpha: 0.35 * fade });
  // Destello central al reventar.
  if (f < 10) {
    const t = f / 10;
    g.circle(cx, cy, 30 + t * 60).fill({ color: 0xffffff, alpha: (1 - t) * 0.8 });
    g.circle(cx, cy, 20 + t * 40).fill({ color: AMARILLO, alpha: (1 - t) * 0.9 });
  }
  // Anillos de neón: cada uno sale un poco después y se abre con un borde blanco y otro de color.
  const colores = [ROSA, CELESTE, AMARILLO, MORADO];
  const n = big ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const t = (f - i * 4) / (total * 0.75);
    if (t <= 0 || t >= 1) continue;
    const e = 1 - (1 - t) * (1 - t);
    const r = maxR * e;
    const a = (1 - t) * fade;
    const c = colores[i % colores.length];
    g.ellipse(cx, cy, r, r * 0.92).stroke({ width: 16 * (1 - t) + 4, color: c, alpha: 0.6 * a });
    g.ellipse(cx, cy, r, r * 0.92).stroke({ width: 3, color: 0xffffff, alpha: 0.9 * a });
  }
  // Rayos de luz de colores, como focos que barren desde él.
  if (f < total * 0.7) {
    const k = f / (total * 0.7);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + f * 0.05;
      const r0 = 20 + k * 20;
      const r1 = maxR * (0.7 + 0.5 * Math.sin(i * 1.7 + f * 0.3));
      const w = 0.07;
      g.poly([
        cx + Math.cos(ang - w) * r0, cy + Math.sin(ang - w) * r0,
        cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1,
        cx + Math.cos(ang + w) * r0, cy + Math.sin(ang + w) * r0,
      ]).fill({ color: colores[i % 4], alpha: 0.35 * (1 - k) * fade });
    }
  }
  // Estrellas que salen volando girando.
  const ns = big ? 14 : 9;
  for (let i = 0; i < ns; i++) {
    const t = Math.min(1, f / (total * 0.8));
    const ang = (i / ns) * Math.PI * 2 + i;
    const r = maxR * (0.25 + 0.9 * t) * (0.7 + (i % 3) * 0.15);
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.85;
    estrella(g, x, y, 7 + (i % 3) * 3, f * 0.2 + i, colores[i % 4], (1 - t) * fade);
    destello(base, x, y, 3, 0xffffff, (1 - t) * 0.8 * fade);
  }
}

/** Una moneda de oro (o plata) de lado que gira: el ancho cambia con el giro. */
function moneda(base: Graphics, g: Graphics, x: number, y: number, r: number, giro: number, color: number, alpha: number): void {
  const w = Math.max(1.2, Math.abs(Math.cos(giro)) * r);
  const borde = color === ORO ? ORO_OSCURO : 0x8a96aa;
  base.ellipse(x, y, w, r).fill({ color: borde, alpha });
  base.ellipse(x, y, Math.max(0.8, w * 0.8), r * 0.8).fill({ color, alpha });
  if (w > r * 0.4) g.ellipse(x - w * 0.25, y - r * 0.3, w * 0.25, r * 0.25).fill({ color: 0xffffff, alpha: 0.7 * alpha });
}

/** "Todo es gratis, papito": aviso dorado en el suelo y monedas que llueven girando sobre el rival. */
export function drawMonedas(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const f = p.frame + after;
  const fade = Math.min(1, (p.life + 1) / 12) * Math.max(0, 1 - after / 14);
  if (fade <= 0) return;
  const delay = p.def.delay ?? 0;
  const top = -300;
  const ancho = p.def.box.w;
  // Aviso: anillo dorado que crece en el suelo y destellos que bajan del cielo.
  if (f < delay + 6) {
    const k = Math.min(1, f / Math.max(1, delay));
    g.ellipse(p.x, 0, ancho * (0.4 + k * 0.6), 4 + k * 4).fill({ color: ORO, alpha: (0.2 + 0.45 * k) * (0.7 + Math.random() * 0.3) });
    for (let i = 0; i < 4; i++) destello(g, p.x + rand(-ancho, ancho), top + 40 + rand(0, 160) * k, 4 + k * 4, ORO_CLARO, 0.6 * k);
  }
  if (f < delay - 12) return;
  // Chorro de monedas: cada una con su hora de salida, cae acelerando y rebota al tocar el suelo.
  const n = 14 + p.def.hits * 8;
  const durLluvia = (p.def.hits - 1) * (p.def.hitInterval ?? 8) + 18;
  for (let i = 0; i < n; i++) {
    const salida = delay - 12 + ((i * 7) % durLluvia);
    const t = (f - salida) / 14;
    if (t < 0) continue;
    const x = p.x + (((i * 37) % 100) / 100 - 0.5) * ancho * 1.4;
    if (t < 1) {
      const y = top + (0 - top) * t * t;
      moneda(base, g, x, y - 10, 11, f * 0.5 + i, i % 5 === 0 ? PLATA : ORO, fade);
      // Estela de brillo detrás de la moneda.
      g.moveTo(x, y - 46).lineTo(x, y - 16).stroke({ width: 4, color: ORO_CLARO, alpha: 0.5 * fade });
    } else if (t < 2.2) {
      // Rebote corto y queda brillando un momento en el piso.
      const u = t - 1;
      const y = -Math.max(0, Math.sin(Math.min(1, u) * Math.PI) * 14);
      moneda(base, g, x + u * ((i % 2) * 2 - 1) * 8, y - 9, 9, f * 0.3 + i, i % 5 === 0 ? PLATA : ORO, fade * (1 - Math.max(0, u - 0.8) / 0.4));
      if (u < 0.3) destello(g, x, -8, 16 * (1 - u / 0.3), 0xffffff, 0.9 * fade);
    }
  }
  // Polvo de oro en el aire.
  for (let i = 0; i < 6; i++) g.circle(p.x + rand(-ancho, ancho), rand(-150, -10), rand(0.8, 2)).fill({ color: ORO_CLARO, alpha: 0.7 * fade });
}

/** Un lingote de oro visto de lado (trapecio con cara de arriba más clara). */
function lingote(base: Graphics, g: Graphics, x: number, y: number, s: number, ang: number, alpha: number): void {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const pt = (px: number, py: number): number[] => [x + px * c - py * sn, y + px * sn + py * c];
  const w = s;
  const h = s * 0.42;
  base.poly([...pt(-w / 2, 0), ...pt(w / 2, 0), ...pt(w * 0.36, -h), ...pt(-w * 0.36, -h)]).fill({ color: ORO_OSCURO, alpha });
  base.poly([...pt(-w * 0.44, -h * 0.12), ...pt(w * 0.44, -h * 0.12), ...pt(w * 0.32, -h * 0.85), ...pt(-w * 0.32, -h * 0.85)]).fill({ color: ORO, alpha });
  g.poly([...pt(-w * 0.28, -h * 0.75), ...pt(w * 0.1, -h * 0.75), ...pt(w * 0.04, -h * 0.55), ...pt(-w * 0.24, -h * 0.55)]).fill({ color: 0xffffff, alpha: 0.75 * alpha });
}

/** Súper "¡Dios es el dueño del oro!": se abre el cielo y cae una tormenta de oro, plata y estrellas. */
export function drawOro(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const f = p.frame + after;
  const fade = Math.min(1, (p.life + 1) / 16) * Math.max(0, 1 - after / 18);
  if (fade <= 0) return;
  const delay = p.def.delay ?? 0;
  const top = -320;
  const ancho = p.def.box.w;
  // El cielo se abre: una columna de luz dorada que baja hasta el rival, con rayos que giran.
  const abre = Math.min(1, f / Math.max(1, delay));
  const colW = ancho * (0.25 + 0.75 * abre);
  g.poly([p.x - colW * 0.35, top, p.x + colW * 0.35, top, p.x + colW, 0, p.x - colW, 0]).fill({ color: ORO, alpha: 0.32 * abre * fade });
  g.poly([p.x - colW * 0.15, top, p.x + colW * 0.15, top, p.x + colW * 0.5, 0, p.x - colW * 0.5, 0]).fill({ color: ORO_CLARO, alpha: 0.42 * abre * fade });
  for (let i = 0; i < 10; i++) {
    const ang = Math.PI / 2 + Math.sin(f * 0.04 + i * 1.3) * 0.9;
    const l = 260 + (i % 3) * 40;
    g.poly([p.x - 6, top + 10, p.x + 6, top + 10, p.x + Math.cos(ang) * l + 14, top + Math.sin(ang) * l, p.x + Math.cos(ang) * l - 14, top + Math.sin(ang) * l])
      .fill({ color: i % 2 ? ORO_CLARO : ORO, alpha: 0.2 * abre * fade });
  }
  // La abertura del cielo: un óvalo brillante arriba, con destellos.
  g.ellipse(p.x, top + 12, 40 + 50 * abre, 10 + 10 * abre).fill({ color: 0xffffff, alpha: 0.6 * abre * fade });
  for (let i = 0; i < 5; i++) destello(g, p.x + rand(-80, 80) * abre, top + rand(0, 40), rand(4, 9), ORO_CLARO, 0.8 * abre * fade);
  // Aviso en el suelo.
  if (f < delay + 4) g.ellipse(p.x, 0, ancho * (0.5 + abre * 0.6), 5 + abre * 4).fill({ color: ORO, alpha: (0.25 + 0.5 * abre) * (0.7 + Math.random() * 0.3) });
  // Lingotes: uno por golpe, grandes, girando, con su estallido al caer.
  const fall = 12;
  for (let i = 0; i < p.def.hits; i++) {
    const land = logLandFrame(p, i);
    const start = land - fall;
    if (f < start) continue;
    const x = p.x + ((i % 3) - 1) * ancho * 0.32;
    if (f < land) {
      const t = (f - start) / fall;
      const y = top + (0 - top) * t * t;
      g.moveTo(x, y - 70).lineTo(x, y - 10).stroke({ width: 6, color: ORO_CLARO, alpha: 0.35 * fade });
      lingote(base, g, x, y, 58, (i % 2 ? 1 : -1) * (1 - t) * 1.2, fade);
    } else {
      const u = f - land;
      lingote(base, g, x, 0, 58, 0, fade * Math.max(0, 1 - Math.max(0, u - 30) / 20));
      if (u < 10) {
        const k = u / 10;
        g.circle(x, -14, 22 + k * 70).stroke({ width: 9 * (1 - k) + 2, color: ORO_CLARO, alpha: (1 - k) * fade });
        g.circle(x, -14, 30 * (1 - k) + 6).fill({ color: 0xffffff, alpha: 0.7 * (1 - k) * fade });
        for (let s = 0; s < 6; s++) {
          const a = -Math.PI / 2 + (s - 2.5) * 0.45;
          estrella(g, x + Math.cos(a) * k * 60, -14 + Math.sin(a) * k * 60, 5, f * 0.3 + s, s % 2 ? AMARILLO : 0xffffff, (1 - k) * fade);
        }
      }
    }
  }
  // Lluvia de monedas de plata y estrellas alrededor, todo el rato.
  if (f > delay - 10) {
    for (let i = 0; i < 26; i++) {
      const per = 20 + (i % 5) * 3;
      const t = ((f + i * 9) % per) / per;
      const x = p.x + (((i * 53) % 100) / 100 - 0.5) * ancho * 2.2;
      const y = top + (0 - top) * t * t;
      if (i % 3 === 0) estrella(g, x, y, 8, f * 0.25 + i, i % 2 ? AMARILLO : ROSA, 0.9 * fade);
      else moneda(base, g, x, y, 8, f * 0.5 + i, i % 4 === 0 ? ORO : PLATA, fade);
    }
  }
}
