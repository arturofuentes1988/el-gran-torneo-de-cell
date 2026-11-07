// Base de los menús (MENÚ PRINCIPAL, CASUAL, OPCIONES, EN LÍNEA, TU CUENTA): panel
// centrado con una barra por opción, que se eligen con las flechas, Enter o tocándolas.

import { Container, Graphics, type Text } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { outlinedText } from '../render/text';
import { backdrop } from './backdrop';

interface Item {
  id: string;
  label: string;
  /** Opción que todavía no está disponible: se ve más apagada. */
  dim?: boolean;
}

/** La opción marcada de cada menú se recuerda al volver a él. */
const lastSel = new Map<string, number>();

/** Colores de los avisos bajo la lista. */
const AVISO = { info: 0xffe6a0, error: 0xff8a8a, ok: 0x8affb0 } as const;
type TipoAviso = keyof typeof AVISO;

/**
 * Menú centrado de estilo moderno: cada opción es una barra inclinada semitransparente;
 * la elegida se enciende (magenta con borde dorado y un brillo que respira) y crece un poco.
 * Bajo la lista caben una nota fija (a quién estás conectado, para qué sirve la pantalla)
 * y un aviso pasajero (errores, "CONECTANDO…").
 */
export abstract class MenuScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  protected ui = new Container();
  protected items: Text[] = [];
  /** Mientras espera una respuesta de internet, el menú no hace caso. */
  protected busy = false;
  private plates = new Graphics();
  private glow = new Graphics();
  private sel: number;
  private t = 0;
  private top: number;
  private row: number;
  private barH: number;
  private barW: number;
  private noteText: Text | null = null;
  private avisoText: Text | null = null;
  private avisoT = 0;

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

  /** Cambió la opción marcada (con las flechas o un toque). */
  protected changed(_id: string): void {}

  /** Marca una opción (al abrir el menú, por ejemplo la dificultad guardada). */
  protected mark(i: number): void {
    this.sel = Math.max(0, Math.min(this.options.length - 1, i));
    lastSel.set(this.key, this.sel);
    this.changed(this.options[this.sel].id);
  }

  /** Borde de abajo de la lista (para poner textos debajo). */
  private get listBottom(): number {
    return this.top + (this.options.length - 1) * this.row + this.barH;
  }

  /** El texto de la nota (para poner algo al lado, como el avatar en EN LÍNEA). */
  protected get noteView(): Text | null {
    return this.noteText;
  }

  /** Nota fija bajo la lista (puede tener dos líneas con \n). */
  protected note(text: string): void {
    if (!this.noteText) {
      this.noteText = outlinedText('', 7, 0xd8cfe8, 0x1a0a24, 2, { align: 'center' });
      this.noteText.anchor.set(0.5, 0);
      this.noteText.position.set(VIEW_W / 2, this.listBottom + 9);
      this.ui.addChild(this.noteText);
    }
    this.noteText.text = text;
  }

  /** Aviso bajo la nota; si `frames` > 0 se borra solo después de ese tiempo. */
  protected aviso(text: string, tipo: TipoAviso = 'info', frames = 0): void {
    if (!this.avisoText) {
      this.avisoText = outlinedText('', 7, AVISO.info, 0x1a0a24, 2, { align: 'center' });
      this.avisoText.anchor.set(0.5, 0);
      this.ui.addChild(this.avisoText);
    }
    const lines = this.noteText?.text ? this.noteText.text.split('\n').length : 0;
    this.avisoText.position.set(VIEW_W / 2, this.listBottom + 9 + lines * 13 + (lines ? 4 : 0));
    this.avisoText.text = text;
    this.avisoText.style.fill = AVISO[tipo];
    this.avisoT = frames;
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
    if (this.avisoT > 0 && --this.avisoT === 0 && this.avisoText) this.avisoText.text = '';
    if (this.busy) return;
    const m = this.game.menu;
    const n = this.options.length;
    if (m.up || m.down) {
      this.sel = (this.sel + (m.up ? n - 1 : 1)) % n;
      lastSel.set(this.key, this.sel);
      this.game.sfx.play('menuMove');
      this.changed(this.options[this.sel].id);
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
      if (this.sel !== hit) {
        this.sel = hit;
        lastSel.set(this.key, hit);
        this.changed(this.options[hit].id);
      }
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
      const dim = !!this.options[i].dim;
      const w = this.barW + (on ? 12 : 0);
      const x = VIEW_W / 2 - w / 2;
      const y = this.top + i * this.row;
      const h = this.barH;
      const shape = [x + slant, y, x + w + slant, y, x + w - slant, y + h, x - slant, y + h];
      if (on) {
        this.glow.roundRect(x - 10, y - 5, w + 20, h + 10, 8).fill({ color: 0xff3ac0, alpha: (0.16 + 0.12 * pulse) * (dim ? 0.5 : 1) });
        g.poly(shape).fill({ color: dim ? 0x6a3a68 : 0xb02a90, alpha: 0.92 }).stroke({ color: 0xffd76a, width: 1.2 });
        g.poly([x + slant, y, x + w + slant, y, x + w + slant - slant * 0.45, y + h * 0.45, x + slant - slant * 0.45, y + h * 0.45]).fill({ color: 0xff8ae0, alpha: 0.28 });
      } else {
        g.poly(shape).fill({ color: 0x1a0c2e, alpha: 0.72 }).stroke({ color: 0xb98cff, width: 0.6, alpha: 0.3 });
      }
      t.style.fill = on ? (dim ? 0xd8cfe8 : 0xffffff) : dim ? 0x8a7fa0 : 0xd8cfe8;
      t.scale.set(on ? 1.08 : 1);
    });
  }
}
