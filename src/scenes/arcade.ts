// ARCADE: el jugador elige su luchador y tiene que ganarle a cada uno de los demás,
// uno tras otro, contra la CPU (la última pelea es un poco más difícil).
// Antes de cada pelea, LA TORRE: un rascacielos de neón con un piso por rival (siempre en el
// mismo orden; la final en el último piso) y cada rival esperando en su piso. Primero se ve
// la torre entera; después el ascensor sube con la cara del jugador hasta el piso del
// próximo rival. Cada rival pelea en su escenario. Después de la torre, la pantalla VS. Si pierde:
// ¿CONTINUAR? (cuenta regresiva; con aceptar repite esa pelea). Si gana todas: ¡CAMPEÓN!,
// con el tiempo total (lo que duraron sus peleas), que se sube al ranking si tiene cuenta.

import { ColorMatrixFilter, Container, Graphics, Sprite, type Filter, type Text, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { loadDifficulty } from '../app/settings';
import { costumeFilter } from '../render/costume';
import { NEON_CYAN, NEON_PINK } from '../render/live';
import { arcade, outlinedText } from '../render/text';
import { tactil } from '../input/touch';
import { subirRecordArcade } from '../online/cuenta';
import { DIFFICULTIES, DIFFICULTY_NAME, type DifficultyId } from '../sim/difficulty';
import { FightScene } from './fight';
import { MainMenuScene } from './modeSelect';
import { loadTitleArena } from './title';
import { Progreso } from '../content/descargas';
import { BarraCarga } from '../render/barraCarga';
import { backdrop } from './backdrop';

/** Dónde es una pelea: el escenario (null = el ring de EL GRAN TORNEO) y su nombre. */
interface Venue {
  stageId: string | null;
  nombre: string;
}

/** Si no hay ningún escenario en la lista: el ring del título. */
const RING: Venue = { stageId: null, nombre: 'EL GRAN TORNEO' };

/** Una partida de ARCADE: el luchador del jugador (índice del plantel), su color, los rivales y sus escenarios. */
interface ArcadeRun {
  player: number;
  color: number;
  opponents: number[];
  venues: Venue[];
  /** Pelea que toca (0 = la primera). */
  index: number;
  /** Dificultad con que se empezó (la del ranking). */
  dificultad: DifficultyId;
  /** Cuadros que llevan sus peleas (las perdidas también) y veces que continuó. */
  frames: number;
  continues: number;
}

/**
 * Empieza el ARCADE: los rivales son todos los demás luchadores del plantel, siempre en el
 * mismo orden (el de ELIGE LUCHADOR, de abajo hacia arriba en la torre; el último es la final).
 * Cada rival pelea en su escenario. Quien no tiene uno pelea en uno que no es de nadie del
 * plantel (o en el del jugador).
 */
export function startArcade(game: Game, player: number, color: number): Scene {
  const roster = game.assets.roster;
  const entries = game.assets.stages.entries.filter((e) => e.json);
  const opponents = roster.map((_, i) => i).filter((i) => i !== player);
  // Con un solo luchador en el plantel, pelea contra sí mismo (de otro color).
  if (!opponents.length) opponents.push(player);
  const ids = new Set(roster.map((f) => f.def.id));
  const libre = entries.find((e) => !e.luchador || !ids.has(e.luchador)) ?? entries.find((e) => e.luchador === roster[player].def.id);
  const venues = opponents.map((o): Venue => {
    const e = entries.find((x) => x.luchador === roster[o].def.id) ?? libre;
    return e ? { stageId: e.id, nombre: e.nombre } : RING;
  });
  return new ArcadeTowerScene(game, {
    player, color, opponents, venues, index: 0,
    dificultad: loadDifficulty(), frames: 0, continues: 0,
  });
}

type Frames = Array<{ tex: Texture; dur: number }>;

/** Luchador grande animado (guardia o victoria), mirando hacia `facing`. */
class BigFighter {
  readonly sprite = new Sprite();
  private frames: Frames;
  private fi = 0;
  private ft = 0;

  constructor(game: Game, index: number, anim: string, height: number, facing: 1 | -1, filter: Filter | null) {
    const a = game.assets.roster[index];
    const list = a.def.anims[anim]?.frames ?? a.def.anims.idle.frames;
    this.frames = list.map((fr) => ({ tex: game.assets.textures[fr.tex], dur: fr.dur })).filter((fr) => fr.tex);
    const k = ((a.def.texScale ?? 1) * height) / 160;
    this.sprite.scale.set(k * facing, k);
    if (filter) this.sprite.filters = [filter];
    this.show();
  }

  private show(): void {
    const tex = this.frames[this.fi]?.tex;
    if (!tex) return;
    this.sprite.texture = tex;
    this.sprite.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
  }

  step(loop = true): void {
    if (!this.frames.length) return;
    if (++this.ft < this.frames[this.fi].dur) return;
    this.ft = 0;
    if (this.fi + 1 < this.frames.length) this.fi++;
    else if (loop) this.fi = 0;
    this.show();
  }
}

/** Escena de menú simple con el fondo de luces del título. */
abstract class ArcadeScreen implements Scene {
  readonly music = 'titulo';
  protected ui = new Container();
  protected t = 0;

  constructor(protected game: Game) {
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.6 });
    this.ui.addChild(bg);
  }

  enter(): void {
    backdrop.attach(this.game);
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    backdrop.detach(this.game);
    this.game.display.hud.removeChild(this.ui);
    this.ui.destroy({ children: true });
  }

  abstract step(): void;

  render(): void {
    backdrop.render();
  }

  protected text(s: string, size: number, x: number, y: number, fill = 0xffffff, stroke = 0x0a0610): Text {
    const t = outlinedText(s, size, fill, stroke, Math.max(2, Math.round(size / 5)));
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.ui.addChild(t);
    return t;
  }
}

/** Antes de cada pelea: el jugador contra el rival que toca, con su número de pelea. */
class ArcadeVsScene extends ArcadeScreen {
  private left: BigFighter;
  private right: BigFighter;
  private go: Text;
  private loaded = false;
  private failed = false;
  private bar = new BarraCarga(200, 6, 'CARGANDO PELEA');
  private prog: Progreso | null = null;

  constructor(game: Game, private run: ArcadeRun) {
    super(game);
    const roster = game.assets.roster;
    const opp = run.opponents[run.index];
    const n = run.opponents.length;
    this.text('ARCADE', 12, VIEW_W / 2, 18, 0xfff4e0, 0x5a0a10);
    this.text(arcade(run.index === n - 1 && n > 1 ? `PELEA FINAL · ${n} DE ${n}` : `PELEA ${run.index + 1} DE ${n}`), 8, VIEW_W / 2, 36, 0xffd040);
    this.left = new BigFighter(game, run.player, 'idle', 160, 1, costumeFilter(run.color, game.assets.roster[run.player].def.costume));
    this.right = new BigFighter(game, opp, 'idle', 160, -1, opp === run.player ? costumeFilter(run.color + 1, roster[opp].def.costume) : null);
    this.left.sprite.position.set(104, 226);
    this.right.sprite.position.set(VIEW_W - 104, 226);
    const glowL = new Graphics().ellipse(104, 226, 52, 9).fill({ color: NEON_PINK, alpha: 0.3 });
    const glowR = new Graphics().ellipse(VIEW_W - 104, 226, 52, 9).fill({ color: NEON_CYAN, alpha: 0.3 });
    this.ui.addChild(glowL, glowR, this.left.sprite, this.right.sprite);
    this.text(arcade(roster[run.player].def.name.toUpperCase()), 9, 104, 240, NEON_PINK);
    this.text(arcade(roster[opp].def.name.toUpperCase()), 9, VIEW_W - 104, 240, NEON_CYAN);
    this.text('VS', 34, VIEW_W / 2, 118, 0xffd040, 0x5a0a10);
    this.go = this.text('', 7, VIEW_W / 2, 196, 0xd8d0e8);
    const venue = run.venues[run.index];
    this.text(arcade(venue.nombre), 7, VIEW_W / 2, 150, 0xffffff);
    this.bar.container.position.set(VIEW_W / 2, 198);
    this.ui.addChild(this.bar.container);
    this.load();
  }

  /** Baja lo que falte para la pelea (luchadores y escenario; la final es en el ring del título). */
  private load(): void {
    const game = this.game;
    const venue = this.run.venues[this.run.index];
    const prog = new Progreso();
    this.prog = prog;
    this.failed = false;
    const fighters = [this.run.player, this.run.opponents[this.run.index]];
    Promise.all([game.assets.content.prepare({ fighters, stage: venue.stageId }, prog), venue.stageId ? null : loadTitleArena(prog)]).then(
      ([stage, arena]) => {
        const st = stage ?? arena;
        if (st) game.assets.stage = st;
        game.assets.stageId = venue.stageId ?? '';
        this.loaded = true;
      },
      (err: unknown) => {
        console.warn('ARCADE: no se pudo cargar la pelea.', err);
        this.failed = true;
      },
    );
  }

  step(): void {
    this.t++;
    this.left.step();
    this.right.step();
    const verb = tactil() ? 'TOCA' : 'ACEPTAR';
    this.go.text = arcade(this.failed ? `NO SE PUDO CARGAR · ${verb} PARA REINTENTAR` : `${verb} PARA PELEAR`);
    this.go.visible = (this.loaded || this.failed) && Math.floor(this.t / 20) % 2 === 0;
    this.bar.container.visible = !this.loaded && !this.failed;
    const m = this.game.menu;
    if (m.back && this.t > 10) {
      this.game.sfx.play('menuBack');
      this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    // Aquí (y en el resto del ARCADE) un toque en cualquier parte es aceptar.
    const ok = m.confirm || !!m.tap;
    if (this.failed && ok) this.load();
    if (this.loaded && ((ok && this.t > 20) || this.t >= 210)) this.fight();
  }

  private fight(): void {
    const g = this.game;
    const run = this.run;
    const n = run.opponents.length;
    const opp = run.opponents[run.index];
    // La dificultad elegida; la pelea final, un nivel más (y uno más cada 3 peleas).
    const base = DIFFICULTIES.indexOf(run.dificultad);
    const level = Math.min(DIFFICULTIES.length - 1, base + Math.floor(run.index / 3) + (run.index === n - 1 && n > 1 ? 1 : 0));
    g.sfx.play('menuConfirm');
    g.setScene(
      new FightScene(g, 'cpu', undefined, {
        fighters: [run.player, opp],
        colors: [run.color, opp === run.player ? run.color + 1 : 0],
        difficulty: DIFFICULTIES[level],
        next: (winner, frames) => {
          const r = { ...run, frames: run.frames + frames };
          if (winner !== 0) return new ArcadeContinueScene(g, r);
          if (run.index + 1 < n) return new ArcadeTowerScene(g, { ...r, index: run.index + 1 });
          return new ArcadeEndScene(g, r);
        },
      }),
    );
  }

  override render(): void {
    super.render();
    if (this.bar.container.visible) this.bar.update(this.prog);
  }
}

/** La torre: alto de cada piso y del vestíbulo, ancho (unidades de pantalla) y dónde queda en pantalla el piso al que se sube. */
const PISO = 64;
const VESTIBULO = 40;
const TORRE_W = 176;
const FOCO_Y = 150;
/** Lo que sobresale encima del último piso: el techo, el letrero y la antena. */
const TECHO = 70;
/** La torre entera: dónde queda la calle en pantalla y cuánto alto tiene (bajo los títulos). */
const CALLE_Y = 250;
const ALTO_VISTA = 192;
/** El vidrio de cada piso (donde espera el rival): borde izquierdo, ancho y alto. */
const SALA_X = -TORRE_W / 2 + 7;
const SALA_W = TORRE_W - 14;
const SALA_H = PISO - 10;
/** Cuadros mirando la torre entera, y cuadro en que llega el ascensor (la cámara se acerca mientras sube). */
const VISTA = 45;
const SUBIDA = 165;

/** Número entre 0 y 1, siempre el mismo para el mismo `a` (pseudoazar fijo). */
function azar(a: number): number {
  const h = Math.sin(a) * 43758.5453;
  return h - Math.floor(h);
}

/** Ventanas encendidas de la ciudad: siempre las mismas. */
function encendida(edificio: number, k: number): boolean {
  return azar(edificio * 127.1 + k * 311.7) < 0.42;
}

/** Centro de un piso en la torre (el suelo en y = 0, hacia arriba negativo); -1 es el vestíbulo. */
function centroPiso(k: number): number {
  return k < 0 ? -VESTIBULO / 2 : -(VESTIBULO + k * PISO + PISO / 2);
}

/** Color entre `a` y `b` (f de 0 a 1). */
function mezcla(a: number, b: number, f: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f) << s;
  return c(16) | c(8) | c(0);
}

/**
 * Antes de cada pelea, LA TORRE: un rascacielos de neón con un piso por rival, cada uno esperando de pie
 * detrás del vidrio de su piso con el nombre de su escenario (los vencidos en gris con una X; la final en
 * el último piso, bajo el letrero de EL GRAN TORNEO). Primero se ve la torre entera; después la cámara se
 * acerca mientras el ascensor de vidrio sube con la cara del jugador desde el piso anterior (o la entrada)
 * hasta el del próximo rival. A los lados, el jugador y el rival en grande: el rival en sombra hasta que
 * llega el ascensor.
 */
class ArcadeTowerScene extends ArcadeScreen {
  private cielo = new Graphics();
  private ciudad = new Container();
  private torre = new Container();
  private brillos = new Graphics();
  private cabina = new Container();
  private yo: BigFighter;
  private rival: BigFighter;
  private rivalFiltro: Filter | null;
  /** Los rivales chicos, cada uno en su piso. */
  private esperando: BigFighter[] = [];
  private abajo: Text;
  private vistaK: number;
  private camHasta: number;
  private alto: number;

  constructor(game: Game, private run: ArcadeRun) {
    super(game);
    const roster = game.assets.roster;
    const n = run.opponents.length;
    const i = run.index;
    const opp = run.opponents[i];
    this.alto = VESTIBULO + n * PISO;
    // Primero la torre entera (achicada para que quepa bajo los títulos); después, el piso del
    // rival a tamaño real (en la final, un poco más arriba: el letrero).
    this.vistaK = Math.min(1, ALTO_VISTA / (this.alto + TECHO));
    this.camHasta = FOCO_Y - centroPiso(i) + (i === n - 1 ? 22 : 0);
    this.torre.position.set(VIEW_W / 2, CALLE_Y);
    this.torre.scale.set(this.vistaK);
    this.dibujarCielo();
    this.dibujarCiudad();
    this.dibujarTorre();
    this.ui.addChild(this.cielo, this.ciudad, this.torre);

    // El jugador a la izquierda y el rival a la derecha (en sombra hasta que llega el ascensor).
    this.yo = new BigFighter(game, run.player, 'idle', 118, 1, costumeFilter(run.color, roster[run.player].def.costume));
    this.rivalFiltro = opp === run.player ? costumeFilter(run.color + 1, roster[opp].def.costume) : null;
    this.rival = new BigFighter(game, opp, 'idle', 118, -1, null);
    const sombra = new ColorMatrixFilter();
    sombra.matrix = [0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.04, 0, 0, 0, 0, 0.2, 0, 0, 0, 1, 0];
    this.rival.sprite.filters = [sombra];
    this.yo.sprite.position.set(74, 238);
    this.rival.sprite.position.set(VIEW_W - 74, 238);
    const glowL = new Graphics().ellipse(74, 238, 44, 8).fill({ color: NEON_PINK, alpha: 0.3 });
    const glowR = new Graphics().ellipse(VIEW_W - 74, 238, 44, 8).fill({ color: NEON_CYAN, alpha: 0.3 });
    this.ui.addChild(glowL, glowR, this.yo.sprite, this.rival.sprite);
    this.text(arcade(roster[run.player].def.name.toUpperCase()), 7, 74, 250, NEON_PINK);
    this.text(arcade(roster[opp].def.name.toUpperCase()), 7, VIEW_W - 74, 250, NEON_CYAN);

    const final = i === n - 1 && n > 1;
    // Franja de arriba: los títulos no quedan encima de la torre.
    const banda = new Graphics();
    banda.rect(0, 0, VIEW_W, 50).fill({ color: 0x0a0414, alpha: 0.92 });
    banda.rect(0, 50, VIEW_W, 1).fill({ color: NEON_PINK, alpha: 0.7 });
    this.ui.addChild(banda);
    this.text('ARCADE', 12, VIEW_W / 2, 14, 0xfff4e0, 0x5a0a10);
    this.text(arcade(final ? 'PELEA FINAL · ÚLTIMO PISO' : `PISO ${i + 1} DE ${n}`), 8, VIEW_W / 2, 31, 0xffd040);
    this.text(arcade(run.venues[i].nombre), 6, VIEW_W / 2, 43, 0xd8d0e8);
    this.abajo = this.text(arcade(final ? 'SUBIENDO AL ÚLTIMO PISO…' : `SUBIENDO AL PISO ${i + 1}…`), 8, VIEW_W / 2, 260, 0xd8d0e8);
  }

  /** El cielo de noche (tapa el fondo de los menús) con estrellas. */
  private dibujarCielo(): void {
    const g = this.cielo;
    const bandas = 16;
    for (let b = 0; b < bandas; b++) {
      g.rect(0, (VIEW_H * b) / bandas, VIEW_W, VIEW_H / bandas + 1).fill({ color: mezcla(0x04020c, 0x2a1050, b / (bandas - 1)) });
    }
    for (let s = 0; s < 80; s++) {
      const y = azar(s * 7.31 + 2) * VIEW_H * 0.75;
      g.rect(azar(s * 3.17 + 1) * VIEW_W, y, 1, 1).fill({ color: 0xfff4e0, alpha: 0.25 + azar(s * 5.9) * 0.55 });
    }
  }

  /** La ciudad de noche detrás de la torre (baja más lento que la torre mientras se sube). */
  private dibujarCiudad(): void {
    const g = new Graphics();
    let x = -10;
    let k = 0;
    while (x < VIEW_W + 10) {
      const w = 22 + ((k * 37) % 30);
      const h = 34 + ((k * 53) % 70);
      g.rect(x, -h, w, h + 60).fill({ color: k % 2 ? 0x1a0f33 : 0x150b2b, alpha: 0.95 });
      for (let r = 0; r < h / 12 - 1; r++) {
        for (let c = 0; c < w / 8 - 1; c++) {
          if (encendida(k + 40, r * 9 + c)) g.rect(x + 4 + c * 8, -h + 6 + r * 12, 3, 5).fill({ color: 0xffc870, alpha: 0.35 });
        }
      }
      x += w + 3;
      k++;
    }
    this.ciudad.addChild(g);
  }

  private dibujarTorre(): void {
    const run = this.run;
    const roster = this.game.assets.roster;
    const n = run.opponents.length;
    const alto = this.alto;
    const x0 = -TORRE_W / 2;
    const g = new Graphics();
    // La calle, con su línea de neón (ancha: con la torre entera se ve achicada).
    g.rect(-VIEW_W * 4, 0, VIEW_W * 8, 80).fill({ color: 0x0a0614 });
    g.rect(-VIEW_W * 4, 0, VIEW_W * 8, 1.2).fill({ color: NEON_CYAN, alpha: 0.55 });
    // Cuerpo de vidrio oscuro con una franja de reflejo.
    g.rect(x0, -alto, TORRE_W, alto).fill({ color: 0x120a26 });
    g.rect(x0, -alto, TORRE_W * 0.42, alto).fill({ color: 0x1c1238, alpha: 0.55 });
    // Separación entre pisos.
    for (let k = 0; k <= n; k++) {
      const y = -(VESTIBULO + k * PISO);
      g.rect(x0 - 5, y - 2, TORRE_W + 10, 4).fill({ color: 0x2a1446 });
      g.rect(x0 - 5, y - 0.5, TORRE_W + 10, 1).fill({ color: NEON_PINK, alpha: 0.75 });
    }
    // La entrada: puertas de vidrio.
    g.rect(-26, -30, 52, 30).fill({ color: 0x0c1830 }).stroke({ color: NEON_CYAN, width: 1, alpha: 0.8 });
    g.rect(-0.5, -30, 1, 30).fill({ color: NEON_CYAN, alpha: 0.6 });
    // El techo escalonado y la antena.
    g.rect(x0 + 10, -alto - 10, TORRE_W - 20, 10).fill({ color: 0x1a0f33 }).stroke({ color: NEON_CYAN, width: 1, alpha: 0.7 });
    g.rect(x0 + 36, -alto - 20, TORRE_W - 72, 10).fill({ color: 0x1a0f33 }).stroke({ color: NEON_CYAN, width: 1, alpha: 0.7 });
    g.rect(-1.5, -alto - 64, 3, 44).fill({ color: 0x6a5a8a });
    // Bordes de neón.
    for (const [w, a] of [[5, 0.12], [2.6, 0.3], [1.1, 1]] as const) {
      g.rect(x0, -alto, TORRE_W, alto).stroke({ color: NEON_CYAN, width: w, alpha: a });
    }
    // El ascensor de vidrio: dos rieles por fuera, a la derecha.
    const rx = x0 + TORRE_W + 13;
    g.rect(rx - 10, -alto - 4, 1, alto + 4).fill({ color: 0x8a7aa8, alpha: 0.7 });
    g.rect(rx + 9, -alto - 4, 1, alto + 4).fill({ color: 0x8a7aa8, alpha: 0.7 });
    this.torre.addChild(g);

    const entrada = outlinedText('ENTRADA', 5, NEON_CYAN, 0x0a0610, 1);
    entrada.anchor.set(0.5);
    entrada.position.set(0, -35);
    const letrero = outlinedText('EL GRAN TORNEO', 10, 0xffd040, 0x5a0a10, 2);
    letrero.anchor.set(0.5);
    letrero.position.set(0, -alto - 32);
    this.torre.addChild(entrada, letrero);

    // Cada piso: el rival de pie detrás del vidrio, con la luz de su color, su nombre, el piso y su escenario.
    run.opponents.forEach((o, k) => {
      const a = roster[o];
      const top = -(VESTIBULO + (k + 1) * PISO) + 6;
      const bottom = top + SALA_H;
      const hecho = k < run.index;
      const tinte = a.def.ui.color;
      const sala = new Graphics();
      sala.rect(SALA_X, top, SALA_W, SALA_H).fill({ color: hecho ? 0x07040d : 0x0d0820 });
      if (!hecho) {
        sala.rect(SALA_X, top, SALA_W, SALA_H).fill({ color: tinte, alpha: 0.14 });
        sala.rect(SALA_X, top, SALA_W, 3).fill({ color: tinte, alpha: 0.5 });
        for (let l = 0; l < 4; l++) sala.rect(SALA_X + 14 + l * 40, top + 3, 12, 1.5).fill({ color: 0xfff4e0, alpha: 0.75 });
        sala.rect(SALA_X, bottom - 3, SALA_W, 3).fill({ color: tinte, alpha: 0.55 });
      }
      this.torre.addChild(sala);

      // El rival mirando hacia el ascensor, sin salirse de su piso.
      const chico = new BigFighter(this.game, o, 'idle', 46, 1, o === run.player ? costumeFilter(run.color + 1, a.def.costume) : null);
      chico.sprite.position.set(SALA_X + SALA_W - 32, bottom - 3);
      if (hecho) {
        const gris = new ColorMatrixFilter();
        gris.desaturate();
        gris.brightness(0.5, true);
        chico.sprite.filters = [gris];
      }
      const mascara = new Graphics().rect(SALA_X, top, SALA_W, SALA_H).fill({ color: 0xffffff });
      chico.sprite.mask = mascara;
      this.torre.addChild(mascara, chico.sprite);
      this.esperando.push(chico);

      // El reflejo del vidrio y su marco.
      const vidrio = new Graphics();
      vidrio.poly([SALA_X + 18, top, SALA_X + 40, top, SALA_X + 22, bottom, SALA_X, bottom, SALA_X, bottom - 8]).fill({ color: 0xffffff, alpha: 0.04 });
      vidrio.rect(SALA_X, top, SALA_W, SALA_H).stroke({ color: hecho ? 0x3a2e4a : 0x5a4a7a, width: 1 });
      if (hecho) {
        const cx = SALA_X + SALA_W - 32;
        const cy = top + SALA_H / 2;
        vidrio.moveTo(cx - 16, cy - 18).lineTo(cx + 16, cy + 18).moveTo(cx + 16, cy - 18).lineTo(cx - 16, cy + 18).stroke({ color: 0xff3348, width: 3 });
      }
      this.torre.addChild(vidrio);

      const final = k === n - 1 && n > 1;
      const tx = SALA_X + 8;
      const nombre = outlinedText(arcade(a.def.name.toUpperCase()), 7, hecho ? 0x8a7fa0 : 0xffffff, 0x0a0610, 2);
      nombre.anchor.set(0, 0.5);
      nombre.position.set(tx, top + 13);
      nombre.scale.set(Math.min(1, 92 / Math.max(1, nombre.width)));
      const piso = outlinedText(arcade(hecho ? 'VENCIDO' : final ? `PISO ${k + 1} · FINAL` : `PISO ${k + 1}`), 5, hecho ? 0xff5a6a : 0xffd040, 0x0a0610, 1);
      piso.anchor.set(0, 0.5);
      piso.position.set(tx, top + 26);
      const sede = outlinedText(arcade(run.venues[k].nombre), 4, hecho ? 0x6a5f80 : 0xc8b8e8, 0x0a0610, 1);
      sede.anchor.set(0, 0.5);
      sede.position.set(tx, top + 37);
      sede.scale.set(Math.min(1, 92 / Math.max(1, sede.width)));
      this.torre.addChild(nombre, piso, sede);
    });
    this.torre.addChild(this.brillos);

    // La cabina del ascensor, con la cara del jugador.
    const cab = new Graphics();
    cab.roundRect(-11, -14, 22, 28, 3).fill({ color: 0x140a24, alpha: 0.9 }).stroke({ color: NEON_PINK, width: 1.4 });
    this.cabina.addChild(cab);
    const mia = roster[run.player].face;
    if (mia) {
      const cara = new Sprite(mia);
      cara.anchor.set(0.5);
      cara.width = 18;
      cara.height = 18;
      cara.position.set(0, -1);
      this.cabina.addChild(cara);
    }
    this.cabina.position.set(rx, centroPiso(run.index - 1));
    this.torre.addChild(this.cabina);
  }

  step(): void {
    this.t++;
    this.yo.step();
    this.rival.step();
    for (const f of this.esperando) f.step();
    const m = this.game.menu;
    if (m.back && this.t > 10) {
      this.game.sfx.play('menuBack');
      this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.t === SUBIDA) {
      // Llegó: "ding", el rival sale de la sombra.
      this.game.sfx.play('menuConfirm');
      this.rival.sprite.filters = this.rivalFiltro ? [this.rivalFiltro] : [];
      this.abajo.text = '¡A PELEAR!';
      this.abajo.style.fill = 0xffd040;
      this.abajo.style.fontSize = Math.round(14 * 1.45);
    }
    if (this.t > SUBIDA) this.abajo.visible = Math.floor(this.t / 12) % 2 === 0;
    if (((m.confirm || m.tap) && this.t > 15) || this.t >= SUBIDA + 80) this.game.setScene(new ArcadeVsScene(this.game, this.run));
  }

  override render(): void {
    super.render();
    const k = Math.min(1, Math.max(0, (this.t - VISTA) / (SUBIDA - VISTA)));
    const e = k * k * (3 - 2 * k);
    const i = this.run.index;
    this.torre.y = CALLE_Y + (this.camHasta - CALLE_Y) * e;
    this.torre.scale.set(this.vistaK + (1 - this.vistaK) * e);
    this.cabina.y = centroPiso(i - 1) + (centroPiso(i) - centroPiso(i - 1)) * e;
    // La ciudad baja más lento que la torre (está más lejos).
    this.ciudad.y = CALLE_Y + (this.torre.y - CALLE_Y) * 0.25;
    // El piso del rival late; la luz de la antena pestañea; al llegar, un destello.
    const b = this.brillos;
    b.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 6);
    const top = centroPiso(i) - PISO / 2 + 6;
    b.rect(SALA_X - 2, top - 2, SALA_W + 4, SALA_H + 4).stroke({ color: NEON_CYAN, width: 2, alpha: 0.35 + pulse * 0.5 });
    if (Math.floor(this.t / 30) % 2 === 0) b.circle(0, -this.alto - 66, 2.6).fill({ color: 0xff3348 });
    if (this.t > SUBIDA) {
      const d = this.t - SUBIDA;
      b.rect(SALA_X - 2 - d * 2, top - 2 - d, SALA_W + 4 + d * 4, SALA_H + 4 + d * 2).stroke({ color: 0xffffff, width: 1.4, alpha: Math.max(0, 1 - d / 22) });
    }
  }
}

/** Perdió una pelea: ¿CONTINUAR? con cuenta regresiva (aceptar repite esa pelea). */
class ArcadeContinueScene extends ArcadeScreen {
  private count: Text;
  private sub: Text;
  private left = 10;
  private over = -1;
  private fighter: BigFighter;

  constructor(game: Game, private run: ArcadeRun) {
    super(game);
    this.fighter = new BigFighter(game, run.player, 'lose', 130, 1, costumeFilter(run.color, game.assets.roster[run.player].def.costume));
    this.fighter.sprite.position.set(VIEW_W / 2, 236);
    this.fighter.sprite.alpha = 0.85;
    this.ui.addChild(this.fighter.sprite);
    this.text('¿CONTINUAR?', 22, VIEW_W / 2, 46, 0xfff4e0, 0x5a0a10);
    this.count = this.text('9', 40, VIEW_W / 2, 94, 0xffd040, 0x5a0a10);
    this.sub = this.text(arcade(tactil() ? 'TOCA PARA SEGUIR · ☰ PARA SALIR' : 'ACEPTAR PARA SEGUIR · ESC PARA SALIR'), 6, VIEW_W / 2, 128, 0xd8d0e8);
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (this.over >= 0) {
      if (++this.over >= 120 || ((m.confirm || m.tap) && this.over > 30)) this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.t % 60 === 1) {
      this.left--;
      this.count.text = String(this.left);
      if (this.left >= 0) this.game.sfx.play('menuMove');
    }
    if ((m.confirm || m.tap) && this.t > 15) {
      this.game.sfx.play('menuConfirm');
      this.game.setScene(new ArcadeVsScene(this.game, { ...this.run, continues: this.run.continues + 1 }));
      return;
    }
    if (m.back || this.left < 0) {
      // GAME OVER.
      this.over = 0;
      this.count.text = 'GAME OVER';
      this.count.style.fontSize = 24;
      this.sub.text = '';
      this.game.sfx.play('menuBack');
    }
  }
}

/** 332.4 → "5:32.4". */
function formatoTiempo(seg: number): string {
  const m = Math.floor(seg / 60);
  return `${m}:${(seg - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Le ganó a todos: ¡CAMPEÓN! con su pose de victoria, el tiempo total y si quedó en el ranking. */
class ArcadeEndScene extends ArcadeScreen {
  private fighter: BigFighter;
  private sparks = new Graphics();
  private stars: Array<{ x: number; y: number; v: number; c: number; s: number }> = [];
  private vivo = true;

  constructor(game: Game, run: ArcadeRun) {
    super(game);
    const a = game.assets.roster[run.player];
    this.ui.addChild(this.sparks);
    this.fighter = new BigFighter(game, run.player, 'win', 170, 1, costumeFilter(run.color, game.assets.roster[run.player].def.costume));
    this.fighter.sprite.position.set(VIEW_W / 2, 238);
    this.ui.addChild(this.fighter.sprite);
    this.text('¡CAMPEÓN!', 30, VIEW_W / 2, 34, 0xffd040, 0x5a0a10);
    this.text(arcade(`${a.def.name.toUpperCase()} GANÓ EL GRAN TORNEO DE CELL`), 8, VIEW_W / 2, 60, 0xfff4e0);
    const seg = run.frames / 60;
    const cont = run.continues ? ` · ${run.continues} ${run.continues === 1 ? 'CONTINUE' : 'CONTINUES'}` : '';
    this.text(arcade(`TIEMPO ${formatoTiempo(seg)} · ${DIFFICULTY_NAME[run.dificultad]}${cont}`), 7, VIEW_W / 2, 74, 0xffd040);
    const estado = this.text('GUARDANDO EN EL RANKING…', 6, VIEW_W / 2, 86, 0xd8d0e8);
    void subirRecordArcade({ dificultad: run.dificultad, luchador: a.def.id, segundos: seg, continues: run.continues }).then((aviso) => {
      if (!this.vivo) return;
      estado.text = arcade(aviso ?? '¡QUEDASTE EN EL RANKING DE LA WEB!');
      estado.style.fill = aviso ? 0xd8d0e8 : 0x8affb0;
    });
    const own = `${a.def.id}/voz/victoria`;
    if (game.sfx.has(own)) game.sfx.play(own);
    for (let i = 0; i < 70; i++) this.stars.push(this.newStar(true));
  }

  override exit(): void {
    this.vivo = false;
    super.exit();
  }

  private newStar(anywhere: boolean): { x: number; y: number; v: number; c: number; s: number } {
    const colors = [0xffd040, NEON_PINK, NEON_CYAN, 0xffffff];
    return { x: Math.random() * VIEW_W, y: anywhere ? Math.random() * VIEW_H : -4, v: 0.6 + Math.random() * 1.4, c: colors[Math.floor(Math.random() * 4)], s: 1 + Math.random() * 1.5 };
  }

  step(): void {
    this.t++;
    this.fighter.step(false);
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.y += s.v;
      s.x += Math.sin((this.t + i * 13) / 20) * 0.4;
      if (s.y > VIEW_H + 4) this.stars[i] = this.newStar(false);
    }
    const m = this.game.menu;
    if (this.t > 90 && (m.confirm || m.back || m.tap)) {
      this.game.sfx.play('menuConfirm');
      this.game.setScene(new MainMenuScene(this.game));
    }
  }

  override render(): void {
    super.render();
    this.sparks.clear();
    for (const s of this.stars) this.sparks.rect(s.x, s.y, s.s, s.s * 2.2).fill({ color: s.c, alpha: 0.85 });
  }
}
