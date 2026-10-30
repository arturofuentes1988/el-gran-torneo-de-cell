// ARCADE: el jugador elige su luchador y tiene que ganarle a cada uno de los demás,
// uno tras otro, contra la CPU (la última pelea es un poco más difícil).
// Antes de cada pelea, el MAPA: Chile acostado (el norte a la izquierda), en neón, con
// un avión que vuela de la sede anterior a la siguiente (como en Street Fighter II).
// Cada rival pelea en su escenario (o en uno libre) y la final es en el ring de
// EL GRAN TORNEO (el del título). Después del mapa, la pantalla VS. Si pierde:
// ¿CONTINUAR? (cuenta regresiva; con aceptar repite esa pelea). Si gana todas: ¡CAMPEÓN!

import { ColorMatrixFilter, Container, Graphics, Sprite, type Filter, type Text, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { loadDifficulty } from '../app/settings';
import { costumeFilter } from '../render/costume';
import { NEON_CYAN, NEON_PINK } from '../render/live';
import { arcade, outlinedText } from '../render/text';
import type { StagePlace } from '../content/stages';
import { DIFFICULTIES } from '../sim/difficulty';
import { FightScene } from './fight';
import { MainMenuScene } from './modeSelect';
import { loadTitleArena } from './title';
import { backdrop } from './backdrop';

/** Dónde es una pelea: el escenario (null = el ring de EL GRAN TORNEO), su nombre y su lugar en el mapa. */
interface Venue {
  stageId: string | null;
  nombre: string;
  lugar: StagePlace;
}

/** La final: el ring del título, en la costa central. */
const RING: Venue = { stageId: null, nombre: 'EL GRAN TORNEO', lugar: { nombre: 'EL GRAN TORNEO', lat: -33.05, lon: -71.62 } };
/** De dónde sale el avión si el luchador del jugador no tiene ciudad (el extremo norte). */
const START: StagePlace = { nombre: 'INICIO', lat: -18.48, lon: -70.31 };

/** Una partida de ARCADE: el luchador del jugador (índice del plantel), su color, los rivales y sus sedes. */
export interface ArcadeRun {
  player: number;
  color: number;
  opponents: number[];
  venues: Venue[];
  /** De dónde sale el viaje: la ciudad del luchador del jugador. */
  home: StagePlace;
  /** Pelea que toca (0 = la primera). */
  index: number;
}

/**
 * Empieza el ARCADE: los rivales son todos los demás luchadores del plantel. El viaje sale
 * de la ciudad del jugador y va a la de cada rival (de norte a sur), que pelea en su
 * escenario (o en uno libre de esa ciudad o de la lista); el último, en el ring del torneo.
 */
export function startArcade(game: Game, player: number, color: number): Scene {
  const roster = game.assets.roster;
  const entries = game.assets.stages.entries.filter((e) => e.json);
  const ids = roster.map((_, i) => i).filter((i) => i !== player);
  // Con un solo luchador en el plantel, pelea contra sí mismo (de otro color).
  if (!ids.length) ids.push(player);
  const used = new Set<string>();
  const venueOf = (opp: number): Venue => {
    const city = roster[opp].def.ciudad;
    const free = (x: (typeof entries)[number]) => !used.has(x.id);
    const mine = (x: (typeof entries)[number]) => x.luchador === roster[opp].def.id;
    const here = (x: (typeof entries)[number]) => !!city && x.lugar?.nombre === city.nombre;
    const e =
      entries.find((x) => free(x) && mine(x) && here(x)) ??
      entries.find((x) => free(x) && here(x)) ??
      entries.find((x) => free(x) && mine(x)) ??
      entries.find(free) ??
      entries[0];
    if (!e) return RING;
    used.add(e.id);
    // En el mapa va en la ciudad del rival (si se sabe); si no, donde queda el escenario.
    return { stageId: e.id, nombre: e.nombre, lugar: city ?? e.lugar ?? { nombre: e.nombre, lat: -33.45, lon: -70.66 } };
  };
  // La final (en el ring) es contra quien no tiene escenario propio; si todos tienen, contra
  // el que tiene más (así los demás pelean en su escenario, en su ciudad).
  const ownStages = (opp: number) => entries.filter((e) => e.luchador === roster[opp].def.id).length;
  const finalist = ids.reduce((best, opp) => {
    const a = ownStages(opp);
    const b = ownStages(best);
    return (a === 0) !== (b === 0) ? (a === 0 ? opp : best) : a >= b ? opp : best;
  }, ids[ids.length - 1]);
  ids.splice(ids.indexOf(finalist), 1);
  const last = finalist;
  const home = roster[player].def.ciudad ?? START;
  // La ruta: desde la casa del jugador, siempre a la ciudad más cercana que falte.
  const pending = ids.map((opp) => ({ opp, venue: venueOf(opp) }));
  const before: typeof pending = [];
  let here: StagePlace = home;
  while (pending.length) {
    const d = (v: Venue) => (v.lugar.lat - here.lat) ** 2 + (v.lugar.lon - here.lon) ** 2;
    const k = pending.reduce((best, f, i) => (d(f.venue) < d(pending[best].venue) ? i : best), 0);
    const [next] = pending.splice(k, 1);
    before.push(next);
    here = next.venue.lugar;
  }
  const fights = [...before, { opp: last, venue: RING }];
  return new ArcadeMapScene(game, { player, color, opponents: fights.map((f) => f.opp), venues: fights.map((f) => f.venue), home, index: 0 });
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
    const load = venue.stageId ? game.assets.stages.get(venue.stageId) : loadTitleArena();
    load.then(
      (st) => {
        game.assets.stage = st;
        this.loaded = true;
      },
      () => {
        this.loaded = true;
        this.failed = true;
      },
    );
  }

  step(): void {
    this.t++;
    this.left.step();
    this.right.step();
    this.go.text = arcade(this.loaded ? 'ACEPTAR PARA PELEAR' : 'CARGANDO...');
    this.go.visible = !this.loaded || Math.floor(this.t / 20) % 2 === 0;
    const m = this.game.menu;
    if (m.back && this.t > 10) {
      this.game.sfx.play('menuBack');
      this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.loaded && ((m.confirm && this.t > 20) || this.t >= 210)) this.fight();
  }

  private fight(): void {
    const g = this.game;
    const run = this.run;
    const n = run.opponents.length;
    const opp = run.opponents[run.index];
    // La dificultad elegida; la pelea final, un nivel más (y uno más cada 3 peleas).
    const base = DIFFICULTIES.indexOf(loadDifficulty());
    const level = Math.min(DIFFICULTIES.length - 1, base + Math.floor(run.index / 3) + (run.index === n - 1 && n > 1 ? 1 : 0));
    g.sfx.play('menuConfirm');
    if (this.failed) console.warn('ARCADE: no se pudo cargar el escenario del rival; se usa el actual.');
    g.setScene(
      new FightScene(g, 'cpu', undefined, {
        fighters: [run.player, opp],
        colors: [run.color, opp === run.player ? run.color + 1 : 0],
        difficulty: DIFFICULTIES[level],
        next: (winner) => {
          if (winner !== 0) return new ArcadeContinueScene(g, run);
          if (run.index + 1 < n) return new ArcadeMapScene(g, { ...run, index: run.index + 1 });
          return new ArcadeEndScene(g, run);
        },
      }),
    );
  }

  override render(): void {
    super.render();
  }
}

/** Contorno simplificado de Chile (latitud, longitud): la costa de norte a sur y la frontera de vuelta. */
const CHILE: ReadonlyArray<[number, number]> = [
  [-17.5, -70.4], [-18.5, -70.3], [-20.2, -70.15], [-22.1, -70.2], [-23.6, -70.4], [-25.4, -70.5], [-27.1, -70.9],
  [-29.9, -71.35], [-31.6, -71.55], [-33.0, -71.65], [-34.5, -72.05], [-36.8, -73.15], [-37.6, -73.65], [-39.8, -73.4],
  [-41.5, -73.9], [-41.9, -74.0], [-43.4, -74.3], [-44.5, -74.6], [-46.5, -75.6], [-48.5, -75.5], [-50.5, -75.4],
  [-52.4, -74.9], [-53.5, -73.5], [-54.5, -71.5], [-55.4, -69.5], [-55.9, -67.3], [-54.9, -66.8], [-53.0, -68.6],
  [-52.6, -68.6], [-52.3, -69.0], [-52.0, -71.0], [-51.0, -72.3], [-49.5, -73.2], [-48.0, -72.4], [-46.5, -71.8],
  [-45.0, -71.6], [-43.5, -71.8], [-42.0, -71.8], [-40.5, -71.9], [-39.0, -71.4], [-37.5, -71.1], [-36.0, -70.7],
  [-34.5, -70.3], [-33.0, -70.0], [-31.0, -70.1], [-29.0, -69.9], [-27.3, -68.8], [-25.0, -68.4], [-23.0, -67.2],
  [-21.5, -68.3], [-19.5, -68.6], [-18.0, -69.2], [-17.5, -69.5],
];

/** Chile acostado: el norte a la izquierda, el Pacífico abajo. */
function mapXY(p: { lat: number; lon: number }): { x: number; y: number } {
  return { x: 22 + (-p.lat - 17) * 11, y: 150 + (-71 - p.lon) * 9.5 };
}

/** Cuadros que dura el vuelo. */
const TRAVEL = 150;

/** El mapa: el avión vuela hasta la sede de la próxima pelea; las caras marcan a cada rival. */
class ArcadeMapScene extends ArcadeScreen {
  private map = new Graphics();
  private route = new Graphics();
  private plane = new Graphics();
  private marks = new Graphics();
  private from: { x: number; y: number };
  private to: { x: number; y: number };
  private c1: { x: number; y: number };
  private c2: { x: number; y: number };
  private arrived: Text;

  constructor(game: Game, private run: ArcadeRun) {
    super(game);
    const roster = game.assets.roster;
    const n = run.opponents.length;
    const venue = run.venues[run.index];
    this.from = mapXY(run.index === 0 ? run.home : run.venues[run.index - 1].lugar);
    this.to = mapXY(venue.lugar);
    if (Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y) < 8) {
      // Pelea en la misma ciudad: el avión da una vuelta en el aire y vuelve a bajar.
      this.c1 = { x: this.from.x - 40, y: this.from.y - 52 };
      this.c2 = { x: this.to.x + 40, y: this.to.y - 52 };
    } else {
      // El vuelo hace una curva por arriba (por el lado de la cordillera).
      const ctrl = { x: (this.from.x + this.to.x) / 2, y: Math.min(this.from.y, this.to.y) - 46 };
      this.c1 = { x: this.from.x + ((ctrl.x - this.from.x) * 2) / 3, y: this.from.y + ((ctrl.y - this.from.y) * 2) / 3 };
      this.c2 = { x: this.to.x + ((ctrl.x - this.to.x) * 2) / 3, y: this.to.y + ((ctrl.y - this.to.y) * 2) / 3 };
    }
    this.drawMap();
    this.ui.addChild(this.map, this.route, this.marks);
    this.text('ARCADE', 12, VIEW_W / 2, 16, 0xfff4e0, 0x5a0a10);
    const final = run.index === n - 1 && n > 1;
    this.text(arcade(final ? `PELEA FINAL · RUMBO A ${venue.lugar.nombre}` : `PELEA ${run.index + 1} DE ${n} · RUMBO A ${venue.lugar.nombre}`), 7, VIEW_W / 2, 34, 0xffd040);
    if (venue.lugar.nombre !== venue.nombre) this.text(arcade(venue.nombre), 6, VIEW_W / 2, 46, 0xd8d0e8);
    // Las caras de los rivales sobre su ciudad (el de la final también, aunque pelee en el
    // ring), con el nombre de la ciudad debajo: los ya vencidos en gris con una X.
    const homes = run.opponents.map((o, i) => roster[o].def.ciudad ?? run.venues[i].lugar);
    const named = new Set<string>();
    homes.forEach((h, i) => {
      const at = mapXY(h);
      const face = roster[run.opponents[i]].face;
      // Si dos ciudades caen juntas, las caras se separan hacia los lados.
      const twins = homes.map((_, j) => j).filter((j) => Math.abs(mapXY(homes[j]).x - at.x) < 18);
      const slot = twins.indexOf(i);
      const dx = (slot - (twins.length - 1) / 2) * 30;
      const fx = at.x + dx;
      const fy = 72;
      if (!named.has(h.nombre)) {
        named.add(h.nombre);
        const city = outlinedText(arcade(h.nombre), 5, 0xd8d0e8, 0x0a0610, 1);
        city.anchor.set(0.5, 0);
        city.position.set(at.x, fy + 14);
        this.ui.addChild(city);
      }
      const frame = new Graphics();
      frame.moveTo(at.x, at.y - 4).lineTo(fx, fy + 22).stroke({ color: 0x8a7aa8, width: 0.8, alpha: 0.7 });
      frame.circle(at.x, at.y, 1.8).fill({ color: 0xd8d0e8 });
      frame.roundRect(fx - 12, fy - 12, 24, 24, 3).fill({ color: 0x140a24 }).stroke({ color: i === run.index ? NEON_CYAN : i < run.index ? 0x5a4a6a : 0xc89a3a, width: i === run.index ? 1.6 : 1 });
      this.ui.addChild(frame);
      if (face) {
        const s = new Sprite(face);
        s.anchor.set(0.5);
        s.width = 22;
        s.height = 22;
        s.position.set(fx, fy);
        if (i < run.index) {
          const grey = new ColorMatrixFilter();
          grey.desaturate();
          grey.brightness(0.55, true);
          s.filters = [grey];
        }
        this.ui.addChild(s);
      }
      if (i < run.index) {
        const x = new Graphics();
        x.moveTo(fx - 9, fy - 9).lineTo(fx + 9, fy + 9).moveTo(fx + 9, fy - 9).lineTo(fx - 9, fy + 9).stroke({ color: 0xff3348, width: 2.2 });
        this.ui.addChild(x);
      }
    });
    const homeAt = mapXY(run.home);
    const myFace = roster[run.player].face;
    if (myFace && run.index === 0) {
      const fy = 228 - 30;
      const frame = new Graphics();
      frame.moveTo(homeAt.x, homeAt.y + 4).lineTo(homeAt.x, fy - 12).stroke({ color: 0x8a7aa8, width: 0.8, alpha: 0.7 });
      frame.roundRect(homeAt.x - 12, fy - 12, 24, 24, 3).fill({ color: 0x140a24 }).stroke({ color: NEON_PINK, width: 1.6 });
      const s = new Sprite(myFace);
      s.anchor.set(0.5);
      s.width = 22;
      s.height = 22;
      s.position.set(homeAt.x, fy);
      const tag = outlinedText(arcade(`SALIDA: ${run.home.nombre}`), 5, NEON_PINK, 0x0a0610, 1);
      tag.anchor.set(0.5, 0);
      tag.position.set(homeAt.x, fy + 13);
      this.ui.addChild(frame, s, tag);
    }
    this.ui.addChild(this.plane);
    const opp = roster[run.opponents[run.index]];
    this.text(arcade(`PRÓXIMO RIVAL: ${opp.def.name.toUpperCase()}`), 8, VIEW_W / 2, 228, NEON_CYAN);
    this.arrived = this.text('¡A PELEAR!', 16, VIEW_W / 2, 250, 0xffd040, 0x5a0a10);
    this.arrived.visible = false;
  }

  /** Chile en neón, con el océano y la cordillera insinuados y las sedes del torneo. */
  private drawMap(): void {
    const g = this.map;
    // Paralelos tenues cada 5 grados.
    for (let lat = -20; lat >= -55; lat -= 5) {
      const { x } = mapXY({ lat, lon: -70 });
      g.moveTo(x, 92).lineTo(x, 212).stroke({ color: 0x3a2a5a, width: 0.6, alpha: 0.6 });
    }
    const pts = CHILE.map(([lat, lon]) => mapXY({ lat, lon }));
    g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: 0x1c1040, alpha: 0.92 });
    for (const [w, a] of [[5, 0.12], [2.6, 0.3], [1.1, 1]] as const) {
      g.poly(pts.flatMap((p) => [p.x, p.y])).stroke({ color: NEON_CYAN, width: w, alpha: a, join: 'round' });
    }
    const label = (s: string, x: number, y: number, color: number, size = 6): void => {
      const t = outlinedText(arcade(s), size, color, 0x0a0610, 1);
      t.anchor.set(0.5);
      t.position.set(x, y);
      t.alpha = 0.75;
      this.ui.addChild(t);
    };
    const homeX = mapXY(this.run.home).x;
    const oceanX = this.run.index > 0 || Math.abs(homeX - VIEW_W / 2) > 80 ? VIEW_W / 2 : homeX < VIEW_W / 2 ? homeX + 110 : homeX - 110;
    label('OCÉANO PACÍFICO', oceanX, 206, 0x6aa8d8);
    label('N', 14, 150, 0xffd040, 7);
    const arrow = new Graphics();
    arrow.moveTo(20, 158).lineTo(10, 158).moveTo(10, 158).lineTo(14, 155).moveTo(10, 158).lineTo(14, 161).stroke({ color: 0xffd040, width: 1 });
    this.ui.addChild(arrow);
    // Sedes: un punto por pelea, con su nombre.
    this.run.venues.forEach((v, i) => {
      const at = mapXY(v.lugar);
      g.circle(at.x, at.y, 2.4).fill({ color: i < this.run.index ? 0x5a4a6a : i === this.run.index ? 0xffd040 : 0xff8ac8 });
    });
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (m.back && this.t > 10) {
      this.game.sfx.play('menuBack');
      this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.t === TRAVEL) this.game.sfx.play('menuConfirm');
    this.arrived.visible = this.t > TRAVEL && Math.floor(this.t / 12) % 2 === 0;
    if ((m.confirm && this.t > 15) || this.t >= TRAVEL + 70) this.game.setScene(new ArcadeVsScene(this.game, this.run));
  }

  /** Punto de la curva del vuelo (0..1). */
  private at(k: number): { x: number; y: number } {
    const u = 1 - k;
    const a = u * u * u;
    const b = 3 * u * u * k;
    const c = 3 * u * k * k;
    const d = k * k * k;
    return {
      x: a * this.from.x + b * this.c1.x + c * this.c2.x + d * this.to.x,
      y: a * this.from.y + b * this.c1.y + c * this.c2.y + d * this.to.y,
    };
  }

  override render(): void {
    super.render();
    const k = Math.min(1, this.t / TRAVEL);
    const e = k * k * (3 - 2 * k);
    // Estela punteada desde la salida hasta el avión.
    const r = this.route;
    r.clear();
    for (let i = 0; i < 40; i++) {
      const a = i / 40;
      if (a > e) break;
      if (i % 2) continue;
      const p0 = this.at(a);
      const p1 = this.at(Math.min(e, a + 1 / 40));
      r.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y);
    }
    r.stroke({ color: 0xffffff, width: 1.2, alpha: 0.75 });
    // Destino que late y salida.
    const mk = this.marks;
    mk.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 6);
    mk.circle(this.to.x, this.to.y, 5 + pulse * 5).stroke({ color: 0xffd040, width: 1.2, alpha: 0.4 + pulse * 0.5 });
    mk.circle(this.from.x, this.from.y, 3).fill({ color: 0xffffff, alpha: 0.6 });
    if (this.t > TRAVEL) mk.circle(this.to.x, this.to.y, 4 + (this.t - TRAVEL) * 0.8).stroke({ color: 0xffffff, width: 1, alpha: Math.max(0, 1 - (this.t - TRAVEL) / 25) });
    // El avión, mirando hacia donde va.
    const p = this.at(e);
    const q = this.at(Math.min(1, e + 0.01));
    const ang = Math.atan2(q.y - p.y, q.x - p.x) || 0;
    const pl = this.plane;
    pl.clear();
    const rot = (x: number, y: number): [number, number] => [p.x + x * Math.cos(ang) - y * Math.sin(ang), p.y + x * Math.sin(ang) + y * Math.cos(ang)];
    const shape = (pts: Array<[number, number]>, color: number): void => {
      pl.poly(pts.flatMap(([x, y]) => rot(x, y))).fill({ color }).stroke({ color: 0x0a0610, width: 0.8 });
    };
    shape([[-6, -1.2], [6, -1], [8, 0], [6, 1], [-6, 1.2]], 0xffffff);
    shape([[0, -1], [-3, -7], [-5, -7], [-3, -1]], 0xe0e8ff);
    shape([[0, 1], [-3, 7], [-5, 7], [-3, 1]], 0xe0e8ff);
    shape([[-5, -1], [-7, -3.5], [-8, -3.5], [-7, -1]], 0xff5a7a);
    shape([[-5, 1], [-7, 3.5], [-8, 3.5], [-7, 1]], 0xff5a7a);
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
    this.sub = this.text(arcade('ACEPTAR PARA SEGUIR · ESC PARA SALIR'), 6, VIEW_W / 2, 128, 0xd8d0e8);
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (this.over >= 0) {
      if (++this.over >= 120 || (m.confirm && this.over > 30)) this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.t % 60 === 1) {
      this.left--;
      this.count.text = String(this.left);
      if (this.left >= 0) this.game.sfx.play('menuMove');
    }
    if (m.confirm && this.t > 15) {
      this.game.sfx.play('menuConfirm');
      this.game.setScene(new ArcadeVsScene(this.game, this.run));
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

/** Le ganó a todos: ¡CAMPEÓN! con su pose de victoria. */
class ArcadeEndScene extends ArcadeScreen {
  private fighter: BigFighter;
  private sparks = new Graphics();
  private stars: Array<{ x: number; y: number; v: number; c: number; s: number }> = [];

  constructor(game: Game, run: ArcadeRun) {
    super(game);
    const a = game.assets.roster[run.player];
    this.ui.addChild(this.sparks);
    this.fighter = new BigFighter(game, run.player, 'win', 170, 1, costumeFilter(run.color, game.assets.roster[run.player].def.costume));
    this.fighter.sprite.position.set(VIEW_W / 2, 238);
    this.ui.addChild(this.fighter.sprite);
    this.text('¡CAMPEÓN!', 30, VIEW_W / 2, 34, 0xffd040, 0x5a0a10);
    this.text(arcade(`${a.def.name.toUpperCase()} GANÓ EL GRAN TORNEO DE CELL`), 8, VIEW_W / 2, 60, 0xfff4e0);
    this.text(arcade(`${run.opponents.length} PELEAS GANADAS`), 7, VIEW_W / 2, 74, 0xd8d0e8);
    const own = `${a.def.id}/voz/victoria`;
    if (game.sfx.has(own)) game.sfx.play(own);
    for (let i = 0; i < 70; i++) this.stars.push(this.newStar(true));
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
    if (this.t > 90 && (m.confirm || m.back)) {
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
