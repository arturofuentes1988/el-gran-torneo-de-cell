import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { VIEW_W } from '../config';

// Fondo de la pantalla de título: boceto del ring del torneo de artes marciales
// (el de Dragon Ball). Ring de baldosas de piedra en perspectiva, el templo de
// techos curvos con su puerta en arco, palmeras, graderías con público y cielo
// de día con nubes. Todo dibujado en código, con un poco de vida (nubes que
// pasan, público que salta, palmeras que se mecen).

/** Borde de atrás y de adelante del ring (los pies de los luchadores quedan entre ambos). */
export const RING_BACK_Y = 186;
export const RING_FRONT_Y = 248;
const RING_FACE_Y = 266;
const GROUND_Y = 166;
const OUTLINE = 0x4a3020;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
}

interface Cloud {
  g: Graphics;
  speed: number;
}

interface Fan {
  x: number;
  y: number;
  color: number;
  ph: number;
}

interface Palm {
  crown: Container;
  ph: number;
}

export class TournamentBackdrop {
  readonly container = new Container();
  private clouds: Cloud[] = [];
  private crowd = new Graphics();
  private fans: Fan[] = [];
  private palms: Palm[] = [];
  private t = 0;
  private last = performance.now();

  constructor() {
    // Cielo de día.
    const sky = new Sprite(
      canvasTexture(4, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#2c78d2');
        g.addColorStop(0.55, '#74b8ee');
        g.addColorStop(1, '#d4f0ff');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 256);
      }),
    );
    sky.width = VIEW_W;
    sky.height = GROUND_Y;
    this.container.addChild(sky);

    for (const [x, y, s, speed] of [
      [60, 40, 1.1, 2.2],
      [210, 22, 0.8, 1.6],
      [330, 52, 1.3, 2.6],
      [450, 30, 0.9, 1.9],
      [-60, 64, 0.7, 1.3],
    ] as const) {
      const g = this.cloud(s);
      g.position.set(x, y);
      this.clouds.push({ g, speed });
      this.container.addChild(g);
    }

    this.container.addChild(this.mountains(), this.ground(), this.stands(), this.crowd);
    this.makeFans();
    for (const x of [118, 362]) this.container.addChild(this.palm(x, x < VIEW_W / 2 ? 1 : -1));
    this.container.addChild(this.temple(), this.ring());
    this.drawCrowd();
  }

  private cloud(s: number): Graphics {
    const g = new Graphics();
    const puffs: Array<[number, number, number]> = [
      [0, 6, 14], [16, 0, 17], [34, 4, 15], [50, 8, 11], [-14, 10, 10],
    ];
    for (const [x, y, r] of puffs) g.circle(x * s, (y + 3) * s, r * s).fill({ color: 0xb8d8f0 });
    for (const [x, y, r] of puffs) g.circle(x * s, y * s, r * s).fill({ color: 0xffffff });
    g.alpha = 0.92;
    return g;
  }

  private mountains(): Graphics {
    const g = new Graphics();
    g.poly([0, 150, 40, 128, 90, 142, 140, 118, 200, 140, 260, 124, 320, 142, 380, 116, 430, 136, 480, 122, 480, GROUND_Y, 0, GROUND_Y]).fill({ color: 0x9cc0dc });
    g.poly([0, 158, 60, 140, 120, 152, 190, 136, 250, 150, 300, 138, 370, 152, 430, 140, 480, 150, 480, GROUND_Y, 0, GROUND_Y]).fill({ color: 0x86afcf });
    return g;
  }

  private ground(): Graphics {
    const g = new Graphics();
    g.rect(0, GROUND_Y, VIEW_W, RING_FACE_Y + 10 - GROUND_Y).fill({ color: 0x6cb24c });
    g.rect(0, GROUND_Y, VIEW_W, 4).fill({ color: 0x86c862 });
    return g;
  }

  /** Graderías a los dos lados del templo. */
  private stands(): Graphics {
    const g = new Graphics();
    for (const [x0, x1] of [
      [-10, 150],
      [330, 490],
    ] as const) {
      for (let row = 0; row < 3; row++) {
        const y = 144 + row * 8;
        g.rect(x0, y, x1 - x0, 8).fill({ color: row % 2 ? 0xc8beac : 0xb4aa96 }).stroke({ color: 0x8a7e6a, width: 0.5 });
      }
      g.rect(x0, 168, x1 - x0, 6).fill({ color: 0x9a907c });
    }
    return g;
  }

  private makeFans(): void {
    const colors = [0xe84a3a, 0x3a7ae8, 0xf2c23a, 0x5ac25a, 0xf08ac0, 0xffffff, 0x8a5ae0, 0xf28a3a];
    for (const [x0, x1] of [
      [-6, 146],
      [334, 486],
    ] as const) {
      for (let row = 0; row < 3; row++) {
        for (let x = x0 + (row % 2) * 3; x < x1; x += 6) {
          this.fans.push({ x, y: 142 + row * 8, color: colors[Math.floor(Math.random() * colors.length)], ph: Math.random() * Math.PI * 2 });
        }
      }
    }
  }

  /** Público: cabezas y torsos de colores que saltan de vez en cuando. */
  private drawCrowd(): void {
    const g = this.crowd.clear();
    for (const f of this.fans) {
      const jump = Math.max(0, Math.sin(this.t * 3.2 + f.ph)) ** 6 * 3;
      g.roundRect(f.x - 2.2, f.y - jump, 4.4, 5, 1.5).fill({ color: f.color });
      g.circle(f.x, f.y - 2 - jump, 1.8).fill({ color: 0xf0c8a0 });
    }
  }

  private palm(x: number, lean: 1 | -1): Container {
    const c = new Container();
    const trunk = new Graphics();
    const top = { x: x + lean * 14, y: 92 };
    trunk.moveTo(x, GROUND_Y + 4).quadraticCurveTo(x + lean * 2, 130, top.x, top.y).stroke({ color: 0x8a5a30, width: 5 });
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      const px = x + (top.x - x) * t * t + lean * 2 * t;
      const py = GROUND_Y + 4 + (top.y - GROUND_Y - 4) * t;
      trunk.moveTo(px - 2.5, py).lineTo(px + 2.5, py - 1).stroke({ color: 0x6a4020, width: 0.8 });
    }
    const crown = new Container();
    crown.position.set(top.x, top.y);
    const leaves = new Graphics();
    for (const [ang, len] of [
      [-2.7, 30], [-2.1, 34], [-1.5, 26], [-0.9, 34], [-0.3, 30], [0.5, 24], [2.6, 24],
    ] as const) {
      const ex = Math.cos(ang) * len;
      const ey = Math.sin(ang) * len + len * 0.35;
      const nx = -Math.sin(ang) * 5;
      const ny = Math.cos(ang) * 5;
      leaves.poly([0, 0, ex * 0.5 + nx, ey * 0.5 + ny - 6, ex, ey, ex * 0.5 - nx, ey * 0.5 - ny - 6]).fill({ color: 0x3f9a3a }).stroke({ color: 0x2a6a28, width: 0.6 });
    }
    leaves.circle(0, 0, 3).fill({ color: 0x6a4a20 });
    crown.addChild(leaves);
    c.addChild(trunk, crown);
    this.palms.push({ crown, ph: Math.random() * Math.PI * 2 });
    return c;
  }

  /** El templo: salón crema con columnas, puerta en arco y dos techos curvos naranjos. */
  private temple(): Graphics {
    const g = new Graphics();
    const cx = VIEW_W / 2;
    const roof = 0xe27a2a;
    const roofDark = 0xa84a14;
    // Escalinata y base.
    g.rect(cx - 74, 160, 148, 10).fill({ color: 0xd8d0c0 }).stroke({ color: OUTLINE, width: 0.8 });
    g.rect(cx - 66, 156, 132, 5).fill({ color: 0xe4dccc }).stroke({ color: OUTLINE, width: 0.6 });
    // Salón principal.
    g.rect(cx - 58, 118, 116, 39).fill({ color: 0xf6e8c8 }).stroke({ color: OUTLINE, width: 0.8 });
    for (const dx of [-54, -40, -26, 22, 36, 50]) g.rect(cx + dx, 120, 5, 36).fill({ color: 0xc9542a }).stroke({ color: OUTLINE, width: 0.5 });
    // Puerta en arco.
    g.moveTo(cx - 16, 156).lineTo(cx - 16, 136).arc(cx, 136, 16, Math.PI, 0).lineTo(cx + 16, 156).closePath().fill({ color: 0x3a2418 }).stroke({ color: OUTLINE, width: 0.8 });
    // Placa sobre la puerta.
    g.roundRect(cx - 12, 113, 24, 7, 1).fill({ color: 0xc9302a }).stroke({ color: OUTLINE, width: 0.6 });
    // Techo de abajo: ancho, con las puntas levantadas.
    g.poly([cx - 82, 112, cx - 70, 120, cx + 70, 120, cx + 82, 112, cx + 60, 104, cx + 34, 94, cx - 34, 94, cx - 60, 104]).fill({ color: roof }).stroke({ color: roofDark, width: 1 });
    for (let i = -5; i <= 5; i++) g.moveTo(cx + i * 6, 95).lineTo(cx + i * 12.5, 119).stroke({ color: roofDark, width: 0.5, alpha: 0.7 });
    // Piso de arriba y su techo.
    g.rect(cx - 28, 82, 56, 13).fill({ color: 0xf6e8c8 }).stroke({ color: OUTLINE, width: 0.8 });
    for (const dx of [-24, -10, 6, 20]) g.rect(cx + dx, 84, 4, 10).fill({ color: 0xc9542a });
    g.poly([cx - 46, 82, cx - 36, 86, cx + 36, 86, cx + 46, 82, cx + 28, 74, cx + 14, 66, cx - 14, 66, cx - 28, 74]).fill({ color: roof }).stroke({ color: roofDark, width: 1 });
    return g;
  }

  /** El ring: plataforma cuadrada de baldosas de piedra, vista en perspectiva. */
  private ring(): Graphics {
    const g = new Graphics();
    const bl = 40;
    const br = VIEW_W - 40;
    const fl = -40;
    const fr = VIEW_W + 40;
    // Sombra del ring sobre el pasto.
    g.poly([bl - 6, RING_BACK_Y - 2, br + 6, RING_BACK_Y - 2, fr + 10, RING_FACE_Y + 4, fl - 10, RING_FACE_Y + 4]).fill({ color: 0x000000, alpha: 0.12 });
    // Cara de arriba.
    g.poly([bl, RING_BACK_Y, br, RING_BACK_Y, fr, RING_FRONT_Y, fl, RING_FRONT_Y]).fill({ color: 0xe9e4da });
    // Baldosas: filas (más juntas atrás) y columnas que se juntan hacia el fondo.
    const rows = 7;
    for (let i = 1; i < rows; i++) {
      const t = (i / rows) ** 1.25;
      const y = RING_BACK_Y + (RING_FRONT_Y - RING_BACK_Y) * t;
      const xl = bl + (fl - bl) * t;
      const xr = br + (fr - br) * t;
      g.moveTo(xl, y).lineTo(xr, y);
    }
    const cols = 12;
    for (let i = 1; i < cols; i++) {
      const u = i / cols;
      g.moveTo(bl + (br - bl) * u, RING_BACK_Y).lineTo(fl + (fr - fl) * u, RING_FRONT_Y);
    }
    g.stroke({ color: 0xb4ad9f, width: 0.7 });
    // Grietas y manchas de boceto.
    g.moveTo(150, 214).lineTo(158, 220).lineTo(155, 228).stroke({ color: 0x9a9284, width: 0.5 });
    g.moveTo(330, 200).lineTo(336, 206).stroke({ color: 0x9a9284, width: 0.5 });
    // Borde de atrás (luz) y cara de adelante con sus bloques.
    g.moveTo(bl, RING_BACK_Y).lineTo(br, RING_BACK_Y).stroke({ color: 0xffffff, width: 1, alpha: 0.8 });
    g.rect(fl, RING_FRONT_Y, fr - fl, RING_FACE_Y - RING_FRONT_Y).fill({ color: 0xaaa397 });
    for (let x = fl + 10; x < fr; x += 34) g.moveTo(x, RING_FRONT_Y).lineTo(x, RING_FACE_Y);
    g.moveTo(fl, (RING_FRONT_Y + RING_FACE_Y) / 2).lineTo(fr, (RING_FRONT_Y + RING_FACE_Y) / 2);
    g.stroke({ color: 0x8a8376, width: 0.7 });
    g.moveTo(fl, RING_FRONT_Y).lineTo(fr, RING_FRONT_Y).stroke({ color: 0xf6f2ea, width: 1.2 });
    return g;
  }

  /** Cada cuadro de pantalla: pasan las nubes, salta el público y se mecen las palmeras. */
  render(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    for (const c of this.clouds) {
      c.g.x += c.speed * dt;
      if (c.g.x > VIEW_W + 70) c.g.x = -90;
    }
    for (const p of this.palms) p.crown.rotation = Math.sin(this.t * 0.9 + p.ph) * 0.05;
    this.drawCrowd();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

