// Efectos del Dr. Maki Gero: el científico loco que crea androides. Vectores en la capa que brilla
// y, para los ayudantes, sus cuadros pintados (ProjectileDef.sprites):
// - 'color': "¡Dale color!" débil: una bola de plasma arcoíris con estela de bandas de colores que
//   suelta gotas de pintura y revienta en manchas.
// - 'colorRayo': "¡Dale color!" fuerte: un rayo arcoíris que sale de sus palmas y cruza la pantalla.
// - 'androides': "¡Son todos androides!": se abre una cápsula de vidrio y salen corriendo sus
//   androides cromados (2 o 4 en fila, uno por golpe) con estela roja de los ojos.
// - 'cambia': súper "¡Cambia, cambia, es por tu bien!": baja del cielo la máquina de reprogramar,
//   colgando de cables; detrás del rival cae el código verde (drawCambia) y delante le encaja el
//   casco, lo recorren descargas y la barra de "reprogramando" se llena (drawCambiaFrente).
// - 'robo': súper "¡Aquí estamos nuevamente con mi androide!": cae del cielo el Tío René robot
//   gigante con cohetes en los pies, detrás del Maki; dispara dos puñetazos cohete y remata con el
//   rayo de los ojos. Después se va volando.

import type { Graphics, Texture } from 'pixi.js';
import type { Projectile } from '../sim/match';
import type { LookSprites } from './elemental';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Los colores de "¡Dale color!". */
const ARCO = [0xff3b3b, 0xff9a2e, 0xffe14a, 0x4dff6a, 0x3fc8ff, 0x8a5bff, 0xff4fd8];
const CIAN = 0x7ff6ff;
const VERDE = 0x3fffa0;
const VERDE_CODIGO = 0x4dff6a;
const ROJO = 0xff2a2a;
/** Escala de los cuadros pintados de los ayudantes (unidades de mundo por pixel, como el luchador). */
const ESCALA = 0.3125;
/** El robot es más grande que un luchador: ~237 unidades de alto (cuadros de 640 px). */
const ESCALA_ROBO = 0.37;
const ALTO_ROBO = 640 * ESCALA_ROBO;

/** Destello de cuatro puntas. */
function destello(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  g.poly([x, y - r, x + r * 0.18, y - r * 0.18, x + r, y, x + r * 0.18, y + r * 0.18, x, y + r, x - r * 0.18, y + r * 0.18, x - r, y, x - r * 0.18, y - r * 0.18])
    .fill({ color, alpha });
}

/** Descarga eléctrica quebrada de (x0, y0) a (x1, y1). */
function chispa(g: Graphics, x0: number, y0: number, x1: number, y1: number, w: number, color: number, alpha: number): void {
  const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
  g.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    g.lineTo(x0 + (x1 - x0) * t + rand(-7, 7), y0 + (y1 - y0) * t + rand(-7, 7));
  }
  g.lineTo(x1, y1);
  g.stroke({ width: w * 2.6, color, alpha: alpha * 0.35, cap: 'round', join: 'round' });
  g.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    g.lineTo(x0 + (x1 - x0) * t + rand(-5, 5), y0 + (y1 - y0) * t + rand(-5, 5));
  }
  g.lineTo(x1, y1);
  g.stroke({ width: w, color: 0xffffff, alpha, cap: 'round', join: 'round' });
}

/** Cuadros pintados de un dibujo (los que la definición nombra en `sprites`). */
function cuadros(p: Projectile, spr: LookSprites): Texture[] {
  const out: Texture[] = [];
  for (const n of p.def.sprites ?? []) {
    const t = spr.tex(n);
    if (t) out.push(t);
  }
  return out;
}

/** "¡Dale color!" débil: bola de plasma arcoíris con estela, gotas de pintura y manchas al reventar. */
export function drawColor(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const fade = Math.max(0, 1 - after / 14);
  if (fade <= 0) return;
  const f = p.frame + after;
  const d = p.dir;
  if (after) {
    // Revienta: manchas de pintura que salen volando y un destello blanco.
    const t = after / 14;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + i * 0.7;
      const r = 8 + t * (40 + (i % 3) * 10);
      g.circle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.85 + t * t * 20, 7 * (1 - t) + 2).fill({ color: ARCO[i % ARCO.length], alpha: 1 - t });
    }
    g.circle(p.x, p.y, 30 * (1 - t) + 8).fill({ color: 0xffffff, alpha: 0.6 * (1 - t) });
    return;
  }
  // Estela: siete bandas de colores que ondulan detrás de la bola.
  for (let c = 0; c < ARCO.length; c++) {
    const off = (c - 3) * 3.2;
    g.moveTo(p.x, p.y + off * 0.5);
    for (let k = 1; k <= 9; k++) {
      g.lineTo(p.x - d * k * 9, p.y + off * (1 + k * 0.1) + Math.sin(f * 0.5 + k * 0.9 + c * 0.4) * k * 0.9);
    }
    g.stroke({ width: 3.6, color: ARCO[c], alpha: 0.75 });
  }
  // La bola: halo que cambia de color, núcleo rosado y centro blanco.
  const pul = 1 + Math.sin(f * 0.8) * 0.12;
  g.circle(p.x, p.y, 27 * pul).fill({ color: ARCO[(f >> 1) % ARCO.length], alpha: 0.25 });
  g.circle(p.x, p.y, 17 * pul).fill({ color: 0xff7ae0, alpha: 0.6 });
  g.circle(p.x, p.y, 10).fill({ color: 0xffffff, alpha: 0.95 });
  // Esferitas de colores que giran alrededor.
  for (let i = 0; i < 5; i++) {
    const a = f * 0.4 + i * 1.257;
    g.circle(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, 4).fill({ color: ARCO[(i * 2 + f) % ARCO.length], alpha: 0.9 });
  }
  // Gotas de pintura que se desprenden y caen.
  for (let i = 0; i < 5; i++) {
    const t = ((f + i * 4) % 20) / 20;
    base.circle(p.x - d * (10 + t * 40), p.y + t * t * 34 + (i - 2) * 4, 3.2 * (1 - t) + 1).fill({ color: ARCO[(i * 3 + (f >> 2)) % ARCO.length], alpha: (1 - t) * 0.9 });
  }
}

/** "¡Dale color!" fuerte: un rayo arcoíris desde las palmas que cruza la pantalla. */
export function drawColorRayo(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const fade = Math.max(0, 1 - after / 12);
  if (fade <= 0) return;
  const f = p.frame + after;
  const d = p.dir;
  const largo = p.def.box.w * Math.min(1, (p.frame + 1) / 5);
  const x0 = p.x;
  const y0 = p.y;
  const xe = x0 + d * largo;
  const grosor = (30 + Math.sin(f * 0.9) * 4) * fade;
  // Halo de todo el rayo.
  g.rect(Math.min(x0, xe), y0 - grosor * 0.95, largo, grosor * 1.9).fill({ color: 0xff7ae0, alpha: 0.16 * fade });
  // Bandas de colores, angostas en las palmas y que se abren, con ondas que corren hacia adelante.
  const n = ARCO.length;
  for (let c = 0; c < n; c++) {
    const off = ((c + 0.5) / n - 0.5) * grosor * 1.3;
    g.moveTo(x0, y0 + off * 0.35);
    for (let k = 1; k <= 24; k++) {
      const t = k / 24;
      g.lineTo(x0 + d * largo * t, y0 + off * (0.35 + 0.65 * Math.min(1, t * 4)) + Math.sin(f * 0.7 - t * 12 + c) * 2.2);
    }
    g.stroke({ width: (grosor / n) * 1.7, color: ARCO[c], alpha: 0.85 * fade });
  }
  // Núcleo blanco.
  g.moveTo(x0, y0).lineTo(xe, y0).stroke({ width: grosor * 0.26, color: 0xffffff, alpha: 0.9 * fade });
  // Destello en las palmas.
  g.circle(x0, y0, grosor * 0.85 + Math.sin(f) * 3).fill({ color: 0xffffff, alpha: 0.5 * fade });
  g.circle(x0, y0, grosor * 1.4).fill({ color: ARCO[(f >> 1) % n], alpha: 0.2 * fade });
  // Brillos que viajan por el rayo.
  for (let i = 0; i < 9; i++) {
    const t = (f * 0.05 + i / 9) % 1;
    destello(g, x0 + d * largo * t, y0 + Math.sin(i * 3 + f * 0.4) * grosor * 0.7, 4 + (i % 3) * 2, ARCO[(i + f) % n], 0.9 * fade);
  }
  // La punta revienta en manchas de pintura.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + f * 0.3;
    const r = 8 + ((f * 3 + i * 7) % 24);
    g.circle(xe + Math.cos(a) * r, y0 + Math.sin(a) * r, 5).fill({ color: ARCO[i % n], alpha: 0.85 * fade });
  }
  g.circle(xe, y0, grosor * 0.7).fill({ color: 0xffffff, alpha: 0.4 * fade });
  // Luz en el piso bajo el rayo.
  base.ellipse((x0 + xe) / 2, 0, largo / 2, 6).fill({ color: 0xff7ae0, alpha: 0.18 * fade });
}

/** "¡Son todos androides!": cápsula que se abre y androides cromados que corren y embisten. */
export function drawAndroides(base: Graphics, g: Graphics, p: Projectile, after: number, spr: LookSprites): void {
  const fade = Math.max(0, 1 - after / 12);
  if (fade <= 0) return;
  const f = p.frame + after;
  const d = p.dir;
  const tex = cuadros(p, spr);
  // Dónde se abrió la cápsula (el proyectil avanza desde ahí).
  const xc = p.x - p.vx * p.frame;
  if (f < 24) {
    const k = f / 24;
    const a = 1 - k;
    const w = 28;
    const h = 146;
    // Tubo de vidrio con líquido celeste, tapas de metal y vapor al abrirse.
    base.roundRect(xc - w, -h, w * 2, h, 12).fill({ color: 0x0b3a44, alpha: 0.4 * a });
    base.rect(xc - w - 5, -h - 12, w * 2 + 10, 14).fill({ color: 0x59606b, alpha: a });
    base.rect(xc - w - 5, -8, w * 2 + 10, 9).fill({ color: 0x59606b, alpha: a });
    g.rect(xc - w + 4, -h + 4 - k * 40, w * 2 - 8, h - 8).fill({ color: 0x3fffe8, alpha: 0.22 * a });
    g.roundRect(xc - w, -h, w * 2, h, 12).stroke({ width: 3, color: CIAN, alpha: 0.9 * a });
    for (let i = 0; i < 8; i++) g.circle(xc + rand(-34, 34), -rand(10, 140), rand(4, 11)).fill({ color: 0xe8ffff, alpha: 0.22 * a });
    if (f < 6) g.ellipse(xc, -70, 50, 90).fill({ color: CIAN, alpha: 0.35 * (1 - f / 6) });
  }
  const n = Math.max(1, p.def.hits);
  for (let i = 0; i < n; i++) {
    const x = p.x - d * i * 36;
    // Los de atrás todavía no salen de la cápsula.
    if (!after && (x - xc) * d < -6) continue;
    // Estela roja de los ojos y halo de cromo.
    g.moveTo(x + d * 10, -110).lineTo(x - d * 34, -106).stroke({ width: 4, color: ROJO, alpha: 0.45 * fade });
    g.circle(x + d * 10, -110, 7).fill({ color: ROJO, alpha: 0.35 * fade });
    if (tex.length) spr.put(tex[Math.floor((f + i * 3) / 2) % tex.length], x, 0, ESCALA * d, ESCALA, 0, fade);
    // Polvo en los pies.
    if ((f + i) % 4 === 0) base.circle(x - d * 16, -3, 5).fill({ color: 0xc8c0b0, alpha: 0.3 * fade });
  }
}

/** Avance de la máquina de reprogramar: 0 arriba en el cielo, 1 encajada en la cabeza del rival. */
function bajadaCambia(p: Projectile, f: number): number {
  const k = Math.min(1, f / Math.max(1, p.def.delay ?? 1));
  return 1 - (1 - k) * (1 - k);
}

/** Alto de la cabeza del rival donde encaja el casco. */
const CABEZA = -150;

/**
 * Súper "¡Cambia, cambia, es por tu bien!", la parte de atrás del rival: cables que cuelgan del cielo,
 * columna de luz, código verde que cae y un anillo en el suelo. El casco va en drawCambiaFrente.
 */
export function drawCambia(base: Graphics, g: Graphics, p: Projectile, after: number): void {
  const fade = Math.min(1, (p.life + 1) / 10) * Math.max(0, 1 - after / 20);
  if (fade <= 0) return;
  const f = p.frame + after;
  const delay = p.def.delay ?? 0;
  const k = bajadaCambia(p, f);
  const top = -320;
  const yc = top + (CABEZA - top) * k;
  // Cables gruesos desde arriba de la pantalla hasta el casco.
  for (const s of [-1, 1]) {
    base.moveTo(p.x + s * 70, top - 20).quadraticCurveTo(p.x + s * 50, (top + yc) / 2, p.x + s * 22, yc - 18)
      .stroke({ width: 6, color: 0x1e2430, alpha: fade });
    g.moveTo(p.x + s * 70, top - 20).quadraticCurveTo(p.x + s * 50, (top + yc) / 2, p.x + s * 22, yc - 18)
      .stroke({ width: 2, color: VERDE, alpha: 0.5 * fade });
  }
  // Aviso en el suelo y columna de luz verde.
  g.ellipse(p.x, 0, 46 + 20 * k, 6 + 3 * k).fill({ color: VERDE, alpha: (0.25 + 0.4 * k) * fade * (0.7 + Math.random() * 0.3) });
  if (f >= delay - 4) {
    const a = Math.min(1, (f - delay + 4) / 6) * fade;
    g.poly([p.x - 30, top, p.x + 30, top, p.x + 60, 0, p.x - 60, 0]).fill({ color: VERDE, alpha: 0.14 * a });
    // Código que cae: columnas de "letras" verdes (rayitas y cuadritos) alrededor del rival.
    for (let c = 0; c < 9; c++) {
      const x = p.x + (c - 4) * 15;
      const vel = 4 + (c % 3) * 1.5;
      for (let j = 0; j < 7; j++) {
        const y = top + ((f * vel + j * 34 + c * 47) % (-top + 20));
        const brillo = j === 0 ? 1 : 0.55;
        if ((c + j) % 2) g.rect(x - 2.5, y, 5, 7).fill({ color: VERDE_CODIGO, alpha: 0.75 * brillo * a });
        else g.rect(x - 1, y, 2, 9).fill({ color: VERDE_CODIGO, alpha: 0.75 * brillo * a });
      }
    }
  }
  // Al final, el casco revienta: anillo verde y destello.
  if (after) {
    const t = after / 20;
    g.circle(p.x, CABEZA, 20 + t * 110).stroke({ width: 10 * (1 - t) + 2, color: VERDE, alpha: (1 - t) });
    g.circle(p.x, CABEZA, 40 * (1 - t) + 6).fill({ color: 0xffffff, alpha: 0.7 * (1 - t) });
  }
}

/**
 * La parte de adelante del súper de la máquina (se dibuja sobre los luchadores): el casco con
 * antenas que le encaja al rival, las descargas que lo recorren, el anillo que lo escanea y la barra
 * de "reprogramando".
 */
export function drawCambiaFrente(g: Graphics, p: Projectile): void {
  const f = p.frame;
  const fade = Math.min(1, (p.life + 1) / 10);
  const delay = p.def.delay ?? 0;
  const k = bajadaCambia(p, f);
  const top = -320;
  const pegado = f >= delay;
  const xc = p.x + (pegado ? rand(-1.5, 1.5) : 0);
  const yc = top + (CABEZA - top) * k + (pegado ? rand(-1.5, 1.5) : 0);
  // Casco: domo metálico con banda de luces y visera brillante.
  g.ellipse(xc, yc, 30, 24).fill({ color: 0x9fb8c8, alpha: 0.32 * fade });
  g.ellipse(xc, yc, 30, 24).stroke({ width: 3, color: CIAN, alpha: 0.95 * fade });
  g.rect(xc - 32, yc + 6, 64, 8).fill({ color: VERDE, alpha: 0.55 * fade });
  for (let i = 0; i < 6; i++) g.circle(xc - 25 + i * 10, yc + 10, 2).fill({ color: (f >> 2) % 6 === i ? 0xffffff : ROJO, alpha: fade });
  g.ellipse(xc, yc + 16, 24, 6).fill({ color: CIAN, alpha: 0.5 * fade });
  // Antenas con bolitas que parpadean.
  for (const s of [-1, 1]) {
    g.moveTo(xc + s * 14, yc - 20).lineTo(xc + s * 26, yc - 46).stroke({ width: 3, color: 0xdfe8f4, alpha: fade });
    g.circle(xc + s * 26, yc - 48, 5).fill({ color: (f >> 3) % 2 === (s > 0 ? 1 : 0) ? VERDE : ROJO, alpha: fade });
  }
  if (!pegado) return;
  const t = (f - delay) / Math.max(1, p.def.life - delay);
  // Descargas de las antenas al cuerpo del rival.
  for (let i = 0; i < 2; i++) {
    const s = i % 2 ? 1 : -1;
    chispa(g, xc + s * 26, yc - 48, p.x + rand(-26, 26), rand(-130, -20), 1.3, VERDE, 0.6 * fade);
  }
  // Anillo que lo escanea de arriba a abajo.
  const ys = -10 + (Math.sin(f * 0.18) * 0.5 - 0.5) * 140;
  g.ellipse(p.x, ys, 40, 7).stroke({ width: 3, color: VERDE, alpha: 0.8 * fade });
  g.ellipse(p.x, ys, 40, 7).fill({ color: VERDE, alpha: 0.12 * fade });
  // Barra de "reprogramando" que se llena.
  const bx = p.x - 34;
  const by = yc - 74;
  g.rect(bx, by, 68, 9).stroke({ width: 2, color: CIAN, alpha: 0.9 * fade });
  const seg = Math.floor(Math.min(1, t * 1.05) * 8);
  for (let i = 0; i < seg; i++) g.rect(bx + 2 + i * 8.2, by + 2, 6.6, 5).fill({ color: VERDE, alpha: 0.95 * fade });
}

/** Cuadro del robot según la edad del súper: guardia, grito, puñetazo 1, puñetazo 2, grito con rayo. */
function cuadroRobo(f: number): number {
  if (f < 12) return 0;
  if (f < 26) return 1;
  if (f < 28) return 3;
  if (f < 30) return 4;
  if (f < 46) return 5 + Math.min(4, Math.floor((f - 30) / 3.2));
  if (f < 64) return 10 + Math.min(4, Math.floor((f - 46) / 3.6));
  return 1;
}

/** Llamas de los cohetes de los pies del robot (bajando del cielo y al irse). */
function cohetes(g: Graphics, x: number, y: number, d: number, f: number, k: number): void {
  for (const s of [-0.18, 0.2]) {
    const fx = x + d * s * ALTO_ROBO;
    const l = (34 + Math.sin(f * 1.7 + s * 9) * 8) * k;
    g.poly([fx - 9, y, fx + 9, y, fx, y + l]).fill({ color: 0xffa040, alpha: 0.85 });
    g.poly([fx - 5, y, fx + 5, y, fx, y + l * 0.6]).fill({ color: 0xfff2c0, alpha: 0.95 });
    g.circle(fx, y + 4, 12).fill({ color: CIAN, alpha: 0.3 });
  }
}

/** Súper del Tío René robot: cae del cielo, dos puñetazos cohete, rayo de los ojos y se va volando. */
export function drawRobo(base: Graphics, g: Graphics, p: Projectile, after: number, spr: LookSprites): void {
  const f = p.frame + after;
  const d = p.dir;
  const tex = cuadros(p, spr);
  const vida = p.def.life;
  const sale = vida - 20;
  let y = 0;
  let alpha = 1;
  if (f < 12) {
    const t = f / 12;
    y = -420 * (1 - t) * (1 - t);
  } else if (f >= sale) {
    const t = (f - sale) / 20;
    y = -t * t * 420;
    alpha = Math.max(0, 1 - t * 0.6);
  }
  if (alpha <= 0) return;
  // Sombra en el piso (más chica mientras está en el aire).
  const alto = Math.min(1, -y / 300);
  base.ellipse(p.x, 0, 100 * (1 - alto * 0.6), 9 * (1 - alto * 0.6)).fill({ color: 0x10101a, alpha: 0.45 * (1 - alto) * alpha });
  if (f < 12 || f >= sale) cohetes(g, p.x, y, d, f, 1);
  // Al caer: onda de choque y polvo.
  if (f >= 12 && f < 24) {
    const t = (f - 12) / 12;
    g.ellipse(p.x, 0, 60 + t * 160, 8 + t * 10).stroke({ width: 8 * (1 - t) + 2, color: CIAN, alpha: (1 - t) * 0.8 });
    for (let i = 0; i < 6; i++) base.circle(p.x + (i - 2.5) * 40 * (0.5 + t), -6 - t * 20, 14 * (1 - t) + 6).fill({ color: 0xa89a88, alpha: 0.35 * (1 - t) });
  }
  const i = cuadroRobo(f);
  if (tex.length) spr.put(tex[Math.min(i, tex.length - 1)], p.x, y, ESCALA_ROBO * d, ESCALA_ROBO, 0, alpha);
  // Brillo del reactor de la guata.
  g.circle(p.x + d * 0.02 * ALTO_ROBO, y - 0.52 * ALTO_ROBO, 16 + Math.sin(f * 0.5) * 3).fill({ color: CIAN, alpha: 0.3 * alpha });
  // Puñetazos cohete: el puño sale volando hacia el rival con su llama y vuelve.
  for (const [ini, fin] of [[30, 44], [48, 62]]) {
    if (f < ini || f >= fin) continue;
    const t = (f - ini) / (fin - ini);
    const ida = t < 0.5 ? t * 2 : (1 - t) * 2;
    const x0 = p.x + d * 0.44 * ALTO_ROBO;
    const y0 = y - 0.86 * ALTO_ROBO;
    const x1 = p.x + d * 260;
    const y1 = -96;
    const fx = x0 + (x1 - x0) * ida;
    const fy = y0 + (y1 - y0) * ida;
    const ang = Math.atan2(y1 - y0, (x1 - x0));
    // Llama detrás del puño.
    const lx = -Math.cos(ang) * 40;
    const ly = -Math.sin(ang) * 40;
    g.poly([fx - ly * 0.3, fy + lx * 0.3, fx + ly * 0.3, fy - lx * 0.3, fx + lx, fy + ly]).fill({ color: 0xffa040, alpha: 0.85 });
    g.poly([fx - ly * 0.15, fy + lx * 0.15, fx + ly * 0.15, fy - lx * 0.15, fx + lx * 0.6, fy + ly * 0.6]).fill({ color: 0xfff2c0, alpha: 0.95 });
    // El puño de acero: nudillos y muñeca.
    base.roundRect(fx - 15, fy - 13, 30, 26, 8).fill({ color: 0xb8c2cc });
    base.roundRect(fx - 15, fy - 13, 30, 26, 8).stroke({ width: 2.5, color: 0x2a2e36 });
    for (let k = 0; k < 4; k++) base.circle(fx + d * 11, fy - 9 + k * 6, 3).fill({ color: 0xe8eef4 });
    base.rect(fx - d * 22 - 6, fy - 8, 12, 16).fill({ color: 0x3a404a });
    g.circle(fx, fy, 24).fill({ color: CIAN, alpha: 0.18 });
    if (ida > 0.9) {
      g.circle(x1, y1, 30).fill({ color: 0xffffff, alpha: 0.5 });
      destello(g, x1, y1, 26, CIAN, 0.9);
    }
  }
  // Rayo de los ojos: dos rayos rojos con núcleo blanco que barren al rival.
  if (f >= 66 && f < 92) {
    const t = (f - 66) / 26;
    const a = Math.min(1, (f - 66) / 4) * Math.min(1, (92 - f) / 4);
    const ex = p.x + d * -0.1 * ALTO_ROBO;
    const ey = y - 0.875 * ALTO_ROBO;
    const tx = p.x + d * (200 + Math.sin(t * Math.PI * 2) * 30);
    const ty = -110 + Math.sin(t * Math.PI * 3) * 30;
    for (const off of [-4, 4]) {
      g.moveTo(ex + off, ey).lineTo(tx, ty).stroke({ width: 14, color: ROJO, alpha: 0.35 * a });
      g.moveTo(ex + off, ey).lineTo(tx, ty).stroke({ width: 5, color: 0xff6a5a, alpha: 0.9 * a });
      g.moveTo(ex + off, ey).lineTo(tx, ty).stroke({ width: 2, color: 0xffffff, alpha: a });
    }
    g.circle(ex, ey, 12).fill({ color: ROJO, alpha: 0.6 * a });
    g.circle(tx, ty, 18 + Math.random() * 8).fill({ color: 0xffd0c0, alpha: 0.7 * a });
    for (let k = 0; k < 4; k++) destello(g, tx + rand(-20, 20), ty + rand(-20, 20), rand(5, 10), 0xffffff, a);
  }
}
