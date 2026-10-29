import type { Game, Scene } from '../app/game';
import { MoveListPanel } from '../render/moveListPanel';
import { backdrop } from './backdrop';

/** Pantalla "MOVIMIENTOS" desde el menú: botones, especiales y combos de cada luchador. */
export class MoveListScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private panel: MoveListPanel;

  constructor(private game: Game, private back: () => Scene) {
    this.panel = new MoveListPanel(game.assets, 0);
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
    const m = this.game.menu;
    if (m.back || m.confirm) {
      this.game.sfx.play('menuBack');
      this.game.setScene(this.back());
      return;
    }
    const before = m.up || m.down || m.left || m.right;
    this.panel.step(m, this.game.kb);
    if (before) this.game.sfx.play('menuMove');
  }

  render(): void {
    backdrop.render();
  }
}
