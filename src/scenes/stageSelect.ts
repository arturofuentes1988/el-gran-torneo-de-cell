import { BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game, Scene } from '../app/game';
import { VIEW_H, VIEW_W } from '../config';
import type { StageEntry } from '../content/stages';
import type { StageView } from '../render/stage';
import { arcade, outlinedText } from '../render/text';

/** Grilla de miniaturas: hasta 6 por fila y 2 filas (11 escenarios + ALEATORIO). */
const COLS = 6;
const CARD_W = 60;
const CARD_H = 34;
const GAP_X = 8;
const GAP_Y = 9;
const GRID_Y = 184;
const PREVIEW_W = 192;
const PREVIEW_H = 108;
const PREVIEW_Y = 34;

/** La tarjeta marcada se recuerda entre visitas. */
let lastSel = 0;

interface Card {
  /** null: ALEATORIO. */
  entry: StageEntry | null;
  root: Container;
  thumb: Sprite;
  frame: Graphics;
}

/**
 * "ELIGE ESCENARIO", antes de cada pelea: miniaturas en grilla, vista previa
 * grande del escenario marcado y su nombre. Al aceptar se carga (CARGANDO...),
 * queda en game.assets.stage y empieza la pelea con start(). Atrás: back().
 */
export class StageSelectScene implements Scene {
  /** El tema de la pantalla de título sigue sonando en los menús. */
  readonly music = 'titulo';
  private ui = new Container();
  private grid = new Container();
  private backdrop = new Sprite(Texture.EMPTY);
  private preview = new Sprite(Texture.EMPTY);
  private previewBox = new Graphics();
  private question = outlinedText('?', 40, 0xffd040, 0x5a0a10, 4);
  private name = outlinedText('', 12, 0xffd040, 0x5a0a10, 3);
  private owner = outlinedText('', 8, 0xd8cce0);
  private status = outlinedText('', 8, 0xffffff);
  private cards: Card[] = [];
  private textures = new Map<string, Texture>();
  private sel: number;
  private t = 0;
  private alive = true;
  private loading = false;
  /** Escenario ya cargado: la pelea empieza en el próximo cuadro. */
  private ready: StageView | null = null;
  private failTimer = 0;

  constructor(private game: Game, private start: () => Scene, private back: () => Scene) {
    const list: Array<StageEntry | null> = [...game.assets.stages.entries, null];
    this.sel = Math.min(lastSel, list.length - 1);

    const shade = new Graphics()
      .rect(0, 0, VIEW_W, VIEW_H)
      .fill({ color: 0x0a0414, alpha: 0.62 });
    this.backdrop.filters = [new BlurFilter({ strength: 6, quality: 3 })];
    const title = outlinedText('ELIGE ESCENARIO', 14, 0xfff4e0, 0x5a0a10, 3);
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 17);

    this.preview.anchor.set(0.5);
    this.preview.position.set(VIEW_W / 2, PREVIEW_Y + PREVIEW_H / 2);
    this.question.anchor.set(0.5);
    this.question.position.copyFrom(this.preview.position);
    this.name.anchor.set(0.5, 0);
    this.name.position.set(VIEW_W / 2, PREVIEW_Y + PREVIEW_H + 9);
    this.owner.anchor.set(0.5, 0);
    this.owner.position.set(VIEW_W / 2, PREVIEW_Y + PREVIEW_H + 26);
    this.status.anchor.set(0.5);
    this.status.position.set(VIEW_W / 2, PREVIEW_Y + PREVIEW_H - 12);

    const n = list.length;
    const rows = Math.ceil(n / COLS);
    const gridY = rows === 1 ? GRID_Y + Math.round((CARD_H + GAP_Y) / 2) : GRID_Y;
    list.forEach((entry, i) => {
      const row = Math.floor(i / COLS);
      const inRow = Math.min(COLS, n - row * COLS);
      const rowW = inRow * CARD_W + (inRow - 1) * GAP_X;
      const x = Math.round((VIEW_W - rowW) / 2 + (i % COLS) * (CARD_W + GAP_X));
      const y = gridY + row * (CARD_H + GAP_Y);
      const root = new Container();
      root.position.set(x + CARD_W / 2, y + CARD_H / 2);
      const bg = new Graphics()
        .rect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H)
        .fill(entry ? 0x140a24 : 0x2a0e30);
      const thumb = new Sprite(Texture.EMPTY);
      thumb.anchor.set(0.5);
      root.addChild(bg, thumb);
      if (!entry) {
        const q = outlinedText('?', 16, 0xffd040, 0x5a0a10, 3);
        q.anchor.set(0.5);
        root.addChild(q);
      }
      const frame = new Graphics();
      root.addChild(frame);
      this.grid.addChild(root);
      this.cards.push({ entry, root, thumb, frame });
    });

    this.ui.addChild(this.backdrop, shade, title, this.previewBox, this.preview, this.question, this.name, this.owner, this.status, this.grid);
    this.refresh();
  }

  enter(): void {
    this.game.display.hud.addChild(this.ui);
    // Miniaturas: llegan de a poco (la del escenario de prueba se dibuja aquí mismo).
    const lib = this.game.assets.stages;
    for (const e of lib.entries) {
      void lib.thumbnail(e.id, this.game.display.app.renderer).then((tex) => {
        if (!tex || !this.alive) return;
        this.textures.set(e.id, tex);
        this.refresh();
      });
    }
  }

  exit(): void {
    this.alive = false;
    this.game.display.hud.removeChild(this.ui);
    // Las texturas de las miniaturas quedan en la caché de la biblioteca.
    this.ui.destroy({ children: true });
  }

  step(): void {
    this.t++;
    if (this.ready) {
      this.game.assets.stage = this.ready;
      this.game.setScene(this.start());
      return;
    }
    if (this.failTimer > 0 && --this.failTimer === 0) this.status.text = '';
    if (this.loading) return;
    const m = this.game.menu;
    if (m.back) {
      this.game.sfx.play('menuBack');
      this.game.setScene(this.back());
      return;
    }
    const n = this.cards.length;
    let next = this.sel;
    if (m.left) next = (this.sel + n - 1) % n;
    if (m.right) next = (this.sel + 1) % n;
    if (m.up && this.sel >= COLS) next = this.sel - COLS;
    if (m.down && Math.floor(this.sel / COLS) < Math.floor((n - 1) / COLS)) next = Math.min(n - 1, this.sel + COLS);
    if (next !== this.sel) {
      this.sel = next;
      lastSel = next;
      this.game.sfx.play('menuMove');
      this.refresh();
    }
    if (m.confirm) this.choose();
  }

  /** Carga el escenario marcado (o uno al azar) y, cuando está listo, empieza la pelea. */
  private choose(): void {
    const pool = this.game.assets.stages.entries;
    const entry = this.cards[this.sel].entry ?? pool[Math.floor(Math.random() * pool.length)];
    this.loading = true;
    this.failTimer = 0;
    this.status.text = 'CARGANDO...';
    this.game.sfx.play('menuConfirm');
    this.game.assets.stages.get(entry.id).then(
      (stage) => {
        if (this.alive) this.ready = stage;
      },
      (err: unknown) => {
        console.warn(`No se pudo cargar el escenario "${entry.id}".`, err);
        if (!this.alive) return;
        this.loading = false;
        this.status.text = 'NO SE PUDO CARGAR';
        this.failTimer = 150;
      },
    );
  }

  /** Actualiza vista previa, nombre y tarjetas según la selección. */
  private refresh(): void {
    const card = this.cards[this.sel];
    const entry = card.entry;
    const tex = entry ? this.textures.get(entry.id) : undefined;
    this.name.text = arcade(entry ? entry.nombre : 'ALEATORIO');
    this.owner.text = arcade(entry ? '' : 'UN ESCENARIO AL AZAR');
    this.question.visible = !entry;
    this.showPreview(tex ?? (entry ? null : this.randomTexture()));
    this.cards.forEach((c, i) => {
      const t = c.entry ? this.textures.get(c.entry.id) : undefined;
      c.thumb.texture = t ?? Texture.EMPTY;
      c.thumb.width = CARD_W;
      c.thumb.height = CARD_W * (9 / 16);
      const on = i === this.sel;
      c.root.scale.set(on ? 1.12 : 1);
      c.frame.alpha = 1;
      c.thumb.tint = on ? 0xffffff : 0x8c86a4;
      c.frame
        .clear()
        .rect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H)
        .stroke({ color: on ? 0xffd040 : 0x5a4a70, width: on ? 1.5 : 1, alignment: 1 });
    });
    // La tarjeta marcada queda encima de las demás.
    this.grid.setChildIndex(card.root, this.grid.children.length - 1);
  }

  private showPreview(tex: Texture | null): void {
    this.previewBox.clear();
    this.previewBox
      .rect(VIEW_W / 2 - PREVIEW_W / 2 - 3, PREVIEW_Y - 3, PREVIEW_W + 6, PREVIEW_H + 6)
      .fill(0x0a0612)
      .stroke({ color: 0xffd040, width: 2, alignment: 1 });
    this.preview.texture = tex ?? Texture.EMPTY;
    this.preview.width = PREVIEW_W;
    this.preview.height = PREVIEW_H;
    this.preview.alpha = this.cards[this.sel].entry ? 1 : 0.45;
    if (tex) {
      this.backdrop.texture = tex;
      this.backdrop.width = VIEW_W;
      this.backdrop.height = VIEW_H;
    }
  }

  /** Para la tarjeta ALEATORIO: las miniaturas pasan como una ruleta. */
  private randomTexture(): Texture | null {
    const all = [...this.textures.values()];
    return all.length ? all[Math.floor(this.t / 10) % all.length] : null;
  }

  render(): void {
    if (!this.cards[this.sel].entry && this.t % 10 === 0) this.showPreview(this.randomTexture());
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 7);
    this.cards[this.sel].frame.alpha = 0.55 + 0.45 * pulse;
    this.status.visible = this.failTimer > 0 || Math.floor(this.t / 18) % 2 === 0;
  }
}
