// Efectos especiales pintados que comparten todos los luchadores (public/efectos/, los arma
// herramientas/efectos_vfx.py): cuadros de videos de efectos sin el fondo negro
// ("vfx/<efecto>/<i>", para mezcla aditiva) y objetos pintados ("obj/<nombre>").

import { Assets, type Spritesheet, type Texture } from 'pixi.js';

/** Texturas compartidas (no vienen en el atlas de un luchador). */
export const SHARED_TEX = /^(vfx|obj)\//;

/** Carga los atlas de efectos; si faltan, devuelve nada y los poderes se dibujan con vectores. */
export async function loadEffects(folder = 'efectos'): Promise<Record<string, Texture>> {
  try {
    const res = await fetch(`${folder}/atlas.json`);
    if (!res.ok) return {};
    const list = (await res.json()) as string[];
    const sheets = await Promise.all(
      list.map((a) =>
        Assets.load<Spritesheet>({ src: `${folder}/${a}`, data: { textureOptions: { scaleMode: 'linear', autoGenerateMipmaps: true } } }),
      ),
    );
    return Object.assign({}, ...sheets.map((s) => s.textures)) as Record<string, Texture>;
  } catch (err) {
    console.warn('No se pudieron cargar los efectos especiales; se usan los dibujados.', err);
    return {};
  }
}

const cache = new WeakMap<Record<string, Texture>, Map<string, Texture[]>>();

/** Cuadros de un efecto en orden ("vfx/rayo/0", "vfx/rayo/1", …); vacío si no está cargado. */
export function vfxFrames(textures: Record<string, Texture>, name: string): Texture[] {
  let byName = cache.get(textures);
  if (!byName) {
    byName = new Map();
    cache.set(textures, byName);
  }
  let frames = byName.get(name);
  if (!frames) {
    frames = [];
    for (let i = 0; textures[`vfx/${name}/${i}`]; i++) frames.push(textures[`vfx/${name}/${i}`]);
    byName.set(name, frames);
  }
  return frames;
}
