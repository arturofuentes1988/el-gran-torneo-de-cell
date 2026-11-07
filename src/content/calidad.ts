// Calidad de los gráficos (OPCIONES > GRÁFICOS): BAJA, MEDIA, ALTA o ULTRA.
//  - BAJA: arte liviano, dibujo a 2x como máximo, pantalla a densidad 1, la mitad de las
//    partículas, brillo más simple y escenarios sin video (su imagen fija). Celulares débiles.
//  - MEDIA: arte liviano (mitad de resolución, ~3 veces menos peso y 4 veces menos memoria de
//    video), dibujo hasta 3x. Lo normal en celulares y tablets.
//  - ALTA: arte HD, dibujo hasta 3x.
//  - ULTRA: arte HD, dibujo hasta 4x (1920x1080) y densidad de pantalla hasta 3. Computadores.
// ?calidad=baja|media|alta|ultra la fuerza (hd y liviano sirven como alias de alta y media);
// si no, la guardada en OPCIONES; si no, se elige según el aparato.

import { loadQuality, type QualityPref } from '../app/settings';

/** Juego de arte que se baja: HD o liviano (mitad de resolución). */
export type Calidad = 'hd' | 'liviano';
/** Nivel de gráficos elegido en OPCIONES. */
export type Nivel = 'baja' | 'media' | 'alta' | 'ultra';

export const NIVELES: readonly Nivel[] = ['baja', 'media', 'alta', 'ultra'];

export const NOMBRE_NIVEL: Record<Nivel, string> = { baja: 'BAJA', media: 'MEDIA', alta: 'ALTA', ultra: 'ULTRA' };

/** Cómo dibuja cada nivel: arte, escala máxima del mundo (S), tope de densidad de pantalla y efectos. */
const DIBUJO: Record<Nivel, { arte: Calidad; maxS: number; dpr: number; particulas: number; bloom: number; video: boolean }> = {
  baja: { arte: 'liviano', maxS: 2, dpr: 1, particulas: 0.5, bloom: 2, video: false },
  media: { arte: 'liviano', maxS: 3, dpr: 2, particulas: 1, bloom: 5, video: true },
  alta: { arte: 'hd', maxS: 3, dpr: 2, particulas: 1, bloom: 5, video: true },
  ultra: { arte: 'hd', maxS: 4, dpr: 3, particulas: 1, bloom: 5, video: true },
};

/** Nombres viejos (antes había solo HD y liviano) y los de la URL. */
function aNivel(v: string | null | undefined): Nivel | null {
  if (v === 'hd') return 'alta';
  if (v === 'liviano') return 'media';
  return (NIVELES as readonly string[]).includes(v ?? '') ? (v as Nivel) : null;
}

/** ¿Celular o tablet? (pantalla táctil chica o poca memoria). */
function aparatoLiviano(): boolean {
  const tactil = matchMedia('(pointer: coarse)').matches;
  const chica = Math.min(screen.width, screen.height) < 900;
  const memoria = (navigator as { deviceMemory?: number }).deviceMemory;
  return (tactil && chica) || (memoria !== undefined && memoria <= 4);
}

/** Sin nada guardado: MEDIA en celulares; en computadores, ULTRA con pantalla grande (1080p o más) y ALTA si no. */
function nivelAutomatico(): Nivel {
  if (aparatoLiviano()) return 'media';
  const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
  return px >= 1800 ? 'ultra' : 'alta';
}

/** Nivel que corresponde a una preferencia (la URL manda sobre lo guardado, salvo con conUrl = false). */
export function elegirNivel(pref: QualityPref = loadQuality(), conUrl = true): Nivel {
  const q = conUrl ? aNivel(new URLSearchParams(location.search).get('calidad')) : null;
  if (q) return q;
  return pref === 'auto' ? nivelAutomatico() : pref;
}

let actual: Nivel | null = null;

/** El nivel de esta sesión (se elige una vez al abrir el juego; cambiarlo en OPCIONES recarga la página). */
export function nivel(): Nivel {
  actual ??= elegirNivel();
  return actual;
}

/** El juego de arte de esta sesión (HD o liviano): lo usan los cargadores de luchadores, escenarios y efectos. */
export function calidad(): Calidad {
  return DIBUJO[nivel()].arte;
}

/** Cómo dibuja esta sesión: escala máxima del mundo, tope de densidad, partículas, brillo y videos de fondo. */
export function dibujo(): (typeof DIBUJO)[Nivel] {
  return DIBUJO[nivel()];
}
