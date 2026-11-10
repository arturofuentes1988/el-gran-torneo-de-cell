import { ZoomBlurFilter } from 'pixi-filters';
import { ColorMatrixFilter, Container, Graphics, type Sprite, type Text } from 'pixi.js';
import { GROUND_SCREEN_Y, MAX_METER, VIEW_H, VIEW_W } from '../config';
import type { FightMode, Game, Scene } from '../app/game';
import { reportarError } from '../app/errores';
import { loadDifficulty } from '../app/settings';
import { announcerVoice } from '../audio/announcer';
import { COMBO_BREAKER, ULTRA_COMBO, comboNameFor } from '../render/comboNames';
import type { FrameInput } from '../input/buffer';
import { P1_KEYS, P2_KEYS, PlayerInput, type KeyBindings } from '../input/devices';
import { mandosDePelea, mandosDePractica, tactil } from '../input/touch';
import { FighterView, ProjectileViews, type WorldLayers } from '../render/fighterView';
import { DiscoShow } from '../render/disco';
import { StormShow, bolt } from '../render/elemental';
import { Grieta, PartyShow, UltraShow, drawMareo, drawRemolino } from '../render/fuego';
import { FxLayer } from '../render/fx';
import { Hud, type PracticeHudInfo } from '../render/hud';
import { drawCambiaFrente } from '../render/lab';
import { LiveShow } from '../render/live';
import { Smears } from '../render/smear';
import { MoveListPanel } from '../render/moveListPanel';
import { ControlsPanel } from './controls';
import { COSTUME_COUNT } from '../render/costume';
import { vfxFrames } from '../content/vfx';
import { snap } from '../render/scale';
import type { StageView } from '../render/stage';
import { outlinedText } from '../render/text';
import { CpuController } from '../sim/ai';
import type { DifficultyId } from '../sim/difficulty';
import { DUMMY_MODES, DUMMY_NAME, PracticeDummy } from '../sim/dummy';
import type { Fighter, StateName } from '../sim/fighter';
import { DEAD_LINGER, Match } from '../sim/match';
import type { SimEvent } from '../sim/events';
import type { FighterDef, LightsKind, ProjectileDef, SuperCinematic } from '../sim/types';
import { SesionRollback } from '../online/rollback';
import type { Sala } from '../online/sala';
import { MainMenuScene } from './modeSelect';

/**
 * Cuadros que el round 1 espera las frases de entrada de los dos luchadores (una después de la
 * otra), según el largo de sus audios. En línea lo calcula quien creó la sala y se lo manda al otro.
 */
export function esperaDeEntrada(game: Game, defs: readonly FighterDef[]): number {
  const len = defs.reduce((t, d) => {
    const l = game.sfx.duration(`${d.id}/voz/intro`);
    return t + (l > 0 ? l + 0.3 : 0);
  }, 0);
  return len > 0 ? Math.round((len + 0.1) * 60) : 0;
}

/** En línea: el rival lleva más de esto sin mandar sus controles y se avisa en pantalla (cuadros). */
const AVISO_ESPERA = 20;
/** En línea: cuadros entre dos saltos para que el otro computador alcance. */
const CADA_FRENO = 8;

/** Estados en que un luchador todavía está "dentro" de un combo o recuperándose. */
const BUSY: ReadonlySet<StateName> = new Set<StateName>(['hitstun', 'airHit', 'knockdown', 'getup', 'blockstun', 'thrown', 'pinned']);
/** Cuadros (de pantalla) en que no se apilan dos frases del mismo luchador (~1,2 s). */
const LINE_GAP = 72;
/** Cuadros que espera una frase de combo si el anunciador acaba de hablar (K.O., etc.). */
const AFTER_ANNOUNCER = 54;
/** Cuadros mínimos entre dos gritos o quejidos automáticos del mismo luchador (~0,8 s). */
const GRUNT_GAP = 48;
/** Segundos que la frase del combo espera a que el luchador termine la frase de su poder. */
const COMBO_WAIT = 3;
/** Cuadros de calma antes de que la vida se recupere en práctica (~1 segundo). */
const REFILL_DELAY = 60;

/** Estado del modo práctica (opciones y lectura del combo). */
type PracticeState = PracticeHudInfo;

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

type OpcionPausa = 'CONTINUAR' | 'REINICIAR COMBATE' | 'MOVIMIENTOS' | 'CONTROLES' | 'SALIR AL MENÚ' | 'SALIR DE LA SALA';
const PAUSE_OPTIONS: readonly OpcionPausa[] = ['CONTINUAR', 'REINICIAR COMBATE', 'MOVIMIENTOS', 'CONTROLES', 'SALIR AL MENÚ'];
/** En línea no hay pausa (el otro sigue jugando): el menú se abre sobre la pelea, que sigue. */
const ONLINE_OPTIONS: readonly OpcionPausa[] = ['CONTINUAR', 'MOVIMIENTOS', 'CONTROLES', 'SALIR DE LA SALA'];
/**
 * Menú de pausa (mismo estilo que los menús: una barra inclinada por opción). Grande para tocarlo
 * en el celular: cada fila mide P_ROW unidades (~45 px en un celular horizontal) y toda la fila cuenta.
 */
const P_FONT = 11;
const P_ROW = 31;
const P_BAR = 24;
const P_W = 252;
const P_PAD = 10;
const P_X = Math.round((VIEW_W - P_W) / 2);
/** Alto del panel y su borde de arriba, según cuántas opciones tenga. */
const pauseH = (n: number): number => P_PAD * 2 + (n - 1) * P_ROW + P_BAR;
const pauseY = (n: number): number => Math.round((VIEW_H - pauseH(n)) / 2) + 8;
/** Botón ☰ MENÚ de la pelea en línea en el computador (en el celular está el ☰ de siempre). */
const MENU_BTN = { x: VIEW_W / 2 - 34, y: VIEW_H - 27, w: 68, h: 13 };
const NEUTRO: FrameInput = { dir: 5, held: 0, pressed: 0 };

/** Colores para distinguir a un luchador repetido en la misma pelea (el primero va sin cambio). */

/**
 * Opciones de la pelea (índices de game.assets.roster). teams: 2 VS 2, los de cada equipo.
 * fighters: 1 VS 1, el del jugador 1 y el del 2 (si falta, la pareja por defecto de assets.fighters).
 */
interface FightOptions {
  teams?: [number[], number[]];
  fighters?: [number, number];
  /** Color de ropa de cada lado (0 = el original), elegido en ELIGE LUCHADOR. */
  colors?: [number, number];
  /** Dificultad de la CPU para esta pelea (ARCADE la sube de a poco); si falta, la guardada. */
  difficulty?: DifficultyId;
  /** Qué viene al terminar (ARCADE: la siguiente pelea o CONTINUAR; frames = lo que duró); si falta, el menú principal. */
  next?: (winner: 0 | 1 | -1, frames: number) => Scene;
  /** Un solo round (la DEMOSTRACIÓN cambia de luchadores en cada uno). */
  singleRound?: boolean;
  /** DEMOSTRACIÓN: adónde vuelve al apretar aceptar o volver. */
  exit?: () => Scene;
  /** En línea: la sala y la espera de las frases de entrada (la misma en los dos computadores). */
  online?: { sala: Sala; intro: number; salir: (error: string | null) => Scene };
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
  /** Estelas de los golpes normales (en la capa con brillo de los efectos). */
  private smears = new Smears();
  /** Show de luces de los súpers con cinematic.lights = 'disco' (detrás de los luchadores). */
  private disco = new DiscoShow();
  /** Discoteca de neón rojo del súper de Carlitos Run (cinematic.lights = 'neon'). */
  private neon = new DiscoShow([0xff1a1a, 0xff5a2a, 0xff2a7a, 0xffc890, 0xd01030]);
  private discoOwner: Fighter | null = null;
  private discoProj: ProjectileDef | null = null;
  private discoT = 0;
  /** Cuadros mínimos y máximos del show (desde que empieza el cartel). */
  private discoMin = 0;
  private discoMax = 0;
  /** Tormenta de los súpers con cinematic.lights = 'tormenta' (el Flaitiano). */
  private storm = new StormShow();
  /** Ultra instinto y fiesta del Vendedor de Leña (cinematic.lights = 'ultrainstinto' / 'fiesta'). */
  private ultraShow = new UltraShow();
  private party = new PartyShow();
  private lightsKind: LightsKind = 'disco';
  /** La pantalla que se triza con el remate del súper del Vendedor de Leña. */
  private grieta = new Grieta();
  /** Fuego que brilla encima de los luchadores (el remolino de "¡Te paseo!"). */
  private fireG = new Graphics();
  /** Cuadros que le quedan mareado a cada luchador (las estrellitas del silbido). */
  private dizzy = new Map<Fighter, number>();
  /** Cuadros de "cuadro de impacto" (la imagen en negativo) después de un golpe enorme. */
  private impact = 0;
  private negative = new ColorMatrixFilter();
  /** Rayo gigante del remate de un súper o ultra de tormenta: dónde y cuántos cuadros le quedan. */
  private bigBolt = new Graphics();
  private bigBoltT = 0;
  private bigBoltX = 0;
  /** Letras de cómic de los golpes (¡TOC!), en el mundo. */
  private comics: Array<{ text: Text; life: number }> = [];
  /** Sellos dorados de "¡EL AUTÉNTICO!" (Maki Gero): caen como un timbrazo y se apagan. */
  private sellos: Array<{ view: Container; life: number }> = [];
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
  /** Golpe fuerte: un tirón corto del zoom hacia el impacto y un destello de pantalla. */
  private punchT = 0;
  private punchMax = 1;
  private punchFlash = new Graphics();
  private paused = false;
  private pauseSel = 0;
  private moveList: MoveListPanel | null = null;
  private controls: ControlsPanel | null = null;
  private pauseUi = new Container();
  private pauseItems: Text[] = [];
  private pauseBar = new Graphics();
  private pauseGlow = new Graphics();
  private pauseCursor = outlinedText('>', P_FONT, 0xffd040, 0x5a0a10, 2);
  /** Lado de quien pausó (1 VS 1 entre dos con el joystick 2: J2); MOVIMIENTOS abre en su luchador. */
  private pausedBy: 0 | 1 = 0;
  private pauseT = 0;
  /** Opciones del menú de esta pelea (en línea, sin reiniciar y saliendo de la sala). */
  private readonly opciones: readonly OpcionPausa[];
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
  /** Cuándo gritó o se quejó por última vez cada luchador (para no repetirlo en cada golpe). */
  private gruntAt = new Map<string, number>();
  /** Cuándo habló por última vez el anunciador. */
  private announcerAt = -999;
  /** Voces que esperan su turno (la frase del combo después del "K.O."). */
  private pendingVoices: Array<{ name: string; at: number; channel?: string; wait?: number }> = [];
  /** Puente de pruebas: entradas forzadas por lado (una por cuadro de simulación). */
  readonly qaInputs: [FrameInput[], FrameInput[]] = [[], []];
  /** En línea: la sesión con rollback (null en las demás peleas). */
  readonly sesion: SesionRollback | null = null;
  /** En línea: aviso arriba al centro (esperando al rival, salir, conexión cortada) y el ping. */
  private onlineUi = new Container();
  private onlineText = outlinedText('', 9, 0xffffff, 0x0a0610, 2);
  private pingText = outlinedText('', 6, 0xb8b0c8, 0x0a0610, 1);
  /** Cuadros seguidos esperando los controles del rival. */
  private esperaT = 0;
  /** Cuadros desde el último salto para emparejar la velocidad. */
  private frenoT = 0;
  /** Cuadros que queda en pantalla el aviso de la conexión cortada antes de salir. */
  private cortadaT = 0;

  constructor(
    private game: Game,
    private mode: FightMode,
    seed = (Date.now() & 0xffff) + 1,
    private opts: FightOptions = {},
  ) {
    this.seed = seed;
    this.opciones = opts.online ? ONLINE_OPTIONS : PAUSE_OPTIONS;
    this.difficulty = mode === 'demo' ? opts.difficulty ?? 'normal' : opts.difficulty ?? loadDifficulty();
    // 2 VS 2: los luchadores de cada equipo salen del plantel; el primero de cada uno parte peleando.
    const roster = game.assets.roster;
    const pick = (idx: number[]) => idx.map((i) => roster[i]?.def).filter((d): d is FighterDef => !!d);
    const teamDefs: [FighterDef[], FighterDef[]] | null =
      opts.teams && mode !== 'practica' ? [pick(opts.teams[0]), pick(opts.teams[1])] : null;
    const teams = teamDefs && teamDefs[0].length && teamDefs[1].length ? teamDefs : null;
    const chosen = opts.fighters ? pick(opts.fighters) : [];
    const pair = chosen.length === 2 ? chosen : [game.assets.fighters[0].def, game.assets.fighters[1].def];
    const defs = teams ? ([teams[0][0], teams[1][0]] as const) : ([pair[0], pair[1]] as const);
    // Las frases de entrada de los dos suenan una después de la otra, y después el "ROUND 1".
    // En línea la espera viene de la sala: el largo de un audio puede variar un poco entre navegadores.
    const introDelay = opts.online ? opts.online.intro : esperaDeEntrada(game, [defs[0], defs[1]]);
    this.match = new Match(defs, seed, { practice: mode === 'practica', teams: teams ?? undefined, introDelay, singleRound: opts.singleRound });
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
    } else if (opts.online) {
      // En línea: el jugador maneja su lado con cualquiera de sus controles; el otro lo trae la red.
      const sala = opts.online.sala;
      const yo = human(mergeKeys(P1_KEYS, P2_KEYS), 0);
      const nadie: InputSource = { sample: () => ({ dir: 5, held: 0, pressed: 0 }) };
      this.sources = sala.lado === 0 ? [yo, nadie] : [nadie, yo];
      const sesion = new SesionRollback(this.match, sala.lado);
      this.sesion = sesion;
      sala.alPaquete = (p) => sesion.recibirPaquete(p);
    } else this.sources = [human(P1_KEYS, 0), human(P2_KEYS, 1)];
    this.onlineUi.addChild(this.onlineText, this.pingText);
    if (opts.online && !tactil()) {
      // En el computador, un botón para abrir el menú con el mouse (ESC también lo abre).
      const b = MENU_BTN;
      const caja = new Graphics().roundRect(b.x, b.y, b.w, b.h, 3).fill({ color: 0x140a24, alpha: 0.75 }).stroke({ color: 0xc89a3a, width: 0.8 });
      const txt = outlinedText('☰ MENÚ · ESC', 6, 0xfff4e0, 0x0a0610, 1);
      txt.anchor.set(0.5);
      txt.position.set(b.x + b.w / 2, b.y + b.h / 2);
      this.onlineUi.addChild(caja, txt);
    }

    this.world.addChild(this.layers.shadows, this.layers.ghosts, this.layers.projectiles, this.layers.fighters);
    const [a, b] = this.match.fighters;
    const all = this.allFighters();
    // Color de ropa: el elegido en ELIGE LUCHADOR; un luchador repetido (René contra René)
    // que no eligió otro color se viste distinto solo.
    const used = new Map<string, Set<number>>();
    for (const f of all) {
      const taken = used.get(f.def.id) ?? new Set<number>();
      used.set(f.def.id, taken);
      let color = !this.match.teams && opts.colors ? opts.colors[f.side] : 0;
      while (taken.has(color) && taken.size < COSTUME_COUNT) color = (color + 1) % COSTUME_COUNT;
      taken.add(color);
      const v = new FighterView(f, game.assets.textures, this.layers, 0xffffff, color);
      v.visible = f === a || f === b;
      this.views.set(f, v);
    }
    // Orden de dibujo por zIndex: el jugador 1 delante del 2 cuando se cruzan, las ayudas detrás.
    this.layers.fighters.sortableChildren = true;
    this.projViews = new ProjectileViews(game.assets.textures, this.layers.projectiles, this.fx);
    this.fx.addGlow(this.smears.view);
    this.hud = new Hud([a.def, b.def], game.assets.textures);
    if (this.match.teams) this.hud.setTeamMode(all.map((f) => f.def));
    this.live = new LiveShow([a.def, b.def], game.assets.textures, seed, (side, color) => this.spawnHeart(side, color));
    this.hud.addLayer(this.live.container);
    if (this.dummy) this.hud.setPractice(this.practiceState!);
    this.buildPause();
    this.shownStage = game.assets.stage;
    this.bigBolt.blendMode = 'add';
    this.fireG.blendMode = 'add';
    this.world.addChild(this.overlayG, this.fireG, this.bigBolt, this.grieta.g);
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

  /** Teclas 1-4 de la práctica (fila de números; el teclado numérico es del jugador 2), o tocar la opción. */
  private practiceKeys(): void {
    const kb = this.game.kb;
    const tap = this.game.menu.tap;
    const touched = tap ? this.hud.practiceOptionAt(tap.x, tap.y) : 0;
    const key = (n: number) => kb.hit(`Digit${n}`) || touched === n;
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

  /** Borde de arriba del panel (en línea, un poco más abajo: el título no tapa las vistas). */
  private panelY(): number {
    return pauseY(this.opciones.length) + (this.opts.online ? 12 : 0);
  }

  /** Arriba de la barra de cada opción. */
  private pauseBarY(i: number): number {
    return this.panelY() + P_PAD + i * P_ROW;
  }

  private buildPause(): void {
    const n = this.opciones.length;
    const enLinea = !!this.opts.online;
    const bg = new Graphics();
    // En línea la pelea sigue detrás: se oscurece menos, para verla.
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x05020c, alpha: enLinea ? 0.35 : 0.6 });
    bg.roundRect(P_X, this.panelY(), P_W, pauseH(n), 6).fill({ color: 0x140a24, alpha: 0.92 }).stroke({ color: 0xc89a3a, width: 1.2 });
    const title = outlinedText(enLinea ? 'MENÚ' : 'PAUSA', 14, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, this.panelY() - 15);
    if (enLinea) {
      const nota = outlinedText('LA PELEA SIGUE: TU LUCHADOR SE QUEDA QUIETO', 6, 0xffd76a, 0x0a0610, 1);
      nota.anchor.set(0.5);
      nota.position.set(VIEW_W / 2, this.panelY() + pauseH(n) + 9);
      this.pauseUi.addChild(nota);
    }
    this.pauseGlow.blendMode = 'add';
    this.pauseCursor.anchor.set(0, 0.5);
    this.pauseUi.addChild(bg, this.pauseGlow, this.pauseBar, title, this.pauseCursor);
    this.opciones.forEach((o, i) => {
      const t = outlinedText(o, P_FONT, 0xffffff, 0x1a0a24, 2);
      t.anchor.set(0.5);
      t.position.set(VIEW_W / 2, this.pauseBarY(i) + P_BAR / 2);
      this.pauseItems.push(t);
      this.pauseUi.addChild(t);
    });
    this.pauseUi.visible = false;
  }

  /** Opción de la pausa bajo el toque de este cuadro (toda la fila cuenta), o -1. */
  private pauseTapped(): number {
    const mi = this.game.menu;
    return this.opciones.findIndex((_, i) => mi.tapIn(P_X, this.pauseBarY(i) - (P_ROW - P_BAR) / 2, P_W, P_ROW));
  }

  /** Barras de la pausa: la marcada se enciende (magenta con borde dorado), con cursor que pestañea. */
  private paintPause(): void {
    const g = this.pauseBar.clear();
    this.pauseGlow.clear();
    const slant = 7;
    const pulse = 0.5 + 0.5 * Math.sin(this.pauseT * 0.12);
    this.opciones.forEach((_, i) => {
      const on = i === this.pauseSel;
      const w = P_W - 36 + (on ? 10 : 0);
      const x = VIEW_W / 2 - w / 2;
      const y = this.pauseBarY(i);
      const shape = [x + slant, y, x + w + slant, y, x + w - slant, y + P_BAR, x - slant, y + P_BAR];
      if (on) {
        this.pauseGlow.roundRect(x - 8, y - 4, w + 16, P_BAR + 8, 8).fill({ color: 0xff3ac0, alpha: 0.14 + 0.1 * pulse });
        g.poly(shape).fill({ color: 0xb02a90, alpha: 0.92 }).stroke({ color: 0xffd76a, width: 1.2 });
      } else {
        g.poly(shape).fill({ color: 0x1a0c2e, alpha: 0.8 }).stroke({ color: 0xb98cff, width: 0.6, alpha: 0.35 });
      }
      this.pauseItems[i].style.fill = on ? 0xffffff : 0xd8cfe8;
      this.pauseItems[i].scale.set(on ? 1.06 : 1);
    });
    const y = this.pauseBarY(this.pauseSel) + P_BAR / 2;
    this.pauseCursor.position.set(P_X + 8 + (Math.floor(this.pauseT / 10) % 2), y);
  }

  /** Luchador con que pelea un lado ahora (en 2 VS 2, el que está en la pelea de su equipo). */
  private activeFighter(side: 0 | 1): Fighter {
    const team = this.match.teams?.[side];
    return team ? team.members[team.point] : this.match.fighters[side];
  }

  enter(): void {
    // Suelta lo que lleva rato sin usarse (las escenas de antes ya no lo dibujan).
    const { roster, content, stageId } = this.game.assets;
    content.trim({ fighters: this.allFighters().map((f) => roster.findIndex((r) => r.def.id === f.def.id)), stage: stageId });
    const d = this.game.display;
    d.world.addChild(this.game.assets.stage.container, this.disco.container, this.neon.container, this.storm.container, this.ultraShow.container, this.party.container, this.world);
    d.fx.addChild(this.fx.container, this.debugG);
    this.punchFlash.rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
    this.punchFlash.alpha = 0;
    this.punchFlash.blendMode = 'add';
    d.hud.addChildAt(this.punchFlash, 0);
    d.hud.addChild(this.hud.container);
    d.overlay.addChild(this.pauseUi);
    if (this.sesion) {
      // En línea: aviso arriba al centro (bajo el reloj y las vistas) y el ping abajo al centro.
      this.onlineText.anchor.set(0.5);
      this.onlineText.position.set(VIEW_W / 2, 84);
      this.pingText.anchor.set(0.5, 1);
      this.pingText.position.set(VIEW_W / 2, VIEW_H - 3);
      d.overlay.addChild(this.onlineUi);
    }
    d.worldView.filters = [this.zoom, this.negative];
    this.zoom.enabled = false;
    this.negative.enabled = false;
    // Celular: la cruceta y los botones salen en la pelea (no en la DEMOSTRACIÓN).
    mandosDePelea(this.mode !== 'demo');
    // Práctica: botones de las opciones 1-4 abajo al centro (se esconden en la pausa con los demás).
    mandosDePractica(this.mode === 'practica');
  }

  exit(): void {
    mandosDePelea(false);
    mandosDePractica(false);
    this.closeMoveList();
    this.closeControls();
    const d = this.game.display;
    d.world.removeChild(this.shownStage.container, this.disco.container, this.neon.container, this.storm.container, this.ultraShow.container, this.party.container, this.world);
    if (this.shownStage !== this.game.assets.stage) this.shownStage.setDarkness(0);
    d.fx.removeChild(this.fx.container, this.debugG);
    d.hud.removeChild(this.hud.container);
    d.hud.removeChild(this.punchFlash);
    d.overlay.removeChild(this.pauseUi);
    if (this.opts.online) {
      this.opts.online.sala.alPaquete = null;
      d.overlay.removeChild(this.onlineUi);
    }
    this.onlineUi.destroy({ children: true });
    d.worldView.filters = [];
    this.game.assets.stage.setDarkness(0);
    this.projViews.clear();
    for (const g of this.powerGlows) if (g) this.fx.releaseGlow(g);
    this.powerGlows = [null, null];
    this.fx.clear();
    this.live.destroy();
    this.disco.destroy();
    this.neon.destroy();
    this.storm.destroy();
    this.ultraShow.destroy();
    this.party.destroy();
    for (const v of this.views.values()) v.destroy();
    this.smears.destroy();
    this.world.destroy({ children: true });
  }

  step(): void {
    const g = this.game;
    // ESC, el botón START de un joystick o (en línea, en el computador) el botón ☰ MENÚ.
    const menuBtn = !!this.sesion && !this.paused && !tactil() && g.menu.tapIn(MENU_BTN.x, MENU_BTN.y, MENU_BTN.w, MENU_BTN.h);
    const pausePressed = g.kb.hit('Escape') || [0, 1, 2, 3].some((i) => g.pads.pressed(i, 9)) || menuBtn;
    if (pausePressed && !this.paused) {
      // MOVIMIENTOS abre en el luchador de quien abrió el menú (en línea, el propio).
      this.pausedBy = this.opts.online ? this.opts.online.sala.lado : this.mode === '2p' && g.pads.pressed(1, 9) ? 1 : 0;
    }
    if (this.paused) {
      this.stepPause(pausePressed);
      // En línea la pelea sigue detrás del menú (el rival sigue jugando); si se salió de la sala, nada más.
      if (!this.sesion || this.game.scene !== this) return;
    } else {
      // DEMOSTRACIÓN: aceptar, volver o un toque sale (no hay pausa).
      if (this.mode === 'demo' && this.opts.exit && (pausePressed || g.menu.confirm || g.menu.back || g.menu.tap)) {
        g.sfx.play('menuBack');
        g.setScene(this.opts.exit());
        return;
      }
      if (pausePressed && this.mode !== 'demo') {
        this.paused = true;
        this.pauseSel = 0;
        this.pauseUi.visible = true;
        // En la pausa las opciones se tocan: la cruceta y los botones no las tapan.
        mandosDePelea(false);
        g.sfx.play('pause');
        if (!this.sesion) return;
      }
    }

    const m = this.match;
    if (this.dummy) this.practiceKeys();
    let events: readonly SimEvent[];
    if (this.sesion) events = this.stepOnline();
    else {
      const inputs: [FrameInput, FrameInput] = [this.sources[0].sample(m), this.sources[1].sample(m)];
      for (const i of [0, 1] as const) {
        const forced = this.qaInputs[i].shift();
        if (forced) inputs[i] = forced;
      }
      m.step(inputs);
      events = m.events;
    }
    if (this.dummy) {
      this.practiceAfterStep();
      this.hud.setPractice(this.practiceState!);
    }
    this.t++;
    this.handleEvents(events);
    if (this.sesion && this.stepOnlineUi()) return;
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
    this.smears.step(this.allFighters());
    this.projViews.step(m);
    this.stepElemental();
    this.fx.step();
    this.hud.step(m);
    this.live.step(m);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.35);
    // Un rayo que avisa corta la luz: el escenario parpadea a oscuras.
    const blackout = this.projViews.blackout(m) * (0.7 + Math.random() * 0.3);
    const targetDark = Math.max(m.freeze > 0 ? 0.62 : 0, m.ultraActive ? 0.72 : 0, this.disco.darkness, this.neon.darkness, this.storm.darkness, this.ultraShow.darkness, this.party.darkness, blackout);
    this.dark += (targetDark - this.dark) * (targetDark > this.dark ? 0.35 : 0.08);
    if (this.zoomT > 0) this.zoomT--;
    if (this.punchT > 0) this.punchT--;

    if (m.over && this.finDefinitivo()) {
      if (this.opts.next) g.setScene(this.opts.next(m.matchWinner ?? -1, m.frame));
      else if (this.mode === 'demo') g.setScene(new FightScene(g, 'demo', this.seed + 1, this.opts));
      else g.setScene(new MainMenuScene(g));
    }
  }

  // ---------------------------------------------------------------- en línea

  /** En línea: avanza un cuadro con la sesión (rehaciendo lo que haga falta) y manda los controles. */
  private stepOnline(): SimEvent[] {
    const s = this.sesion!;
    const sala = this.opts.online!.sala;
    let ev: SimEvent[];
    this.frenoT++;
    if (sala.estado === 'cerrada') ev = [];
    else if (s.debeFrenar && this.frenoT >= CADA_FRENO) {
      // Va adelantado: se salta este cuadro para que el otro alcance (casi no se nota).
      this.frenoT = 0;
      ev = s.corregir();
    } else if (s.puedeAvanzar) {
      // El control se lee solo cuando se usa: si no, se perdería una pulsación.
      const lado = sala.lado;
      // Con el menú abierto, el luchador propio se queda quieto (las teclas manejan el menú).
      const input = this.qaInputs[lado].shift() ?? (this.paused ? NEUTRO : this.sources[lado].sample(this.match));
      ev = s.avanzar(input) ?? [];
      this.esperaT = 0;
    } else {
      // Faltan los controles del rival de hace muchos cuadros: se espera.
      this.esperaT++;
      ev = s.corregir();
    }
    sala.enviarPaquete(s.armarPaquete());
    return ev;
  }

  /** En línea: los avisos de arriba y el ping. Devuelve true si la escena ya se fue. */
  private stepOnlineUi(): boolean {
    const { sala } = this.opts.online!;
    const s = this.sesion!;
    if (sala.estado === 'cerrada' || s.desincronizado !== null) {
      if (this.cortadaT === 0) {
        this.cortadaT = 150;
        if (s.desincronizado !== null) {
          reportarError(new Error(`en línea: desincronización en el cuadro ${s.desincronizado}`), 'online');
          sala.cerrar('LA PELEA SE DESINCRONIZÓ');
        }
        this.onlineText.text = sala.error ?? 'SE CORTÓ LA CONEXIÓN';
        this.game.sfx.play('menuBack');
      }
      if (--this.cortadaT <= 0) {
        this.salirOnline(sala.error);
        return true;
      }
    } else if (this.esperaT > AVISO_ESPERA) {
      this.onlineText.text = `ESPERANDO A ${sala.rival?.apodo.toUpperCase() ?? 'TU RIVAL'}…`;
    } else {
      this.onlineText.text = '';
    }
    this.pingText.text = sala.ping ? `PING ${Math.round(sala.ping)} MS` : '';
    return false;
  }

  /** En línea: la pelea solo termina cuando llegaron todos los controles del rival (los dos ven el mismo final). */
  private finDefinitivo(): boolean {
    const s = this.sesion;
    if (!s) return true;
    if (!s.alDia) return false;
    this.handleEvents(s.corregir());
    return this.match.over;
  }

  private salirOnline(error: string | null): void {
    const { sala, salir } = this.opts.online!;
    sala.cerrar();
    this.game.sfx.play('menuBack');
    this.game.setScene(salir(error));
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
      const n = this.opciones.length;
      this.pauseSel = (this.pauseSel + (mi.up ? n - 1 : 1)) % n;
      g.sfx.play('menuMove');
    }
    // Tocar una opción la elige.
    let confirm = mi.confirm;
    const hit = this.pauseTapped();
    if (hit >= 0) {
      this.pauseSel = hit;
      confirm = true;
    }
    const op = confirm ? this.opciones[this.pauseSel] : null;
    const resume = pausePressed || op === 'CONTINUAR';
    if (resume) {
      this.paused = false;
      this.pauseUi.visible = false;
      mandosDePelea(true);
      g.sfx.play('pause');
      return;
    }
    if (op === 'REINICIAR COMBATE') {
      // La misma pelea desde el round 1: mismos luchadores, colores, escenario y lo que venga después.
      g.sfx.play('menuConfirm');
      g.setScene(new FightScene(g, this.mode, this.seed, this.opts));
      return;
    }
    if (op === 'MOVIMIENTOS') {
      g.sfx.play('menuConfirm');
      // Abre en el luchador con que está peleando quien pausó (con ← → se ven los demás).
      const side = this.pausedBy;
      const id = this.activeFighter(side).def.id;
      // En línea se juega con las teclas de J1 (las dos manos sirven): esas se muestran.
      this.moveList = new MoveListPanel(g.assets, g.assets.roster.findIndex((r) => r.def.id === id), this.opts.online ? 0 : side);
      g.display.overlay.addChild(this.moveList.container);
      this.pauseUi.visible = false;
      return;
    }
    if (op === 'CONTROLES') {
      g.sfx.play('menuConfirm');
      this.controls = new ControlsPanel(g, true);
      g.display.overlay.addChild(this.controls.container);
      this.pauseUi.visible = false;
      return;
    }
    if (op === 'SALIR AL MENÚ') {
      g.sfx.play('menuBack');
      g.setScene(new MainMenuScene(g));
    }
    if (op === 'SALIR DE LA SALA') this.salirOnline(null);
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

  /** Lo que pasó en la pelea este cuadro (golpes, voces, carteles): efectos y sonidos. */
  private handleEvents(events: readonly SimEvent[]): void {
    const m = this.match;
    const sfx = this.game.sfx;
    const camLeft = m.camX - VIEW_W / 2;
    const pan = (x: number) => ((x - camLeft) / VIEW_W) * 1.2 - 0.6;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          this.fx.hit(e.x, e.y, e.dir, e.spark);
          this.fx.impact(e.x, e.y, e.dir, e.spark, m.fighters[e.side].def.ui.fx);
          if (e.spark !== 'light') this.hitPunch(e.x, e.y, e.spark === 'heavy' ? 1 : 2, camLeft);
          sfx.play(e.spark === 'light' ? 'hitLight' : e.spark === 'heavy' ? 'hitHeavy' : 'hitSuper', { pan: pan(e.x) });
          this.addShake(e.spark === 'light' ? 1.4 : e.spark === 'heavy' ? 3.2 : 4.6);
          this.elementalHit(e);
          if (e.spark !== 'light') this.grunt(m.fighters[e.side === 0 ? 1 : 0], 'voz/dolor', 0.7);
          // El público del escenario (si tiene) celebra el golpe.
          this.game.assets.stage.alentar();
          break;
        }
        case 'block':
          this.fx.block(e.x, e.y, e.dir);
          sfx.play('block', { pan: pan(e.x) });
          this.addShake(0.8);
          break;
        case 'attack':
          if (!e.special) {
            sfx.play(e.heavy ? 'whooshH' : 'whooshL', { vol: 0.7 });
            this.grunt(m.fighters[e.side], 'voz/golpe', e.heavy ? 0.6 : 0.2);
          }
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
        case 'launch': {
          // El gancho que lanza se marca como en Mortal Kombat: columna de luz, un golpe que
          // retumba, la pantalla que tiembla y un tirón de zoom con destello.
          const att = m.fighters[e.side];
          this.fx.launch(e.x, e.y);
          this.fx.uppercut(e.x, e.y, att.def.ui.fx, att.x);
          sfx.play('launch', { pan: pan(e.x) });
          sfx.play('uppercut', { pan: pan(e.x) });
          this.addShake(5.5);
          this.hitPunch(e.x, e.y, 2, camLeft);
          this.impact = Math.max(this.impact, 2);
          break;
        }
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
          this.grunt(m.fighters[e.side], 'voz/dolor', 1, true);
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
          // Las frases de entrada van en fila (una después de la otra, nunca encima).
          const intro = e.name === 'voz/intro';
          if (own && sfx.has(own)) {
            sfx.play(own, intro ? { channel: 'intro', mode: 'queue', maxWait: 12 } : !voz ? {} : e.wait ? { channel: who, mode: 'queue', maxWait: e.wait } : { channel: who });
          }
          else sfx.play(e.name);
          if (who && (e.name === 'voz/remate' || e.name === 'voz/ultra' || (voz && m.ultraActive)) && sfx.has(own)) this.lineAt.set(who, this.t);
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
          const party = !!owner && owner.def.moves[owner.ultraRun!.moveId]?.cinematic?.lights === 'fiesta';
          if (party) this.partyHit(owner!, e.x, e.y, !!e.final);
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
   * Grito al tirar un golpe normal (`voz/golpe`) o quejido al recibir uno fuerte (`voz/dolor`), con las voces
   * reales del luchador: sale con probabilidad `chance`, no se repite antes de GRUNT_GAP y no corta otra frase
   * suya. En el K.O. (`force`) siempre suena y corta lo que estaba diciendo.
   */
  private grunt(f: Fighter, line: 'voz/golpe' | 'voz/dolor', chance: number, force = false): void {
    const who = f.def.id;
    const name = `${who}/${line}`;
    if (!this.game.sfx.has(name)) return;
    const last = this.gruntAt.get(who);
    if (!force && ((last !== undefined && this.t - last < GRUNT_GAP) || Math.random() >= chance)) return;
    this.gruntAt.set(who, this.t);
    this.game.sfx.play(name, { channel: who, mode: force ? 'cut' : 'ifFree' });
  }

  /**
   * Voz al terminar un combo de 3 golpes o más: la frase propia de quien lo hizo
   * según el tramo (corto, medio, largo, viral; el ultra la suya o la viral). Si
   * acaba de decir su frase de REMATE o de ULTRA, no se apila otra. Si el combo
   * terminó con un poder, espera a que acabe su frase (hasta COMBO_WAIT). Si el
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
      // Por el canal del luchador: no corta otra frase suya, espera su turno (en el ultra va al final de la fila).
      this.queueVoice(own, AFTER_ANNOUNCER, who, ultra ? 1.5 : COMBO_WAIT);
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
    } else if (e.look === 'silbido') {
      // El silbido lo deja mareado: estrellitas que giran sobre la cabeza.
      this.dizzy.set(vic, e.last ? 80 : 50);
      this.fx.electric(e.x, e.y, 8, 0xfff4c0);
    } else if (e.look === 'tronco') {
      // El tronco del leñazo: golpe seco de madera, astillas y polvo.
      const id = `${att.def.id}/troncoGolpe`;
      if (this.game.sfx.has(id)) this.game.sfx.play(id);
      this.fx.dust(e.x, e.y, 6, true);
      this.addShake(4);
    } else if (e.look === 'troncos') {
      this.views.get(vic)?.burn(14);
      this.fx.explosion(e.x, e.y, 0xff8a1e, !!e.last);
      this.addShake(e.last ? 6 : 3);
    } else if (e.look === 'sonico') {
      this.fx.electric(e.x, e.y, 10, 0xe6eeff);
      if (e.last) this.shatter(att, e.x, e.y);
    } else if (e.look === 'cola') {
      // La botella revienta: estallido de bebida y espuma (pintado) y gotas que saltan.
      this.fx.playSheet(vfxFrames(this.game.assets.textures, 'espuma'), e.x, e.y, { scale: e.last ? 0.42 : 0.32, frameDur: 2 });
      this.fx.fizz(e.x, e.y, e.last ? 26 : 16);
      this.addShake(e.last ? 4 : 2);
    } else if (e.look === 'cajon') {
      // El cajón revienta: botellas que estallan en espuma.
      this.fx.playSheet(vfxFrames(this.game.assets.textures, 'espuma'), e.x, e.y, { scale: 0.55, frameDur: 2 });
      this.fx.explosion(e.x, e.y, 0x8a3a12, true);
      this.fx.fizz(e.x, e.y, 30);
      this.addShake(5);
    } else if (e.look === 'letras') {
      this.views.get(vic)?.burn(14);
      this.fx.explosion(e.x, e.y, 0xff2a2a, !!e.last);
      this.addShake(e.last ? 7 : 4);
    } else if (e.look === 'color' || e.look === 'colorRayo') {
      // "¡Dale color!": revienta en pintura de todos los colores.
      const arco = [0xff3b3b, 0xffe14a, 0x4dff6a, 0x3fc8ff, 0xff4fd8];
      this.fx.explosion(e.x, e.y, arco[Math.floor(Math.random() * arco.length)], !!e.last);
      for (let i = 0; i < 4; i++) this.fx.starPop(e.x + (Math.random() - 0.5) * 40, e.y - Math.random() * 30, arco[i]);
      this.addShake(e.last ? 5 : 2);
    } else if (e.look === 'androides') {
      // El androide embiste: chispas rojas de metal.
      this.fx.electric(e.x, e.y, 8, 0xff5a4a);
      this.fx.dust(e.x, 0, 3, false);
      if (e.last) this.fx.explosion(e.x, e.y, 0xff3a2a, true);
      this.addShake(e.last ? 5 : 2);
    } else if (e.look === 'cambia') {
      // La máquina lo reprograma: descargas verdes y, al final, revienta.
      this.views.get(vic)?.electrify(30);
      this.fx.electric(e.x, e.y, 7, 0x3fffa0);
      if (e.last) {
        this.fx.explosion(vic.x, -150, 0x3fffa0, true);
        this.fx.superBurst(vic.x, -100, 0x3fffa0);
        this.impact = Math.max(this.impact, 3);
      }
      this.addShake(e.last ? 8 : 3);
    } else if (e.look === 'robo') {
      // Puñetazo cohete o rayo de los ojos del Tío René robot.
      this.fx.explosion(e.x, e.y, e.last ? 0xff3a2a : 0x3fd8ff, true);
      if (e.last) {
        this.views.get(vic)?.burn(18);
        this.fx.superBurst(e.x, e.y, 0xff5a4a);
      }
      this.addShake(e.last ? 9 : 6);
    } else if (e.look === 'shuriken') {
      // El shuriken se clava: chispas de acero y una ráfaga de viento.
      this.fx.electric(e.x, e.y, 4, 0xdfeeff);
      this.fx.trail(e.x, e.y, 0xbfe8ff, 16);
      this.addShake(e.last ? 3 : 1);
    } else if (e.look === 'cadena') {
      // La cadena lo atrapa: chispas de metal y polvo bajo sus pies.
      this.fx.electric(e.x, e.y, 5, 0xd0d8e0);
      this.fx.dust(vic.x, 0, 4, false);
      this.addShake(4);
    } else if (e.look === 'sombras') {
      // Una sombra ninja lo cruza con la katana.
      this.fx.explosion(e.x, e.y, 0x8a6bff, !!e.last);
      this.fx.speedLines(e.x, e.y, att.facing, 0xc8b8ff);
      this.addShake(e.last ? 5 : 2);
    } else if (e.look === 'iai') {
      // El corte del amor: corazones, estallido rosa y, al final, dorado.
      for (let i = 0; i < 6; i++) this.fx.heart(e.x + (Math.random() - 0.5) * 70, e.y - Math.random() * 50, 0xff6ad5);
      this.fx.explosion(e.x, e.y, e.last ? 0xffd34a : 0xff6ad5, true);
      if (e.last) {
        this.fx.superBurst(e.x, e.y, 0xff6ad5);
        this.impact = Math.max(this.impact, 3);
      }
      this.addShake(e.last ? 9 : 4);
    } else if (e.look === 'kunai') {
      // Lluvia de kunai: destellos de acero; el último lo bota en una explosión de humo.
      this.fx.electric(e.x, e.y, 3, 0xffffff);
      if (e.last) {
        this.fx.explosion(e.x, e.y, 0xd8f0ff, true);
        this.fx.dust(vic.x, 0, 8, true);
      }
      this.addShake(e.last ? 6 : 1);
    } else if (e.move?.startsWith('bici')) {
      // La bicicleta atropella: estallido de fuego, polvo y sacudón.
      this.views.get(vic)?.burn(10);
      this.fx.explosion(e.x, e.y, 0xff8a1e, true);
      this.fx.fire(e.x, 0, 90);
      this.fx.dust(e.x, 0, 6, true);
      this.addShake(5);
    } else if (e.move?.startsWith('run')) {
      this.fx.dust(e.x, 0, 5, true);
      this.addShake(4);
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
    // Combo de fuego: brasas desde 3 golpes, aura de llamas desde 5, estallidos desde 8, pilar de fuego desde 12.
    if (att.def.comboFx === 'fuego' && e.combo >= 3) {
      this.fx.electric(e.x, e.y, 3 + Math.min(e.combo, 12), 0xffa040);
      if (e.combo >= 5) for (let i = 0; i < 2; i++) this.fx.powerAura(att.x, att.y, 0xff7a1a, this.t + i);
      if (e.combo >= 8) {
        this.fx.explosion(e.x, e.y, 0xff6a1a, false);
        this.addShake(2);
      }
      if (e.combo >= 12) {
        this.fx.fire(vic.x, 0, 170);
        this.impact = Math.max(this.impact, 2);
      }
    }
    // Combo de bebida: burbujas desde 3 golpes, espuma alrededor desde 5, estallidos desde 8, géiser de bebida desde 12.
    if (att.def.comboFx === 'cola' && e.combo >= 3) {
      this.fx.fizz(e.x, e.y, 4 + Math.min(e.combo, 12));
      if (e.combo >= 5) for (let i = 0; i < 2; i++) this.fx.aura(att.x - att.facing * 10, att.y - 70, 0xfff0d8);
      if (e.combo >= 8) {
        this.fx.explosion(e.x, e.y, 0x8a3a12, false);
        this.addShake(2);
      }
      if (e.combo >= 12) {
        this.fx.geyser(vic.x, 0, 170);
        this.fx.fizz(vic.x, -60, 40);
        this.impact = Math.max(this.impact, 2);
      }
    }
    // Combo de neón (Papi Micky): estrellas de colores desde 3 golpes, aura de focos desde 5, estallidos
    // desde 8, y desde 12 una lluvia de confeti con destello de pantalla, como el final de un show.
    if (att.def.comboFx === 'neon' && e.combo >= 3) {
      const neon = [0xff3fa4, 0x3fe0ff, 0xffe14a, 0xb46bff];
      this.fx.electric(e.x, e.y, 3 + Math.min(e.combo, 12), neon[e.combo % 4]);
      for (let i = 0; i < Math.min(4, e.combo - 2); i++) this.fx.starPop(e.x + (Math.random() - 0.5) * 40, e.y - Math.random() * 30, neon[(e.combo + i) % 4]);
      if (e.combo >= 5) for (let i = 0; i < 2; i++) this.fx.aura(att.x, att.y - 70, neon[(this.t + i) % 4]);
      if (e.combo >= 8) {
        this.fx.explosion(e.x, e.y, neon[e.combo % 4], false);
        this.addShake(2);
      }
      if (e.combo >= 12) {
        for (let i = 0; i < 4; i++) this.fx.explosion(vic.x + (i - 1.5) * 30, -120 - Math.random() * 60, neon[i], true);
        this.impact = Math.max(this.impact, 2);
      }
    }
    // Combo del laboratorio (Maki Gero): chispas de colores desde 3 golpes, aura verde desde 5, estallidos
    // desde 8 y desde 12 el rival queda electrificado, como si lo estuvieran reprogramando.
    if (att.def.comboFx === 'laboratorio' && e.combo >= 3) {
      const lab = [0x3fffa0, 0x7ff6ff, 0xb46bff, 0xff4fd8];
      this.fx.electric(e.x, e.y, 3 + Math.min(e.combo, 12), lab[e.combo % 4]);
      if (e.combo >= 5) for (let i = 0; i < 2; i++) this.fx.aura(att.x, att.y - 70, lab[(this.t + i) % 4]);
      if (e.combo >= 8) {
        this.fx.explosion(e.x, e.y, lab[e.combo % 4], false);
        this.addShake(2);
      }
      if (e.combo >= 12) {
        this.views.get(vic)?.electrify(20);
        this.impact = Math.max(this.impact, 2);
      }
    }
    // Combo ninja (el Samurai de Pudahuel): chispas doradas de KI desde 3 golpes, aura dorada desde 5, tajos de
    // luz desde 8 y desde 12 un destello blanco como un corte de luna sobre el rival.
    if (att.def.comboFx === 'ninja' && e.combo >= 3) {
      const ki = [0xffd34a, 0xfff1b0, 0xff6ad5, 0xbfe8ff];
      this.fx.electric(e.x, e.y, 3 + Math.min(e.combo, 12), ki[e.combo % 4]);
      if (e.combo >= 5) for (let i = 0; i < 2; i++) this.fx.aura(att.x, att.y - 70, ki[(this.t + i) % 2]);
      if (e.combo >= 8) {
        this.fx.speedLines(e.x, e.y, att.facing, 0xfff1b0);
        this.fx.explosion(e.x, e.y, 0xffd34a, false);
        this.addShake(2);
      }
      // Cada 4 golpes (no en todos: en un ultra la pantalla quedaba blanca).
      if (e.combo >= 12 && e.combo % 4 === 0) {
        this.fx.superBurst(vic.x, -100, 0xfff1b0);
        this.impact = Math.max(this.impact, 2);
      }
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

  /** Remate del súper ultra instinto: la pantalla se triza, destello plateado, negativo y vidrio que se rompe. */
  private shatter(owner: Fighter, x: number, y: number): void {
    this.grieta.start(x, y);
    this.ultraShow.strike();
    this.impact = 6;
    this.addShake(10);
    this.fx.superBurst(x, y, 0xd8e6ff);
    const id = `${owner.def.id}/vidrio`;
    if (this.game.sfx.has(id)) this.game.sfx.play(id);
  }

  /** Cada golpe del ultra de fiesta: un fuego artificial sobre el rival; el último, una fogata gigante. */
  private partyHit(owner: Fighter, x: number, y: number, final: boolean): void {
    const camLeft = this.match.camX - VIEW_W / 2;
    const sx = x - camLeft;
    const sy = GROUND_SCREEN_Y + y + this.camOffY;
    this.party.burst(sx + (Math.random() * 60 - 30), Math.max(30, sy - 60 - Math.random() * 40), final);
    const id = `${owner.def.id}/fiesta`;
    if (final) {
      for (let i = 0; i < 4; i++) this.party.burst(sx + (i - 1.5) * 70, 50 + Math.random() * 40, true);
      this.fx.fire(x, 0, 200);
      this.fx.explosion(x, y, 0xff8a1e, true);
      if (this.game.sfx.has(id)) this.game.sfx.play(id);
    } else if (Math.random() < 0.5 && this.game.sfx.has(id)) {
      this.game.sfx.play(id, { vol: 0.5 });
    }
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
    this.stepMoveFx();
    for (const p of this.projViews.strikes) {
      const id = `${p.owner.def.id}/trueno`;
      if (this.game.sfx.has(id)) this.game.sfx.play(id);
      this.storm.strike(false);
      this.addShake(5);
      this.fx.electric(p.x, -12, 10);
    }
    // Troncos que caen al suelo: golpe seco, polvo y chispas de fuego.
    for (const l of this.projViews.landings) {
      const cae: Record<string, string> = { carlitos: 'letraCae', micky: 'monedaCae' };
      const id = `${l.owner.def.id}/${cae[l.owner.def.id] ?? 'troncoCae'}`;
      if (this.game.sfx.has(id)) this.game.sfx.play(id);
      this.fx.dust(l.x, 0, 6, true);
      this.fx.electric(l.x, -6, 5, 0xffa040);
      this.addShake(2);
    }
    for (let i = this.sellos.length - 1; i >= 0; i--) {
      const s = this.sellos[i];
      s.life--;
      // Cae grande (timbrazo), rebota un poco y se apaga al final.
      const age = 46 - s.life;
      const k = age < 6 ? 2.2 - (age / 6) * 1.3 : age < 10 ? 0.9 + ((age - 6) / 4) * 0.1 : 1;
      s.view.scale.set(k);
      s.view.alpha = Math.min(1, s.life / 10);
      if (s.life <= 0) {
        s.view.destroy({ children: true });
        this.sellos.splice(i, 1);
      }
    }
    for (const p of this.match.projectiles) {
      if (p.dead) continue;
      // El Tío René robot aterriza; la máquina de reprogramar encaja en la cabeza.
      if (p.def.look === 'robo' && p.frame === 12) {
        this.addShake(9);
        this.fx.dust(p.x, 0, 14, true);
      }
      if (p.def.look === 'cambia' && p.frame === (p.def.delay ?? 0)) this.addShake(4);
    }
    this.grieta.step();
    for (const [f, n] of this.dizzy) {
      if (n <= 1) this.dizzy.delete(f);
      else this.dizzy.set(f, n - 1);
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

  /**
   * Efectos al hacer especiales: un anillo de energía del color del luchador al arrancar cualquier
   * especial o súper; y los propios de algunos movimientos (la bicicleta de Carlitos deja llamas,
   * polvo y líneas de velocidad; su carrera "¡Run!", polvo y líneas).
   */
  private stepMoveFx(): void {
    for (const f of this.allFighters()) {
      if (f.state !== 'attack' || !f.moveId || f.hitstop > 0) continue;
      const kind = f.moveKind;
      if ((kind === 'special' || kind === 'super') && f.stateFrame === 1) this.fx.charge(f.x, f.y, f.def.ui.fx);
      const id = f.moveId;
      const dir = f.facing;
      if (id.startsWith('bici')) {
        // La bicicleta aparece y se va en una nube de humo (en el video entra y sale por los bordes).
        const last = f.anim.frames.length - 1;
        if ((f.frameIdx === 0 && f.frameTime === 0) || (f.frameIdx === last && f.frameTime === 0)) {
          this.fx.dust(f.x + dir * 10, f.y, 10, true);
          this.fx.dust(f.x - dir * 20, f.y, 8, true);
          this.fx.charge(f.x, f.y + 40, 0xffb060);
        }
        if (f.frameIdx === last) continue;
        this.fx.fireTrail(f.x - dir * 34, f.y, dir);
        if (f.stateFrame % 2 === 0) this.fx.dust(f.x - dir * 30, f.y, 1, false);
        if (Math.abs(f.vx) > 1) this.fx.speedLines(f.x, f.y - 60, dir, 0xffd8a0);
      } else if (id.startsWith('run')) {
        if (f.stateFrame % 2 === 0) this.fx.dust(f.x - dir * 20, f.y, 1, false);
        if (Math.abs(f.vx) > 1) this.fx.speedLines(f.x, f.y - 60, dir);
      } else if (f.def.id === 'micky') {
        this.mickyMoveFx(f, id, dir);
      } else if (f.def.id === 'maki') {
        this.makiMoveFx(f, id, dir);
      } else if (f.def.id === 'samurai') {
        this.samuraiMoveFx(f, id, dir);
      }
    }
  }

  /**
   * Papi Micky: el Paso de C4 deja notas y estrellas de neón y polvo en cada saltito; el mortal, una
   * estela de luz rosada y celeste y un estallido al despegar; el ¡PAAA! enciende un aura de colores.
   */
  private mickyMoveFx(f: Fighter, id: string, dir: number): void {
    const neon = [0xff3fa4, 0x3fe0ff, 0xffe14a, 0xb46bff];
    if (id.startsWith('c4')) {
      if (f.stateFrame % 3 === 0) this.fx.starPop(f.x - dir * 10 + (Math.random() - 0.5) * 30, f.y - 90 - Math.random() * 40, neon[f.stateFrame % 4]);
      if (f.stateFrame % 6 === 0) this.fx.dust(f.x, f.y, 3, false);
      if (Math.abs(f.vx) > 1) this.fx.speedLines(f.x, f.y - 60, dir, neon[(f.stateFrame >> 1) % 4]);
    } else if (id === 'mortal') {
      if (f.stateFrame === 9) {
        this.fx.superBurst(f.x, f.y - 40, 0xff3fa4);
        this.fx.dust(f.x, f.y, 12, true);
      }
      if (f.stateFrame > 8 && f.stateFrame < 44) {
        this.fx.aura(f.x, f.y - 70, neon[(f.stateFrame >> 2) % 4]);
        if (f.stateFrame % 2 === 0) this.fx.trail(f.x + dir * 20, f.y - 120 + Math.sin(f.stateFrame * 0.3) * 50, neon[f.stateFrame % 4], 18);
      }
    } else if (id.startsWith('paaa')) {
      if (f.stateFrame < 30) this.fx.aura(f.x, f.y - 70, neon[(f.stateFrame >> 2) % 4]);
    } else if (id === 'super' || id.startsWith('gratis')) {
      if (f.stateFrame % 3 === 0) this.fx.ember(f.x + (Math.random() - 0.5) * 50, f.y - Math.random() * 140);
    }
  }

  /**
   * El Samurai de Pudahuel: bomba de humo al empezar "¡Haga sombra!" y los ultras, estela morada en su arrancón,
   * humo de teletransporte al tirar los kunai y corazones mientras prepara el corte del amor.
   */
  private samuraiMoveFx(f: Fighter, id: string, dir: number): void {
    if (id.startsWith('sombras') || id === 'ultra' || id === 'ultra2') {
      if (f.stateFrame === 1) this.fx.dust(f.x, f.y, 10, true);
      if (Math.abs(f.vx) > 1) {
        this.fx.speedLines(f.x, f.y - 60, dir, 0xc8b8ff);
        if (f.stateFrame % 2 === 0) this.fx.trail(f.x - dir * 10, f.y - 70, 0x8a6bff, 22);
      }
    } else if (id === 'kunai') {
      if (f.stateFrame % 10 === 1) this.fx.dust(f.x + (Math.random() - 0.5) * 30, f.y, 8, true);
    } else if (id === 'amor') {
      if (f.stateFrame < 40 && f.stateFrame % 4 === 0) this.fx.heart(f.x + (Math.random() - 0.5) * 50, f.y - 40 - Math.random() * 80, 0xff6ad5);
    }
  }

  /**
   * Dr. Maki Gero: "¡El auténtico!" sube envuelto en rayos y estampa su sello dorado; "¡Dale color!"
   * carga un aura arcoíris; los súper chisporrotean verde y celeste en sus manos; la barrida levanta polvo.
   */
  private makiMoveFx(f: Fighter, id: string, dir: number): void {
    const arco = [0xff3b3b, 0xff9a2e, 0xffe14a, 0x4dff6a, 0x3fc8ff, 0x8a5bff, 0xff4fd8];
    if (id.startsWith('autentico')) {
      if (f.stateFrame === 5) this.fx.uppercut(f.x + dir * 20, f.y - 60, 0x9fe8ff, f.x);
      if (f.stateFrame > 4 && f.stateFrame < 30) {
        if (f.stateFrame % 2 === 0) this.fx.electric(f.x + dir * 16, f.y - 70 - Math.random() * 60, 4, 0x9fe8ff);
        this.fx.aura(f.x, f.y - 70, f.stateFrame % 4 < 2 ? 0x9fe8ff : 0xffe14a);
      }
      if (f.stateFrame === 10 && id !== 'autenticoU') this.sello(f.x + dir * 40, f.y - 170);
    } else if (id.startsWith('color')) {
      if (f.stateFrame < 18) this.fx.aura(f.x + dir * 20, f.y - 80, arco[(f.stateFrame >> 1) % arco.length]);
    } else if (id === 'super' || id === 'robot') {
      if (f.stateFrame % 3 === 0) this.fx.electric(f.x + dir * 24, f.y - 90 - Math.random() * 40, 3, id === 'super' ? 0x3fffa0 : 0x7ff6ff);
    } else if (id === 'cLK' || id === 'cHK') {
      // La barrida levanta polvo donde se estira el pie; la fuerte deja además un rastro de colores en el suelo.
      const fuerte = id === 'cHK';
      const pie = f.x + dir * 82;
      if (f.stateFrame === (fuerte ? 6 : 4)) this.fx.dust(pie, f.y, fuerte ? 8 : 3, fuerte);
      if (fuerte && f.stateFrame >= 6 && f.stateFrame < 12) {
        for (let i = 0; i < 2; i++) this.fx.trail(pie - dir * (10 + Math.random() * 50), f.y - 6, arco[(f.stateFrame + i * 3) % arco.length], 14);
      }
    }
  }

  /** Sello dorado "¡EL AUTÉNTICO!": un timbrazo que cae grande, rebota y se apaga. */
  private sello(x: number, y: number): void {
    const c = new Container();
    const g = new Graphics();
    // Insignia: estrella de 16 puntas dorada con anillo.
    const pts: number[] = [];
    for (let i = 0; i < 32; i++) {
      const r = i % 2 ? 30 : 38;
      const a = (i / 32) * Math.PI * 2;
      pts.push(Math.cos(a) * r * 1.9, Math.sin(a) * r);
    }
    g.poly(pts).fill({ color: 0xb07a10 });
    g.ellipse(0, 0, 64, 30).fill({ color: 0xffcf3a });
    g.ellipse(0, 0, 58, 25).stroke({ width: 2, color: 0xfff2a8 });
    c.addChild(g);
    const t = outlinedText('¡EL AUTÉNTICO!', 13, 0xfff8d0, 0x5a3200, 3);
    t.anchor.set(0.5);
    c.addChild(t);
    c.position.set(x, y);
    c.rotation = -0.12;
    this.world.addChild(c);
    this.sellos.push({ view: c, life: 46 });
  }

  /** Escenario de reemplazo del ultra que corre (si tiene uno y ya cargó). */
  /** Golpe fuerte (1) o de súper (2): tirón de zoom hacia el impacto; el de súper además destella la pantalla. */
  private hitPunch(x: number, y: number, level: 1 | 2, camLeft: number): void {
    if (this.zoomT > 0) return;
    this.punchMax = level === 2 ? 14 : 9;
    this.punchT = this.punchMax;
    const p = this.game.display.root.toGlobal({ x: x - camLeft, y: GROUND_SCREEN_Y + y + this.camOffY });
    const r = this.game.display.app.renderer.resolution;
    this.zoom.center = [p.x * r, p.y * r];
  }

  /** La cinemática del ultra que está corriendo (para su fondo y sus siluetas). */
  private activeUltraCinematic(): SuperCinematic | undefined {
    if (!this.match.ultraActive) return undefined;
    const o = this.allFighters().find((f) => f.ultraRun);
    return o ? o.def.moves[o.ultraRun!.moveId]?.cinematic : undefined;
  }

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
    this.fireG.clear();
    for (const f of this.allFighters()) {
      const ov = f.move?.hitOverlay;
      if (f.state !== 'attack' || !f.connected || (ov !== 'tarro' && ov !== 'remolino')) continue;
      const vic = m.opponent(f);
      const boxes = vic.hurtboxes().map((h) => vic.worldBox(h));
      if (!boxes.length) continue;
      const head = boxes.reduce((a, b) => (b.y0 < a.y0 ? b : a));
      if (ov === 'tarro') drawTarro(this.overlayG, (head.x0 + head.x1) / 2, head.y0);
      else drawRemolino(this.fireG, vic.x, head.y0, 0, this.t);
    }
    // Mareado por el silbido: estrellitas sobre la cabeza mientras le dura el golpe.
    for (const [f, n] of this.dizzy) {
      if (!BUSY.has(f.state) || f.state === 'blockstun') {
        if (n < 40) continue;
      }
      const boxes = f.hurtboxes().map((h) => f.worldBox(h));
      if (!boxes.length) continue;
      const head = boxes.reduce((a, b) => (b.y0 < a.y0 ? b : a));
      drawMareo(this.overlayG, (head.x0 + head.x1) / 2, head.y0 - 6, this.t);
    }
    for (const p of m.projectiles) if (!p.dead && p.def.look === 'cambia') drawCambiaFrente(this.fireG, p);
    this.grieta.render();
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
    // Una súper nueva apaga las luces de la anterior (si no, la discoteca de René quedaba pegada
    // cuando otro tiraba su súper encima).
    this.stopAllLights(lights);
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
    else if (lights === 'neon') this.neon.start(Math.max(0, freeze - 18));
    else if (lights === 'tormenta') this.storm.start();
    else if (lights === 'ultrainstinto') this.ultraShow.start();
    else this.party.start();
  }

  /** Apaga todos los shows de luces menos `keep` (el que está por empezar). */
  private stopAllLights(keep?: LightsKind): void {
    if (keep !== 'disco') this.disco.stop();
    if (keep !== 'neon') this.neon.stop();
    if (keep !== 'tormenta') this.storm.stop();
    if (keep !== 'ultrainstinto') this.ultraShow.stop();
    if (keep !== 'fiesta') this.party.stop();
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
      if (!running || (this.discoT > this.discoMax && !o.ultraRun) || this.discoT > this.discoMax + 900) {
        this.discoOwner = null;
        this.stopAllLights();
      }
    }
    // Ultra instinto: aura plateada que sube alrededor de quien lo hace.
    if (this.discoOwner && this.lightsKind === 'ultrainstinto') {
      const o = this.discoOwner;
      this.fx.powerAura(o.x, o.y, 0xe8f0ff, this.discoT);
      this.fx.aura(o.x, o.y - 60, 0xffffff);
    }
    this.disco.step();
    this.neon.step();
    this.storm.step();
    this.ultraShow.step();
    this.party.step();
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
    // El duelo bajo la luna: los dos se ven como siluetas negras a contraluz.
    const silueta = !!backdrop && !!this.activeUltraCinematic()?.silueta;
    stage.update(camLeft - sx, this.camOffY + sy);
    this.disco.update(this.camOffY + sy);
    this.neon.update(this.camOffY + sy);
    this.storm.update(this.camOffY + sy);
    this.ultraShow.update(this.camOffY + sy);
    this.party.update(this.camOffY + sy);
    this.renderElemental();
    for (const [f, v] of this.views) {
      // En 2 VS 2 se ven el punto y los extras (ayuda, el que sale, el caído que se desvanece).
      const point = m.fighters[0] === f || m.fighters[1] === f;
      const ex = point || !m.extras.length ? null : m.extraOf(f);
      v.visible = point || !!ex;
      if (!v.visible) continue;
      v.alpha = ex?.role === 'dead' ? Math.max(0, Math.min(1, (DEAD_LINGER - ex.t) / 20)) : 1;
      v.sprite.zIndex = point ? (f.side === 0 ? 4 : 3) : f.side === 0 ? 2 : 1;
      v.silueta = silueta;
      v.update();
    }
    this.projViews.update(m);
    this.updatePowerGlows();
    this.fx.sync();
    this.smears.draw();
    this.hud.update(m, camLeft, this.camOffY);
    this.live.update(m);
    const punch = this.punchT > 0 ? (this.punchT / this.punchMax) * (this.punchMax > 10 ? 0.11 : 0.07) : 0;
    this.zoom.enabled = this.zoomT > 0 || punch > 0;
    this.zoom.strength = Math.max((this.zoomT / 40) * 0.14, punch);
    this.punchFlash.alpha = this.punchT > 0 && this.punchMax > 10 ? (this.punchT / this.punchMax) * 0.22 : 0;
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
