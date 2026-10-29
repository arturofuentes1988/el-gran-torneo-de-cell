// Nombres de los combos según la cantidad de golpes (estilo Killer Instinct).
// Se muestran en grande cuando termina un combo de 3 golpes o más. Para
// cambiar un nombre basta con editar esta tabla.
//
// Voces: suena la frase propia de quien hizo el combo según su tramo
// (`<id>/voz/combo-corto`, etc., ver docs/FORMATO_SPRITES.md); si ese
// luchador no la tiene, la del anunciador (`voz/combo3`…), si existe.

export interface ComboName {
  /** Golpes desde los que vale el nombre. */
  min: number;
  name: string;
  /** Muestra del anunciador (respaldo si el luchador no tiene frase propia). */
  voice: string;
  /** Frase propia del luchador para este tramo (clave de sus voces). */
  line: ComboLine;
}

/** Tramos de las frases propias de cada luchador. */
export type ComboLine = 'voz/combo-corto' | 'voz/combo-medio' | 'voz/combo-largo' | 'voz/combo-viral';

export const COMBO_NAMES: readonly ComboName[] = [
  { min: 3, name: '¡COMBO WENO!', voice: 'voz/combo3', line: 'voz/combo-corto' },
  { min: 4, name: '¡COMBO BACÁN!', voice: 'voz/combo4', line: 'voz/combo-corto' },
  { min: 5, name: '¡COMBO PULENTO!', voice: 'voz/combo5', line: 'voz/combo-medio' },
  { min: 6, name: '¡COMBO FILETE!', voice: 'voz/combo6', line: 'voz/combo-medio' },
  { min: 7, name: '¡COMBO BRÍGIDO!', voice: 'voz/combo7', line: 'voz/combo-medio' },
  { min: 8, name: '¡COMBO CUÁTICO!', voice: 'voz/combo8', line: 'voz/combo-largo' },
  { min: 9, name: '¡COMBO LA RAJA!', voice: 'voz/combo9', line: 'voz/combo-largo' },
  { min: 10, name: '¡COMBO BESTIAL!', voice: 'voz/combo10', line: 'voz/combo-largo' },
  { min: 11, name: '¡COMBO TERRIBLE!', voice: 'voz/combo11', line: 'voz/combo-largo' },
  { min: 12, name: '¡COMBO VIRAL!', voice: 'voz/combo12', line: 'voz/combo-viral' },
];

/** Combo que terminó con un ultra. */
export const ULTRA_COMBO = { name: '¡ULTRA COMBO!', voice: 'voz/ultraCombo', line: 'voz/combo-ultra' } as const;
/** Combo roto por un COMBO BREAKER. */
export const COMBO_BREAKER = { name: '¡COMBO BREAKER!', voice: 'voz/comboBreaker' } as const;

/** Nombre del combo para esa cantidad de golpes (null con menos de 3). */
export function comboNameFor(hits: number): ComboName | null {
  let out: ComboName | null = null;
  for (const c of COMBO_NAMES) if (hits >= c.min) out = c;
  return out;
}
