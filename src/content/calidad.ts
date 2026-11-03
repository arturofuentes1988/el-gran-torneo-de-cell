// Calidad de los gráficos: HD (computadores) o liviana (celulares: mitad de resolución,
// pesa ~3 veces menos y usa 4 veces menos memoria de video). ?calidad=hd|liviano la fuerza;
// si no, la guardada en OPCIONES; si no, se elige según el aparato.

import { loadQuality, type QualityPref } from '../app/settings';

export type Calidad = 'hd' | 'liviano';

/** ¿Celular o tablet? (pantalla táctil chica o poca memoria). */
function aparatoLiviano(): boolean {
  const tactil = matchMedia('(pointer: coarse)').matches;
  const chica = Math.min(screen.width, screen.height) < 900;
  const memoria = (navigator as { deviceMemory?: number }).deviceMemory;
  return (tactil && chica) || (memoria !== undefined && memoria <= 4);
}

export function elegirCalidad(pref: QualityPref = loadQuality()): Calidad {
  const q = new URLSearchParams(location.search).get('calidad');
  if (q === 'hd' || q === 'liviano') return q;
  if (pref === 'hd' || pref === 'liviano') return pref;
  return aparatoLiviano() ? 'liviano' : 'hd';
}

let actual: Calidad | null = null;

/** La calidad de esta sesión (se elige una vez al abrir el juego; cambiarla en OPCIONES recarga la página). */
export function calidad(): Calidad {
  actual ??= elegirCalidad();
  return actual;
}
