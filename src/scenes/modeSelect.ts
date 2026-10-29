// Menús después del título (mismo estilo: panel centrado, cursor y barra):
// - MENÚ PRINCIPAL: ARCADE, CASUAL, OPCIONES y SALIR.
// - CASUAL: 1 VS CPU, 1 VS 1, 2 VS 2 y PRÁCTICA.
// - OPCIONES: PERSONAJES, MOVIMIENTOS, ESCENARIOS, CONTROLES y DIFICULTAD.

import { Container, Graphics, type Text } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { loadDifficulty, saveDifficulty } from '../app/settings';
import { arcade, outlinedText } from '../render/text';
import { DIFFICULTIES, DIFFICULTY_NAME, type DifficultyId } from '../sim/difficulty';
import { CharacterSelectScene } from './characterSelect';
import { CharactersScene } from './characters';
import { ControlsScene } from './controls';
import { MoveListScene } from './moveList';
import { StageViewerScene } from './stageViewer';
import { TeamSelectScene } from './teamSelect';
import { TitleScene } from './title';
import { backdrop } from './backdrop';

interface Item {
  id: string;
  label: string;
}

/** La opción marcada de cada menú se recuerda al volver a él. */
const lastSel = new Map<string, number>();

/** Menú compacto y centrado: el panel crece con la cantidad de opciones. */
abstract class MenuScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  protected items: Text[] = [];
  private bar = new Graphics();
  private cursor: Text;
  private sel: number;
  private t = 0;
  private top: number;
  private left: number;
  private panelX: number;
  private panelW: number;

  constructor(
    protected game: Game,
    private key: string,
    title: string,
    protected options: readonly Item[],
    private font = 8,
    private row = 13,
  ) {
    this.sel = Math.min(lastSel.get(key) ?? 0, options.length - 1);
    this.cursor = outlinedText('>', font, 0xffd040, 0x5a0a10, 2);
    const padY = Math.round(font * 1.1);
    this.panelW = font >= 10 ? 190 : 214;
    const panelH = padY * 2 + (options.length - 1) * row + font;
    this.panelX = Math.round(VIEW_W / 2 - this.panelW / 2);
    const panelY = Math.round((VIEW_H - panelH) / 2) + 12;
    this.top = panelY + padY;
    this.left = this.panelX + 20;
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.55 });
    bg.roundRect(this.panelX, panelY, this.panelW, panelH, 5).fill({ color: 0x140a24, alpha: 0.86 }).stroke({ color: 0xc89a3a, width: 1 });
    const head = outlinedText(title, 12, 0xfff4e0, 0x5a0a10, 3);
    head.anchor.set(0.5);
    head.position.set(VIEW_W / 2, panelY - 14);
    this.ui.addChild(bg, this.bar, head, this.cursor);
    options.forEach((o, i) => {
      const t = outlinedText(o.label, font, 0xffffff, 0x1a0a24, 2);
      t.position.set(this.left, this.top + i * row);
      this.items.push(t);
      this.ui.addChild(t);
    });
  }

  protected abstract choose(id: string): void;
  protected abstract back(): void;
  /** Izquierda / derecha sobre una opción (ej. cambiar la dificultad). */
  protected side(_id: string, _dir: number): void {}

  protected go(scene: Scene, sound: 'menuConfirm' | 'menuBack' = 'menuConfirm'): void {
    this.game.sfx.play(sound);
    this.game.setScene(scene);
  }

  enter(): void {
    backdrop.attach(this.game);
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    backdrop.detach(this.game);
    this.game.display.hud.removeChild(this.ui);
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    const n = this.options.length;
    if (m.up || m.down) {
      this.sel = (this.sel + (m.up ? n - 1 : 1)) % n;
      lastSel.set(this.key, this.sel);
      this.game.sfx.play('menuMove');
    }
    const id = this.options[this.sel].id;
    if (m.left || m.right) this.side(id, m.left ? -1 : 1);
    if (m.back) {
      this.back();
      return;
    }
    if (m.confirm) this.choose(id);
  }

  render(): void {
    backdrop.render();
    this.items.forEach((t, i) => {
      t.style.fill = i === this.sel ? 0xffd040 : 0xffffff;
    });
    const y = this.top + this.sel * this.row;
    this.bar.clear().roundRect(this.panelX + 5, y - 3, this.panelW - 10, this.font + 6, 3).fill({ color: 0xffd040, alpha: 0.12 });
    this.cursor.position.set(this.left - 13 + (Math.floor(this.t / 10) % 2), y);
  }
}

/** MENÚ PRINCIPAL: ARCADE, CASUAL, OPCIONES y SALIR. */
export class MainMenuScene extends MenuScene {
  constructor(game: Game) {
    super(game, 'principal', 'MENÚ PRINCIPAL', [
      { id: 'arcade', label: 'ARCADE' },
      { id: 'casual', label: 'CASUAL' },
      { id: 'opciones', label: 'OPCIONES' },
      { id: 'salir', label: 'SALIR' },
    ], 10, 17);
  }

  protected choose(id: string): void {
    const g = this.game;
    if (id === 'arcade') this.go(new CharacterSelectScene(g, 'arcade'));
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

/** OPCIONES: fichas y movimientos de los luchadores, escenarios, controles y dificultad. */
export class OptionsMenuScene extends MenuScene {
  private difficulty: DifficultyId = loadDifficulty();

  constructor(game: Game) {
    super(game, 'opciones', 'OPCIONES', [
      { id: 'personajes', label: 'PERSONAJES' },
      { id: 'movimientos', label: 'MOVIMIENTOS' },
      { id: 'escenarios', label: 'ESCENARIOS' },
      { id: 'controles', label: 'CONTROLES' },
      { id: 'dificultad', label: '' },
      { id: 'volver', label: 'VOLVER' },
    ]);
    this.updateDifficultyLabel();
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

  protected override side(id: string, dir: number): void {
    if (id === 'dificultad') this.changeDifficulty(dir);
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
    else if (id === 'dificultad') this.changeDifficulty(1);
    else this.back();
  }

  protected back(): void {
    this.go(new MainMenuScene(this.game), 'menuBack');
  }
}
