import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Fighter } from '../sim/fighter';
import type { Match, Projectile } from '../sim/match';
import { costumeFilter } from './costume';
import { ProjectileLook } from './elemental';
import { logLandFrame } from './fuego';
import type { FxLayer } from './fx';
import { snap } from './scale';

interface Ghost {
  sprite: Sprite;
  life: number;
}

/** Capas del mundo (orden de dibujo). */
export interface WorldLayers {
  shadows: Container;
  ghosts: Container;
  fighters: Container;
  projectiles: Container;
}

/** Dibuja un luchador: sprite, sombra y estelas. */
export class FighterView {
  readonly sprite = new Sprite();
  private shadow = new Graphics();
  private ghosts: Ghost[] = [];
  /** Cuadros que le quedan electrocutado (parpadea en azul) o quemado (en naranjo). */
  zap = 0;
  private zapTint = 0x7fc8ff;
  private baseTint: number;
  /** Copia que brilla en azul encima del luchador mientras está electrocutado. */
  private zapGlow = new Sprite();

  constructor(
    private fighter: Fighter,
    private textures: Record<string, Texture>,
    private layers: WorldLayers,
    /** Color para distinguir a un luchador repetido en la misma pelea (2 VS 2). */
    tint = 0xffffff,
    /** Color de ropa elegido (0 = el original; ver render/costume.ts). */
    costume = 0,
  ) {
    layers.shadows.addChild(this.shadow);
    layers.fighters.addChild(this.sprite);
    this.sprite.tint = tint;
    this.baseTint = tint;
    this.zapGlow.blendMode = 'add';
    this.zapGlow.tint = 0x7fd8ff;
    this.zapGlow.visible = false;
    layers.fighters.addChild(this.zapGlow);
    const filter = costumeFilter(costume, fighter.def.costume);
    if (filter) this.sprite.filters = [filter];
  }

  /** Lo electrocuta un rayo: parpadea en azul eléctrico unos cuadros. */
  electrify(frames: number): void {
    this.zap = Math.max(this.zap, frames);
    this.zapTint = 0x7fc8ff;
    this.zapGlow.tint = 0x7fd8ff;
  }

  /** Lo quema el fuego: parpadea en naranjo unos cuadros. */
  burn(frames: number): void {
    this.zap = Math.max(this.zap, frames);
    this.zapTint = 0xffb070;
    this.zapGlow.tint = 0xff7a1a;
  }

  /** En 2 VS 2 el que descansa fuera de la pantalla no se dibuja. */
  get visible(): boolean {
    return this.sprite.visible;
  }

  set visible(v: boolean) {
    this.sprite.visible = v;
    this.shadow.visible = v;
  }

  /** Transparencia (el caído se desvanece antes de irse). */
  set alpha(a: number) {
    this.sprite.alpha = a;
    this.shadow.alpha = a;
  }

  /** Lógica por cuadro de simulación (estelas). */
  step(): void {
    if (this.zap > 0) this.zap--;
    const f = this.fighter;
    const special = f.state === 'attack' && (f.moveKind === 'special' || f.moveKind === 'super');
    const flying = f.state === 'airHit' && Math.abs(f.vx) > 2.6;
    // En Modo Poder y al rodar también deja estela.
    const power = f.powerTimer > 0 && (f.state === 'attack' || Math.abs(f.vx) > 1.5 || !f.grounded);
    if (this.sprite.visible && (special || flying || power || f.state === 'roll') && f.stateFrame % 3 === 0 && f.hitstop === 0) {
      const g = new Sprite(this.sprite.texture);
      g.anchor.copyFrom(this.sprite.anchor);
      g.position.copyFrom(this.sprite.position);
      g.scale.copyFrom(this.sprite.scale);
      g.tint = f.def.ui.fx;
      g.blendMode = 'add';
      g.alpha = 0.55;
      this.layers.ghosts.addChild(g);
      this.ghosts.push({ sprite: g, life: 12 });
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life--;
      g.sprite.alpha = 0.55 * (g.life / 12);
      if (g.life <= 0) {
        g.sprite.destroy();
        this.ghosts.splice(i, 1);
      }
    }
  }

  update(): void {
    const f = this.fighter;
    const tex = this.textures[f.frame.tex] ?? Texture.EMPTY;
    // Unidades de mundo por pixel de textura (arte HD: menos de 1).
    const k = f.def.texScale ?? 1;
    this.sprite.texture = tex;
    this.sprite.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
    let x = snap(f.x);
    // Temblor del que recibe el golpe durante el congelamiento.
    if (f.hitstop > 0 && (f.state === 'hitstun' || f.state === 'airHit' || f.state === 'blockstun')) {
      x += f.hitstop % 2 === 0 ? 1 : -1;
    }
    this.sprite.position.set(x, snap(f.y));
    this.sprite.scale.set(f.facing * k, k);
    const zapOn = this.zap > 0 && Math.floor(this.zap / 2) % 2 === 0;
    this.sprite.tint = zapOn ? this.zapTint : this.baseTint;
    this.zapGlow.visible = zapOn && this.sprite.visible;
    if (this.zapGlow.visible) {
      this.zapGlow.texture = tex;
      this.zapGlow.anchor.copyFrom(this.sprite.anchor);
      this.zapGlow.position.copyFrom(this.sprite.position);
      this.zapGlow.scale.copyFrom(this.sprite.scale);
      this.zapGlow.zIndex = this.sprite.zIndex + 0.5;
      this.zapGlow.alpha = 0.55 + Math.random() * 0.3;
    }

    const h = Math.min(1, -f.y / 150);
    const w = 30 * (1 - h * 0.45);
    this.shadow.clear();
    this.shadow.ellipse(snap(f.x), 0, w, Math.max(2, 4 * (1 - h * 0.5))).fill({ color: 0x24101a, alpha: 0.42 * (1 - h * 0.5) });
  }

  destroy(): void {
    for (const g of this.ghosts) g.sprite.destroy();
    this.zapGlow.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

/** Dibuja los proyectiles (capa del mundo) y su brillo (capa de efectos). */
export class ProjectileViews {
  private views = new Map<Projectile, { sprite: Sprite; glow: Sprite; look: ProjectileLook | null }>();
  /** Dibujos propios que se siguen apagando después de que su proyectil desapareció. */
  private fading: Array<{ look: ProjectileLook; p: Projectile; t: number }> = [];
  /** Rayos que cayeron en el último cuadro de simulación (para el trueno y el corte de luz). */
  readonly strikes: Projectile[] = [];
  /** Troncos que cayeron al suelo en el último cuadro de simulación (para el golpe seco y el polvo). */
  readonly landings: Array<{ x: number; owner: Projectile['owner'] }> = [];

  constructor(
    private textures: Record<string, Texture>,
    private layer: Container,
    private fx: FxLayer,
  ) {}

  step(m: Match): void {
    this.strikes.length = 0;
    this.landings.length = 0;
    for (const p of m.projectiles) {
      if (p.dead) continue;
      if (p.def.look === 'troncos' || p.def.look === 'letras') {
        for (let i = 0; i < p.def.hits; i++) if (p.frame === logLandFrame(p, i)) this.landings.push({ x: p.x, owner: p.owner });
      }
      if (p.frame % 2 === 0 && p.vx !== 0) this.fx.trail(p.x - Math.sign(p.vx) * 10, p.y, p.def.glow, p.def.glowSize);
      if (p.def.look === 'rayo' && p.frame === (p.def.delay ?? 0)) this.strikes.push(p);
      // Las rastas salpican agua al avanzar por el suelo.
      if (p.def.look === 'rastas' && p.frame % 3 === 0) this.fx.splash(p.x, -2, false);
    }
  }

  /** ¿Hay un rayo avisando o cayendo? (el escenario parpadea como en un corte de luz). */
  blackout(m: Match): number {
    let k = 0;
    for (const p of m.projectiles) {
      if (p.dead || p.def.look !== 'rayo') continue;
      const d = p.def.delay ?? 0;
      k = Math.max(k, p.frame < d ? 0.35 + (p.frame / Math.max(1, d)) * 0.4 : 0.15);
    }
    return k;
  }

  update(m: Match): void {
    const alive = new Set<Projectile>();
    for (const p of m.projectiles) {
      if (p.dead) continue;
      alive.add(p);
      let v = this.views.get(p);
      if (!v) {
        const sprite = new Sprite();
        this.layer.addChild(sprite);
        const look = p.def.look ? new ProjectileLook(p.def.look, this.textures) : null;
        if (look) this.layer.addChild(look.view);
        v = { sprite, glow: this.fx.makeGlow(p.def.glow, p.def.glowSize), look };
        this.views.set(p, v);
      }
      if (v.look) {
        v.look.draw(p);
        // El rayo y el remolino brillan solos; el brillo redondo solo cuando ya pegan.
        v.glow.position.set(p.x, p.def.look === 'rastas' ? p.y - 12 : p.y - 30);
        v.glow.alpha = p.cooldown > 0 && p.frame < (p.def.delay ?? 0) ? 0 : 0.6;
        if (!p.def.frames.length) continue;
      }
      const name = p.def.frames[Math.floor(p.frame / p.def.frameDur) % p.def.frames.length];
      const tex = this.textures[name] ?? Texture.EMPTY;
      const k = p.def.texScale ?? 1;
      v.sprite.texture = tex;
      v.sprite.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 0.5);
      v.sprite.position.set(snap(p.x), snap(p.y));
      v.sprite.scale.set((p.def.flip ? -1 : 1) * p.dir * k, k);
      v.sprite.blendMode = p.def.blend === 'add' ? 'add' : 'normal';
      v.glow.position.set(p.x, p.y);
      v.glow.alpha = 0.75 + Math.sin(p.frame * 0.6) * 0.15;
    }
    for (const [p, v] of this.views) {
      if (alive.has(p)) continue;
      v.sprite.destroy();
      if (v.look && v.look.linger > 0) this.fading.push({ look: v.look, p, t: 0 });
      else v.look?.destroy();
      this.fx.releaseGlow(v.glow);
      this.views.delete(p);
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.t++;
      f.look.draw(f.p, f.t);
      if (f.t >= f.look.linger) {
        f.look.destroy();
        this.fading.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const f of this.fading) f.look.destroy();
    this.fading = [];
    for (const v of this.views.values()) {
      v.sprite.destroy();
      v.look?.destroy();
      this.fx.releaseGlow(v.glow);
    }
    this.views.clear();
  }
}
