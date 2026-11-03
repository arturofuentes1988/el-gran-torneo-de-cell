import { Container, Graphics } from 'pixi.js';
import type { Progreso } from '../content/descargas';
import { outlinedText } from './text';

/** Barra de carga con lo bajado en MB ("CARGANDO PELEA   3,2 / 9,8 MB"). Se centra en su posición. */
export class BarraCarga {
  readonly container = new Container();
  private g = new Graphics();
  private label;
  private mb;
  /** Lo que muestra la barra (persigue al avance real, para que no salte). */
  private shown = 0;
  private t = 0;

  constructor(
    private w = 200,
    private h = 7,
    title = 'CARGANDO',
    private color = 0xffd040,
  ) {
    this.label = outlinedText(title, 8, 0xfff4e0, 0x1a0a24, 2);
    this.label.anchor.set(0, 1);
    this.label.position.set(-w / 2, -h / 2 - 3);
    this.mb = outlinedText('', 7, 0xd8d0e8, 0x1a0a24, 2);
    this.mb.anchor.set(1, 1);
    this.mb.position.set(w / 2, -h / 2 - 3);
    this.container.addChild(this.g, this.label, this.mb);
  }

  set title(s: string) {
    this.label.text = s;
  }

  /** Cada cuadro de pantalla. */
  update(prog: Progreso | null): void {
    this.t++;
    const target = prog ? prog.fraccion : 0;
    this.shown += (target - this.shown) * 0.25;
    if (target >= 1) this.shown = 1;
    this.mb.text = prog && prog.total > 0 ? prog.texto : '';
    const { w, h } = this;
    const fill = Math.max(0, Math.min(1, this.shown)) * (w - 2);
    const g = this.g.clear();
    g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, (h + 3) / 2).fill({ color: 0x07030e, alpha: 0.9 });
    g.roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ color: 0x5a4a70, width: 1 });
    if (fill > 0.5) {
      g.roundRect(-w / 2 + 1, -h / 2 + 1, fill, h - 2, (h - 2) / 2).fill({ color: this.color });
      // Brillo que recorre la parte llena.
      const x = -w / 2 + 1 + ((this.t * 3) % Math.max(1, fill + 30)) - 15;
      if (x > -w / 2 && x < -w / 2 + fill) g.rect(x, -h / 2 + 1, Math.min(10, -w / 2 + 1 + fill - x), h - 2).fill({ color: 0xffffff, alpha: 0.35 });
    }
  }
}
