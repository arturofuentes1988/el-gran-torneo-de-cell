// Menús después del título (mismo estilo: panel centrado, cursor y barra; la base está en menu.ts):
// - MENÚ PRINCIPAL: ARCADE, EN LÍNEA, CASUAL, OPCIONES y SALIR.
// - CASUAL: 1 VS CPU, 2 VS CPU y PRÁCTICA.
// - ELIGE LA DIFICULTAD: antes del ARCADE, del 1 VS CPU y del 2 VS CPU.
// - OPCIONES: PERSONAJES, MOVIMIENTOS, ESCENARIOS, DEMOSTRACIÓN, CONTROLES, SONIDO, MÚSICA y GRÁFICOS.

import type { Game, Scene } from '../app/game';
import { cambiarMusica, musica } from '../app/musica';
import { loadDifficulty, loadQuality, saveDifficulty, saveMuted, saveQuality, type QualityPref } from '../app/settings';
import { elegirNivel, nivel, NIVELES, NOMBRE_NIVEL } from '../content/calidad';
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
    if (id === 'arcade') this.go(new DifficultyMenuScene(g, () => new CharacterSelectScene(g, 'arcade'), () => new MainMenuScene(g)));
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

/** CASUAL: peleas sueltas contra la CPU (1 VS CPU y, en equipos, 2 VS CPU) y la práctica. */
export class CasualMenuScene extends MenuScene {
  constructor(game: Game) {
    super(game, 'casual', 'CASUAL', [
      { id: 'cpu', label: '1 VS CPU' },
      { id: 'equipos', label: '2 VS CPU' },
      { id: 'practica', label: 'PRÁCTICA' },
      { id: 'volver', label: 'VOLVER' },
    ]);
  }

  protected choose(id: string): void {
    const g = this.game;
    const here = (): Scene => new CasualMenuScene(g);
    if (id === 'cpu') this.go(new DifficultyMenuScene(g, () => new CharacterSelectScene(g, 'cpu'), here));
    // 2 VS CPU: la dificultad, después se arman los equipos (y el escenario).
    else if (id === 'equipos') this.go(new DifficultyMenuScene(g, () => new TeamSelectScene(g), here));
    else if (id === 'practica') this.go(new CharacterSelectScene(g, 'practica'));
    else this.back();
  }

  protected back(): void {
    this.go(new MainMenuScene(this.game), 'menuBack');
  }
}

/** Lo que hace la CPU en cada nivel (se lee bajo la lista al marcarlo). */
const DIFFICULTY_NOTE: Record<DifficultyId, string> = {
  facil: 'PARA APRENDER: CASI NO SE CUBRE Y PEGA GOLPES SUELTOS',
  normal: 'SE CUBRE LA MITAD DE LAS VECES Y HACE COMBOS CORTOS',
  dificil: 'SE CUBRE CASI TODO, CASTIGA TUS ERRORES Y REMATA CON EL ULTRA',
  muyDificil: 'NO PERDONA: COMBOS COMPLETOS, SÚPER Y ULTRA APENAS PUEDE',
};

/** ELIGE LA DIFICULTAD: antes del ARCADE, del 1 VS CPU y del 2 VS CPU (queda guardada; la usa también el sparring CPU). */
class DifficultyMenuScene extends MenuScene {
  constructor(
    game: Game,
    private next: () => Scene,
    private previous: () => Scene,
  ) {
    super(game, 'dificultad', 'ELIGE LA DIFICULTAD', [
      ...DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_NAME[d] })),
      { id: 'volver', label: 'VOLVER' },
    ], 9);
    this.mark(DIFFICULTIES.indexOf(loadDifficulty()));
  }

  protected override changed(id: string): void {
    this.note(id in DIFFICULTY_NOTE ? DIFFICULTY_NOTE[id as DifficultyId] : '');
  }

  protected choose(id: string): void {
    if (id === 'volver') return this.back();
    saveDifficulty(id as DifficultyId);
    this.go(this.next());
  }

  protected back(): void {
    this.go(this.previous(), 'menuBack');
  }
}

/** OPCIONES: fichas y movimientos de los luchadores, escenarios, controles, sonido, música y gráficos. */
class OptionsMenuScene extends MenuScene {
  /** Gráficos elegidos: BAJA, MEDIA, ALTA o ULTRA ('auto' mientras no se cambien). Se aplican al aceptar (recarga). */
  private quality: QualityPref = loadQuality();

  constructor(game: Game) {
    super(game, 'opciones', 'OPCIONES', [
      { id: 'personajes', label: 'PERSONAJES' },
      { id: 'movimientos', label: 'MOVIMIENTOS' },
      { id: 'escenarios', label: 'ESCENARIOS' },
      { id: 'demo', label: 'DEMOSTRACIÓN' },
      { id: 'controles', label: 'CONTROLES' },
      { id: 'sonido', label: '' },
      { id: 'musica', label: '' },
      { id: 'graficos', label: '' },
      { id: 'volver', label: 'VOLVER' },
    ]);
    this.updateSoundLabel();
    this.updateMusicLabel();
    this.updateQualityLabel();
  }

  private updateQualityLabel(): void {
    const i = this.options.findIndex((o) => o.id === 'graficos');
    // Sin elegir todavía: el nivel que corresponde al aparato, con la marca (AUTO).
    const label = NOMBRE_NIVEL[elegirNivel(this.quality, false)] + (this.quality === 'auto' ? ' (AUTO)' : '');
    const pending = this.quality !== loadQuality() ? ' · ACEPTAR' : '';
    this.items[i].text = arcade(`GRÁFICOS: < ${label} >${pending}`);
  }

  private changeQuality(step: number): void {
    const n = NIVELES.length;
    const cur = NIVELES.indexOf(elegirNivel(this.quality, false));
    this.quality = NIVELES[(cur + step + n) % n];
    this.updateQualityLabel();
    this.game.sfx.play('menuMove');
  }

  /** Guarda los gráficos elegidos y recarga el juego si cambia el nivel (el arte y la escala de dibujo se eligen al abrir). */
  private applyQuality(): void {
    if (this.quality === loadQuality()) return;
    saveQuality(this.quality);
    if (elegirNivel(this.quality) !== nivel()) location.reload();
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
    // La tecla M y el botón de música también los cambian: las filas muestran siempre cómo están.
    this.updateSoundLabel();
    this.updateMusicLabel();
  }

  private updateMusicLabel(): void {
    const i = this.options.findIndex((o) => o.id === 'musica');
    const m = musica();
    const text = arcade(`MÚSICA: < ${m.activa ? `${m.volumen * 10}%` : 'APAGADA'} >`);
    if (this.items[i].text !== text) this.items[i].text = text;
  }

  /** Izquierda / derecha: volumen de a 10 % (subirlo la prende si estaba apagada). */
  private changeMusic(dir: number): void {
    const m = musica();
    const volumen = Math.max(0, Math.min(10, m.volumen + dir));
    cambiarMusica({ volumen, activa: volumen > 0 && (m.activa || dir > 0) });
    this.updateMusicLabel();
    this.game.sfx.play('menuMove');
  }

  protected override sided(id: string): boolean {
    return id === 'sonido' || id === 'musica' || id === 'graficos';
  }

  protected override side(id: string, dir: number): void {
    if (id === 'sonido') this.toggleSound();
    else if (id === 'musica') this.changeMusic(dir);
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
    else if (id === 'sonido') this.toggleSound();
    else if (id === 'musica') {
      const m = musica();
      cambiarMusica({ activa: !m.activa, volumen: m.volumen || 7 });
      this.updateMusicLabel();
      this.game.sfx.play('menuMove');
    }
    else if (id === 'graficos') this.applyQuality();
    else this.back();
  }

  protected back(): void {
    this.go(new MainMenuScene(this.game), 'menuBack');
  }
}
