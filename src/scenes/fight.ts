import { ZoomBlurFilter } from 'pixi-filters';
import { ColorMatrixFilter, Container, Graphics, type Sprite, type Text } from 'pixi.js';
import { GROUND_SCREEN_Y, MAX_METER, VIEW_H, VIEW_W } from '../config';
import type { FightMode, Game, Scene } from '../app/game';
import { loadDifficulty } from '../app/settings';
import { announcerVoice } from '../audio/announcer';
import { COMBO_BREAKER, ULTRA_COMBO, comboNameFor } from '../render/comboNames';
import type { FrameInput } from '../input/buffer';
import { P1_KEYS, P2_KEYS, PlayerInput, type KeyBindings } from '../input/devices';
import { FighterView, ProjectileViews, type WorldLayers } from '../render/fighterView';
import { DiscoShow } from '../render/disco';
import { StormShow, bolt } from '../render/elemental';
import { FxLayer } from '../render/fx';
import { Hud, type PracticeHudInfo } from '../render/hud';
import { LiveShow } from '../render/live';
import { MoveListPanel } from '../render/moveListPanel';
import { ControlsPanel } from './controls';
import { snap } from '../render/scale';
import type { StageView } from '../render/stage';
import { outlinedText } from '../render/text';
import { CpuController } from '../sim/ai';
import type { DifficultyId } from '../sim/difficulty';
import { DUMMY_MODES, DUMMY_NAME, PracticeDummy } from '../sim/dummy';
import type { Fighter, StateName } from '../sim/fighter';
import { DEAD_LINGER, Match } from '../sim/match';
import type { SimEvent } from '../sim/events';
import type { FighterDef, ProjectileDef } from '../sim/types';
import { TitleScene } from './title';

/** Estados en que un luchador todavía está "dentro" de un combo o recuperándose. */
const BUSY: ReadonlySet<StateName> = new Set<StateName>(['hitstun', 'airHit', 'knockdown', 'getup', 'blockstun', 'thrown', 'pinned']);
/** Cuadros (de pantalla) en que no se apilan dos frases del mismo luchador (~1,2 s). */
const LINE_GAP = 72;
/** Cuadros que espera una frase de combo si el anunciador acaba de hablar (K.O., etc.). */
const AFTER_ANNOUNCER = 54;
/** Cuadros de calma antes de que la vida se recupere en práctica (~1 segundo). */
const REFILL_DELAY = 60;

/** Estado del modo práctica (opciones y lectura del combo). */
export type PracticeState = PracticeHudInfo;

interface InputSource {
  sample(m: Match): FrameInput;
}

/** Une las teclas de dos jugadores; se leen en vivo, así un cambio en CONTROLES rige al tiro. */
function mergeKeys(a: KeyBindings, b: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const k of Object.keys(a) as Array<keyof KeyBindings>) {
    Object.defineProperty(out, k, { get: () => [...a[k], ...b[k]], enumerable: true });
  }
  return out;
}

const PAUSE_OPTIONS = ['CONTINUAR', 'MOVIMIENTOS', 'CONTROLES', 'SALIR AL MENÚ'] as const;
/** Menú de pausa compacto (mismo estilo que el menú de modos). */
const P_FONT = 8;
const P_ROW = 13;
const P_W = 150;
const P_PAD = 9;
const P_H = P_PAD * 2 + (PAUSE_OPTIONS.length - 1) * P_ROW + P_FONT;
const P_X = Math.round((VIEW_W - P_W) / 2);
const P_Y = Math.round((VIEW_H - P_H) / 2) + 6;

/** Colores para distinguir a un luchador repetido en la misma pelea (el primero va sin cambio). */
const DUPLICATE_TINTS = [0xffffff, 0x8ea8ff, 0xffa48a, 0xa0ffb0];

/**
 * Opciones de la pelea (índices de game.assets.roster). teams: 2 VS 2, los de cada equipo.
 * fighters: 1 VS 1, el del jugador 1 y el del 2 (si falta, la pareja por defecto de assets.fighters).
 */
export interface FightOptions {
  teams?: [number[], number[]];
  fighters?: [number, number];
}

export class FightScene implements Scene {
  /** El tema del escenario elegido (o silencio si no tiene). */
  get music(): string | null {
    return this.game.assets.stage.music;
  }
  readonly match: Match;
  private sources: [InputSource, InputSource];
  private world = new Container();
  private layers: WorldLayers = {
    shadows: new Container(),
    ghosts: new Container(),
    fighters: new Container(),
    projectiles: new Container(),
  };
  private fx = new FxLayer();
  /** Show de luces de los súpers con cinematic.lights = 'disco' (detrás de los luchadores). */
  private disco = new DiscoShow();
  private discoOwner: Fighter | null = null;
  private discoProj: ProjectileDef | null = null;
  private discoT = 0;
  /** Cuadros mínimos y máximos del show (desde que empieza el cartel). */
  private discoMin = 0;
  private discoMax = 0;
  /** Tormenta de los súpers con cinematic.lights = 'tormenta' (el Flaitiano). */
  private storm = new StormShow();
  private lightsKind: 'disco' | 'tormenta' = 'disco';
  /** Cuadros de "cuadro de impacto" (la imagen en negativo) después de un golpe enorme. */
  private impact = 0;
  private negative = new ColorMatrixFilter();
  /** Rayo gigante del remate de un súper o ultra de tormenta: dónde y cuántos cuadros le quedan. */
  private bigBolt = new Graphics();
  private bigBoltT = 0;
  private bigBoltX = 0;
  /** Letras de cómic de los golpes (¡TOC!), en el mundo. */
  private comics: Array<{ text: Text; life: number }> = [];
  /** Golpes que lleva conectados cada luchador en su movimiento actual (para las letras de cómic). */
  private moveHits = new Map<Fighter, { move: string; n: number }>();
  /** Lo que se dibuja sobre la cabeza del rival durante un movimiento (el tarro). */
  private overlayG = new Graphics();
  /** Escenarios de reemplazo ya cargados (el ultra en otro lugar) y el que se ve ahora. */
  private backdrops = new Map<string, StageView>();
  private shownStage!: StageView;
  private debugG = new Graphics();
  private hud: Hud;
  /** Presentación de "transmisión en vivo": vistas, regalos, hype, chat y corazones. */
  private live: LiveShow;
  /** Una vista por luchador (en 2 VS 2 también los compañeros; se ven solo en pantalla). */
  private views = new Map<Fighter, FighterView>();
  private projViews: ProjectileViews;
  private camOffY = 0;
  private shake = 0;
  private dark = 0;
  private zoom = new ZoomBlurFilter({ strength: 0, innerRadius: 40 });
  private zoomT = 0;
  private paused = false;
  private pauseSel = 0;
  private moveList: MoveListPanel | null = null;
  private controls: ControlsPanel | null = null;
  private pauseUi = new Container();
  private pauseItems: Text[] = [];
  private pauseBar = new Graphics();
  private pauseCursor = outlinedText('>', P_FONT, 0xffd040, 0x5a0a10, 2);
  private pauseT = 0;
  /** Brillo persistente del Modo Poder, uno por luchador (se crea al activarlo). */
  private powerGlows: [Sprite | null, Sprite | null] = [null, null];
  private seed: number;
  /** Dificultad de la CPU (1 jugador y muñeco CPU); la demo usa NORMAL. */
  readonly difficulty: DifficultyId;
  // Modo práctica.
  private dummy: PracticeDummy | null = null;
  private infiniteMeter = false;
  private healthMode: 'recupera' | 'normal' = 'recupera';
  private calm: [number, number] = [0, 0];
  private combo = { hits: 0, damage: 0 };
  private best = { hits: 0, damage: 0 };
  /** Cuadros de pantalla desde que empezó la escena (para separar las voces). */
  private t = 0;
  /** Cuándo dijo cada luchador su frase de REMATE o de ULTRA (para no apilar la del combo encima). */
  private lineAt = new Map<string, number>();
  /** Cuándo habló por última vez el anunciador. */
  private announcerAt = -999;
  /** Voces que esperan su turno (la frase del combo después del "K.O."). */
  private pendingVoices: Array<{ name: string; at: number; channel?: string; wait?: number }> = [];
  /** Puente de pruebas: entradas forzadas por lado (una por cuadro de simulación). */
  readonly qaInputs: [FrameInput[], FrameInput[]] = [[], []];

  constructor(
    private game: Game,
    private mode: FightMode,
    seed = (Date.now() & 0xffff) + 1,
    private opts: FightOptions = {},
  ) {
    this.seed = seed;
    this.difficulty = mode === 'demo' ? 'normal' : loadDifficulty();
    // 2 VS 2: los luchadores de cada equipo salen del plantel; el primero de cada uno parte peleando.
    const roster = game.assets.roster;
    const pick = (idx: number[]) => idx.map((i) => roster[i]?.def).filter((d): d is FighterDef => !!d);
    const teamDefs: [FighterDef[], FighterDef[]] | null =
      opts.teams && mode !== 'practica' ? [pick(opts.teams[0]), pick(opts.teams[1])] : null;
    const teams = teamDefs && teamDefs[0].length && teamDefs[1].length ? teamDefs : null;
    const chosen = opts.fighters ? pick(opts.fighters) : [];
    const pair = chosen.length === 2 ? chosen : [game.assets.fighters[0].def, game.assets.fighters[1].def];
    const defs = teams ? ([teams[0][0], teams[1][0]] as const) : ([pair[0], pair[1]] as const);
    this.match = new Match(defs, seed, { practice: mode === 'practica', teams: teams ?? undefined });
    const kb = game.kb;
    const pads = game.pads;
    const human = (keys: KeyBindings, pad: number): InputSource => {
      const p = new PlayerInput(kb, pads, keys, pad);
      return { sample: () => p.sample() };
    };
    const cpu = (side: 0 | 1, s: number): InputSource => {
      const c = new CpuController(side, s, this.difficulty);
      return { sample: (m) => c.update(m) };
    };
    if (mode === 'demo') this.sources = [cpu(0, seed * 7 + 1), cpu(1, seed * 13 + 5)];
    else if (mode === 'cpu') this.sources = [human(mergeKeys(P1_KEYS, P2_KEYS), 0), cpu(1, seed * 13 + 5)];
    else if (mode === 'practica') {
      const dummy = new PracticeDummy(1, seed * 13 + 5, this.difficulty);
      this.dummy = dummy;
      this.sources = [human(mergeKeys(P1_KEYS, P2_KEYS), 0), { sample: (m) => dummy.update(m) }];
      this.syncDummyPose();
    } else this.sources = [human(P1_KEYS, 0), human(P2_KEYS, 1)];

    this.world.addChild(this.layers.shadows, this.layers.ghosts, this.layers.projectiles, this.layers.fighters);
    const [a, b] = this.match.fighters;
    const all = this.allFighters();
    // Un luchador repetido (René contra René) se tiñe para distinguirlo.
    const count = new Map<string, number>();
    for (const f of all) {
      const n = count.get(f.def.id) ?? 0;
      count.set(f.def.id, n + 1);
      const v = new FighterView(f, game.assets.textures, this.layers, DUPLICATE_TINTS[n % DUPLICATE_TINTS.length]);
      v.visible = f === a || f === b;
      this.views.set(f, v);
    }
    // Orden de dibujo por zIndex: el jugador 1 delante del 2 cuando se cruzan, las ayudas detrás.
    this.layers.fighters.sortableChildren = true;
    this.projViews = new ProjectileViews(game.assets.textures, this.layers.projectiles, this.fx);
    this.hud = new Hud([a.def, b.def], game.assets.textures);
    if (this.match.teams) this.hud.setTeamMode(all.map((f) => f.def));
    this.live = new LiveShow([a.def, b.def], game.assets.textures, seed, (side, color) => this.spawnHeart(side, color));
    this.hud.addLayer(this.live.container);
    if (this.dummy) this.hud.setPractice(this.practiceState!);
    this.buildPause();
    this.shownStage = game.assets.stage;
    this.bigBolt.blendMode = 'add';
    this.world.addChild(this.overlayG, this.bigBolt);
    this.negative.negative(false);
    // Escenarios de reemplazo de los ultras: se cargan ahora para no esperar en plena pelea.
    for (const f of all) {
      for (const mv of Object.values(f.def.moves)) {
        const id = mv.cinematic?.backdrop;
        if (!id || this.backdrops.has(id) || !game.assets.stages.find(id)) continue;
        game.assets.stages.get(id).then((st) => this.backdrops.set(id, st), () => undefined);
      }
    }
  }

  /** Todos los luchadores de la pelea (en 2 VS 2, los cuatro). */
  private allFighters(): Fighter[] {
    const t = this.match.teams;
    return t ? [...t[0].members, ...t[1].members] : [...this.match.fighters];
  }

  /** Resumen de la transmisión en vivo (para el puente de pruebas). */
  get liveState(): object {
    return this.live.qaState();
  }

  /** Estado de la práctica (null fuera de ese modo); también lo lee el puente de pruebas. */
  get practiceState(): PracticeState | null {
    if (!this.dummy) return null;
    return {
      infiniteMeter: this.infiniteMeter,
      dummy: DUMMY_NAME[this.dummy.mode],
      health: this.healthMode,
      combo: { ...this.combo },
      best: { ...this.best },
    };
  }

  /** Teclas 1-4 de la práctica (fila de números; el teclado numérico es del jugador 2). */
  private practiceKeys(): void {
    const kb = this.game.kb;
    const key = (n: number) => kb.hit(`Digit${n}`);
    const dummy = this.dummy!;
    let changed = false;
    if (key(1)) {
      this.infiniteMeter = !this.infiniteMeter;
      changed = true;
    }
    if (key(2)) {
      const i = DUMMY_MODES.indexOf(dummy.mode);
      dummy.setMode(DUMMY_MODES[(i + 1) % DUMMY_MODES.length], this.difficulty);
      this.syncDummyPose();
      changed = true;
    }
    if (key(3)) {
      this.healthMode = this.healthMode === 'recupera' ? 'normal' : 'recupera';
      changed = true;
    }
    if (key(4)) {
      this.match.practiceReset();
      this.projViews.clear();
      this.calm = [0, 0];
      changed = true;
    }
    if (changed) {
      this.game.sfx.play('menuMove');
      this.hud.showPracticePanel();
    }
  }

  /** Con la guardia baja el muñeco usa su pose relajada (brazos abajo) cuando está quieto. */
  private syncDummyPose(): void {
    if (this.dummy) this.match.fighters[this.dummy.side].relaxed = this.dummy.mode === 'guardiaBaja';
  }

  /** Después de cada cuadro de práctica: súper infinito, vida que se recupera y lectura del combo. */
  private practiceAfterStep(): void {
    const m = this.match;
    const [p1, dum] = m.fighters;
    if (this.infiniteMeter) p1.meter = MAX_METER;
    m.fighters.forEach((f, i) => {
      // La vida vuelve a llenarse un rato después de que termina el combo.
      const busy = f.comboHits > 0 || BUSY.has(f.state);
      this.calm[i] = busy ? 0 : this.calm[i] + 1;
      if (this.healthMode === 'recupera' && this.calm[i] >= REFILL_DELAY && f.health < f.def.health) f.health = f.def.health;
    });
    // Combo del jugador sobre el muñeco: se muestra mientras dura y queda hasta que empieza el próximo.
    if (dum.comboHits > 0) {
      this.combo = { hits: dum.comboHits, damage: dum.comboDamage };
      if (this.combo.damage > this.best.damage) this.best = { ...this.combo };
    }
  }

  private buildPause(): void {
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x05020c, alpha: 0.55 });
    bg.roundRect(P_X, P_Y, P_W, P_H, 5).fill({ color: 0x140a24, alpha: 0.9 }).stroke({ color: 0xc89a3a, width: 1 });
    const title = outlinedText('PAUSA', 12, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, P_Y - 12);
    this.pauseUi.addChild(bg, this.pauseBar, title, this.pauseCursor);
    PAUSE_OPTIONS.forEach((o, i) => {
      const t = outlinedText(o, P_FONT, 0xffffff, 0x1a0a24, 2);
      t.position.set(P_X + 22, P_Y + P_PAD + i * P_ROW);
      this.pauseItems.push(t);
      this.pauseUi.addChild(t);
    });
    this.pauseUi.visible = false;
  }

  /** Opción marcada de la pausa: color, barra y cursor que pestañea. */
  private paintPause(): void {
    this.pauseItems.forEach((t, i) => {
      t.style.fill = i === this.pauseSel ? 0xffd040 : 0xffffff;
    });
    const y = P_Y + P_PAD + this.pauseSel * P_ROW;
    this.pauseBar.clear().roundRect(P_X + 5, y - 3, P_W - 10, P_FONT + 6, 3).fill({ color: 0xffd040, alpha: 0.12 });
    this.pauseCursor.position.set(P_X + 10 + (Math.floor(this.pauseT / 10) % 2), y);
  }

  enter(): void {
    const d = this.game.display;
    d.world.addChild(this.game.assets.stage.container, this.disco.container, this.storm.container, this.world);
    d.fx.addChild(this.fx.container, this.debugG);
    d.hud.addChild(this.hud.container);
    d.overlay.addChild(this.pauseUi);
    d.worldView.filters = [this.zoom, this.negative];
    this.zoom.enabled = false;
    this.negative.enabled = false;
  }

  exit(): void {
    this.closeMoveList();
    this.closeControls();
    const d = this.game.display;
    d.world.removeChild(this.shownStage.container, this.disco.container, this.storm.container, this.world);
    if (this.shownStage !== this.game.assets.stage) this.shownStage.setDarkness(0);
    d.fx.removeChild(this.fx.container, this.debugG);
    d.hud.removeChild(this.hud.container);
    d.overlay.removeChild(this.pauseUi);
    d.worldView.filters = [];
    this.game.assets.stage.setDarkness(0);
    this.projViews.clear();
    for (const g of this.powerGlows) if (g) this.fx.releaseGlow(g);
    this.powerGlows = [null, null];
    this.fx.clear();
    this.live.destroy();
    this.disco.destroy();
    this.storm.destroy();
    for (const v of this.views.values()) v.destroy();
    this.world.destroy({ children: true });
  }

  step(): void {
    const g = this.game;
    const pausePressed = g.kb.hit('Escape') || [0, 1, 2, 3].some((i) => g.pads.pressed(i, 9));
    if (this.paused) {
      this.stepPause(pausePressed);
      return;
    }
    if (pausePressed && this.mode !== 'demo') {
      this.paused = true;
      this.pauseSel = 0;
      this.pauseUi.visible = true;
      g.sfx.play('pause');
      return;
    }

    const m = this.match;
    if (this.dummy) this.practiceKeys();
    const inputs: [FrameInput, FrameInput] = [this.sources[0].sample(m), this.sources[1].sample(m)];
    for (const i of [0, 1] as const) {
      const forced = this.qaInputs[i].shift();
      if (forced) inputs[i] = forced;
    }
    m.step(inputs);
    if (this.dummy) {
      this.practiceAfterStep();
      this.hud.setPractice(this.practiceState!);
    }
    this.t++;
    this.handleEvents();
    this.stepVoices();
    this.stepLights();
    if (m.freeze > 0 && m.freezeOwner) {
      const o = m.freezeOwner;
      this.fx.aura(o.x, o.y - 70, o.def.ui.fx);
    }
    // Aura del Modo Poder.
    for (const f of m.fighters) {
      if (f.powerTimer > 0 && m.freeze === 0) this.fx.powerAura(f.x, f.y, f.def.ui.fx, m.frame);
    }
    for (const v of this.views.values()) v.step();
    this.projViews.step(m);
    this.stepElemental();
    this.fx.step();
    this.hud.step(m);
    this.live.step(m);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.35);
    // Un rayo que avisa corta la luz: el escenario parpadea a oscuras.
    const blackout = this.projViews.blackout(m) * (0.7 + Math.random() * 0.3);
    const targetDark = Math.max(m.freeze > 0 ? 0.62 : 0, m.ultraActive ? 0.72 : 0, this.disco.darkness, this.storm.darkness, blackout);
    this.dark += (targetDark - this.dark) * (targetDark > this.dark ? 0.35 : 0.08);
    if (this.zoomT > 0) this.zoomT--;

    if (m.over) {
      if (this.mode === 'demo') g.setScene(new FightScene(g, 'demo', this.seed + 1, this.opts));
      else g.setScene(new TitleScene(g));
    }
  }

  private stepPause(pausePressed: boolean): void {
    const g = this.game;
    const mi = g.menu;
    this.pauseT++;
    // Controles abiertos sobre la pausa: el panel maneja sus teclas (Esc incluido).
    if (this.controls) {
      if (!this.controls.step()) this.closeControls();
      return;
    }
    // Panel de movimientos abierto sobre la pausa: Esc o volver lo cierra.
    if (this.moveList) {
      if (pausePressed || mi.back || mi.confirm) {
        this.closeMoveList();
        g.sfx.play('menuBack');
        return;
      }
      if (mi.up || mi.down || mi.left || mi.right) g.sfx.play('menuMove');
      this.moveList.step(mi, g.kb);
      return;
    }
    if (mi.up || mi.down) {
      const n = PAUSE_OPTIONS.length;
      this.pauseSel = (this.pauseSel + (mi.up ? n - 1 : 1)) % n;
      g.sfx.play('menuMove');
    }
    const resume = pausePressed || (mi.confirm && this.pauseSel === 0);
    if (resume) {
      this.paused = false;
      this.pauseUi.visible = false;
      g.sfx.play('pause');
      return;
    }
    if (mi.confirm && this.pauseSel === 1) {
      g.sfx.play('menuConfirm');
      this.moveList = new MoveListPanel(g.assets, 0);
      g.display.overlay.addChild(this.moveList.container);
      this.pauseUi.visible = false;
      return;
    }
    if (mi.confirm && this.pauseSel === 2) {
      g.sfx.play('menuConfirm');
      this.controls = new ControlsPanel(g, true);
      g.display.overlay.addChild(this.controls.container);
      this.pauseUi.visible = false;
      return;
    }
    if (mi.confirm && this.pauseSel === 3) {
      g.sfx.play('menuBack');
      g.setScene(new TitleScene(g));
    }
  }

  private closeMoveList(): void {
    if (!this.moveList) return;
    this.game.display.overlay.removeChild(this.moveList.container);
    this.moveList.destroy();
    this.moveList = null;
    this.pauseUi.visible = this.paused;
  }

  private closeControls(): void {
    if (!this.controls) return;
    this.game.display.overlay.removeChild(this.controls.container);
    this.controls.destroy();
    this.controls = null;
    this.pauseUi.visible = this.paused;
  }

  private handleEvents(): void {
    const m = this.match;
    const sfx = this.game.sfx;
    const camLeft = m.camX - VIEW_W / 2;
    const pan = (x: number) => ((x - camLeft) / VIEW_W) * 1.2 - 0.6;
    for (const e of m.events) {
      switch (e.type) {
        case 'hit':
          this.fx.hit(e.x, e.y, e.dir, e.spark);
          sfx.play(e.spark === 'light' ? 'hitLight' : e.spark === 'heavy' ? 'hitHeavy' : 'hitSuper', { pan: pan(e.x) });
          this.addShake(e.spark === 'light' ? 1.2 : e.spark === 'heavy' ? 2.6 : 3.6);
          this.elementalHit(e);
          break;
        case 'block':
          this.fx.block(e.x, e.y, e.dir);
          sfx.play('block', { pan: pan(e.x) });
          this.addShake(0.8);
          break;
        case 'attack':
          if (!e.special) sfx.play(e.heavy ? 'whooshH' : 'whooshL', { vol: 0.7 });
          break;
        case 'jump':
          sfx.play(e.kind === 'super' ? 'superJump' : 'jump');
          this.fx.dust(e.x, 0, e.kind === 'super' ? 10 : e.kind === 'short' ? 2 : 4, e.kind === 'super');
          break;
        case 'roll':
          sfx.play('roll');
          this.fx.dust(e.x, 0, 6, false);
          break;
        case 'powerMode':
          if (e.on) {
            this.fx.superBurst(e.x, e.y, e.color);
            sfx.play('powerUp');
            this.addShake(2.5);
          } else {
            this.fx.explosion(e.x, e.y, e.color, false);
            sfx.play('powerEnd');
          }
          break;
        case 'guardCancel':
          this.fx.clash(e.x, e.y);
          sfx.play('guardCancel');
          this.addShake(2);
          break;
        case 'launch':
          this.fx.launch(e.x, e.y);
          sfx.play('launch', { pan: pan(e.x) });
          break;
        case 'land':
          sfx.play(e.heavy ? 'landHeavy' : 'land', { vol: e.heavy ? 1 : 0.6 });
          this.fx.dust(e.x, 0, e.heavy ? 12 : 5, e.heavy);
          if (e.heavy) this.addShake(2);
          break;
        case 'projectile':
          sfx.play('fireball', { pan: pan(e.x) });
          this.fx.explosion(e.x, e.y, e.color, false);
          break;
        case 'projectileEnd':
          this.fx.explosion(e.x, e.y, e.color, e.big);
          sfx.play('explosion', { pan: pan(e.x) });
          break;
        case 'clash':
          this.fx.clash(e.x, e.y);
          break;
        case 'superFlash': {
          this.fx.superBurst(e.x, e.y, e.color);
          if (e.sound) sfx.play(`${e.id ?? m.fighters[e.side].def.id}/${e.sound}`);
          if (e.song) {
            // El pedazo de la canción del súper (René: "2 Shipitia"), por el canal de su voz.
            const who = e.id ?? m.fighters[e.side].def.id;
            sfx.play(`${who}/${e.song}`, { channel: who });
          }
          this.zoomT = 40;
          this.startLights();
          const sx = e.x - camLeft;
          const sy = GROUND_SCREEN_Y + e.y + this.camOffY;
          const p = this.game.display.root.toGlobal({ x: sx, y: sy });
          const r = this.game.display.app.renderer.resolution;
          this.zoom.center = [p.x * r, p.y * r];
          break;
        }
        case 'ko':
          this.fx.ko(e.x, e.y);
          this.addShake(7);
          break;
        case 'grab':
          sfx.play('grab');
          break;
        case 'throw':
          sfx.play('throw');
          break;
        case 'tech':
          this.fx.clash(e.x, e.y);
          sfx.play('clash');
          break;
        case 'sfx': {
          // Primero los sonidos propios del luchador (en 2 VS 2 puede ser la ayuda), luego los genéricos.
          const who = e.who ?? (e.side !== undefined ? m.fighters[e.side].def.id : '');
          const own = who ? `${who}/${e.name}` : '';
          // Las voces de un luchador van por su canal: la del último poder corta a la anterior
          // (las de los tramos del ultra, con `wait`, esperan su turno para sonar en fila).
          const voz = own.includes('/voz/');
          if (own && sfx.has(own)) sfx.play(own, !voz ? {} : e.wait ? { channel: who, mode: 'queue', maxWait: e.wait } : { channel: who });
          else sfx.play(e.name);
          if (who && (e.name === 'voz/remate' || e.name === 'voz/ultra') && sfx.has(own)) this.lineAt.set(who, this.t);
          break;
        }
        case 'announce': {
          // Voz del anunciador: "ROUND ONE", "FIGHT!", "K.O."...
          const v = announcerVoice(e.kind, e.text);
          if (v) {
            sfx.play(v);
            this.announcerAt = this.t;
          }
          break;
        }
        case 'comboEnd':
          if (!e.broken && e.hits >= 3) this.comboVoice(e.by ?? m.fighters[e.side].def.id, e.hits, !!e.ultra);
          break;
        case 'comboBreaker': {
          this.fx.superBurst(e.x, e.y, 0x40a0ff);
          this.fx.clash(e.x, e.y);
          sfx.play('guardCancel');
          sfx.play('clash');
          this.addShake(5);
          // Voz: la del luchador que lo rompe si la tiene; si no, la del anunciador.
          const own = `${m.fighters[e.side].def.id}/${COMBO_BREAKER.voice}`;
          this.queueVoice(sfx.has(own) ? own : COMBO_BREAKER.voice, 0);
          break;
        }
        case 'lockout':
          sfx.play('menuBack', { vol: 0.9 });
          break;
        case 'remate':
          this.fx.superBurst(e.x, e.y, 0xffd040);
          this.addShake(4);
          this.hud.showToast('¡REMATE!');
          break;
        case 'ultraStart': {
          this.addShake(4);
          this.zoomT = 30;
          const p = this.game.display.root.toGlobal({ x: e.x - camLeft, y: GROUND_SCREEN_Y + e.y + this.camOffY });
          const r = this.game.display.app.renderer.resolution;
          this.zoom.center = [p.x * r, p.y * r];
          break;
        }
        case 'ultraHit': {
          this.addShake(e.final ? 7 : 2.4);
          // Ultra de tormenta (el Flaitiano): chispas en cada golpe; al final el piquero con géiser y rayo.
          const owner = this.allFighters().find((f) => f.side === e.side && f.ultraRun);
          const stormy = !!owner && owner.def.moves[owner.ultraRun!.moveId]?.cinematic?.lights === 'tormenta';
          if (stormy) {
            this.fx.electric(e.x, e.y, e.final ? 20 : 6);
            if (e.final) this.stormFinale(owner!, e.x);
          }
          if (e.final) {
            this.fx.superBurst(e.x, e.y, 0xffd040);
            this.fx.explosion(e.x, e.y, 0xff5a3a, true);
            sfx.play('explosion', { pan: pan(e.x) });
          }
          break;
        }
        case 'tag':
          // 2 VS 2: cambio, ayuda, entrada tras un K.O. o súper en equipo.
          sfx.play(e.kind === 'ayuda' ? 'jump' : e.kind === 'superEquipo' ? 'powerUp' : 'superJump', { pan: pan(e.x) });
          if (e.kind === 'superEquipo') this.addShake(2);
          break;
        default:
          break;
      }
      this.hud.onEvent(e);
      // 2 VS 2: el regalo del combo muestra a quien pega (punto o ayuda).
      if (e.type === 'hit' && e.by && m.teams) {
        const def = this.allFighters().find((f) => f.def.id === e.by)?.def;
        if (def) this.live.useFighter(e.side, def);
      }
      this.live.onEvent(e, m);
    }
    m.events.length = 0;
  }

  /**
   * Voz al terminar un combo de 3 golpes o más: la frase propia de quien lo hizo
   * según el tramo (corto, medio, largo, viral; el ultra la suya o la viral). Si
   * acaba de decir su frase de REMATE o de ULTRA, no se apila otra. Si el
   * luchador no tiene frase, la del anunciador (si existe).
   */
  private comboVoice(who: string, hits: number, ultra: boolean): void {
    const sfx = this.game.sfx;
    const tier = comboNameFor(hits);
    if (!tier && !ultra) return;
    const lines = ultra ? [ULTRA_COMBO.line, 'voz/combo-viral'] : [tier!.line];
    const own = lines.map((l) => `${who}/${l}`).find((n) => sfx.has(n));
    if (own) {
      const last = this.lineAt.get(who);
      if (last !== undefined && this.t - last < LINE_GAP) return;
      // Por el canal del luchador: no corta otra frase suya (solo suena si está callado; en el ultra va al final de la fila).
      this.queueVoice(own, AFTER_ANNOUNCER, who, ultra ? 1.5 : 0);
      return;
    }
    const fallback = ultra ? ULTRA_COMBO.voice : tier!.voice;
    if (sfx.has(fallback)) this.queueVoice(fallback, AFTER_ANNOUNCER);
  }

  /** Pone una voz en espera: sale apenas el anunciador lleva `gap` cuadros callado (con canal: sin pisar al luchador). */
  private queueVoice(name: string, gap: number, channel?: string, wait?: number): void {
    this.pendingVoices.push({ name, at: Math.max(this.t, this.announcerAt + gap), channel, wait });
  }

  private stepVoices(): void {
    for (let i = this.pendingVoices.length - 1; i >= 0; i--) {
      const v = this.pendingVoices[i];
      if (this.t < v.at) continue;
      this.pendingVoices.splice(i, 1);
      // Si esperó demasiado (más de 3 s), ya no tiene sentido.
      if (this.t - v.at < 180) {
        this.game.sfx.play(v.name, v.channel ? { channel: v.channel, mode: v.wait ? 'queue' : 'ifFree', maxWait: v.wait } : {});
      }
    }
  }

  /** Un corazón sube desde la esquina de abajo del lado de quien pega (en la capa de efectos). */
  private spawnHeart(side: 0 | 1, color: number): void {
    const camLeft = this.match.camX - VIEW_W / 2;
    const sx = side === 0 ? 16 + Math.random() * 46 : VIEW_W - 16 - Math.random() * 46;
    const sy = 228 + Math.random() * 8;
    this.fx.heart(camLeft + sx, sy - GROUND_SCREEN_Y - this.camOffY, color);
  }

  /** Efectos de agua y rayos al pegar, letras de cómic y el combo que se electrifica. */
  private elementalHit(e: Extract<SimEvent, { type: 'hit' }>): void {
    const m = this.match;
    const att = this.allFighters().find((f) => f.side === e.side && f.def.id === e.by) ?? m.fighters[e.side];
    const vic = m.fighters[e.side === 0 ? 1 : 0];
    if (e.look === 'rayo') {
      this.views.get(vic)?.electrify(30);
      this.fx.electric(e.x, e.y, 14);
      this.addShake(4);
    } else if (e.look === 'rastas') {
      this.fx.splash(e.x, e.y, true);
      if (e.last) this.fx.geyser(e.x, 0, 120);
    } else if (e.look === 'tornado') {
      this.fx.splash(e.x, e.y, true);
      this.fx.electric(e.x, e.y, 6);
      if (e.last) this.stormFinale(att, vic.x);
    }
    // Letras de cómic (¡TOC!) de los movimientos que las tienen, una por golpe.
    const mv = e.move ? att.def.moves[e.move] : undefined;
    if (e.move && mv?.hitText?.length) {
      const prev = this.moveHits.get(att);
      const n = prev && prev.move === e.move && att.state === 'attack' ? prev.n + 1 : 0;
      this.moveHits.set(att, { move: e.move, n });
      this.comic(mv.hitText[Math.min(n, mv.hitText.length - 1)], e.x + 18, e.y - 46);
      if (this.game.sfx.has(`${att.def.id}/toc`)) this.game.sfx.play(`${att.def.id}/toc`);
    }
    // Combo eléctrico: chispas desde 3 golpes, brillo de las rastas desde 5, agua desde 8, rayos desde 12.
    if (att.def.comboFx === 'electrico' && e.combo >= 3) {
      this.fx.electric(e.x, e.y, 3 + Math.min(e.combo, 12));
      if (e.combo >= 5) for (let i = 0; i < 2; i++) this.fx.aura(att.x - att.facing * 16, att.y - 112, 0x34e070);
      if (e.combo >= 8) {
        this.fx.splash(e.x, e.y, true);
        this.addShake(2);
      }
      if (e.combo >= 12) {
        this.storm.strike(true);
        this.impact = Math.max(this.impact, 2);
      }
    }
  }

  /** Remate del súper o ultra de tormenta: rayo gigante, géiser, negativo y trueno. */
  private stormFinale(owner: Fighter, x: number): void {
    this.bigBoltT = 16;
    this.bigBoltX = x;
    this.impact = 5;
    this.storm.strike(true);
    this.addShake(9);
    this.fx.geyser(x, 0, 170);
    this.fx.electric(x, -80, 22);
    const vic = this.match.fighters[owner.side === 0 ? 1 : 0];
    this.views.get(vic)?.electrify(45);
    const id = `${owner.def.id}/trueno`;
    if (this.game.sfx.has(id)) this.game.sfx.play(id);
  }

  /** Letras de cómic que saltan y se desvanecen (en el mundo, sobre los luchadores). */
  private comic(text: string, x: number, y: number): void {
    const t = outlinedText(text, 12, 0xfff4b0, 0x2a0a10, 3);
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() * 10 - 5), y);
    t.rotation = Math.random() * 0.5 - 0.25;
    this.world.addChild(t);
    this.comics.push({ text: t, life: 32 });
  }

  /** Por cuadro de simulación: truenos de los rayos que caen, letras de cómic y cuentas de los efectos. */
  private stepElemental(): void {
    for (const p of this.projViews.strikes) {
      const id = `${p.owner.def.id}/trueno`;
      if (this.game.sfx.has(id)) this.game.sfx.play(id);
      this.storm.strike(false);
      this.addShake(5);
      this.fx.electric(p.x, -12, 10);
    }
    if (this.impact > 0) this.impact--;
    if (this.bigBoltT > 0) this.bigBoltT--;
    for (let i = this.comics.length - 1; i >= 0; i--) {
      const c = this.comics[i];
      c.life--;
      c.text.y -= 0.5;
      const pop = Math.max(0, c.life - 26) / 6;
      c.text.scale.set(1 + pop * 0.6);
      c.text.alpha = Math.min(1, c.life / 10);
      if (c.life <= 0) {
        c.text.destroy();
        this.comics.splice(i, 1);
      }
    }
  }

  /** Escenario de reemplazo del ultra que corre (si tiene uno y ya cargó). */
  private activeBackdrop(): StageView | null {
    if (!this.match.ultraActive) return null;
    const o = this.allFighters().find((f) => f.ultraRun);
    const id = o ? o.def.moves[o.ultraRun!.moveId]?.cinematic?.backdrop : undefined;
    return (id && this.backdrops.get(id)) || null;
  }

  /** Por cuadro dibujado: el negativo del impacto, el rayo gigante y el tarro en la cabeza del rival. */
  private renderElemental(): void {
    const m = this.match;
    this.negative.enabled = this.impact > 0;
    this.bigBolt.clear();
    if (this.bigBoltT > 0) {
      const a = Math.min(1, this.bigBoltT / 8);
      const top = -(GROUND_SCREEN_Y + this.camOffY) - 10;
      const x = this.bigBoltX;
      bolt(this.bigBolt, x + (Math.random() * 30 - 15), top, x, 0, 6, a, 6);
      bolt(this.bigBolt, x + (Math.random() * 60 - 30), top, x + (Math.random() * 8 - 4), 0, 3, a * 0.7, 3);
    }
    this.overlayG.clear();
    for (const f of this.allFighters()) {
      if (f.state !== 'attack' || !f.connected || f.move?.hitOverlay !== 'tarro') continue;
      const vic = m.opponent(f);
      const boxes = vic.hurtboxes().map((h) => vic.worldBox(h));
      if (!boxes.length) continue;
      const head = boxes.reduce((a, b) => (b.y0 < a.y0 ? b : a));
      drawTarro(this.overlayG, (head.x0 + head.x1) / 2, head.y0);
    }
  }

  private addShake(a: number): void {
    this.shake = Math.max(this.shake, a);
  }

  /** Súper con show de luces (cinematic.lights): parte con el congelamiento del cartel. */
  private startLights(): void {
    const o = this.match.freezeOwner;
    const mv = o?.move;
    const lights = mv?.cinematic?.lights;
    if (!o || !mv?.cinematic || !lights) return;
    this.lightsKind = lights;
    this.discoOwner = o;
    this.discoProj = mv.projectile ? o.def.projectiles[mv.projectile] ?? null : null;
    this.discoT = 0;
    // Se mantiene un poco después del cartel aunque el súper termine rápido (el rival todavía va volando).
    const freeze = mv.cinematic.freeze;
    this.discoMin = freeze + 110;
    this.discoMax = freeze + 210;
    // La bola baja justo cuando se va el cartel; la tormenta parte de inmediato.
    if (lights === 'disco') this.disco.start(Math.max(0, freeze - 18));
    else this.storm.start();
  }

  /** Las luces siguen mientras duran el cartel, la animación del súper y su proyectil (máximo ~3,5 s después del cartel). */
  private stepLights(): void {
    const m = this.match;
    const o = this.discoOwner;
    if (o) {
      this.discoT++;
      const frozen = m.freeze > 0 && m.freezeOwner === o;
      const anim = (o.state === 'attack' && o.move?.kind === 'super') || !!o.ultraRun;
      const proj = !!this.discoProj && m.projectiles.some((p) => !p.dead && p.owner === o && p.def === this.discoProj);
      const running = frozen || anim || proj || this.discoT < this.discoMin;
      if (!running || (this.discoT > this.discoMax && !o.ultraRun)) {
        this.discoOwner = null;
        if (this.lightsKind === 'disco') this.disco.stop();
        else this.storm.stop();
      }
    }
    this.disco.step();
    this.storm.step();
  }

  render(): void {
    const m = this.match;
    const d = this.game.display;
    const camLeft = m.camX - VIEW_W / 2;
    // La cámara sube un poco cuando alguien salta alto (no con el que va cayendo a la pantalla en 2 VS 2).
    let minY = 0;
    for (const f of m.fighters) if (!f.entering) minY = Math.min(minY, f.y);
    const top = Math.max(0, -minY);
    const target = Math.max(0, Math.min(60, (top - 30) * 0.6));
    this.camOffY += (target - this.camOffY) * 0.15;
    // Cámara y temblor en unidades de mundo, ajustados a la grilla de pixeles reales.
    const sx = this.shake > 0 ? snap((Math.random() * 2 - 1) * this.shake) : 0;
    const sy = this.shake > 0 ? snap((Math.random() * 2 - 1) * this.shake * 0.6) : 0;
    const wx = snap(-camLeft + sx);
    const wy = snap(GROUND_SCREEN_Y + this.camOffY + sy);
    this.world.position.set(wx, wy);
    d.fx.position.set(wx, wy);
    // El ultra de otro lugar cambia el escenario mientras dura.
    const backdrop = this.activeBackdrop();
    const stage = backdrop ?? this.game.assets.stage;
    if (stage !== this.shownStage) {
      d.world.removeChild(this.shownStage.container);
      d.world.addChildAt(stage.container, 0);
      this.shownStage = stage;
    }
    stage.setDarkness(backdrop ? Math.min(this.dark, 0.3) : this.dark);
    stage.update(camLeft - sx, this.camOffY + sy);
    this.disco.update(this.camOffY + sy);
    this.storm.update(this.camOffY + sy);
    this.renderElemental();
    for (const [f, v] of this.views) {
      // En 2 VS 2 se ven el punto y los extras (ayuda, el que sale, el caído que se desvanece).
      const point = m.fighters[0] === f || m.fighters[1] === f;
      const ex = point || !m.extras.length ? null : m.extraOf(f);
      v.visible = point || !!ex;
      if (!v.visible) continue;
      v.alpha = ex?.role === 'dead' ? Math.max(0, Math.min(1, (DEAD_LINGER - ex.t) / 20)) : 1;
      v.sprite.zIndex = point ? (f.side === 0 ? 4 : 3) : f.side === 0 ? 2 : 1;
      v.update();
    }
    this.projViews.update(m);
    this.updatePowerGlows();
    this.fx.sync();
    this.hud.update(m, camLeft, this.camOffY);
    this.live.update(m);
    this.zoom.enabled = this.zoomT > 0;
    this.zoom.strength = (this.zoomT / 40) * 0.14;
    if (this.paused) this.paintPause();
    this.controls?.render();
    this.drawDebug();
  }

  /** Brillo que late alrededor del luchador mientras dura el Modo Poder. */
  private updatePowerGlows(): void {
    const m = this.match;
    m.fighters.forEach((f, i) => {
      let g = this.powerGlows[i];
      if (f.powerTimer > 0) {
        if (!g) g = this.powerGlows[i] = this.fx.makeGlow(f.def.ui.fx, 58);
        g.visible = true;
        g.position.set(f.x, f.y - 72);
        // Parpadea en los últimos 1,5 segundos para avisar que se acaba.
        const ending = f.powerTimer < 90 && Math.floor(f.powerTimer / 6) % 2 === 0;
        g.alpha = ending ? 0.12 : 0.32 + Math.sin(m.frame * 0.25) * 0.1;
      } else if (g) {
        g.visible = false;
      }
    });
  }

  private drawDebug(): void {
    const g = this.debugG;
    g.clear();
    const dbg = this.game.debug;
    const m = this.match;
    if (dbg.boxes) {
      for (const f of [...m.fighters, ...m.extras.map((e) => e.f)]) {
        const pb = f.worldBox(f.pushbox());
        g.rect(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0).stroke({ color: 0xffff40, width: 0.5 });
        for (const h of f.hurtboxes()) {
          const b = f.worldBox(h);
          g.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).fill({ color: 0x40a0ff, alpha: 0.18 }).stroke({ color: 0x40a0ff, width: 0.5 });
        }
        if (f.state === 'attack') {
          for (const h of f.frame.hit ?? []) {
            const b = f.worldBox(h);
            g.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).fill({ color: 0xff3030, alpha: 0.3 }).stroke({ color: 0xff3030, width: 0.5 });
          }
        }
        g.circle(f.x, f.y, 1.5).fill(0xffffff);
      }
      for (const p of m.projectiles) {
        if (p.dead) continue;
        const b = p.box();
        g.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).fill({ color: 0xff9020, alpha: 0.3 }).stroke({ color: 0xff9020, width: 0.5 });
      }
    }
    const dt = this.hud.debug;
    dt.visible = dbg.info;
    if (dbg.info) {
      const lines: string[] = [];
      m.fighters.forEach((f, i) => {
        lines.push(`J${i + 1} ${f.state} ${f.animName}[${f.frameIdx}] ${f.frameTime}/${f.frame.dur}${f.move ? ' ' + f.moveId : ''}`);
        lines.push(`   x${Math.round(f.x)} y${Math.round(f.y)} vida${f.health} súper${Math.floor(f.meter)} hs${f.hitstop} st${f.stun} combo${f.comboHits}`);
      });
      lines.push(`cuadro ${m.frame} ${m.phase} round${m.round} cong${m.freeze} fps${Math.round(this.game.display.app.ticker.FPS)}`);
      dt.text = lines.join('\n');
    }
  }
}

/** Un tarro de lata sobre la cabeza (¡Cabeza de tarro!): cilindro con aros, etiqueta roja y brillo. */
function drawTarro(g: Graphics, cx: number, top: number): void {
  const w = 30;
  const h = 26;
  const x = cx - w / 2;
  // Calzado en la cabeza: tapa la coronilla y baja hasta la frente.
  const y = top - 4;
  g.rect(x, y, w, h).fill({ color: 0xb4bec8 }).stroke({ width: 1.2, color: 0x24242c });
  g.rect(x, y + h * 0.36, w, h * 0.3).fill({ color: 0xd8402a });
  for (let i = 1; i < 4; i++) g.moveTo(x, y + (i * h) / 4).lineTo(x + w, y + (i * h) / 4).stroke({ width: 0.7, color: 0x6e7884 });
  g.rect(x + 3, y + 2, 2.4, h - 4).fill({ color: 0xffffff, alpha: 0.55 });
  g.ellipse(cx, y, w / 2, 4).fill({ color: 0xdfe6ec }).stroke({ width: 1.2, color: 0x24242c });
}
