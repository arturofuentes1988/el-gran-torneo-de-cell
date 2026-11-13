// Antes de la pelea (con la barra de carga en pantalla) se deja todo listo en la tarjeta de video:
// las texturas se suben (si no, cada hoja se sube la primera vez que sale uno de sus cuadros, en
// plena pelea: un tirón por hoja, largo en los celulares) y los programas de los filtros se
// compilan (si no, se compilan en el primer golpe).

import { BlurFilter, ColorMatrixFilter, Container, Graphics, RenderTexture, Sprite, Texture, TilingSprite, type Filter, type Renderer, type TextureSource } from 'pixi.js';
import { AdvancedBloomFilter, ZoomBlurFilter } from 'pixi-filters';

const pausa = (): Promise<void> =>
  new Promise((r) => {
    // requestAnimationFrame no corre con la pestaña escondida: el reloj lo cubre.
    const t = setTimeout(r, 60);
    requestAnimationFrame(() => {
      clearTimeout(t);
      r();
    });
  });

/** Sube estas texturas a la tarjeta de video, una por cuadro (cada subida grande frena un poco). */
export async function subirTexturas(renderer: Renderer, sources: Iterable<TextureSource>): Promise<void> {
  const sistema = renderer.texture as unknown as { getGlSource?: (s: TextureSource) => unknown; _glTextures?: Record<number, unknown> };
  if (typeof sistema.getGlSource !== 'function') return;
  for (const s of new Set(sources)) {
    if (!s || s.destroyed || s.resource instanceof HTMLVideoElement || sistema._glTextures?.[s.uid]) continue;
    try {
      sistema.getGlSource(s);
    } catch {
      // Si no se puede, se subirá sola al dibujarse.
      continue;
    }
    if (s.pixelWidth * s.pixelHeight >= 512 * 512) await pausa();
  }
}

let calentados = false;

/** Dibuja una vez, fuera de pantalla, cada filtro de la pelea: así sus programas quedan compilados. */
export function calentarFiltros(renderer: Renderer, extra: Array<Filter | null> = []): void {
  if (calentados) return;
  calentados = true;
  const rt = RenderTexture.create({ width: 64, height: 64 });
  const raiz = new Container();
  try {
    const filtros: Filter[][] = [
      [new AdvancedBloomFilter({ threshold: 0.25, bloomScale: 1.2, brightness: 1, blur: 6, quality: 2 })],
      [new ZoomBlurFilter({ strength: 0.1, innerRadius: 4 }), new ColorMatrixFilter()],
      [new BlurFilter({ strength: 4, quality: 2 })],
      ...extra.filter((f): f is Filter => !!f).map((f) => [f]),
    ];
    for (const f of filtros) {
      const s = new Sprite(Texture.WHITE);
      s.setSize(32, 32);
      s.position.set(8, 8);
      s.filters = f;
      raiz.addChild(s);
    }
    const suma = new Sprite(Texture.WHITE);
    suma.blendMode = 'add';
    raiz.addChild(suma, new TilingSprite({ texture: Texture.WHITE, width: 16, height: 16 }), new Graphics().rect(0, 0, 8, 8).fill(0xffffff).stroke({ color: 0xff0000, width: 1 }));
    renderer.render({ container: raiz, target: rt });
  } catch {
    // No es grave: se compilan al usarse.
  }
  raiz.destroy({ children: true });
  rt.destroy(true);
}
