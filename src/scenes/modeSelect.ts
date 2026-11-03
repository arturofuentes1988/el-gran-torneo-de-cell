// Menús después del título (mismo estilo: panel centrado, cursor y barra; la base está en menu.ts):
// - MENÚ PRINCIPAL: ARCADE, EN LÍNEA, CASUAL, OPCIONES y SALIR.
// - CASUAL: 1 VS CPU, 1 VS 1, 2 VS 2 y PRÁCTICA.
// - OPCIONES: PERSONAJES, MOVIMIENTOS, ESCENARIOS, DEMOSTRACIÓN, CONTROLES, DIFICULTAD, SONIDO y GRÁFICOS.

import type { Game, Scene } from '../app/game';
import { loadDifficulty, loadQuality, saveDifficulty, saveMuted, saveQuality, type QualityPref } from '../app/settings';
import { calidad, elegirCalidad } from '../content/calidad';
import { arcade } from '../render/text';
import { DIFFICULTIES, DIFFICULTY_NAME, type DifficultyId } from '../sim/difficulty';
import { CharacterSelectScene } from './characterSelect';
import { CharactersScene } from './characters';
import { ControlsScene } from './controls';
import { irAEnLinea } from './cuenta';
import { DemoScene } from './demo';
import { MoveListScene } from './moveList';
import { StageViewerScene } from './stageViewer';
import { TeamSelectScene } from './teamSelect';
import { TitleScene } from './title';
import { MenuScene } from './menu';

/** MENÚ PRINCIPAL: ARCADE, EN LÍNEA, CASUAL, OPCIONES y SALIR. */
export class MainMenuScene extends MenuScene {
  constructor(game: Game) {
    super(game, 'principal', 'MENÚ PRINCIPAL', [
      { id: 'arcade', label: 'ARCADE' },
      { id: 'online', label: 'EN LÍNEA' },
      { id: 'casual', label: 'CASUAL' },
      { id: 'opciones', label: 'OPCIONES' },
      { id: 'salir', label: 'SALIR' },
    ], 10, 17);
  }

  protected choose(id: string): void {
    const g = this.game;
    if (id === 'arcade') this.go(new CharacterSelectScene(g, 'arcade'));
    // EN LÍNEA pide cuenta (y apodo) la primera vez.
    else if (id === 'online') this.go(irAEnLinea(g));
    else if (id === 'casual') this.go(new CasualMenuScene(g));
    else if (id === 'opciones') this.go(new OptionsMenuScene(g));
    else this.back();
  }

  /** SALIR: en el navegador no se puede cerrar la pestaña; deja la pantalla completa y vuelve al título. */
  protected back(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    this.go(new TitleScene(this.game), 'menuBack');
  }
}

/** CASUAL: peleas sueltas (contra la CPU, entre dos, 2 VS 2) y la práctica. */
export class CasualMenuScene extends MenuScene {
  constructor(game: Game) {
    super(game, 'casual', 'CASUAL', [
      { id: 'cpu', label: '1 VS CPU' },
      { id: '2p', label: '1 VS 1' },
      { id: 'equipos', label: '2 VS 2' },
      { id: 'practica', label: 'PRÁCTICA' },
      { id: 'volver', label: 'VOLVER' },
    ]);
  }

  protected choose(id: string): void {
    const g = this.game;
    if (id === 'cpu' || id === '2p' || id === 'practica') this.go(new CharacterSelectScene(g, id));
    // 2 VS 2: primero se arman los equipos (después, el escenario).
    else if (id === 'equipos') this.go(new TeamSelectScene(g));
    else this.back();
  }

  protected back(): void {
    this.go(new MainMenuScene(this.game), 'menuBack');
  }
}

const QUALITIES: readonly QualityPref[] = ['auto', 'hd', 'liviano'];

/** OPCIONES: fichas y movimientos de los luchadores, escenarios, controles, dificultad, sonido y gráficos. */
export class OptionsMenuScene extends MenuScene {
  private difficulty: DifficultyId = loadDifficulty();
  /** Gráficos elegidos (se aplican al aceptar: el juego se recarga con la otra calidad). */
  private quality: QualityPref = loadQuality();

  constructor(game: Game) {
    super(game, 'opciones', 'OPCIONES', [
      { id: 'personajes', label: 'PERSONAJES' },
      { id: 'movimientos', label: 'MOVIMIENTOS' },
      { id: 'escenarios', label: 'ESCENARIOS' },
      { id: 'demo', label: 'DEMOSTRACIÓN' },
      { id: 'controles', label: 'CONTROLES' },
      { id: 'dificultad', label: '' },
      { id: 'sonido', label: '' },
      { id: 'graficos', label: '' },
      { id: 'volver', label: 'VOLVER' },
    ]);
    this.updateDifficultyLabel();
    this.updateSoundLabel();
    this.updateQualityLabel();
  }

  private updateQualityLabel(): void {
    const i = this.options.findIndex((o) => o.id === 'graficos');
    const name = (q: 'hd' | 'liviano') => (q === 'hd' ? 'HD' : 'LIVIANOS');
    const label = this.quality === 'auto' ? `AUTOMÁTICOS (${name(elegirCalidad('auto'))})` : name(this.quality);
    const pending = this.quality !== loadQuality() ? ' · ACEPTAR' : '';
    this.items[i].text = arcade(`GRÁFICOS: < ${label} >${pending}`);
  }

  private changeQuality(step: number): void {
    const n = QUALITIES.length;
    this.quality = QUALITIES[(QUALITIES.indexOf(this.quality) + step + n) % n];
    this.updateQualityLabel();
    this.game.sfx.play('menuMove');
  }

  /** Guarda los gráficos elegidos y recarga el juego si cambian (HD: computador; LIVIANOS: celular). */
  private applyQuality(): void {
    if (this.quality === loadQuality()) return;
    const before = calidad();
    saveQuality(this.quality);
    if (elegirCalidad(this.quality) !== before) location.reload();
    else this.updateQualityLabel();
  }

  private updateSoundLabel(): void {
    const i = this.options.findIndex((o) => o.id === 'sonido');
    this.items[i].text = arcade(`SONIDO: < ${this.game.sfx.muted ? 'DESACTIVADO' : 'ACTIVADO'} >`);
  }

  private toggleSound(): void {
    const muted = !this.game.sfx.muted;
    this.game.sfx.setMuted(muted);
    saveMuted(muted);
    this.updateSoundLabel();
    // Al activarlo, un pitido confirma que volvió.
    this.game.sfx.play('menuMove');
  }

  override step(): void {
    super.step();
    // La tecla M también lo cambia: la fila muestra siempre cómo está.
    this.updateSoundLabel();
  }

  private updateDifficultyLabel(): void {
    const i = this.options.findIndex((o) => o.id === 'dificultad');
    this.items[i].text = arcade(`DIFICULTAD: < ${DIFFICULTY_NAME[this.difficulty]} >`);
  }

  private changeDifficulty(step: number): void {
    const n = DIFFICULTIES.length;
    this.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(this.difficulty) + step + n) % n];
    saveDifficulty(this.difficulty);
    this.updateDifficultyLabel();
    this.game.sfx.play('menuMove');
  }

  protected override sided(id: string): boolean {
    return id === 'dificultad' || id === 'sonido' || id === 'graficos';
  }

  protected override side(id: string, dir: number): void {
    if (id === 'dificultad') this.changeDifficulty(dir);
    else if (id === 'sonido') this.toggleSound();
    else if (id === 'graficos') this.changeQuality(dir);
  }

  protected choose(id: string): void {
    const g = this.game;
    const here = (): Scene => new OptionsMenuScene(g);
    // La ficha de cada luchador, con sus movimientos que va haciendo en su vitrina.
    if (id === 'personajes') this.go(new CharactersScene(g, here));
    else if (id === 'movimientos') this.go(new MoveListScene(g, here));
    // Los escenarios a pantalla completa, con su animación y su tema.
    else if (id === 'escenarios') this.go(new StageViewerScene(g, here));
    else if (id === 'controles') this.go(new ControlsScene(g, here));
    // La CPU contra la CPU en MUY DIFÍCIL, cambiando de luchadores en cada round.
    else if (id === 'demo') this.go(new DemoScene(g, here));
    else if (id === 'dificultad') this.changeDifficulty(1);
    else if (id === 'sonido') this.toggleSound();
    else if (id === 'graficos') this.applyQuality();
    else this.back();
  }

  protected back(): void {
    this.go(new MainMenuScene(this.game), 'menuBack');
  }
}
