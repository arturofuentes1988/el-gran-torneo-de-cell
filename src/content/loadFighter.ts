// Carga un luchador definitivo desde su carpeta (la arma herramientas/armar_luchador.py y la
// reparte herramientas/calidades.py): definición (FighterDef en JSON) y atlas de Pixi en dos
// calidades (hd/ y liviano/) y dos grupos: "menu" (lo que sale en los menús, se baja al abrir
// el juego) y "pelea" (todo lo demás, se baja antes de su primera pelea, ver contenido.ts).
// Formato documentado en docs/FORMATO_SPRITES.md.

import type { Texture } from 'pixi.js';
import { REQUIRED_ANIMS, type FighterDef } from '../sim/types';
import type { Calidad } from './calidad';
import { bajarJson, bajarTextura, loadSheets, type OpcionesTextura, type Progreso } from './descargas';
import { SHARED_TEX } from './vfx';

/** Un luchador del plantel. */
export interface FighterAsset {
  def: FighterDef;
  /** Texturas cargadas del luchador (las de los menús siempre; las de pelea cuando se bajan). */
  textures: Record<string, Texture>;
  /** Cara para las casillas de ELIGE LUCHADOR (public/luchadores/<id>/cara.webp). */
  face?: Texture;
  /** Carpeta (public/luchadores/<id>/). */
  folder: string;
  /** Atlas del grupo "pelea" (URL de los JSON); vacío si todo vino con los menús. */
  fightAtlases: string[];
  /** Cómo se crean sus texturas (filtrado y mipmaps según la calidad). */
  texOptions: OpcionesTextura;
  /** Huella de la definición tal como llegó (en línea, los dos tienen que tener la misma versión). */
  huella: number;
}

/** Huella de un texto (FNV-1a de 32 bits). */
export function huellaTexto(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** atlas.json: una lista (formato viejo, todo junto) o calidades con grupos. */
type AtlasIndex = string[] | Partial<Record<Calidad, { menu?: string[]; pelea?: string[] }>>;

const okScale = (k: number | undefined) => k === undefined || (Number.isFinite(k) && k > 0 && k <= 8);

/**
 * Revisa que la definición esté completa; devuelve la lista de problemas. Con `ownOnly` no
 * revisa las texturas compartidas de efectos (vfx/…, obj/…), que no vienen en su atlas.
 */
export function validateFighter(def: FighterDef, textures: Record<string, Texture>, ownOnly = false): string[] {
  const problems: string[] = [];
  if (!okScale(def.texScale)) problems.push(`texScale debe ser un número entre 0 y 8 (hay ${def.texScale})`);
  if (def.texFilter !== undefined && def.texFilter !== 'linear' && def.texFilter !== 'nearest') {
    problems.push(`texFilter debe ser "linear" o "nearest" (hay "${def.texFilter}")`);
  }
  for (const name of REQUIRED_ANIMS) {
    if (!def.anims[name]) problems.push(`falta la animación "${name}"`);
  }
  for (const [name, anim] of Object.entries(def.anims)) {
    anim.frames.forEach((f, i) => {
      const tex = textures[f.tex];
      if (!tex) problems.push(`${name}[${i}]: no existe la textura "${f.tex}"`);
      else if (!tex.defaultAnchor) problems.push(`${name}[${i}]: la textura "${f.tex}" no trae anchor (los pies)`);
      if (!(f.dur >= 1)) problems.push(`${name}[${i}]: la duración debe ser 1 o más`);
    });
  }
  for (const [id, mv] of Object.entries(def.moves)) {
    if (!def.anims[mv.anim]) problems.push(`movimiento "${id}": no existe la animación "${mv.anim}"`);
    if (mv.cinematic && !def.sounds?.[mv.cinematic.sound]) {
      problems.push(`súper "${id}": no existe el sonido "${mv.cinematic.sound}" en sounds`);
    }
    if (mv.cinematic?.portrait && !textures[mv.cinematic.portrait]) {
      problems.push(`súper "${id}": no existe la textura del retrato "${mv.cinematic.portrait}"`);
    }
    if (!okScale(mv.cinematic?.portraitScale)) problems.push(`súper "${id}": portraitScale inválido`);
  }
  for (const [id, p] of Object.entries(def.projectiles)) {
    if (!okScale(p.texScale)) problems.push(`proyectil "${id}": texScale inválido`);
    for (const t of p.frames) {
      if (!textures[t] && !(ownOnly && SHARED_TEX.test(t))) problems.push(`proyectil "${id}": no existe la textura "${t}"`);
    }
  }
  const specials = def.specials.filter((id) => def.moves[id]?.kind === 'special').map((id) => def.moves[id].name);
  const distinct = new Set(specials).size;
  if (distinct < 2 || distinct > 3) problems.push(`se esperan 2 o 3 especiales y hay ${distinct}`);
  if (!def.specials.some((id) => def.moves[id]?.kind === 'super')) problems.push('falta el súper');
  return problems;
}

/**
 * Lee la carpeta del luchador y baja lo de los menús (y su cara). Lo de pelea queda anotado
 * en `fightAtlases` para bajarlo después.
 */
export async function loadFighterFolder(folder: string, id: string, calidad: Calidad, prog?: Progreso): Promise<FighterAsset> {
  const [index, def] = await Promise.all([bajarJson<AtlasIndex>(`${folder}/atlas.json`, prog), bajarJson<FighterDef>(`${folder}/${id}.json`, prog)]);
  // Antes de que la pelea le agregue animaciones armadas (DOBLE, tramos del ultra).
  const huella = huellaTexto(JSON.stringify(def));
  const groups = Array.isArray(index) ? { menu: index, pelea: [] } : (index[calidad] ?? index.hd ?? {});
  const scaleMode = def.texFilter ?? 'linear';
  const texOptions: OpcionesTextura = { scaleMode, mipmaps: calidad === 'hd' && scaleMode === 'linear' };
  const url = (a: string) => `${folder}/${a}`;
  const faceUrl = `${folder}/cara.webp`;
  prog?.esperar(faceUrl);
  const [sheets, face] = await Promise.all([
    loadSheets((groups.menu ?? []).map(url), texOptions, prog),
    // Cara para ELIGE LUCHADOR (herramientas/caras.py); si falta, la pantalla usa su silueta.
    bajarTextura(faceUrl, { mipmaps: true }, prog).catch(() => undefined),
  ]);
  const textures: Record<string, Texture> = {};
  for (const sheet of sheets) Object.assign(textures, sheet.textures);
  return { def, textures, face, folder, fightAtlases: (groups.pelea ?? []).map(url), texOptions, huella };
}
