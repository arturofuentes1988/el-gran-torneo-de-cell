// Constantes globales del juego.

/** Resolución interna de la capa de pixel art. */
export const VIEW_W = 480;
export const VIEW_H = 270;

/** Línea del suelo en pantalla (con la cámara en reposo). */
export const GROUND_SCREEN_Y = 248;

/** Ancho del escenario (2 pantallas). */
export const STAGE_W = 960;

/** Distancia mínima a los bordes del escenario y de la cámara. */
export const WALL_MARGIN = 22;

/** La simulación corre siempre a 60 cuadros por segundo. */
export const SIM_HZ = 60;
export const FRAME_MS = 1000 / SIM_HZ;

/** Barra de súper: 3 niveles de 100. */
export const METER_BAR = 100;
export const MAX_METER = 300;

export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
export const MAX_ROUNDS = 5;

/** Fuente pixel incluida localmente (@fontsource/press-start-2p). */
/** Fuente de todo el juego (moderna, con tildes y ñ; viene incluida en el build). */
export const GAME_FONT = 'Oswald';
