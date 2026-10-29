// Niveles de dificultad de la CPU (nombres y orden del menú). La tabla de
// parámetros de cada nivel está en ai.ts.

export type DifficultyId = 'facil' | 'normal' | 'dificil' | 'muyDificil';

export const DIFFICULTIES: readonly DifficultyId[] = ['facil', 'normal', 'dificil', 'muyDificil'];

export const DIFFICULTY_NAME: Record<DifficultyId, string> = {
  facil: 'FÁCIL',
  normal: 'NORMAL',
  dificil: 'DIFÍCIL',
  muyDificil: 'MUY DIFÍCIL',
};
