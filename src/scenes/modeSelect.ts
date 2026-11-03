// Menús después del título (mismo estilo: panel centrado, cursor y barra):
// - MENÚ PRINCIPAL: ARCADE, CASUAL, OPCIONES y SALIR.
// - CASUAL: 1 VS CPU, 1 VS 1, 2 VS 2 y PRÁCTICA.
// - OPCIONES: PERSONAJES, MOVIMIENTOS, ESCENARIOS, DEMOSTRACIÓN, CONTROLES, DIFICULTAD, SONIDO y GRÁFICOS.

import { Container, Graphics, type Text } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { loadDifficulty, loadQuality, saveDifficulty, saveMuted, saveQuality, type QualityPref } from '../app/settings';
import { calidad, elegirCalidad } from '../content/calidad';
import { arcade, outlinedText } from '../render/text';
import { DIFFICULTIES, DIFFICULTY_NAME, type DifficultyId } from '../sim/difficulty';
import { CharacterSelectScene } from './characterSelect';
import { CharactersScene } from './characters';
import { ControlsScene } from './controls';
import { DemoScene } from './demo';
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

/**
 * Menú centrado de estilo moderno: cada opción es una barra inclinada semitransparente;
 * la elegida se enciende (magenta con borde dorado y un brillo que respira) y crece un poco.
 */
abstract class MenuScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  protected items: Text[] = [];
  private plates = new Graphics();
  private glow = new Graphics();
  private sel: number;
  private t = 0;
  private top: number;
  private row: number;
  private barH: number;
  private barW: number;

  constructor(
    protected game: Game,
    private key: string,
    title: string,
    protected options: readonly Item[],
    font = 8,
    row = 13,
  ) {
    this.sel = Math.min(lastSel.get(key) ?? 0, options.length - 1);
    this.row = Math.max(row, Math.round(font * 2.25));
    this.barH = Math.round(this.row * 0.8);
    this.barW = font >= 10 ? 214 : 196;
    const listH = (options.length - 1) * this.row + this.barH;
    this.top = Math.round((VIEW_H - listH) / 2) + 14;
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.4 });
    // Título grande con una línea de acento debajo.
    const head = outlinedText(title, 13, 0xfff4e0, 0x3a0a40, 3);
    head.anchor.set(0.5);
    head.position.set(VIEW_W / 2, this.top - 20);
    bg.rect(VIEW_W / 2 - 46, this.top - 8, 92, 1.5).fill({ color: 0xff4fd8, alpha: 0.85 });
    bg.rect(VIEW_W / 2 - 22, this.top - 5.5, 44, 1).fill({ color: 0xffd040, alpha: 0.8 });
    this.glow.blendMode = 'add';
    this.ui.addChild(bg, this.glow, this.plates, head);
    options.forEach((o, i) => {
      const t = outlinedText(o.label, font, 0xffffff, 0x1a0a24, 2);
      t.anchor.set(0.5);
      t.position.set(VIEW_W / 2, this.top + i * this.row + this.barH / 2);
      this.items.push(t);
      this.ui.addChild(t);
    });
  }

  protected abstract choose(id: string): void;
  protected abstract back(): void;
  /** Izquierda / derecha sobre una opción (ej. cambiar la dificultad). */
  protected side(_id: string, _dir: number): void {}
  /** ¿La opción cambia con izquierda / derecha? (al tocarla, los costados de la barra son las flechas). */
  protected sided(_id: string): boolean {
    return false;
  }

  /** Opción bajo el toque de este cuadro (toda la fila cuenta, no solo la barra), o -1. */
  private tappedItem(): number {
    const m = this.game.menu;
    if (!m.tap) return -1;
    const half = this.barW / 2 + 16;
    for (let i = 0; i < this.options.length; i++) {
      const y = this.top + i * this.row - (this.row - this.barH) / 2;
      if (m.tapIn(VIEW_W / 2 - half, y, half * 2, this.row)) return i;
    }
    return -1;
  }

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
    // Tocar una opción la elige (en las de < >, tocar un costado la cambia hacia ese lado).
    const hit = this.tappedItem();
    if (hit >= 0) {
      this.sel = hit;
      lastSel.set(this.key, hit);
      const tid = this.options[hit].id;
      const dx = m.tap!.x - VIEW_W / 2;
      if (this.sided(tid) && Math.abs(dx) > this.barW * 0.22) this.side(tid, Math.sign(dx));
      else this.choose(tid);
      return;
    }
    if (m.confirm) this.choose(id);
  }

  render(): void {
    backdrop.render();
    const g = this.plates;
    g.clear();
    this.glow.clear();
    const slant = 7;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.12);
    this.items.forEach((t, i) => {
      const on = i === this.sel;
      const w = this.barW + (on ? 12 : 0);
      const x = VIEW_W / 2 - w / 2;
      const y = this.top + i * this.row;
      const h = this.barH;
      const shape = [x + slant, y, x + w + slant, y, x + w - slant, y + h, x - slant, y + h];
      if (on) {
        this.glow.roundRect(x - 10, y - 5, w + 20, h + 10, 8).fill({ color: 0xff3ac0, alpha: 0.16 + 0.12 * pulse });
        g.poly(shape).fill({ color: 0xb02a90, alpha: 0.92 }).stroke({ color: 0xffd76a, width: 1.2 });
        g.poly([x + slant, y, x + w + slant, y, x + w + slant - slant * 0.45, y + h * 0.45, x + slant - slant * 0.45, y + h * 0.45]).fill({ color: 0xff8ae0, alpha: 0.28 });
      } else {
        g.poly(shape).fill({ color: 0x1a0c2e, alpha: 0.72 }).stroke({ color: 0xb98cff, width: 0.6, alpha: 0.3 });
      }
      t.style.fill = on ? 0xffffff : 0xd8cfe8;
      t.scale.set(on ? 1.08 : 1);
    });
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
