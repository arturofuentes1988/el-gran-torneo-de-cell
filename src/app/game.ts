import type { Texture } from 'pixi.js';
import { MusicLibrary } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import type { Contenido } from '../content/contenido';
import type { FighterAsset } from '../content/loadFighter';
import type { StageLibrary } from '../content/stages';
import { saveMuted } from './settings';
import type { Gamepads, Keyboard, MenuInput } from '../input/devices';
import type { StageView } from '../render/stage';
import type { Display } from './display';

export interface Scene {
  enter(): void;
  exit(): void;
  /** Un cuadro de lógica (60 por segundo). */
  step(): void;
  /** Actualiza lo que se dibuja (cada cuadro de pantalla). */
  render(): void;
  /** Música de la escena (clave de public/musica/musica.json); null = silencio; sin definir = la que venía sonando. */
  readonly music?: string | null;
}

export interface Assets {
  /** Pelea 1 vs 1: jugador 1 y jugador 2. */
  fighters: [FighterAsset, FighterAsset];
  /** Todos los luchadores elegibles (equipos del 2 VS 2, pantalla de movimientos). */
  roster: FighterAsset[];
  /** Texturas cargadas: las de los menús de todo el plantel, los efectos y las de pelea que se hayan bajado. */
  textures: Record<string, Texture>;
  /** Escenario de la pelea (lo deja ELIGE ESCENARIO, el ARCADE o la DEMOSTRACIÓN antes de pelear). */
  stage: StageView;
  /** Su id en la lista de escenarios. */
  stageId: string;
  /** Escenarios para elegir antes de pelear. */
  stages: StageLibrary;
  /** Lo que se baja antes de cada pelea (texturas de pelea, voces, efectos, escenario). */
  content: Contenido;
}

export type FightMode = 'cpu' | '2p' | 'demo' | 'practica';

export class Game {
  scene: Scene | null = null;
  debug = { boxes: false, info: false };
  /** Música de fondo (título y menús, y un tema por escenario). */
  readonly music: MusicLibrary;

  constructor(
    readonly display: Display,
    readonly kb: Keyboard,
    readonly pads: Gamepads,
    readonly menu: MenuInput,
    readonly sfx: Sfx,
    readonly assets: Assets,
  ) {
    this.music = new MusicLibrary(sfx);
  }

  setScene(s: Scene): void {
    this.scene?.exit();
    this.scene = s;
    s.enter();
    if (s.music !== undefined) this.music.play(s.music);
  }

  /** Atajos globales: M sonido, F1 cajas, F2 información. */
  globalKeys(): void {
    if (this.kb.hit('KeyM')) saveMuted(this.sfx.toggleMute());
    if (this.kb.hit('F1')) this.debug.boxes = !this.debug.boxes;
    if (this.kb.hit('F2')) this.debug.info = !this.debug.info;
  }
}
