// Pantalla "CONTROLES": cambiar las teclas y los botones del joystick de cada
// jugador y guardarlos en el navegador. Se usa desde el menú (ControlsScene)
// y sobre la pausa de la pelea (ControlsPanel en la capa de menús).

import { Container, Graphics } from 'pixi.js';
import type { Game, Scene } from '../app/game';
import { saveControls } from '../app/settings';
import { VIEW_H, VIEW_W } from '../config';
import {
  ACTIONS,
  RESERVED_KEYS,
  RESERVED_PAD,
  applyControls,
  currentControls,
  defaultControls,
  keyLabel,
  padLabel,
  sameControls,
  type Action,
  type ControlsState,
  type PadAction,
} from '../input/devices';
import { keycap, textTokens, tokenLine } from '../render/keycap';
import { arcade, outlinedText } from '../render/text';
import { backdrop } from './backdrop';

const SIZE = 7;
const ROW = 13;
const TABLE_TOP = 60;
const LABEL_X = 44;
/** Columnas editables: J1 teclado, J1 joystick, J2 teclado, J2 joystick (x del centro de cada una). */
const COLS = [192, 256, 334, 398];
const BUTTONS = ['GUARDAR', 'RESTAURAR', 'VOLVER'] as const;
const BUTTONS_Y = TABLE_TOP + ACTIONS.length * ROW + 5;
const MODAL = ['GUARDAR', 'DESCARTAR', 'SEGUIR EDITANDO'] as const;

const isPadAction = (a: Action): a is PadAction => a !== 'up' && a !== 'down' && a !== 'left' && a !== 'right';

/** Panel de controles. step() devuelve false cuando el jugador sale. */
export class ControlsPanel {
  readonly container = new Container();
  private table = new Container();
  private cursorG = new Graphics();
  private footer = new Container();
  private status = new Container();
  private modalUi = new Container();
  /** Controles en edición y los últimos guardados. */
  private state: ControlsState = currentControls();
  private saved: ControlsState = currentControls();
  private row = 4;
  private col = 0;
  private btn = 0;
  /** Esperando la tecla o botón nuevo de una casilla. */
  private waiting = false;
  private modal = -1;
  private t = 0;

  constructor(private game: Game, overlay = false) {
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x05020c, alpha: overlay ? 0.8 : 0.6 });
    bg.roundRect(28, 30, VIEW_W - 56, BUTTONS_Y + 14 - 30, 5).fill({ color: 0x140a24, alpha: 0.94 }).stroke({ color: 0xc89a3a, width: 1 });
    // Encabezados de columnas.
    const title = outlinedText('CONTROLES', 12, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5, 0);
    title.position.set(VIEW_W / 2, 10);
    bg.roundRect(COLS[0] - 34, 36, 124, 22, 3).fill({ color: 0xff2e63, alpha: 0.12 });
    bg.roundRect(COLS[2] - 34, 36, 124, 22, 3).fill({ color: 0x2be4f0, alpha: 0.12 });
    const head = (text: string, x: number, y: number, color: number, size: number) => {
      const t = outlinedText(text, size, color);
      t.anchor.set(0.5, 0);
      t.position.set(x, y);
      return t;
    };
    this.container.addChild(
      bg,
      title,
      head('JUGADOR 1', (COLS[0] + COLS[1]) / 2, 38, 0xff6a8e, 7),
      head('JUGADOR 2', (COLS[2] + COLS[3]) / 2, 38, 0x6aeef6, 7),
      head('TECLADO', COLS[0], 49, 0xa898bc, 5),
      head('JOYSTICK', COLS[1], 49, 0xa898bc, 5),
      head('TECLADO', COLS[2], 49, 0xa898bc, 5),
      head('JOYSTICK', COLS[3], 49, 0xa898bc, 5),
      this.cursorG,
      this.table,
      this.footer,
      this.status,
      this.modalUi,
    );
    this.rebuild();
    this.setStatus('ELIGE UNA CASILLA Y APRIETA ENTER PARA CAMBIARLA');
  }

  private get dirty(): boolean {
    return !sameControls(this.state, this.saved);
  }

  private setStatus(text: string, color = 0x8ae8ff): void {
    this.status.removeChildren().forEach((c) => c.destroy({ children: true }));
    const line = tokenLine(textTokens(arcade(text), color), 6, color);
    line.position.set(Math.round(VIEW_W / 2 - line.width / 2), VIEW_H - 15);
    this.status.addChild(line);
  }

  /** Redibuja la tabla con el estado en edición. */
  private rebuild(): void {
    this.table.removeChildren().forEach((c) => c.destroy({ children: true }));
    ACTIONS.forEach((a, r) => {
      const y = TABLE_TOP + r * ROW;
      if (r % 2 === 1) this.table.addChild(new Graphics().rect(36, y - 1, VIEW_W - 72, ROW).fill({ color: 0xffffff, alpha: 0.035 }));
      const label = outlinedText(a.label, SIZE, r >= 11 ? 0xc8b8e0 : 0xe8e0f0);
      label.position.set(LABEL_X, y);
      this.table.addChild(label);
      for (let c = 0; c < 4; c++) {
        const player = c < 2 ? 0 : 1;
        const pad = c % 2 === 1;
        if (this.waiting && r === this.row && c === this.col) continue;
        let cell: Container;
        if (pad) {
          if (!isPadAction(a.id)) {
            cell = outlinedText('CRUCETA', 5, 0x6c5c84);
          } else {
            cell = keycap(padLabel(this.state.pads[player][a.id]), 7);
          }
        } else {
          cell = keycap(keyLabel(this.state.keys[player][a.id][0]), 7);
        }
        cell.position.set(Math.round(COLS[c] - cell.width / 2), y + (pad && !isPadAction(a.id) ? 3 : 0));
        this.table.addChild(cell);
      }
    });
    // Botones de abajo.
    this.footer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const gap = 96;
    BUTTONS.forEach((b, i) => {
      const label = b === 'GUARDAR' && this.dirty ? 'GUARDAR *' : b;
      const t = outlinedText(label, SIZE, 0xffffff, 0x1a0a24, 2);
      t.anchor.set(0.5, 0);
      t.position.set(VIEW_W / 2 + (i - 1) * gap, BUTTONS_Y);
      this.footer.addChild(t);
    });
  }

  /** Marca de la casilla elegida (o del botón de abajo). */
  private drawCursor(): void {
    const g = this.cursorG.clear();
    const blink = Math.floor(this.t / 12) % 2 === 0;
    if (this.modal >= 0) return;
    if (this.row < ACTIONS.length) {
      const y = TABLE_TOP + this.row * ROW;
      g.rect(36, y - 1, VIEW_W - 72, ROW).fill({ color: 0xffd040, alpha: 0.08 });
      const x = COLS[this.col];
      const w = this.col % 2 === 0 ? 64 : 50;
      g.roundRect(x - w / 2, y - 2, w, ROW + 1, 3).stroke({ color: 0xffd040, width: 1, alpha: this.waiting && !blink ? 0.3 : 1 });
      if (this.waiting) {
        g.roundRect(x - w / 2 + 4, y, w - 8, ROW - 3, 2).fill({ color: 0xffd040, alpha: blink ? 0.9 : 0.45 });
      }
    } else {
      const x = VIEW_W / 2 + (this.btn - 1) * 96;
      g.roundRect(x - 44, BUTTONS_Y - 3, 88, 13, 3).fill({ color: 0xffd040, alpha: 0.14 }).stroke({ color: 0xffd040, width: 1 });
    }
  }

  private openModal(): void {
    this.modal = 0;
    this.modalUi.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics();
    g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x05020c, alpha: 0.55 });
    g.roundRect(VIEW_W / 2 - 110, VIEW_H / 2 - 36, 220, 72, 5).fill({ color: 0x1a0e2c, alpha: 0.98 }).stroke({ color: 0xc89a3a, width: 1 });
    const t = outlinedText('HAY CAMBIOS SIN GUARDAR', 8, 0xffd040);
    t.anchor.set(0.5, 0);
    t.position.set(VIEW_W / 2, VIEW_H / 2 - 26);
    this.modalUi.addChild(g, t);
    MODAL.forEach((o, i) => {
      const m = outlinedText(o, SIZE, 0xffffff);
      m.anchor.set(0.5, 0);
      m.position.set(VIEW_W / 2, VIEW_H / 2 - 8 + i * 12);
      m.label = 'opt';
      this.modalUi.addChild(m);
    });
    this.paintModal();
  }

  private paintModal(): void {
    let i = 0;
    for (const c of this.modalUi.children) {
      if (c.label !== 'opt') continue;
      (c as unknown as { style: { fill: number } }).style.fill = i === this.modal ? 0xffd040 : 0xffffff;
      i++;
    }
  }

  private closeModal(): void {
    this.modal = -1;
    this.modalUi.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private save(): void {
    applyControls(this.state);
    const ok = saveControls(this.state);
    this.saved = currentControls();
    this.state = currentControls();
    this.rebuild();
    this.game.sfx.play('menuConfirm');
    this.setStatus(ok ? 'GUARDADO' : 'NO SE PUDO GUARDAR EN ESTE NAVEGADOR (VALE SOLO POR AHORA)', ok ? 0x9cff8a : 0xff8a8a);
  }

  /** Asigna una tecla a la casilla elegida; si otra acción la usaba, se intercambian. */
  private assignKey(code: string): void {
    const a = ACTIONS[this.row].id;
    const p = this.col < 2 ? 0 : 1;
    const old = this.state.keys[p][a];
    let swapped = '';
    for (let p2 = 0; p2 < 2; p2++) {
      for (const b of ACTIONS) {
        if (p2 === p && b.id === a) continue;
        const list = this.state.keys[p2][b.id];
        if (!list.includes(code)) continue;
        const rest = list.filter((c) => c !== code);
        this.state.keys[p2][b.id] = rest.length ? rest : old.length ? [old[0]] : [];
        swapped = `${b.label} (J${p2 + 1})`;
      }
    }
    this.state.keys[p][a] = [code];
    const what = `${keyLabel(code)} -> ${ACTIONS[this.row].label} (J${p + 1})`;
    this.setStatus(swapped ? `${what} · SE CAMBIÓ CON ${swapped}` : what, 0x9cff8a);
  }

  /** Asigna un botón del joystick (los intercambios son dentro del mismo jugador). */
  private assignPad(button: number): void {
    const a = ACTIONS[this.row].id as PadAction;
    const p = this.col < 2 ? 0 : 1;
    const pads = this.state.pads[p];
    const old = pads[a];
    let swapped = '';
    for (const b of ACTIONS) {
      if (!isPadAction(b.id) || b.id === a) continue;
      if (pads[b.id] === button) {
        pads[b.id] = old;
        swapped = b.label;
      }
    }
    pads[a] = button;
    const what = `${padLabel(button)} -> ${ACTIONS[this.row].label} (J${p + 1})`;
    this.setStatus(swapped ? `${what} · SE CAMBIÓ CON ${swapped}` : what, 0x9cff8a);
  }

  /** Un cuadro de lógica. Devuelve false cuando hay que cerrar. */
  step(): boolean {
    this.t++;
    const g = this.game;
    const m = g.menu;
    if (this.waiting) {
      const p = this.col < 2 ? 0 : 1;
      const pad = this.col % 2 === 1;
      const hits = g.kb.frameHits();
      if (hits.includes('Escape')) {
        this.waiting = false;
        this.rebuild();
        this.setStatus('CANCELADO');
        g.sfx.play('menuBack');
      } else if (pad) {
        const b = g.pads.firstPressed(p);
        if (b >= 0) {
          if (RESERVED_PAD.has(b)) this.setStatus('ESE BOTÓN ESTÁ RESERVADO (START Y CRUCETA)', 0xff8a8a);
          else {
            this.assignPad(b);
            this.waiting = false;
            this.rebuild();
            g.sfx.play('menuConfirm');
          }
        } else if (!g.pads.get(p) && this.t % 60 === 0) {
          this.setStatus(`CONECTA EL JOYSTICK ${p + 1} Y APRIETA UN BOTÓN · ESC CANCELA`);
        }
      } else if (hits.length) {
        const code = hits[0];
        if (RESERVED_KEYS.has(code)) this.setStatus('ESA TECLA ESTÁ RESERVADA (PAUSA, SONIDO, OPCIONES DE PRÁCTICA)', 0xff8a8a);
        else {
          this.assignKey(code);
          this.waiting = false;
          this.rebuild();
          g.sfx.play('menuConfirm');
        }
      }
      this.drawCursor();
      return true;
    }

    if (this.modal >= 0) {
      if (m.up || m.down) {
        this.modal = (this.modal + (m.up ? MODAL.length - 1 : 1)) % MODAL.length;
        this.paintModal();
        g.sfx.play('menuMove');
      }
      if (m.back) {
        this.closeModal();
        g.sfx.play('menuBack');
      } else if (m.confirm) {
        const choice = MODAL[this.modal];
        this.closeModal();
        if (choice === 'GUARDAR') {
          this.save();
          return false;
        }
        if (choice === 'DESCARTAR') {
          g.sfx.play('menuBack');
          return false;
        }
        g.sfx.play('menuMove');
      }
      return true;
    }

    const rows = ACTIONS.length + 1;
    if (m.up || m.down) {
      this.row = (this.row + (m.up ? rows - 1 : 1)) % rows;
      g.sfx.play('menuMove');
    }
    if (m.left || m.right) {
      if (this.row < ACTIONS.length) this.col = (this.col + (m.left ? 3 : 1)) % 4;
      else this.btn = (this.btn + (m.left ? BUTTONS.length - 1 : 1)) % BUTTONS.length;
      g.sfx.play('menuMove');
    }
    const leave = () => {
      if (this.dirty) {
        this.openModal();
        g.sfx.play('menuMove');
        return true;
      }
      g.sfx.play('menuBack');
      return false;
    };
    if (m.back) return leave();
    if (m.confirm) {
      if (this.row < ACTIONS.length) {
        const a = ACTIONS[this.row];
        const pad = this.col % 2 === 1;
        if (pad && !isPadAction(a.id)) {
          this.setStatus('LAS DIRECCIONES DEL JOYSTICK SON LA CRUCETA O LA PALANCA');
        } else {
          this.waiting = true;
          this.rebuild();
          const who = `J${this.col < 2 ? 1 : 2}`;
          this.setStatus(pad ? `APRIETA UN BOTÓN DEL JOYSTICK PARA ${a.label} (${who}) · ESC CANCELA` : `APRIETA UNA TECLA PARA ${a.label} (${who}) · ESC CANCELA`, 0xffd040);
          g.sfx.play('menuConfirm');
        }
      } else {
        const b = BUTTONS[this.btn];
        if (b === 'GUARDAR') this.save();
        else if (b === 'RESTAURAR') {
          this.state = defaultControls();
          this.rebuild();
          g.sfx.play('menuMove');
          this.setStatus('CONTROLES POR DEFECTO · FALTA GUARDAR', 0xffd040);
        } else return leave();
      }
    }
    this.drawCursor();
    return true;
  }

  render(): void {
    this.drawCursor();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** Pantalla CONTROLES desde el menú de modos. */
export class ControlsScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private panel: ControlsPanel;

  constructor(private game: Game, private back: () => Scene) {
    this.panel = new ControlsPanel(game);
  }

  enter(): void {
    const d = this.game.display;
    backdrop.attach(this.game);
    d.hud.addChild(this.panel.container);
  }

  exit(): void {
    const d = this.game.display;
    backdrop.detach(this.game);
    d.hud.removeChild(this.panel.container);
    this.panel.destroy();
  }

  step(): void {
    if (!this.panel.step()) this.game.setScene(this.back());
  }

  render(): void {
    backdrop.render();
    this.panel.render();
  }
}
