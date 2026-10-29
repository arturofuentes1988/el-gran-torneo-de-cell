import type { SparkKind } from './types';

/**
 * Eventos que la simulación emite para el render y el audio.
 * La simulación no dibuja ni suena: solo avisa qué pasó y dónde (coordenadas de mundo).
 */
export type SimEvent =
  /** by: id del luchador que pegó (en 2 VS 2 puede ser la ayuda); total: daño acumulado del combo. */
  | {
      type: 'hit'; side: 0 | 1; x: number; y: number; dir: number; spark: SparkKind; damage: number; combo: number; by?: string; total?: number;
      /** Para los efectos: el dibujo del proyectil que pegó (ej. 'rayo') y si fue su último golpe, o el movimiento. */
      look?: string; last?: boolean; move?: string;
    }
  | { type: 'block'; side: 0 | 1; x: number; y: number; dir: number; spark: SparkKind }
  | { type: 'attack'; side: 0 | 1; heavy: boolean; special: boolean }
  | { type: 'jump'; side: 0 | 1; x: number; kind?: 'normal' | 'short' | 'super' }
  | { type: 'roll'; side: 0 | 1; x: number }
  /** on: true al activar el Modo Poder, false cuando se acaba. */
  | { type: 'powerMode'; side: 0 | 1; x: number; y: number; color: number; on: boolean }
  | { type: 'guardCancel'; side: 0 | 1; x: number; y: number }
  /** Un lanzador conectó: el rival sale volando hacia arriba. */
  | { type: 'launch'; side: 0 | 1; x: number; y: number }
  | { type: 'land'; side: 0 | 1; x: number; heavy: boolean }
  | { type: 'projectile'; side: 0 | 1; x: number; y: number; color: number }
  | { type: 'projectileEnd'; x: number; y: number; color: number; big: boolean }
  | { type: 'clash'; x: number; y: number }
  | {
      type: 'superFlash';
      side: 0 | 1;
      x: number;
      y: number;
      /** Nombre del súper y del luchador (para el cartel). */
      name: string;
      fighter: string;
      color: number;
      /** Duración de la cinemática en cuadros. */
      freeze: number;
      /** Sonido propio (clave de FighterDef.sounds) o null para el genérico. */
      sound: string | null;
      /** Textura del retrato (o del cuerpo, para la silueta provisoria). */
      portrait: string;
      silhouette: boolean;
      /** Id del luchador (en 2 VS 2 el lado no basta para saber quién es). */
      id?: string;
      /** Es un ultra (el cartel dice ULTRA). */
      ultra?: boolean;
      /** Pedazo de canción del súper (voz propia del luchador, "voz/…"), si tiene. */
      song?: string | null;
    }
  | { type: 'ko'; side: 0 | 1; x: number; y: number }
  | { type: 'grab'; side: 0 | 1 }
  | { type: 'throw'; side: 0 | 1; x: number; y: number }
  | { type: 'tech'; x: number; y: number }
  | { type: 'taunt'; side: 0 | 1; line: string }
  /**
   * Terminó un combo de 2 golpes o más. side: quien pegaba; by: su id; ender: terminó con un
   * REMATE; ultra: con un ultra; broken: lo rompió un COMBO BREAKER.
   */
  | { type: 'comboEnd'; side: 0 | 1; hits: number; damage: number; by?: string; ender?: boolean; ultra?: boolean; broken?: boolean }
  /** Combos Killer: empezó un DOBLE (strong: con botón fuerte). */
  | { type: 'doble'; side: 0 | 1; x: number; y: number; strong: boolean }
  /** Combos Killer: un especial canceló un DOBLE (ENLACE o REMATE). */
  | { type: 'kiLink'; side: 0 | 1; remate: boolean }
  /** Combos Killer: conectó un REMATE (bonus: daño extra). */
  | { type: 'remate'; side: 0 | 1; x: number; y: number; bonus: number }
  /** COMBO BREAKER acertado (side: quien lo rompió). */
  | { type: 'comboBreaker'; side: 0 | 1; x: number; y: number }
  /** COMBO BREAKER equivocado: BLOQUEO (side: quien se equivocó). */
  | { type: 'lockout'; side: 0 | 1; x: number; y: number }
  /** Ultra: el arranque conectó y empieza la secuencia. */
  | { type: 'ultraStart'; side: 0 | 1; x: number; y: number }
  /** Ultra: cada golpe de la secuencia (final: el último, que lanza). */
  | { type: 'ultraHit'; side: 0 | 1; x: number; y: number; final: boolean }
  /**
   * 2 VS 2: cambio de luchador, llamada de ayuda, entrada del compañero tras un
   * K.O. o súper en equipo. name: quien entra.
   */
  | { type: 'tag'; side: 0 | 1; kind: 'cambio' | 'ayuda' | 'entra' | 'superEquipo'; name: string; x: number }
  | { type: 'announce'; text: string; kind: 'round' | 'fight' | 'ko' | 'time' | 'perfect' | 'winner' | 'draw' | 'final' }
  /**
   * side/who: si vienen, se busca primero en los sonidos propios de ese luchador (who: id; si falta, el punto del lado).
   * wait: segundos que una voz del luchador puede esperar a que termine la anterior (las del ultra van en fila).
   */
  | { type: 'sfx'; name: string; side?: 0 | 1; who?: string; wait?: number };
