// DEMOSTRACIÓN (en OPCIONES): la CPU contra la CPU en MUY DIFÍCIL, sin fin. Cada pelea es al mejor
// de tres rounds, con dos luchadores distintos (al azar, otra pareja que la anterior si se puede),
// cada uno con su ropa original, en otro escenario. Aceptar o volver sale al menú de OPCIONES.

import { Container, Graphics, type Text } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { arcade, outlinedText } from '../render/text';
import { FightScene } from './fight';

/** Cuadros mínimos que se ve el cartel entre una pelea y la siguiente (mientras carga el escenario). */
const MIN_FRAMES = 40;

export class DemoScene implements Scene {
  readonly music = null;
  private ui = new Container();
  private label: Text;
  private t = 0;
  private ready = false;
  private fighters: [number, number];
  private colors: [number, number];

  constructor(
    private game: Game,
    private exitTo: () => Scene,
    private last: { pair: string; stage: string } = { pair: '', stage: '' },
  ) {
    const n = game.assets.roster.length;
    // Pareja al azar de dos luchadores distintos (nunca el mismo contra sí mismo), distinta de la
    // anterior si hay con qué variar. Los dos con su color original.
    let a = 0;
    let b = Math.min(1, n - 1);
    for (let tries = 0; tries < 40 && n > 1; tries++) {
      a = Math.floor(Math.random() * n);
      b = Math.floor(Math.random() * n);
      if (a === b) continue;
      const key = [a, b].sort().join('+');
      if (key !== last.pair || n <= 2) break;
    }
    if (a === b && n > 1) b = (a + 1) % n;
    this.fighters = [a, b];
    this.colors = [0, 0];
    // Escenario al azar de la lista, distinto del anterior.
    const stages = game.assets.stages.entries;
    const pool = stages.length > 1 ? stages.filter((e) => e.id !== last.stage) : stages;
    const entry = pool[Math.floor(Math.random() * pool.length)];
    this.last = { pair: [a, b].sort().join('+'), stage: entry?.id ?? '' };
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x07030e });
    this.label = outlinedText(arcade('DEMOSTRACIÓN'), 14, 0xffd040, 0x5a0a10, 3);
    this.label.anchor.set(0.5);
    this.label.position.set(VIEW_W / 2, VIEW_H / 2 - 8);
    const hint = outlinedText(arcade('ACEPTAR O VOLVER: SALIR'), 7, 0xd8d0e8, 0x1a0a24, 2);
    hint.anchor.set(0.5);
    hint.position.set(VIEW_W / 2, VIEW_H / 2 + 14);
    this.ui.addChild(bg, this.label, hint);
    if (!entry) {
      this.ready = true;
      return;
    }
    game.assets.stages.get(entry.id).then(
      (st) => {
        game.assets.stage = st;
        this.ready = true;
      },
      () => {
        this.ready = true;
      },
    );
  }

  enter(): void {
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    this.game.display.hud.removeChild(this.ui);
    this.ui.destroy({ children: true });
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (m.back || m.confirm) {
      this.game.sfx.play('menuBack');
      this.game.setScene(this.exitTo());
      return;
    }
    if (!this.ready || this.t < MIN_FRAMES) return;
    const g = this.game;
    const last = this.last;
    g.setScene(
      new FightScene(g, 'demo', (Date.now() & 0xffff) + 1, {
        fighters: this.fighters,
        colors: this.colors,
        difficulty: 'muyDificil',
        exit: this.exitTo,
        next: () => new DemoScene(g, this.exitTo, last),
      }),
    );
  }

  render(): void {
    this.label.alpha = 0.75 + 0.25 * Math.sin(this.t * 0.15);
  }
}
