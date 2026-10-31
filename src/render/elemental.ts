// Efectos de agua y rayos (el Flaitiano: "¡junten agua, junten luz!"). Usan los efectos
// pintados compartidos (public/efectos/: el rayo y el tornado son videos sin el fondo negro)
// y, si no están cargados, se dibujan con vectores:
// - bolt(): un rayo quebrado con ramas, núcleo blanco y halo celeste.
// - ProjectileLook: el dibujo propio de un proyectil con `look` ('rayo', 'rastas',
//   'tornado'; y los del Vendedor de Leña, en render/fuego.ts), cuadro a cuadro según su edad.
// - StormShow: la tormenta del súper (cinematic.lights = 'tormenta'): cielo oscuro,
//   lluvia y relámpagos, detrás de los luchadores, en unidades de pantalla (480x270).

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import { vfxFrames } from '../content/vfx';
import type { Projectile } from '../sim/match';
import { drawSilbido, drawSonico, drawTronco, drawTroncos } from './fuego';
import { drawCajon, drawCola, drawLetras } from './cola';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Celeste eléctrico y blanco azulado del rayo; agua. */
export const C_BOLT = 0x9fe8ff;
const C_CORE = 0xf4fdff;
const C_WATER = 0x5fd0ff;
const C_DREAD = 0x2a1a12;
const C_TIP = 0x2fd060;

/**
 * Rayo de (x0, y0) a (x1, y1): tramos quebrados al azar, más gruesos arriba, con
 * ramas que se abren. `w` es el grosor del núcleo; `a` la opacidad.
 */
export function bolt(g: Graphics, x0: number, y0: number, x1: number, y1: number, w: number, a = 1, branches = 3): void {
  const pts = jagged(x0, y0, x1, y1, Math.max(6, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16)), 0.32);
  stroke(g, pts, w * 3.2, C_BOLT, a * 0.28);
  stroke(g, pts, w * 1.7, C_BOLT, a * 0.7);
  stroke(g, pts, w, C_CORE, a);
  for (let b = 0; b < branches; b++) {
    const i = 1 + Math.floor(Math.random() * (pts.length - 3));
    const [bx, by] = pts[i];
    const len = rand(18, 46);
    const ang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.1);
    const bp = jagged(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, 4, 0.4);
    stroke(g, bp, w * 1.6, C_BOLT, a * 0.45);
    stroke(g, bp, w * 0.55, C_CORE, a * 0.9);
  }
}

function jagged(x0: number, y0: number, x1: number, y1: number, n: number, rough: number): Array<[number, number]> {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / (len || 1);
  const ny = (x1 - x0) / (len || 1);
  const pts: Array<[number, number]> = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = (Math.random() * 2 - 1) * len * rough / n * 2.2;
    pts.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

function stroke(g: Graphics, pts: Array<[number, number]>, width: number, color: number, alpha: number): void {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/**
 * Sprites de los efectos pintados de un dibujo de proyectil: cada cuadro se piden con put() y
 * los que no se pidieron se esconden. `normal` va sobre los vectores de base (objetos: troncos,
 * cajón, botella); `glow` brilla con mezcla aditiva (videos de efectos sin fondo).
 */
export class LookSprites {
  readonly normal = new Container();
  readonly glow = new Container();
  private pool: Sprite[] = [];
  private used = 0;

  constructor(private textures: Record<string, Texture>) {}

  /** Cuadros de un efecto de video (vacío si no están cargados). */
  frames(name: string): Texture[] {
    return vfxFrames(this.textures, name);
  }

  /** Un objeto pintado (obj/<nombre>) o undefined. */
  obj(name: string): Texture | undefined {
    return this.textures[`obj/${name}`];
  }

  begin(): void {
    this.used = 0;
  }

  /** Pone `tex` en (x, y) con escala (sx negativo = espejado), giro y opacidad; `add` = brilla. */
  put(tex: Texture, x: number, y: number, sx: number, sy: number, rot = 0, alpha = 1, add = false): void {
    let s = this.pool[this.used];
    if (!s) {
      s = new Sprite();
      this.pool.push(s);
    }
    this.used++;
    const layer = add ? this.glow : this.normal;
    if (s.parent !== layer) layer.addChild(s);
    s.blendMode = add ? 'add' : 'normal';
    s.texture = tex;
    s.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 0.5);
    s.position.set(x, y);
    s.scale.set(sx, sy);
    s.rotation = rot;
    s.alpha = alpha;
    s.visible = alpha > 0.01;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}

/** Dibujo propio de un proyectil con `look`; se redibuja cada cuadro. */
export class ProjectileLook {
  /** Capa normal (las rastas oscuras) y capa que brilla (agua, rayos), en la capa de proyectiles. */
  readonly view = new Container();
  private base = new Graphics();
  private g = new Graphics();
  private spr: LookSprites;
  /** Cuadro en que pegó (para el destello del rayo). */
  private struck = -1;

  constructor(
    readonly kind: string,
    textures: Record<string, Texture> = {},
  ) {
    this.g.blendMode = 'add';
    this.spr = new LookSprites(textures);
    this.view.addChild(this.base, this.spr.normal, this.g, this.spr.glow);
  }

  /** Cuadros que se sigue viendo después de que el proyectil desaparece (el rayo se apaga, el remolino se deshace). */
  get linger(): number {
    const linger: Record<string, number> = { rayo: 26, tornado: 18, troncos: 16, sonico: 20, letras: 16 };
    return linger[this.kind] ?? 0;
  }

  /** Dibuja el proyectil; `after` = cuadros desde que desapareció (para que se apague suave). */
  draw(p: Projectile, after = 0): void {
    this.g.clear();
    this.base.clear();
    this.spr.begin();
    if (this.kind === 'rayo') this.rayo(p, after);
    else if (this.kind === 'rastas') this.rastas(p);
    else if (this.kind === 'tornado') this.tornado(p, after);
    else if (this.kind === 'silbido') drawSilbido(this.base, this.g, p, this.spr);
    else if (this.kind === 'tronco') drawTronco(this.base, this.g, p, this.spr);
    else if (this.kind === 'troncos') drawTroncos(this.base, this.g, p, after, this.spr);
    else if (this.kind === 'sonico') drawSonico(this.g, p, after, this.spr);
    else if (this.kind === 'cola') drawCola(this.base, this.g, p, this.spr);
    else if (this.kind === 'cajon') drawCajon(this.base, this.g, p, this.spr);
    else if (this.kind === 'letras') drawLetras(this.base, this.g, p, after, this.spr);
    this.spr.end();
  }

  /** Aviso (nube que chispea arriba y un brillo en el suelo) y después el rayo que cae. */
  private rayo(p: Projectile, after: number): void {
    const g = this.g;
    const delay = p.def.delay ?? 0;
    // Arriba de la pantalla (el suelo está a 248 del borde de arriba).
    const top = -224;
    if (p.frame < delay && !after) {
      const k = p.frame / Math.max(1, delay);
      // Nube cargada: manchas con destellos adentro, cada vez más fuertes.
      for (let i = 0; i < 6; i++) {
        g.ellipse(p.x + (i - 2.5) * 16 + rand(-2, 2), top + rand(-4, 4), 22, 9).fill({ color: 0x8fb8ff, alpha: 0.1 + k * 0.18 });
      }
      if (Math.random() < 0.4 + k * 0.5) bolt(g, p.x + rand(-40, 40), top, p.x + rand(-50, 50), top + rand(8, 30), 1, 0.8, 0);
      // Chispas que bajan anunciando el golpe y la marca en el suelo donde va a caer.
      if (k > 0.5 && Math.random() < 0.6) bolt(g, p.x + rand(-6, 6), top, p.x + rand(-10, 10), top + rand(40, 120) * k, 0.9, 0.7, 1);
      g.ellipse(p.x, p.y, 18 + k * 12, 3 + k * 2.5).fill({ color: C_BOLT, alpha: 0.2 + k * 0.45 * (0.6 + Math.random() * 0.4) });
      return;
    }
    if (this.struck < 0) this.struck = p.frame;
    const age = p.frame - this.struck + after;
    // El rayo pintado (video): cae desde arriba de la pantalla hasta el suelo, con chispas.
    const frames = this.spr.frames('rayo');
    if (frames.length) {
      if (age >= frames.length) return;
      const k = (p.y - top + 24) / frames[0].height;
      this.spr.put(frames[age], p.x, p.y + 6, (this.struck % 2 ? -1 : 1) * k, k, 0, 1, true);
      if (age < 7) {
        const f = 1 - age / 7;
        g.ellipse(p.x, p.y, 44 * (1 + age * 0.12), 10).fill({ color: C_CORE, alpha: f * 0.7 });
        g.circle(p.x, p.y - 20, 40 * f + 10).fill({ color: C_BOLT, alpha: f * 0.3 });
      }
      return;
    }
    const a = Math.max(0, 1 - age / 16);
    if (a <= 0) return;
    const w = 4 * (age < 4 ? 1.5 : 1);
    bolt(g, p.x + rand(-6, 6), top, p.x, p.y, w, a, 5);
    if (age % 2 === 0) bolt(g, p.x + rand(-16, 16), top, p.x + rand(-4, 4), p.y, w * 0.6, a * 0.7, 2);
    g.ellipse(p.x, p.y, 38 * (1 + age * 0.06), 8).fill({ color: C_CORE, alpha: a * 0.6 });
    g.circle(p.x, p.y - 6, 26 * a + 6).fill({ color: C_BOLT, alpha: a * 0.25 });
  }

  /** Rastas de agua que avanzan por el suelo como serpientes, con una ola, gotas y chispas. */
  private rastas(p: Projectile): void {
    const g = this.g;
    const dir = p.dir;
    const h = p.def.box.h * 1.25;
    const len = p.def.box.w * 1.7;
    const n = h > 40 ? 7 : 5;
    // La ola de agua sobre la que van: un lomo translúcido que brilla.
    const wave: Array<[number, number]> = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      wave.push([p.x - dir * (len * t - len * 0.2), -Math.sin(Math.PI * Math.min(1, t * 1.15)) * h * 0.55 * (0.85 + 0.15 * Math.sin(p.frame * 0.5 + t * 6))]);
    }
    g.moveTo(wave[0][0], 0);
    for (const [x, y] of wave) g.lineTo(x, y);
    g.lineTo(wave[wave.length - 1][0], 0);
    g.closePath();
    g.fill({ color: C_WATER, alpha: 0.22 });
    stroke(g, wave, 2, 0xd8f6ff, 0.55);
    for (let s = 0; s < n; s++) {
      const phase = p.frame * 0.5 + s * 1.3;
      const amp = h * (0.45 + 0.15 * Math.sin(s * 2.1));
      const base = -1 - (s % 3) * 2.5;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const x = p.x - dir * (len * t - len * 0.3) + dir * (s - n / 2) * 4;
        // La punta se levanta (la cabeza de la serpiente) y la cola se arrastra.
        const lift = Math.sin(phase - t * 6) * amp * (1 - t * 0.75) + (t < 0.18 ? (0.18 - t) * h * 2.2 : 0);
        pts.push([x, base - Math.abs(lift)]);
      }
      // Halo de agua (brilla) y la rasta oscura encima, con su punta verde.
      stroke(g, pts, 9, C_WATER, 0.35);
      stroke(this.base, pts, 4.6, C_DREAD, 1);
      stroke(this.base, pts.slice(0, 4), 4.8, C_TIP, 1);
      stroke(this.base, pts, 1.2, 0x6a4a36, 0.8);
      g.circle(pts[0][0], pts[0][1], 6).fill({ color: C_WATER, alpha: 0.45 });
    }
    // Gotas que saltan y chispas eléctricas sueltas.
    for (let i = 0; i < 10; i++) {
      g.circle(p.x - dir * rand(-10, len), -rand(0, h * 1.2), rand(1, 2.4)).fill({ color: 0xe0f8ff, alpha: 0.85 });
    }
    if (Math.random() < 0.65) bolt(g, p.x - dir * rand(0, len * 0.7), -rand(6, h), p.x - dir * rand(0, len * 0.7), -rand(0, h * 0.6), 0.9, 0.9, 0);
  }

  /** Remolino de agua sobre el rival: anillos que giran, espuma y rayitos adentro. */
  private tornado(p: Projectile, after: number): void {
    const g = this.g;
    const delay = p.def.delay ?? 0;
    const h = p.def.box.h;
    const grow = Math.min(1, (p.frame + 1) / (delay + 10));
    const fade = Math.min(1, p.life / 14) * Math.max(0, 1 - after / 18);
    if (fade <= 0) return;
    // Al deshacerse, los anillos se abren y suben.
    const open = 1 + after * 0.06;
    // El tornado pintado (video): agua que gira con rayos, crece al salir y se abre al irse.
    const frames = this.spr.frames('tornado');
    if (frames.length) {
      const f = p.frame + after;
      const tex = frames[Math.floor(f / 2) % frames.length];
      const k = (h * 1.2) / tex.height;
      this.spr.put(tex, p.x, 6 - after * 2, k * open, k * (0.35 + 0.65 * grow), 0, fade * Math.min(1, grow * 1.6), true);
      g.ellipse(p.x, 0, 54 * grow * open, 8).fill({ color: C_WATER, alpha: 0.3 * fade });
      if (p.frame > delay && !after && Math.random() < 0.35) {
        bolt(g, p.x + rand(-28, 28), -h * rand(0.6, 1), p.x + rand(-28, 28), -h * rand(0, 0.4), 1.2, 0.9 * fade, 1);
      }
      return;
    }
    const top = -h * grow - after * 3;
    const rings = 18;
    const f = p.frame + after;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const y = top * t;
      // Angosto abajo, ancho arriba, ondulando.
      const r = (12 + t * 38) * (0.85 + 0.15 * Math.sin(f * 0.3 + i)) * open;
      const x = p.x + Math.sin(f * 0.18 + t * 3) * 7 * t;
      const spin = f * 0.55 + i * 0.7;
      g.ellipse(x, y, r, r * 0.22).stroke({ width: 3.4, color: C_WATER, alpha: (0.28 + 0.4 * t) * fade * grow });
      g.ellipse(x, y, r * 0.8, r * 0.17).stroke({ width: 1.4, color: C_CORE, alpha: 0.35 * fade * grow });
      // Brillo que da la vuelta al anillo.
      g.circle(x + Math.cos(spin) * r, y + Math.sin(spin) * r * 0.22, 2.6).fill({ color: C_CORE, alpha: 0.85 * fade });
    }
    // Espuma en la base y gotas que salen despedidas.
    g.ellipse(p.x, 0, 46 * grow * open, 7).fill({ color: C_WATER, alpha: 0.35 * fade });
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(18, 60) * open;
      g.circle(p.x + Math.cos(a) * r, top * rand(0, 1), rand(1, 2.4)).fill({ color: 0xe0f8ff, alpha: 0.75 * fade });
    }
    if (p.frame > delay && !after && Math.random() < 0.6) {
      bolt(g, p.x + rand(-24, 24), top * rand(0.6, 1), p.x + rand(-24, 24), top * rand(0, 0.4), 1.3, 0.95 * fade, 1);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

/** Tormenta del súper: cielo oscuro, lluvia y relámpagos (detrás de los luchadores). */
export class StormShow {
  readonly container = new Container();
  private sky = new Graphics();
  private rainG = new Graphics();
  private boltG = new Graphics();
  private flashG = new Graphics();
  private drops: Drop[] = [];
  private level = 0;
  private on = false;
  private t = 0;
  private nextBolt = 0;
  private flash = 0;
  private boltLife = 0;

  constructor() {
    this.rainG.blendMode = 'add';
    this.boltG.blendMode = 'add';
    this.flashG.blendMode = 'add';
    this.container.addChild(this.sky, this.rainG, this.boltG, this.flashG);
    for (let i = 0; i < 140; i++) this.drops.push({ x: rand(0, VIEW_W + 60), y: rand(0, VIEW_H), v: rand(7, 11), len: rand(8, 16) });
    this.container.visible = false;
  }

  start(): void {
    this.on = true;
    this.t = 0;
    this.nextBolt = 10;
    this.container.visible = true;
  }

  stop(): void {
    this.on = false;
  }

  /** Cuánto oscurece el escenario. */
  get darkness(): number {
    return this.level * 0.55;
  }

  /** Relámpago a pedido (un rayo que cae): destello de toda la pantalla y, si se pide, un rayo en el cielo. */
  strike(withBolt = true): void {
    this.flash = 1;
    if (withBolt) this.boltLife = 8;
  }

  step(): void {
    this.level += ((this.on ? 1 : 0) - this.level) * (this.on ? 0.12 : 0.05);
    // Fuera del súper igual se ve un relámpago suelto (el rayo de un especial, un combo largo).
    const active = this.level > 0.02 || this.flash > 0.03 || this.boltLife > 0;
    this.container.visible = active;
    if (!active) {
      this.level = 0;
      return;
    }
    this.t++;
    if (this.on && this.t >= this.nextBolt) {
      this.nextBolt = this.t + Math.round(rand(35, 80));
      this.flash = Math.max(this.flash, 0.55);
      this.boltLife = 6;
    }
    this.flash *= 0.8;
    if (this.boltLife > 0) this.boltLife--;
    for (const d of this.drops) {
      d.y += d.v;
      d.x -= d.v * 0.35;
      if (d.y > VIEW_H) {
        d.y = rand(-20, 0);
        d.x = rand(0, VIEW_W + 80);
      }
    }
  }

  update(camOffY: number): void {
    if (!this.container.visible) return;
    const L = this.level;
    this.container.y = -camOffY * 0.2;
    this.sky.clear();
    // Nubes cargadas arriba, que se aclaran con cada relámpago.
    for (let i = 0; i < 6; i++) {
      const a = (0.5 - i * 0.07) * L;
      this.sky.rect(0, i * 14 - 10, VIEW_W, 18).fill({ color: 0x0c1428, alpha: Math.max(0, a) });
    }
    this.sky.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x06122a, alpha: 0.28 * L });
    this.rainG.clear();
    for (const d of this.drops) this.rainG.moveTo(d.x, d.y).lineTo(d.x + d.len * 0.35, d.y - d.len);
    this.rainG.stroke({ width: 1, color: 0xa8d8ff, alpha: 0.35 * L });
    this.boltG.clear();
    if (this.boltLife > 0) {
      const x = rand(40, VIEW_W - 40);
      bolt(this.boltG, x, -10, x + rand(-40, 40), rand(90, 150), 1.6, Math.min(1, this.boltLife / 6) * Math.max(L, 0.8), 3);
    }
    this.flashG.clear();
    if (this.flash > 0.02) this.flashG.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xcfe6ff, alpha: this.flash * 0.5 * Math.max(L, 0.6) });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
