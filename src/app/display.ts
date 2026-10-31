import { Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import { renderScale } from '../render/scale';

/** Límites de la escala de dibujo del mundo (S = 4 → 1920x1080). */
const MIN_S = 2;
const MAX_S = 4;

/**
 * Capas de dibujo (todas en unidades de mundo de 480x270):
 *  - world: escenario, luchadores y proyectiles. No está en app.stage: se
 *    dibuja a una textura S veces más grande (S entre 2 y 4 según la pantalla)
 *    y esa textura se muestra en worldView. Así el arte HD se ve nítido.
 *  - fx: partículas y brillos, dibujados directo a resolución de pantalla, misma cámara.
 *  - hud: interfaz, texto nítido a resolución de pantalla.
 *  - overlay: menús y fundidos.
 * El "root" se escala para llenar la ventana y se centra con bandas negras.
 */
export class Display {
  readonly app = new Application();
  readonly root = new Container();
  readonly world = new Container();
  readonly fx = new Container();
  readonly hud = new Container();
  readonly overlay = new Container();
  /** Muestra la textura del mundo dentro de root (a escala 1/S). */
  readonly worldView = new Sprite();
  /** Pixeles CSS por unidad de mundo. */
  scale = 1;
  dpr = 1;
  /** Pixeles de la textura del mundo por unidad de mundo (S). */
  renderScale = 0;
  /** Celular vertical: el juego va arriba (los controles táctiles quedan abajo) en vez de centrado. */
  alignTop = false;
  /** Con alignTop: pixeles CSS libres arriba del juego (para el botón ☰ de los controles táctiles). */
  topOffset = 0;
  private worldRoot = new Container();
  private rt: RenderTexture | null = null;
  private lastW = 0;
  private lastH = 0;
  private listeners: Array<() => void> = [];

  async init(): Promise<void> {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    await this.app.init({
      background: '#07040c',
      resizeTo: window,
      antialias: false,
      resolution: this.dpr,
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    document.body.appendChild(this.app.canvas);
    this.worldRoot.addChild(this.world);
    const mask = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
    this.root.addChild(this.worldView, this.fx, this.hud, this.overlay, mask);
    this.root.mask = mask;
    this.app.stage.addChild(this.root);
    this.layout(true);
  }

  onResize(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Recalcula escala y textura del mundo si cambió el tamaño de la ventana. */
  layout(force = false): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    if (!force && W === this.lastW && H === this.lastH) return;
    this.lastW = W;
    this.lastH = H;
    this.scale = Math.min(W / VIEW_W, H / VIEW_H);
    // S: los pixeles reales por unidad de mundo, redondeado hacia arriba
    // (con un margen para no saltar de nivel por un pixel de más).
    const s = Math.max(MIN_S, Math.min(MAX_S, Math.ceil(this.scale * this.dpr - 0.05)));
    if (s !== this.renderScale || !this.rt) {
      this.renderScale = s;
      renderScale.s = s;
      this.rt?.destroy(true);
      this.rt = RenderTexture.create({ width: VIEW_W * s, height: VIEW_H * s, scaleMode: 'linear', resolution: 1 });
      this.worldView.texture = this.rt;
      this.worldView.scale.set(1 / s);
      this.worldRoot.scale.set(s);
    }
    this.root.scale.set(this.scale);
    const y = this.alignTop ? Math.round(this.topOffset) : Math.round((H - VIEW_H * this.scale) / 2);
    this.root.position.set(Math.round((W - VIEW_W * this.scale) / 2), y);
    for (const fn of this.listeners) fn();
  }

  /** Resolución para que el texto del HUD quede nítido. */
  get textResolution(): number {
    return Math.max(1, this.scale * this.dpr);
  }

  /** Dibuja el mundo en su textura HD (se muestra con worldView). */
  renderWorld(): void {
    if (this.rt) this.app.renderer.render({ container: this.worldRoot, target: this.rt, clear: true, clearColor: '#000000' });
  }
}
