// Proyecto de Supabase del juego (cuentas y, más adelante, las salas en línea).
// La llave publicable es pública a propósito: va dentro del juego y solo deja hacer
// lo que permiten las reglas de seguridad (RLS) de cada tabla. Nunca poner aquí la
// llave secreta ni la contraseña de la base de datos: el repositorio es público.

export const SUPABASE_URL = 'https://hmyesbgnihxgaygmkuck.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_SDkVYO6TBQnkWoPv2tq18w_L1LiNx4v';

/**
 * Worker de Cloudflare que entrega las claves del servidor de respaldo (TURN) a los jugadores con
 * sesión (ver cloudflare/turn-torneo.js). Vacío: sin TURN, solo conexión directa (STUN).
 */
export const TURN_URL = '';
