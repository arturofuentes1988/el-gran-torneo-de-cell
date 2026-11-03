// Pantalla de carga genérica: baja lo que falte para una pelea (con barra) y sigue con next().
// La usan los atajos de prueba (?escena=pelea); ELIGE ESCENARIO, el ARCADE y la DEMOSTRACIÓN
// muestran la barra en su propia pantalla.

import { Container, Graphics, type Text } from 'pixi.js';
import type { Game, Scene } from '../app/game';
import { VIEW_H, VIEW_W } from '../config';
import type { FightNeeds } from '../content/contenido';
import { Progreso } from '../content/descargas';
import { BarraCarga } from '../render/barraCarga';
import { tactil } from '../input/touch';
import { outlinedText } from '../render/text';

export class LoadingScene implements Scene {
  private ui = new Container();
  private bar = new BarraCarga(240, 8, 'CARGANDO PELEA');
  private hint: Text;
  private prog = new Progreso();
  private done = false;
  private failed = false;

  constructor(
    private game: Game,
    private needs: FightNeeds,
    private next: () => Scene,
  ) {
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x07030e });
    this.bar.container.position.set(VIEW_W / 2, VIEW_H / 2);
    this.hint = outlinedText('', 7, 0xd8d0e8);
    this.hint.anchor.set(0.5);
    this.hint.position.set(VIEW_W / 2, VIEW_H / 2 + 22);
    this.ui.addChild(bg, this.bar.container, this.hint);
    this.load();
  }

  private load(): void {
    this.failed = false;
    this.prog = new Progreso();
    this.hint.text = '';
    this.game.assets.content.prepare(this.needs, this.prog).then(
      (stage) => {
        if (stage && this.needs.stage) {
          this.game.assets.stage = stage;
          this.game.assets.stageId = this.needs.stage;
        }
        this.done = true;
      },
      (err: unknown) => {
        console.warn('No se pudo cargar la pelea.', err);
        this.failed = true;
        this.hint.text = tactil() ? 'NO SE PUDO CARGAR · TOCA PARA REINTENTAR' : 'NO SE PUDO CARGAR · ACEPTAR PARA REINTENTAR';
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
    if (this.done) this.game.setScene(this.next());
    else if (this.failed && (this.game.menu.confirm || this.game.menu.tap)) this.load();
  }

  render(): void {
    this.bar.update(this.prog);
  }
}
