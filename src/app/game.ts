import type { Texture } from 'pixi.js';
import { MusicLibrary } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import type { FighterAsset } from '../content/mannequin/fighters';
import type { StageLibrary } from '../content/stages';
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
  /** Texturas de todos los luchadores del plantel. */
  textures: Record<string, Texture>;
  /** Escenario actual: al empezar, el primero de la lista; después lo cambia ELIGE ESCENARIO. */
  stage: StageView;
  /** Escenarios para elegir antes de pelear (el procedural de prueba solo si no hay ninguno HD). */
  stages: StageLibrary;
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
    if (this.kb.hit('KeyM')) this.sfx.toggleMute();
    if (this.kb.hit('F1')) this.debug.boxes = !this.debug.boxes;
    if (this.kb.hit('F2')) this.debug.info = !this.debug.info;
  }
}
