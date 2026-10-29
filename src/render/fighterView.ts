import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Fighter } from '../sim/fighter';
import type { Match, Projectile } from '../sim/match';
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

  constructor(
    private fighter: Fighter,
    private textures: Record<string, Texture>,
    private layers: WorldLayers,
    /** Color para distinguir a un luchador repetido en la misma pelea (2 VS 2). */
    tint = 0xffffff,
  ) {
    layers.shadows.addChild(this.shadow);
    layers.fighters.addChild(this.sprite);
    this.sprite.tint = tint;
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

    const h = Math.min(1, -f.y / 150);
    const w = 30 * (1 - h * 0.45);
    this.shadow.clear();
    this.shadow.ellipse(snap(f.x), 0, w, Math.max(2, 4 * (1 - h * 0.5))).fill({ color: 0x24101a, alpha: 0.42 * (1 - h * 0.5) });
  }

  destroy(): void {
    for (const g of this.ghosts) g.sprite.destroy();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

/** Dibuja los proyectiles (capa del mundo) y su brillo (capa de efectos). */
export class ProjectileViews {
  private views = new Map<Projectile, { sprite: Sprite; glow: Sprite }>();

  constructor(
    private textures: Record<string, Texture>,
    private layer: Container,
    private fx: FxLayer,
  ) {}

  step(m: Match): void {
    for (const p of m.projectiles) {
      if (p.dead) continue;
      if (p.frame % 2 === 0) this.fx.trail(p.x - Math.sign(p.vx) * 10, p.y, p.def.glow, p.def.glowSize);
    }
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
        v = { sprite, glow: this.fx.makeGlow(p.def.glow, p.def.glowSize) };
        this.views.set(p, v);
      }
      const name = p.def.frames[Math.floor(p.frame / p.def.frameDur) % p.def.frames.length];
      const tex = this.textures[name] ?? Texture.EMPTY;
      const k = p.def.texScale ?? 1;
      v.sprite.texture = tex;
      v.sprite.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 0.5);
      v.sprite.position.set(snap(p.x), snap(p.y));
      v.sprite.scale.set(p.vx >= 0 ? k : -k, k);
      v.glow.position.set(p.x, p.y);
      v.glow.alpha = 0.75 + Math.sin(p.frame * 0.6) * 0.15;
    }
    for (const [p, v] of this.views) {
      if (alive.has(p)) continue;
      v.sprite.destroy();
      this.fx.releaseGlow(v.glow);
      this.views.delete(p);
    }
  }

  clear(): void {
    for (const v of this.views.values()) {
      v.sprite.destroy();
      this.fx.releaseGlow(v.glow);
    }
    this.views.clear();
  }
}
