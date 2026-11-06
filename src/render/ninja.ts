// Efectos del Samurai de Pudahuel: el maestro ninja sabio, con katana y armas ninja. Vectores en la capa
// que brilla (`g`), objetos de acero en la normal (`base`) y, para las sombras, sus propios cuadros pintados
// (ProjectileDef.sprites), teñidos de sombra:
// - 'shuriken': "¡La palabra no se la lleva el viento!": shuriken de acero que giran con su estela de viento
//   (uno; o tres que se abren en abanico).
// - 'cadena': "¡Ven a probar suerte pa' acá!": la cadena de la kusarigama sale de su mano con la hoz en la
//   punta y, al atrapar, vuelve recogiéndose.
// - 'sombras': "¡Haga sombra!": sus sombras ninja (siluetas moradas con estela) cruzan al rival.
// - 'iai': súper "¡El amor todo lo puede!": una línea de luz se forma en calma y estalla en un tajo rosa y
//   dorado que cruza la pantalla; quedan corazones y pétalos flotando.
// - 'kunai': súper "¡El 0,01 % de su poder!": nubes de humo alrededor del rival (aparece y desaparece) y una
//   lluvia de kunai que llega desde todos lados.
// - 'caligrafia': ultra "¡Una frase pa'l día!": la frase escrita en el aire, letra por letra, en trazos dorados.
// - 'cortes': ultra "¡Haga sombra!": tajos blancos que relampaguean sobre las siluetas bajo la luna.

import { Texture, type Graphics } from 'pixi.js';
import { GAME_FONT } from '../config';
import type { Projectile } from '../sim/match';
import type { LookSprites } from './elemental';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

const ACERO = 0xc9d3dc;
const ACERO_OSCURO = 0x4a5560;
const VIENTO = 0xbfe8ff;
const ROSA = 0xff6ad5;
const ORO = 0xffd34a;
const MORADO = 0x8a6bff;
/** Escala de sus cuadros pintados (unidades de mundo por pixel, como el luchador). */
const ESCALA = 0.3125;

/** Shuriken de cuatro puntas con el hoyo al centro, girado `rot`. */
function estrella(base: Graphics, g: Graphics, x: number, y: number, r: number, rot: number, alpha: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.32;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  base.poly(pts).fill({ color: ACERO, alpha }).stroke({ width: 1.2, color: ACERO_OSCURO, alpha });
  base.circle(x, y, r * 0.16).fill({ color: 0x1a1f24, alpha });
  // Brillo del filo.
  g.circle(x + Math.cos(rot) * r * 0.5, y + Math.sin(rot) * r * 0.5, r * 0.35).fill({ color: 0xffffff, alpha: 0.35 * alpha });
}

/** "¡La palabra no se la lleva el viento!": shuriken que giran con estela de viento. */
export function drawShuriken(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const fade = Math.max(0, 1 - after / 10);
  if (fade <= 0) return;
  const f = p.frame + after;
  const d = p.dir;
  const tres = p.def.hits > 1;
  const abre = Math.min(34, f * 2.2);
  for (const k of tres ? [-1, 0, 1] : [0]) {
    const x = p.x - d * Math.abs(k) * 10;
    const y = p.y + k * abre;
    // Estela de viento: rayas que se quedan atrás y un remolino.
    for (let i = 1; i <= 4; i++) {
      g.moveTo(x - d * (8 + i * 12), y + rand(-3, 3)).lineTo(x - d * (26 + i * 16), y + rand(-4, 4))
        .stroke({ width: 3.2 - i * 0.6, color: VIENTO, alpha: (0.55 - i * 0.11) * fade, cap: 'round' });
    }
    g.arc(x - d * 18, y, 13, 0, Math.PI * 1.2).stroke({ width: 1.4, color: 0xffffff, alpha: 0.25 * fade });
    estrella(base, g, x, y, 16, f * 0.85 * d, fade);
  }
}

/** "¡Ven a probar suerte pa' acá!": la cadena de la kusarigama con la hoz en la punta. */
export function drawCadena(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  // Al atrapar (o al terminar) se recoge en 10 cuadros.
  const k = Math.max(0, 1 - after / 10);
  if (k <= 0) return;
  const d = p.dir;
  const o = p.owner;
  const hx = o.x + d * 30;
  const hy = o.y - 98;
  const tx = hx + (p.x - hx) * k;
  const ty = hy + (p.y - hy) * k;
  const largo = Math.hypot(tx - hx, ty - hy);
  const n = Math.max(2, Math.floor(largo / 7));
  // Eslabones: elipses alternadas, con una leve curva de la cadena.
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = hx + (tx - hx) * t;
    const y = hy + (ty - hy) * t + Math.sin(t * Math.PI) * 6;
    const ancho = i % 2 === 0 ? 4.2 : 2.4;
    base.ellipse(x, y, ancho, i % 2 === 0 ? 2.4 : 3.6).stroke({ width: 1.6, color: 0x6c757e });
    if (i % 3 === 0) g.circle(x, y - 1, 1.4).fill({ color: 0xffffff, alpha: 0.4 });
  }
  // La hoz: hoja curva de acero en la punta.
  base.moveTo(tx, ty).quadraticCurveTo(tx + d * 16, ty - 22, tx + d * 2, ty - 30).lineTo(tx + d * 6, ty - 22)
    .quadraticCurveTo(tx + d * 10, ty - 12, tx, ty).fill({ color: ACERO }).stroke({ width: 1, color: ACERO_OSCURO });
  base.rect(tx - 2, ty - 2, 4, 12).fill({ color: 0x3a2a1a });
  g.circle(tx + d * 6, ty - 18, 4).fill({ color: 0xffffff, alpha: 0.35 * k });
  // Silbido de la cadena al ir: rayitas.
  if (!after) {
    for (let i = 0; i < 3; i++) {
      g.moveTo(tx - d * (10 + i * 8), ty + rand(-6, 6)).lineTo(tx - d * (22 + i * 8), ty + rand(-6, 6)).stroke({ width: 1.2, color: 0xffffff, alpha: 0.3 });
    }
  }
}

function cuadros(p: Projectile, spr: LookSprites): Texture[] {
  return (p.def.sprites ?? []).map((n) => spr.tex(n)).filter((t): t is Texture => !!t);
}

/** "¡Haga sombra!": sombras ninja moradas que cruzan al rival, con estela. */
export function drawSombras(base: Graphics, g: Graphics, p: Projectile, after: number, spr: LookSprites): void {
  const fade = Math.max(0, 1 - after / 12);
  if (fade <= 0) return;
  const f = p.frame + after;
  const d = p.dir;
  const tex = cuadros(p, spr);
  const xc = p.x - p.vx * p.frame;
  // Bomba de humo donde nacen.
  if (f < 18) {
    const a = 1 - f / 18;
    for (let i = 0; i < 7; i++) base.circle(xc + rand(-30, 30), -rand(10, 110), rand(14, 28) * (0.6 + f / 30)).fill({ color: 0x6b6478, alpha: 0.3 * a });
  }
  const n = Math.max(1, p.def.hits);
  for (let i = 0; i < n; i++) {
    const x = p.x - d * i * 44;
    if (!after && (x - xc) * d < -6) continue;
    const t = tex.length ? tex[Math.min(tex.length - 1, 2 + ((f >> 2) + i) % (tex.length - 2))] : undefined;
    // Estela: dos copias atrás, cada vez más tenues.
    for (let e = 2; e >= 0; e--) {
      const xe = x - d * e * 16;
      const al = (e === 0 ? 0.88 : 0.3 / e) * fade;
      if (t) spr.put(t, xe, 0, ESCALA * d, ESCALA, 0, al, false, 0x3c2a6e);
    }
    g.ellipse(x, -60, 34, 62).fill({ color: MORADO, alpha: 0.12 * fade });
    // El filo de la katana relampaguea delante.
    if ((f + i * 2) % 6 < 2) g.moveTo(x + d * 20, -70).lineTo(x + d * 64, -90).stroke({ width: 2.4, color: 0xffffff, alpha: 0.8 * fade, cap: 'round' });
  }
}

/** Corazón chico (para el corte del amor). */
function corazon(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  g.circle(x - r * 0.5, y, r * 0.55).fill({ color, alpha });
  g.circle(x + r * 0.5, y, r * 0.55).fill({ color, alpha });
  g.poly([x - r * 1.02, y + r * 0.15, x + r * 1.02, y + r * 0.15, x, y + r * 1.3]).fill({ color, alpha });
}

/** Súper "¡El amor todo lo puede!": la línea de luz en calma, el tajo y los corazones. */
export function drawIai(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const fade = Math.max(0, 1 - after / 26);
  if (fade <= 0) return;
  const f = p.frame + after;
  const d = p.dir;
  const delay = p.def.delay ?? 0;
  const x0 = p.x;
  const largo = p.def.box.w;
  const y = p.y;
  if (f < delay) {
    // Calma: una línea finísima de luz se dibuja de punta a punta y tiembla.
    const k = f / Math.max(1, delay);
    g.moveTo(x0, y).lineTo(x0 + d * largo * k, y + rand(-0.6, 0.6)).stroke({ width: 1.2, color: 0xffffff, alpha: 0.5 + k * 0.5 });
    g.circle(x0 + d * largo * k, y, 3 + k * 4).fill({ color: ROSA, alpha: 0.6 });
    return;
  }
  const t = f - delay;
  // El tajo: una media luna ancha rosa con el centro dorado y blanco.
  const abre = Math.min(1, t / 4);
  const ancho = (1 - Math.min(1, t / 30)) * 22 + 4;
  const pts = 18;
  for (const [w, color, al] of [[ancho * 2.4, ROSA, 0.28], [ancho, ORO, 0.7], [ancho * 0.35, 0xffffff, 1]] as const) {
    g.moveTo(x0, y);
    for (let i = 1; i <= pts; i++) {
      const s = (i / pts) * abre;
      g.lineTo(x0 + d * largo * s, y - Math.sin(s * Math.PI) * 26);
    }
    g.stroke({ width: w, color, alpha: al * fade, cap: 'round', join: 'round' });
  }
  // Destello al cortar y la pantalla rosa en el aire.
  if (t < 6) g.rect(x0 - d * 40, y - 140, d * (largo + 80), 240).fill({ color: ROSA, alpha: 0.16 * (1 - t / 6) });
  // Corazones y pétalos que suben donde pasó el filo.
  for (let i = 0; i < 10; i++) {
    const s = ((i * 0.37 + t * 0.004) % 1) * abre;
    const cx = x0 + d * largo * s;
    const cy = y - Math.sin(s * Math.PI) * 26 - ((t * 1.3 + i * 17) % 90);
    const a = (1 - ((t * 1.3 + i * 17) % 90) / 90) * fade;
    if (i % 2 === 0) corazon(g, cx, cy, 4 + (i % 3), ROSA, 0.75 * a);
    else g.ellipse(cx, cy, 3.2, 1.8).fill({ color: 0xffc8ec, alpha: 0.7 * a });
  }
  // Luz en el suelo bajo el tajo.
  base.ellipse(x0 + d * largo * 0.5, 0, largo * 0.5, 6).fill({ color: ROSA, alpha: 0.14 * fade });
}

/** Un kunai que vuela de (x0, y0) hacia (x1, y1); `t` 0..1 del recorrido. */
function kunaiVolando(base: Graphics, g: Graphics, x0: number, y0: number, x1: number, y1: number, t: number, alpha: number): void {
  const x = x0 + (x1 - x0) * t;
  const y = y0 + (y1 - y0) * t;
  const a = Math.atan2(y1 - y0, x1 - x0);
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Hoja de acero, mango negro y la argolla.
  base.poly([x + c * 11, y + s * 11, x - s * 2.6, y + c * 2.6, x + s * 2.6, y - c * 2.6]).fill({ color: ACERO, alpha });
  base.moveTo(x, y).lineTo(x - c * 9, y - s * 9).stroke({ width: 2.2, color: 0x1a1a1a, alpha });
  base.circle(x - c * 11, y - s * 11, 2.2).stroke({ width: 1.2, color: 0x8a8a8a, alpha });
  g.moveTo(x - c * 14, y - s * 14).lineTo(x - c * 36, y - s * 36).stroke({ width: 1.6, color: 0xffffff, alpha: 0.35 * alpha });
}

/** Súper "¡El 0,01 % de su poder!": humo de teletransporte alrededor y la lluvia de kunai. */
export function drawKunai(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const fade = Math.max(0, 1 - after / 14);
  if (fade <= 0) return;
  const f = p.frame + after;
  const cx = p.x;
  const cy = p.y;
  // Nubes de humo donde aparece y desaparece (en anillo alrededor del rival).
  for (let i = 0; i < 6; i++) {
    const a0 = i * 1.047 + Math.floor(f / 8) * 0.6;
    const vida = (f + i * 5) % 16;
    const px = cx + Math.cos(a0) * 70;
    const py = cy + Math.sin(a0) * 45 - 10;
    if (vida < 10) base.circle(px, py, 10 + vida * 1.6).fill({ color: 0x7a7488, alpha: 0.35 * (1 - vida / 10) * fade });
  }
  // Kunai desde todos lados, en tandas.
  for (let i = 0; i < 12; i++) {
    const ciclo = 14;
    const t = ((f + i * 3) % ciclo) / ciclo;
    const ang = i * 0.52 + 0.3;
    const r0 = 150;
    kunaiVolando(base, g, cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.6, cx + rand(-8, 8), cy + rand(-10, 10), t, fade);
  }
  if (f % 5 === 0) g.circle(cx + rand(-14, 14), cy + rand(-20, 20), rand(6, 12)).fill({ color: 0xffffff, alpha: 0.5 * fade });
}

const FRASE = ["UNA FRASE", "PA'L DÍA"];
const letras = new Map<string, Texture>();

/** Textura de una letra dorada con borde oscuro (se hace una vez por letra). */
function letra(ch: string): Texture | undefined {
  if (typeof document === 'undefined') return undefined;
  let t = letras.get(ch);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    ctx.font = `italic 700 104px ${GAME_FONT}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grad = ctx.createLinearGradient(0, 14, 0, 114);
    grad.addColorStop(0, '#fff6c8');
    grad.addColorStop(0.5, '#ffd34a');
    grad.addColorStop(1, '#b86a10');
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2a1400';
    ctx.strokeText(ch, 48, 66);
    ctx.fillStyle = grad;
    ctx.fillText(ch, 48, 66);
    t = Texture.from(c);
    letras.set(ch, t);
  }
  return t;
}

/** Ultra "¡Una frase pa'l día!": la frase escrita en el aire sobre el rival, letra por letra. */
export function drawCaligrafia(base: Graphics, g: Graphics, p: Projectile, after: number, spr: LookSprites): void {
  const fade = Math.max(0, 1 - after / 20) * Math.min(1, (p.def.life - p.frame + 20) / 20);
  if (fade <= 0) return;
  const f = p.frame + after;
  const alto = 22;
  let n = 0;
  FRASE.forEach((linea, li) => {
    const y = p.y - 70 + li * (alto + 8);
    const w = linea.length * alto * 0.62;
    [...linea].forEach((ch, i) => {
      const k = n++;
      if (ch === ' ') return;
      const sale = k * 3;
      if (f < sale) return;
      const x = p.x - w / 2 + (i + 0.5) * alto * 0.62;
      const t = letra(ch);
      const pop = Math.min(1, (f - sale) / 4);
      if (t) spr.put(t, x, y, (alto / 128) * (0.6 + pop * 0.4), (alto / 128) * (0.6 + pop * 0.4), -0.06, fade, true);
      // Trazo del pincel al aparecer.
      if (f - sale < 4) g.moveTo(x - 10, y + 8).lineTo(x + 10, y - 8).stroke({ width: 3, color: 0xffffff, alpha: 0.9 * (1 - pop) });
    });
  });
  base.ellipse(p.x, p.y - 58, 110, 40).fill({ color: ORO, alpha: 0.07 * fade });
}

/** Ultra "¡Haga sombra!": tajos blancos que relampaguean sobre las siluetas. */
export function drawCortes(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  void base;
  const f = p.frame + after;
  if (after > 6) return;
  for (let i = 0; i < 3; i++) {
    if ((f + i * 2) % 5 > 1) continue;
    const a = rand(0, Math.PI);
    const r = rand(60, 120);
    const cx = p.x + rand(-20, 20);
    const cy = p.y + rand(-30, 30);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r * 0.7;
    g.moveTo(cx - dx, cy - dy).lineTo(cx + dx, cy + dy).stroke({ width: 3.4, color: 0xffffff, alpha: 0.95, cap: 'round' });
    g.moveTo(cx - dx, cy - dy).lineTo(cx + dx, cy + dy).stroke({ width: 10, color: 0xbfd8ff, alpha: 0.25, cap: 'round' });
  }
}
