// Liga en línea: al terminar cada pelea en línea, cada jugador manda su resultado a Supabase
// (función reportar_pelea, ver supabase/migraciones/004_liga_en_linea.sql). Cuando llegan los dos y
// coinciden, se suman los puntos (tipo ELO) a los dos; si no coinciden, no cuenta.

import { reportarError } from '../app/errores';
import { obtenerCliente } from './cuenta';

export type Resultado = 'gane' | 'perdi' | 'empate';

/** En qué quedó la pelea ('esperando' al otro, 'contada'...) y los puntos que se ganaron o perdieron. */
export interface Reporte {
  estado: string;
  cambio: number | null;
}

/** Manda el resultado de una pelea en línea. `clave`: código de la sala y semilla (la misma en los dos). */
export async function reportarPelea(clave: string, soyAnfitrion: boolean, resultado: Resultado): Promise<Reporte | null> {
  try {
    const c = await obtenerCliente();
    // Sin sesión (pruebas con ?apodo=) no hay a quién sumarle.
    if (!(await c.auth.getSession()).data.session) return null;
    const { data, error } = await c.rpc('reportar_pelea', { clave_pelea: clave, soy_anfitrion: soyAnfitrion, mi_resultado: resultado });
    if (error) {
      // Mientras no se pegue la migración 004 la función no existe: nada que anotar.
      if (error.code === 'PGRST202') return null;
      throw new Error(`${error.code ?? ''} ${error.message}`.trim());
    }
    const fila = (Array.isArray(data) ? data[0] : data) as Reporte | undefined;
    return fila ?? null;
  } catch (err) {
    reportarError(err, 'liga');
    return null;
  }
}
