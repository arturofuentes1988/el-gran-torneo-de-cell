// Efectos especiales pintados que comparten todos los luchadores (public/efectos/, los arma
// herramientas/efectos_vfx.py): cuadros de videos de efectos sin el fondo negro
// ("vfx/<efecto>/<i>", para mezcla aditiva) y objetos pintados ("obj/<nombre>").

import type { Texture } from 'pixi.js';
import type { Calidad } from './calidad';
import { bajarJson, loadSheets, type Progreso } from './descargas';

/** Texturas compartidas (no vienen en el atlas de un luchador). */
export const SHARED_TEX = /^(vfx|obj)\//;

/**
 * Carga los atlas de efectos (public/efectos/atlas.json: una lista, o {"hd": {"todo": [...]},
 * "liviano": {...}}); si faltan, devuelve nada y los poderes se dibujan con vectores.
 */
export async function loadEffects(calidad: Calidad, prog?: Progreso, folder = 'efectos'): Promise<Record<string, Texture>> {
  try {
    const index = await bajarJson<string[] | Partial<Record<Calidad, Record<string, string[]>>>>(`${folder}/atlas.json`, prog);
    const list = Array.isArray(index) ? index : Object.values(index[calidad] ?? index.hd ?? {}).flat();
    const sheets = await loadSheets(list.map((a) => `${folder}/${a}`), { scaleMode: 'linear', mipmaps: calidad === 'hd' }, prog);
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
