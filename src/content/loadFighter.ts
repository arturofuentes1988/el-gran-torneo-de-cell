// Carga un luchador definitivo desde archivos: atlas (PNG + JSON con formato
// de spritesheet de Pixi) y definición (FighterDef en JSON). Devuelve lo mismo
// que los luchadores provisorios, así que el motor no cambia.
// Formato documentado en docs/FORMATO_SPRITES.md.

import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { REQUIRED_ANIMS, type FighterDef } from '../sim/types';
import type { FighterAsset } from './mannequin/fighters';

const okScale = (k: number | undefined) => k === undefined || (Number.isFinite(k) && k > 0 && k <= 8);

/** Revisa que la definición esté completa; devuelve la lista de problemas. */
export function validateFighter(def: FighterDef, textures: Record<string, Texture>): string[] {
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
    for (const t of p.frames) if (!textures[t]) problems.push(`proyectil "${id}": no existe la textura "${t}"`);
  }
  const specials = def.specials.filter((id) => def.moves[id]?.kind === 'special').map((id) => def.moves[id].name);
  const distinct = new Set(specials).size;
  if (distinct < 2 || distinct > 3) problems.push(`se esperan 2 o 3 especiales y hay ${distinct}`);
  if (!def.specials.some((id) => def.moves[id]?.kind === 'super')) problems.push('falta el súper');
  return problems;
}

/**
 * Carga la definición y uno o varios atlas (por ejemplo, una hoja de AutoSprite
 * por animación). El filtrado sale de `def.texFilter` (por defecto 'linear',
 * con mipmaps, para arte HD hecho con IA).
 */
export async function loadFighter(atlasJsonUrls: string | string[], defJsonUrl: string): Promise<FighterAsset> {
  const res = await fetch(defJsonUrl);
  if (!res.ok) throw new Error(`No se pudo cargar ${defJsonUrl}`);
  const def = (await res.json()) as FighterDef;
  const scaleMode = def.texFilter ?? 'linear';
  const urls = Array.isArray(atlasJsonUrls) ? atlasJsonUrls : [atlasJsonUrls];
  const sheets = await Promise.all(
    urls.map((src) =>
      Assets.load<Spritesheet>({ src, data: { textureOptions: { scaleMode, autoGenerateMipmaps: scaleMode === 'linear' } } }),
    ),
  );
  const textures: Record<string, Texture> = {};
  for (const sheet of sheets) Object.assign(textures, sheet.textures);
  const problems = validateFighter(def, textures);
  if (problems.length) console.warn(`Luchador "${def.id}":\n- ${problems.join('\n- ')}`);
  return { def, textures };
}

/**
 * Carga un luchador desde la carpeta que deja herramientas/armar_luchador.py:
 * `atlas.json` (lista de atlas) y `<id>.json` (definición).
 */
export async function loadFighterFolder(folder: string, id: string): Promise<FighterAsset> {
  const res = await fetch(`${folder}/atlas.json`);
  if (!res.ok) throw new Error(`No se pudo cargar ${folder}/atlas.json`);
  const atlas = (await res.json()) as string[];
  return loadFighter(atlas.map((a) => `${folder}/${a}`), `${folder}/${id}.json`);
}
