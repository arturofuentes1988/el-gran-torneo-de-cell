// Preferencias guardadas en el navegador (localStorage).

import { DIFFICULTIES, type DifficultyId } from '../sim/difficulty';

const KEY_DIFFICULTY = 'torneoDeCell.dificultad';

/** Dificultad elegida (NORMAL si no hay nada guardado o el navegador no deja guardar). */
export function loadDifficulty(): DifficultyId {
  try {
    const v = localStorage.getItem(KEY_DIFFICULTY);
    if (v && (DIFFICULTIES as readonly string[]).includes(v)) return v as DifficultyId;
  } catch {
    // Sin acceso a localStorage (modo privado, etc.): se usa el valor por defecto.
  }
  return 'normal';
}

export function saveDifficulty(d: DifficultyId): void {
  try {
    localStorage.setItem(KEY_DIFFICULTY, d);
  } catch {
    // Si no se puede guardar, solo dura esta sesión.
  }
}

const KEY_SOUND = 'torneoDeCell.sonido';

/** ¿El sonido quedó desactivado? (por defecto, activado). */
export function loadMuted(): boolean {
  try {
    return localStorage.getItem(KEY_SOUND) === 'no';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY_SOUND, muted ? 'no' : 'si');
  } catch {
    // Si no se puede guardar, solo dura esta sesión.
  }
}

const KEY_CONTROLS = 'torneoDeCell.controles';

/** Controles guardados (teclas y botones de joystick de cada jugador), sin validar; null si no hay. */
export function loadControls(): unknown {
  try {
    const v = localStorage.getItem(KEY_CONTROLS);
    return v ? (JSON.parse(v) as unknown) : null;
  } catch {
    return null;
  }
}

/** Guarda los controles; devuelve false si el navegador no dejó guardar. */
export function saveControls(c: unknown): boolean {
  try {
    localStorage.setItem(KEY_CONTROLS, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}
