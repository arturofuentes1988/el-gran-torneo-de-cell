import { BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { STAGE_W, VIEW_H, VIEW_W } from '../config';
import { autoFullscreen } from '../app/fullscreen';
import type { Game, Scene } from '../app/game';
import type { FighterAsset } from '../content/mannequin/fighters';
import { attackKeys } from '../input/devices';
import { FxLayer } from '../render/fx';
import type { StageView } from '../render/stage';
import { outlinedText } from '../render/text';
import type { FighterDef } from '../sim/types';
import { backdrop } from './backdrop';
import { MainMenuScene } from './modeSelect';
import { loadTitleArena } from './titleArena';

export { loadTitleArena };

/** Alto en pantalla de cada luchador (de cuerpo entero) y dónde quedan sus pies. */
const ALTO = 112;
const PIES_Y = 236;
/**
 * Escala de los efectos: explosiones, aura y polvo están hechos para un luchador
 * de ~150 de alto (el de la pelea), así que su capa se achica igual que ellos.
 */
const S = ALTO / 150;
/** Cuadro del ciclo en que salta el primero, y cuadros entre la entrada de uno y la del siguiente. */
const INICIO = 20;
const ENTRADA = 105;
/** Cuadros que dura el salto con que entra cada uno, y cuánto sube. */
const SALTO = 34;
const ALTURA_SALTO = 60;
/** Tras aterrizar el último: cuadros hasta la pose de todos juntos, y cuánto dura esa pose. */
const ESPERA_FINAL = 75;
const POSE_FINAL = 170;
/** Cuadros que se queda gritando en la pose de todos antes de volver a la guardia. */
const GRITO = 80;
/** Cuadros del desvanecimiento y de pantalla vacía antes de que vuelvan a entrar. */
const FUNDIDO = 40;
const VACIO = 35;

interface Frame {
  tex: Texture;
  dur: number;
}

type Anim = 'idle' | 'up' | 'top' | 'fall' | 'land' | 'win' | 'power';

/** Un luchador del show de entrada. */
interface Actor {
  def: FighterDef;
  sprite: Sprite;
  shadow: Graphics;
  glow: Graphics;
  anims: Record<Anim, Frame[]>;
  /** Animación actual y su avance; si `hold`, se queda en el último cuadro; si no, sigue con `after` (que queda quieta al final) o repite. */
  cur: Anim;
  frames: Frame[];
  i: number;
  t: number;
  hold: boolean;
  after: Anim | null;
  /** Puesto final, desde dónde entra (-1 izquierda, 1 derecha, 0 cae desde arriba), hacia dónde mira y escala. */
  x: number;
  from: -1 | 0 | 1;
  mira: 1 | -1;
  k: number;
  /** Cuadro del ciclo en que salta, y cuadros desde que aterrizó (para la luz y el fuego). */
  start: number;
  landed: number;
}

/** Explosión pendiente detrás de los luchadores (las de colores, como en los Power Rangers). */
interface Burst {
  at: number;
  x: number;
  y: number;
  color: number;
  big: boolean;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * Pantalla de título: "EL GRAN TORNEO DE CELL". En cada vuelta salen dos luchadores
 * al azar: entra uno saltando desde la izquierda y después el otro desde la derecha
 * (salto, explosión de su color detrás y pose), posan juntos, se desvanecen y sale
 * otra pareja. De fondo, el ring del torneo de artes marciales (los menús usan el show de luces).
 */
export class TitleScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  /** Explosiones y chispas: van detrás de los luchadores (capa fx, bajo la interfaz). */
  private fx = new FxLayer();
  private t = 0;
  /** Cuadros desde que empezó el ciclo de entradas. */
  private cycle = 0;
  private prompt = outlinedText('PRESIONA ENTER', 12, 0xffffff, 0x3a0a18, 3);
  /** Un clic en el título pone la pantalla completa (y el sonido) sin pasar al menú. */
  private onPointer = (): void => autoFullscreen();
  private logoBig = outlinedText('DE CELL', 30, 0xffd040, 0x5a0a10, 3);
  /** De fondo, el ring del torneo de artes marciales (si no carga, el show de luces de los menús). */
  private arena: StageView | null = null;
  private lights = false;
  private active = false;
  private glows = new Container();
  private shadows = new Container();
  private cast = new Container();
  private whiteout = new Graphics();
  private actors: Actor[] = [];
  /** La pareja que sale en esta vuelta (y la anterior, para no repetirla seguida). */
  private pair: Actor[] = [];
  private lastPair = '';
  private bursts: Burst[] = [];
  private finalAt = 0;
  private fadeAt = 0;
  /** Destello blanco, temblor y golpe del logo (decaen solos). */
  private flash = 0;
  private shake = 0;
  private kick = 0;

  constructor(private game: Game) {
    const top = outlinedText('EL GRAN TORNEO', 17, 0xfff4e0, 0x5a0a10, 3);
    top.anchor.set(0.5);
    top.position.set(VIEW_W / 2, 24);
    this.logoBig.anchor.set(0.5);
    this.logoBig.position.set(VIEW_W / 2, 62);
    this.fx.container.scale.set(S);
    this.prompt.anchor.set(0.5);
    this.prompt.position.set(VIEW_W / 2, VIEW_H - 13);
    this.whiteout.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff });
    this.whiteout.alpha = 0;
    this.whiteout.blendMode = 'add';

    this.buildCast(game.assets.roster.filter((f) => (f.def.texScale ?? 1) !== 1));
    this.ui.addChild(this.shadows, this.glows, this.cast, this.whiteout, top, this.logoBig, this.prompt);
    this.reset();
  }

  private frames(def: FighterDef, anim: string, maxDur = Infinity): Frame[] {
    return (def.anims[anim]?.frames ?? [])
      .map((fr) => ({ tex: this.game.assets.textures[fr.tex], dur: Math.min(fr.dur, maxDur) }))
      .filter((fr) => fr.tex);
  }

  /** Los luchadores con sprites definitivos (los provisorios no salen); su puesto lo da cada vuelta. */
  private buildCast(reales: FighterAsset[]): void {
    reales.forEach((f) => {
      const def = f.def;
      const idle = this.frames(def, 'idle');
      if (!idle.length) return;
      const pick = (a: string, fallback: Frame[], maxDur?: number): Frame[] => {
        const fr = this.frames(def, a, maxDur);
        return fr.length ? fr : fallback;
      };
      const fall = pick('jumpFall', idle);
      const anims: Record<Anim, Frame[]> = {
        idle,
        up: pick('jumpUp', fall),
        top: pick('jumpTop', fall),
        fall,
        land: pick('land', idle, 4),
        win: pick('win', idle),
        power: pick('powerUp', idle),
      };
      // El cuadro de guardia mide ~150 unidades de mundo de alto: se escala a ALTO unidades de pantalla.
      const k = (ALTO * (def.texScale ?? 1)) / 150;
      const sprite = new Sprite(idle[0].tex);
      const glow = new Graphics().circle(0, PIES_Y - 75 * S, 62 * S).fill({ color: def.ui.fx });
      glow.filters = [new BlurFilter({ strength: 22, quality: 4 })];
      glow.blendMode = 'add';
      this.glows.addChild(glow);
      this.cast.addChild(sprite);
      // Sombra sobre el ring (se achica y aclara mientras va en el aire).
      const shadow = new Graphics().ellipse(0, 0, 30 * S, 6 * S).fill({ color: 0x000000, alpha: 0.3 });
      shadow.visible = false;
      this.shadows.addChild(shadow);
      this.actors.push({
        def, sprite, shadow, glow, anims, cur: 'idle', frames: idle, i: 0, t: 0, hold: false, after: null,
        x: VIEW_W / 2, from: 0, mira: 1, k, start: Number.MAX_SAFE_INTEGER, landed: -1,
      });
    });
    // Entran dos, uno después del otro.
    this.finalAt = INICIO + ENTRADA + SALTO + ESPERA_FINAL;
    this.fadeAt = this.finalAt + POSE_FINAL;
  }

  /** Elige la pareja de esta vuelta (al azar, distinta de la anterior si se puede) y la deja lista para entrar. */
  private reset(): void {
    this.cycle = 0;
    this.bursts = [];
    for (const a of this.actors) {
      a.sprite.visible = false;
      a.shadow.visible = false;
      a.sprite.alpha = 1;
      a.glow.alpha = 0;
      a.landed = -1;
      a.start = Number.MAX_SAFE_INTEGER;
      this.play(a, 'idle');
    }
    const n = this.actors.length;
    if (!n) return;
    let pick: Actor[] = [];
    for (let tries = 0; tries < 8; tries++) {
      const i = Math.floor(Math.random() * n);
      let j = Math.floor(Math.random() * (n - 1));
      if (j >= i) j++;
      pick = n > 1 ? [this.actors[i], this.actors[j]] : [this.actors[i]];
      const key = pick.map((a) => a.def.id).sort().join('+');
      if (key !== this.lastPair || n <= 2) {
        this.lastPair = key;
        break;
      }
    }
    this.pair = pick;
    // El primero entra por la izquierda y el segundo por la derecha; se miran.
    pick.forEach((a, slot) => {
      const solo = pick.length === 1;
      a.x = solo ? VIEW_W / 2 : slot === 0 ? VIEW_W / 2 - 92 : VIEW_W / 2 + 92;
      a.from = solo ? 0 : slot === 0 ? -1 : 1;
      a.mira = slot === 0 ? 1 : -1;
      a.sprite.scale.set(a.k * a.mira, a.k);
      a.glow.position.x = a.x;
      a.shadow.position.set(a.x, PIES_Y);
      a.start = INICIO + slot * ENTRADA;
    });
  }

  private play(a: Actor, anim: Anim, hold = false, after: Anim | null = null): void {
    a.cur = anim;
    a.frames = a.anims[anim];
    a.i = 0;
    a.t = 0;
    a.hold = hold;
    a.after = after;
    this.setTex(a);
  }

  private setTex(a: Actor): void {
    const tex = a.frames[a.i].tex;
    a.sprite.texture = tex;
    a.sprite.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
  }

  private advance(a: Actor): void {
    if (++a.t < a.frames[a.i].dur) return;
    a.t = 0;
    if (a.i + 1 < a.frames.length) a.i++;
    else if (a.hold) return;
    else if (a.after) return this.play(a, a.after, true);
    else a.i = 0;
    this.setTex(a);
  }

  /** Programa explosiones de colores detrás de un luchador, una tras otra. */
  private pyro(x: number, colors: number[], n: number): void {
    for (let i = 0; i < n; i++) {
      this.bursts.push({ at: this.cycle + i * 3, x: x + rand(-44, 44) * S, y: PIES_Y - rand(30, 140) * S, color: colors[i % colors.length], big: i % 2 === 0 });
    }
  }

  /** Aterriza en su puesto: polvo, explosión de su color y la pose. */
  private land(a: Actor): void {
    a.sprite.position.set(a.x, PIES_Y);
    a.landed = 0;
    this.fx.dust(a.x / S, PIES_Y / S, 12, true);
    this.fx.superBurst(a.x / S, PIES_Y / S - 75, a.def.ui.fx);
    this.pyro(a.x, [a.def.ui.fx, a.def.ui.color, 0xffffff], 9);
    this.flash = Math.max(this.flash, 0.45);
    this.shake = 5;
    this.play(a, 'land', false, 'win');
  }

  /** Los dos juntos: gritan con el aura encendida, explosiones de sus colores y el logo da un golpe. */
  private finale(): void {
    for (const a of this.pair) {
      this.play(a, 'power', true);
      this.pyro(a.x, [a.def.ui.fx, a.def.ui.color, 0xffd040], 7);
      a.landed = 0;
    }
    this.fx.superBurst(VIEW_W / 2 / S, PIES_Y / S - 85, 0xffd040);
    this.flash = 0.75;
    this.shake = 9;
    this.kick = 1;
  }

  enter(): void {
    const d = this.game.display;
    this.active = true;
    loadTitleArena().then(
      (arena) => {
        if (!this.active) return;
        this.arena = arena;
        arena.setDarkness(0);
        d.world.addChildAt(arena.container, 0);
      },
      (err) => {
        console.warn('No se pudo cargar el fondo del título; quedan las luces de los menús.', err);
        if (!this.active) return;
        this.lights = true;
        backdrop.attach(this.game);
      },
    );
    d.fx.position.set(0, 0);
    d.fx.addChild(this.fx.container);
    d.hud.addChild(this.ui);
    window.addEventListener('pointerdown', this.onPointer);
  }

  exit(): void {
    window.removeEventListener('pointerdown', this.onPointer);
    const d = this.game.display;
    this.active = false;
    if (this.arena) d.world.removeChild(this.arena.container);
    if (this.lights) backdrop.detach(this.game);
    d.fx.removeChild(this.fx.container);
    d.hud.removeChild(this.ui);
    this.fx.clear();
  }

  step(): void {
    this.t++;
    const c = this.cycle;

    for (const a of this.actors) {
      const s = c - a.start;
      if (s === 0) {
        a.sprite.visible = true;
        a.shadow.visible = true;
      }
      if (s >= 0 && s < SALTO) {
        // En el aire: cruza desde su lado (o cae desde arriba) hasta su puesto.
        const p = (s + 1) / SALTO;
        if (a.from === 0) {
          a.sprite.position.set(a.x, -30 + (PIES_Y + 30) * p * p);
        } else {
          const x0 = a.x + a.from * 300;
          a.sprite.position.set(x0 + (a.x - x0) * p, PIES_Y - 30 + 30 * p - 4 * ALTURA_SALTO * p * (1 - p));
        }
        const want: Anim = a.from === 0 || p >= 0.62 ? 'fall' : p >= 0.38 ? 'top' : 'up';
        if (a.cur !== want) this.play(a, want, true);
      }
      if (s === SALTO) this.land(a);
      const inPair = this.pair.includes(a);
      if (inPair && c === this.finalAt + GRITO) this.play(a, 'idle');
      if (inPair && c >= this.finalAt && c < this.finalAt + GRITO) this.fx.powerAura(a.x / S, PIES_Y / S, a.def.ui.fx, c);
      this.advance(a);
      // La luz de su color se enciende y queda suave, y detrás sube una columna de fuego de sus colores.
      if (a.landed >= 0) {
        const q = Math.max(0, 1 - a.landed / 9);
        if (a.landed < 32 && c < this.fadeAt) {
          this.fx.powerAura(a.x / S, PIES_Y / S, a.def.ui.fx, c);
          if (a.landed % 2 === 0) this.fx.powerAura(a.x / S, PIES_Y / S, a.def.ui.color, c + 1);
        }
        a.glow.alpha = 0.35 + 0.55 * q;
        a.landed++;
      }
    }
    if (c === this.finalAt) this.finale();
    for (const b of this.bursts) if (b.at === c) this.fx.explosion(b.x / S, b.y / S, b.color, b.big);
    this.bursts = this.bursts.filter((b) => b.at > c);

    // Se desvanecen y, tras un momento vacío, vuelven a entrar.
    if (c >= this.fadeAt) {
      const k = Math.max(0, 1 - (c - this.fadeAt) / FUNDIDO);
      for (const a of this.actors) {
        a.sprite.alpha = k;
        a.glow.alpha = Math.min(a.glow.alpha, 0.35 * k);
      }
    }
    this.cycle++;
    if (this.cycle >= this.fadeAt + FUNDIDO + VACIO) this.reset();

    this.fx.step();
    this.whiteout.alpha = this.flash;
    this.flash *= 0.82;
    this.cast.position.set(this.shake > 0.5 ? rand(-1, 1) * this.shake : 0, this.shake > 0.5 ? rand(-1, 1) * this.shake * 0.6 : 0);
    this.shake *= 0.8;
    this.kick *= 0.86;

    const kb = this.game.kb;
    const attack = attackKeys().some((k) => kb.hit(k));
    if (this.game.menu.confirm || this.game.menu.start || attack) {
      // Dentro del gesto del jugador: el navegador permite la pantalla completa.
      autoFullscreen();
      this.game.sfx.unlock();
      this.game.sfx.play('menuConfirm');
      this.game.setScene(new MainMenuScene(this.game));
    }
  }

  render(): void {
    // Cámara quieta al centro del ring; el video del escenario le da vida.
    this.arena?.update((STAGE_W - VIEW_W) / 2, 0);
    if (this.lights) backdrop.render();
    for (const a of this.actors) {
      const air = Math.max(0, PIES_Y - a.sprite.y);
      a.shadow.visible = a.sprite.visible;
      a.shadow.x = a.sprite.x;
      a.shadow.scale.set(Math.max(0.4, 1 - air / 140));
      a.shadow.alpha = a.sprite.alpha * Math.max(0.25, 1 - air / 120);
    }
    this.prompt.visible = Math.floor(this.t / 30) % 2 === 0;
    this.logoBig.scale.set(1 + Math.sin(this.t / 20) * 0.025 + this.kick * 0.18);
    this.fx.sync();
  }
}
