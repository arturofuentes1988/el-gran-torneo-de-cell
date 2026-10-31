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
import { loadFighterFolder, validateFighter } from './content/loadFighter';
import { loadEffects } from './content/vfx';
import { BUILTIN_STAGE, StageLibrary } from './content/stages';
import { buildPlaceholderFighters, type FighterAsset } from './content/mannequin/fighters';
import { Gamepads, Keyboard, MenuInput } from './input/devices';
import { TouchControls } from './input/touch';
import { StageView } from './render/stage';
import { setTextResolution } from './render/text';
import { DemoScene } from './scenes/demo';
import { FightScene } from './scenes/fight';
import { TitleScene, loadTitleArena } from './scenes/title';

/** Luchadores con sprites definitivos (carpetas de public/luchadores/), en el orden del plantel. */
const REAL_FIGHTERS = ['rene', 'pablito', 'flaitiano', 'lena', 'carlitos'];

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

async function main(): Promise<void> {
  // La fuente viene incluida en el build (sin descargas en tiempo de ejecución).
  await Promise.all(['500', '700'].flatMap((w) => [12, 24, 48].map((s) => document.fonts.load(`${w} ${s}px "${GAME_FONT}"`))));

  const display = new Display();
  await display.init();
  installFullscreen();
  // El fondo del título (imagen y video) se carga mientras tanto, junto con los luchadores.
  void loadTitleArena().catch(() => undefined);
  setTextResolution(display.textResolution);
  display.onResize(() => setTextResolution(display.textResolution));

  const kb = new Keyboard();
  // Celulares y tablets: joystick y botones en pantalla (aprietan las teclas del jugador 1).
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

  const params = new URLSearchParams(location.search);
  const placeholders = buildPlaceholderFighters();
  // Luchadores con sprites definitivos, en este orden (public/luchadores/<id>/). Si una carpeta
  // falta o no carga, se salta. ?provisorios=1 fuerza los dos luchadores provisorios.
  const folders: Array<{ asset: FighterAsset; folder: string }> = [];
  // Efectos especiales pintados (rayos, tornado, objetos): se cargan junto con los luchadores.
  const effectsLoading = loadEffects();
  if (!params.has('provisorios')) {
    for (const id of REAL_FIGHTERS) {
      const folder = `luchadores/${id}`;
      try {
        folders.push({ asset: await loadFighterFolder(folder, id), folder });
      } catch (err) {
        console.warn(`No se pudo cargar el luchador "${id}"; se salta.`, err);
      }
    }
  }
  // Plantel (ELIGE LUCHADOR, 2 VS 2, movimientos): los definitivos y, si son menos de 2, los provisorios
  // para que siempre haya rival.
  const roster: FighterAsset[] = folders.map((f) => f.asset);
  if (roster.length < 2) roster.push(...placeholders);
  // Pareja por defecto (pruebas con ?escena=pelea): los dos primeros definitivos, o el primero contra
  // el Azul provisorio si hay uno solo. ?luchadores=i,j la cambia (índices del plantel).
  const pair = parsePair(params.get('luchadores'), roster.length);
  const fighters: [FighterAsset, FighterAsset] = pair
    ? [roster[pair[0]], roster[pair[1]]]
    : [roster[0], folders.length >= 2 ? roster[1] : placeholders[1]];
  // Los nombres de textura llevan el id del luchador (rene/…, rojo/…, azul/…): no chocan.
  const effects = await effectsLoading;
  const textures = Object.assign({}, effects, ...roster.map((f) => f.textures)) as Record<string, Texture>;
  for (const f of roster) {
    const problems = validateFighter(f.def, { ...effects, ...f.textures });
    if (problems.length) console.warn(`Luchador "${f.def.id}":\n- ${problems.join('\n- ')}`);
  }

  if (params.get('escena') === 'atlas') {
    // Visor de depuración: muestra el atlas de poses del luchador indicado (?escena=atlas&f=0).
    const atlas = placeholders[Number(params.get('f')) === 1 ? 1 : 0].atlas;
    const zoom = Number(params.get('zoom')) || 0.5;
    display.app.canvas.style.display = 'none';
    document.body.style.background = '#3a3a48';
    if (atlas) {
      atlas.style.width = `${atlas.width * zoom}px`;
      atlas.style.imageRendering = 'pixelated';
      document.body.appendChild(atlas);
    }
    document.getElementById('loading')?.remove();
    return;
  }
  for (const f of roster) {
    for (const [name, spec] of Object.entries(f.def.sounds ?? {})) sfx.register(`${f.def.id}/${name}`, spec);
  }
  // Escenarios para elegir antes de pelear (public/escenarios/escenarios.json). Hasta que se
  // elija uno, las peleas de prueba y los menús usan el primero de la lista.
  // ?escenario=<id de la lista>, ?escenario=ruta/al/escenario.json o ?escenario=prueba (el procedural) lo cambia.
  const builtinStage = new StageView();
  const stages = await StageLibrary.load('escenarios/escenarios.json', builtinStage);
  let stage = builtinStage;
  const stageParam = params.get('escenario');
  try {
    if (stageParam && stageParam !== BUILTIN_STAGE) {
      stage = stages.find(stageParam) ? await stages.get(stageParam) : await StageView.load(stageParam);
    } else if (!stageParam) {
      stage = await stages.get(stages.first.id);
    }
  } catch (err) {
    console.warn('No se pudo cargar el escenario; se usa el de prueba.', err);
  }
  // Los demás escenarios se cargan mientras tanto, sin frenar el inicio (así la pelea parte sin espera).
  for (const e of stages.entries) stages.get(e.id).catch(() => undefined);
  // Sonidos en archivo, sin frenar el inicio: voces del anunciador (public/voces/voces.json),
  // y voces de cada luchador (<carpeta>/voces/voces.json → "rene/voz/…").
  void sfx.loadManifest('voces/voces.json');
  for (const { asset, folder } of folders) void sfx.loadManifest(`${folder}/voces/voces.json`, `${asset.def.id}/`);
  const game = new Game(display, kb, pads, menu, sfx, { fighters, roster, textures, stage, stages });
  // Música de fondo (public/musica/musica.json): título y menús, y un tema por escenario.
  void game.music.load('musica/musica.json');

  // Atajos para pruebas: ?escena=pelea&modo=cpu|2p|demo|practica&semilla=123; ?escena=demostracion (la de OPCIONES).
  // 1 VS 1: &luchadores=0,1 (índices del plantel). 2 VS 2: &equipos=0,1-2,0 (índices de cada equipo).
  const mode = params.get('modo') as FightMode | null;
  if (params.get('escena') === 'pelea' && (mode === 'cpu' || mode === '2p' || mode === 'demo' || mode === 'practica')) {
    const teams = parseTeams(params.get('equipos'), roster.length);
    const opts = teams && mode !== 'practica' ? { teams } : pair ? { fighters: pair } : undefined;
    game.setScene(new FightScene(game, mode, Number(params.get('semilla')) || 7, opts));
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

  document.getElementById('loading')?.remove();
}

main().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'ERROR AL CARGAR: ' + String(err);
});
