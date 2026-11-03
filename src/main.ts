import '@fontsource/oswald/500.css';
import '@fontsource/oswald/700.css';
import type { Texture } from 'pixi.js';
import { Display } from './app/display';
import { autoFullscreen, installFullscreen } from './app/fullscreen';
import { installQaBridge } from './app/qa';
import { Game, type FightMode } from './app/game';
import { loadMuted } from './app/settings';
import { Sfx } from './audio/sfx';
import { FRAME_MS, GAME_FONT } from './config';
import { calidad } from './content/calidad';
import { Contenido } from './content/contenido';
import { cargarTamanos, Progreso } from './content/descargas';
import { loadFighterFolder, type FighterAsset } from './content/loadFighter';
import { StageLibrary } from './content/stages';
import { Gamepads, Keyboard, MenuInput } from './input/devices';
import { TouchControls } from './input/touch';
import { StageView } from './render/stage';
import { setTextResolution } from './render/text';
import { DemoScene } from './scenes/demo';
import { FightScene } from './scenes/fight';
import { LoadingScene } from './scenes/loading';
import { TitleScene, loadTitleArena } from './scenes/title';

/** Luchadores del plantel (carpetas de public/luchadores/), en este orden. */
const FIGHTERS = ['rene', 'pablito', 'flaitiano', 'lena', 'carlitos'];

/** "0,1" → [0, 1] (índices del plantel del jugador 1 y del 2); null si no viene o no sirve. */
function parsePair(raw: string | null, n: number): [number, number] | null {
  if (!raw) return null;
  const ids = raw.split(',').map(Number);
  return ids.length === 2 && ids.every((i) => Number.isInteger(i) && i >= 0 && i < n) ? [ids[0], ids[1]] : null;
}

/** "0,1-2,0" → [[0, 1], [2, 0]] (dos luchadores por equipo); null si no viene o no sirve. */
function parseTeams(raw: string | null, n: number): [number[], number[]] | null {
  if (!raw) return null;
  const sides = raw.split('-').map((t) => t.split(',').map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n));
  return sides.length === 2 && sides[0].length === 2 && sides[1].length === 2 ? [sides[0], sides[1]] : null;
}

/** Barra de carga del arranque (en index.html, antes de que se dibuje el juego): lo bajado en MB. */
function watchBoot(prog: Progreso): () => void {
  const fill = document.querySelector<HTMLElement>('#loading .lleno');
  const text = document.querySelector<HTMLElement>('#loading .texto');
  let raf = 0;
  const tick = (): void => {
    if (fill) fill.style.width = `${(prog.fraccion * 100).toFixed(1)}%`;
    if (text && prog.total > 0) text.textContent = `DESCARGANDO EL JUEGO · ${prog.texto}`;
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

async function main(): Promise<void> {
  const prog = new Progreso();
  const stopBoot = watchBoot(prog);
  // La fuente viene incluida en el build (sin descargas en tiempo de ejecución).
  await Promise.all(['500', '700'].flatMap((w) => [12, 24, 48].map((s) => document.fonts.load(`${w} ${s}px "${GAME_FONT}"`))));

  const display = new Display();
  await display.init();
  installFullscreen();
  setTextResolution(display.textResolution);
  display.onResize(() => setTextResolution(display.textResolution));

  const kb = new Keyboard();
  // Celulares y tablets: cruceta y botones en pantalla (aprietan las teclas del jugador 1).
  new TouchControls(kb, display);
  const pads = new Gamepads();
  const menu = new MenuInput(kb, pads);
  const sfx = new Sfx();
  // El sonido queda como lo dejó el jugador (OPCIONES > SONIDO o la tecla M).
  sfx.setMuted(loadMuted());
  // El navegador solo permite audio y pantalla completa después de un gesto del usuario:
  // la primera tecla (o clic) desbloquea el sonido (y con él la música del título) y pide
  // la pantalla completa, esté donde esté el jugador.
  kb.onKey(() => sfx.unlock());
  window.addEventListener('pointerdown', () => sfx.unlock());
  const firstGesture = (e: Event): void => {
    if (e instanceof KeyboardEvent && (e.code === 'Escape' || e.code.startsWith('F') || e.altKey || e.metaKey)) return;
    window.removeEventListener('keydown', firstGesture);
    window.removeEventListener('pointerdown', firstGesture);
    autoFullscreen();
  };
  window.addEventListener('keydown', firstGesture);
  window.addEventListener('pointerdown', firstGesture);

  // Al abrir solo se baja lo de los menús: la guardia (y poses del título) de cada luchador, la
  // lista de escenarios y el ring del título. Lo de cada pelea se baja antes de pelear (contenido.ts).
  await cargarTamanos();
  const q = calidad();
  const [fighters, stages, arena] = await Promise.all([
    Promise.allSettled(FIGHTERS.map((id) => loadFighterFolder(`luchadores/${id}`, id, q, prog))),
    StageLibrary.load('escenarios/escenarios.json', prog),
    loadTitleArena(prog).catch((err: unknown) => {
      console.warn('No se pudo cargar el ring del título.', err);
      return null;
    }),
  ]);
  const roster: FighterAsset[] = [];
  fighters.forEach((r, i) => {
    if (r.status === 'fulfilled') roster.push(r.value);
    else console.warn(`No se pudo cargar el luchador "${FIGHTERS[i]}"; se salta.`, r.reason);
  });
  if (roster.length < 2) throw new Error('no se pudieron bajar los luchadores. Revisa tu conexión.');
  // Los nombres de textura llevan el id del luchador (rene/…, pablito/…): no chocan.
  const textures = Object.assign({}, ...roster.map((f) => f.textures)) as Record<string, Texture>;
  for (const f of roster) {
    for (const [name, spec] of Object.entries(f.def.sounds ?? {})) sfx.register(`${f.def.id}/${name}`, spec);
  }
  // Voces del anunciador (public/voces/voces.json), sin frenar el inicio.
  void sfx.loadManifest('voces/voces.json');

  const params = new URLSearchParams(location.search);
  // Pareja por defecto (pruebas con ?escena=pelea): los dos primeros. ?luchadores=i,j la cambia (índices del plantel).
  const pair = parsePair(params.get('luchadores'), roster.length);
  const content = new Contenido(roster, textures, sfx, stages);
  const game = new Game(display, kb, pads, menu, sfx, {
    fighters: [roster[pair?.[0] ?? 0], roster[pair?.[1] ?? 1]],
    roster,
    textures,
    // Hasta la primera pelea, el escenario es el ring del título (cada pelea deja el suyo).
    stage: arena ?? new StageView({ name: '', layers: [] }),
    stageId: '',
    stages,
    content,
  });
  // Música de fondo (public/musica/musica.json): título y menús, y un tema por escenario.
  void game.music.load('musica/musica.json');

  // Atajos para pruebas: ?escena=pelea&modo=cpu|2p|demo|practica&semilla=123&escenario=<id>; ?escena=demostracion.
  // 1 VS 1: &luchadores=0,1 (índices del plantel). 2 VS 2: &equipos=0,1-2,0 (índices de cada equipo).
  const mode = params.get('modo') as FightMode | null;
  if (params.get('escena') === 'pelea' && (mode === 'cpu' || mode === '2p' || mode === 'demo' || mode === 'practica')) {
    const teams = parseTeams(params.get('equipos'), roster.length);
    const opts = teams && mode !== 'practica' ? { teams } : pair ? { fighters: pair } : undefined;
    const stageId = stages.find(params.get('escenario') ?? '')?.id ?? stages.first.id;
    const needs = { fighters: teams ? [...teams[0], ...teams[1]] : (pair ?? [0, 1]), stage: stageId };
    game.setScene(new LoadingScene(game, needs, () => new FightScene(game, mode, Number(params.get('semilla')) || 7, opts)));
  } else if (params.get('escena') === 'demostracion') {
    game.setScene(new DemoScene(game, () => new TitleScene(game)));
  } else {
    // Al abrir el juego: directo al título (PRESIONA ENTER).
    game.setScene(new TitleScene(game));
  }
  (window as unknown as { __game?: Game }).__game = game;
  const qa = params.has('qa') ? installQaBridge(game) : null;

  // Bucle: lógica a 60 Hz fijos, dibujo a la frecuencia de la pantalla.
  let acc = 0;
  let last = performance.now();
  display.app.ticker.add(() => {
    const now = performance.now();
    acc += Math.min(250, now - last);
    last = now;
    display.layout();
    let steps = 0;
    while (acc >= FRAME_MS && steps < 5) {
      pads.poll();
      menu.sample();
      game.globalKeys();
      game.scene?.step();
      kb.endFrame();
      acc -= FRAME_MS;
      steps++;
    }
    if (steps >= 5) acc = 0;
    game.scene?.render();
    display.renderWorld();
    qa?.();
  });

  stopBoot();
  document.getElementById('loading')?.remove();
}

main().catch((err: unknown) => {
  console.error(err);
  const text = document.querySelector('#loading .texto');
  if (text) text.textContent = 'ERROR AL CARGAR: ' + (err instanceof Error ? err.message : String(err));
  document.querySelector('#loading .reintentar')?.removeAttribute('hidden');
});
