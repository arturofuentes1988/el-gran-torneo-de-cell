import { Container, Graphics, type Text } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { FightMode, Game, Scene } from '../app/game';
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

type Option = 'cpu' | '2p' | 'equipos' | 'practica' | 'personajes' | 'movimientos' | 'escenarios' | 'controles' | 'dificultad' | 'volver';

const OPTIONS: ReadonlyArray<{ id: Option; label: string }> = [
  { id: 'cpu', label: '1 JUGADOR VS CPU' },
  { id: '2p', label: '2 JUGADORES' },
  { id: 'equipos', label: '2 VS 2' },
  { id: 'practica', label: 'PRÁCTICA' },
  { id: 'personajes', label: 'PERSONAJES' },
  { id: 'movimientos', label: 'MOVIMIENTOS' },
  { id: 'escenarios', label: 'ESCENARIOS' },
  { id: 'controles', label: 'CONTROLES' },
  { id: 'dificultad', label: '' },
  { id: 'volver', label: 'VOLVER' },
];

/** Menú compacto y centrado: el panel crece solo con la cantidad de opciones. */
const FONT = 8;
/** La fila de dificultad va más chica para que quepa "< MUY DIFÍCIL >". */
const FONT_SMALL = 7;
const ROW = 13;
const PANEL_W = 214;
const PAD_Y = 9;
const PANEL_H = PAD_Y * 2 + (OPTIONS.length - 1) * ROW + FONT;
const PANEL_X = Math.round(VIEW_W / 2 - PANEL_W / 2);
const PANEL_Y = Math.round((VIEW_H - PANEL_H) / 2) + 10;
const TOP = PANEL_Y + PAD_Y;
const LEFT = PANEL_X + 18;

/** La opción marcada se recuerda al volver (por ejemplo, desde ELIGE ESCENARIO). */
let lastSel = 0;

export class ModeSelectScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  private items: Text[] = [];
  private bar = new Graphics();
  private cursor = outlinedText('>', FONT, 0xffd040, 0x5a0a10, 2);
  private sel = Math.min(lastSel, OPTIONS.length - 1);
  private t = 0;
  private difficulty: DifficultyId = loadDifficulty();

  constructor(private game: Game) {
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.55 });
    bg.roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5).fill({ color: 0x140a24, alpha: 0.86 }).stroke({ color: 0xc89a3a, width: 1 });
    const title = outlinedText('ELIGE MODO', 12, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, PANEL_Y - 13);
    this.ui.addChild(bg, this.bar, title, this.cursor);
    OPTIONS.forEach((o, i) => {
      const small = o.id === 'dificultad';
      const t = outlinedText(o.label, small ? FONT_SMALL : FONT, 0xffffff, 0x1a0a24, 2);
      t.position.set(LEFT, TOP + i * ROW + (small ? (FONT - FONT_SMALL) / 2 : 0));
      this.items.push(t);
      this.ui.addChild(t);
    });
    this.updateDifficultyLabel();
  }

  private indexOf(id: Option): number {
    return OPTIONS.findIndex((o) => o.id === id);
  }

  private updateDifficultyLabel(): void {
    this.items[this.indexOf('dificultad')].text = arcade(`DIFICULTAD: < ${DIFFICULTY_NAME[this.difficulty]} >`);
  }

  private changeDifficulty(step: number): void {
    const n = DIFFICULTIES.length;
    this.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(this.difficulty) + step + n) % n];
    saveDifficulty(this.difficulty);
    this.updateDifficultyLabel();
    this.game.sfx.play('menuMove');
  }

  enter(): void {
    const d = this.game.display;
    backdrop.attach(this.game);
    d.hud.addChild(this.ui);
  }

  exit(): void {
    const d = this.game.display;
    backdrop.detach(this.game);
    d.hud.removeChild(this.ui);
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (m.up || m.down) {
      this.sel = (this.sel + (m.up ? OPTIONS.length - 1 : 1)) % OPTIONS.length;
      lastSel = this.sel;
      this.game.sfx.play('menuMove');
    }
    const opt = OPTIONS[this.sel].id;
    if (opt === 'dificultad' && (m.left || m.right)) this.changeDifficulty(m.left ? -1 : 1);
    if (m.back) {
      this.game.sfx.play('menuBack');
      this.game.setScene(new TitleScene(this.game));
      return;
    }
    if (!m.confirm) return;
    switch (opt) {
      case 'volver':
        this.game.sfx.play('menuBack');
        this.game.setScene(new TitleScene(this.game));
        return;
      case 'personajes':
        // La ficha de cada luchador y sus movimientos, que va haciendo en su vitrina.
        this.game.sfx.play('menuConfirm');
        this.game.setScene(new CharactersScene(this.game, () => new ModeSelectScene(this.game)));
        return;
      case 'movimientos':
        this.game.sfx.play('menuConfirm');
        this.game.setScene(new MoveListScene(this.game, () => new ModeSelectScene(this.game)));
        return;
      case 'escenarios':
        // Ver los escenarios a pantalla completa, con su animación y su tema.
        this.game.sfx.play('menuConfirm');
        this.game.setScene(new StageViewerScene(this.game, () => new ModeSelectScene(this.game)));
        return;
      case 'controles':
        this.game.sfx.play('menuConfirm');
        this.game.setScene(new ControlsScene(this.game, () => new ModeSelectScene(this.game)));
        return;
      case 'dificultad':
        this.changeDifficulty(1);
        return;
      case 'equipos':
        // 2 VS 2: primero se arman los equipos (después, el escenario).
        this.game.sfx.play('menuConfirm');
        this.game.setScene(new TeamSelectScene(this.game));
        return;
      default: {
        // Antes de pelear: ELIGE LUCHADOR y después ELIGE ESCENARIO.
        const mode: Exclude<FightMode, 'demo'> = opt;
        this.game.sfx.play('menuConfirm');
        this.game.setScene(new CharacterSelectScene(this.game, mode));
      }
    }
  }

  render(): void {
    backdrop.render();
    this.items.forEach((t, i) => {
      t.style.fill = i === this.sel ? 0xffd040 : 0xffffff;
    });
    const y = TOP + this.sel * ROW;
    this.bar.clear().roundRect(PANEL_X + 5, y - 3, PANEL_W - 10, FONT + 6, 3).fill({ color: 0xffd040, alpha: 0.12 });
    this.cursor.position.set(LEFT - 12 + (Math.floor(this.t / 10) % 2), y);
  }
}
