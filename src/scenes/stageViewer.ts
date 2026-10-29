import { Container, Graphics } from 'pixi.js';
import { STAGE_W, VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import type { StageView } from '../render/stage';
import { arcade, outlinedText } from '../render/text';

// VER ESCENARIOS: cada escenario a pantalla completa, con su animación y su
// tema musical, sin luchadores. La cámara recorre el escenario de lado a lado.
// ← → cambia de escenario; Esc (o Enter en VOLVER) vuelve al menú.

interface Item {
  nombre: string;
  /** Música del escenario (si el escenario no trae la suya). */
  musica?: string;
  load: () => Promise<StageView | null>;
}

export class StageViewerScene implements Scene {
  // Sin `music`: sigue la que venía y cada escenario pone la suya al mostrarse (ver show).
  private ui = new Container();
  private band = new Graphics();
  private name = outlinedText('', 10, 0xffd040, 0x1a0420, 2);
  private help = outlinedText('← → CAMBIAR · ESC VOLVER', 6, 0xd8d0e8, 0x0a0610, 2);
  private count = outlinedText('', 6, 0x8ae8ff, 0x0a0610, 2);
  private items: Item[];
  private i = 0;
  private stage: StageView | null = null;
  private t = 0;
  /** Cuadros desde el último cambio (el cartel se desvanece si no se toca nada). */
  private idle = 0;
  private serial = 0;

  constructor(private game: Game, private back: () => Scene) {
    const lib = game.assets.stages;
    this.items = lib.entries.map((e) => ({ nombre: e.nombre, load: () => lib.get(e.id) }));
    this.name.anchor.set(0.5, 0);
    this.help.anchor.set(0.5, 0);
    this.count.anchor.set(1, 0);
    this.ui.addChild(this.band, this.name, this.help, this.count);
    this.layout();
  }

  private layout(): void {
    const h = 30;
    this.band.clear().rect(0, VIEW_H - h, VIEW_W, h).fill({ color: 0x0a0414, alpha: 0.7 });
    this.name.position.set(VIEW_W / 2, VIEW_H - h + 4);
    this.help.position.set(VIEW_W / 2, VIEW_H - 11);
    this.count.position.set(VIEW_W - 8, VIEW_H - h + 6);
  }

  private show(i: number): void {
    const n = this.items.length;
    this.i = (i + n) % n;
    const it = this.items[this.i];
    this.name.text = arcade(it.nombre);
    this.count.text = `${this.i + 1}/${n}`;
    this.idle = 0;
    const serial = ++this.serial;
    it.load().then(
      (stage) => {
        if (serial !== this.serial || !stage) return;
        this.setStage(stage);
        this.game.music.play(stage.music ?? it.musica ?? null);
      },
      () => undefined,
    );
  }

  private setStage(stage: StageView): void {
    const world = this.game.display.world;
    if (this.stage) world.removeChild(this.stage.container);
    this.stage = stage;
    stage.setDarkness(0);
    world.addChildAt(stage.container, 0);
    this.t = 0;
  }

  enter(): void {
    this.game.display.hud.addChild(this.ui);
    this.show(0);
  }

  exit(): void {
    const d = this.game.display;
    if (this.stage) d.world.removeChild(this.stage.container);
    d.hud.removeChild(this.ui);
  }

  step(): void {
    this.t++;
    this.idle++;
    const m = this.game.menu;
    if (m.left || m.right) {
      this.game.sfx.play('menuMove');
      this.show(this.i + (m.left ? -1 : 1));
    }
    if (m.back || m.confirm) {
      this.game.sfx.play('menuBack');
      this.game.setScene(this.back());
    }
  }

  render(): void {
    // Recorre el escenario de un borde al otro, lento y suave.
    const camLeft = (STAGE_W - VIEW_W) / 2 + Math.sin(this.t / 300) * ((STAGE_W - VIEW_W) / 2 - 8);
    this.stage?.update(camLeft, 0);
    // El cartel se desvanece a los 4 s sin tocar nada, para ver el escenario limpio.
    this.ui.alpha = this.idle < 240 ? 1 : Math.max(0, 1 - (this.idle - 240) / 40);
  }
}
