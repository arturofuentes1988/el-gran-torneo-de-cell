// Ahorro en caliente: si el aparato no alcanza a dibujar la pelea a buen ritmo, el juego se
// aliviana solo (sin recargar ni tocar OPCIONES). Solo con GRÁFICOS en AUTOMÁTICO: si el jugador
// eligió un nivel, se respeta. No vuelve a subir en la misma sesión (para no andar saltando).
//  1: el mundo se dibuja a escala 2 como máximo y el brillo es más simple y a menor resolución.
//  2: además, densidad de pantalla 1,5 como máximo y escenarios sin video (su imagen fija).
//  3: además, densidad de pantalla 1.
// ?ahorro=1|2|3 lo fuerza (pruebas).

import { loadQuality } from './settings';

export const AHORRO_MAX = 3;

/** Nivel de ahorro de esta sesión (0 = nada). Lo leen la pantalla, los efectos y los escenarios. */
export const rendimiento = { ahorro: 0 };

/** Cada cuánto se revisa el ritmo (ms). */
const VENTANA_MS = 2000;
/** Bajo estos cuadros por segundo, la ventana cuenta como lenta. */
const FPS_MINIMO = 45;
/** Ventanas lentas seguidas para alivianar. */
const VENTANAS = 2;
/** Un cuadro más largo que esto es un corte, no lentitud (ms). */
const CORTE_MS = 400;
/** Después de alivianar, se espera esto antes de volver a medir (ms). */
const DESCANSO_MS = 2500;

export class Vigia {
  private activo: boolean;
  private desde = 0;
  private cuadros = 0;
  private ultimo = 0;
  private lentas = 0;
  private espera = 0;

  constructor(private alCambiar: (ahorro: number) => void) {
    const p = new URLSearchParams(location.search);
    const forzado = Number(p.get('ahorro'));
    if (forzado > 0) rendimiento.ahorro = Math.min(AHORRO_MAX, Math.floor(forzado));
    this.activo = loadQuality() === 'auto' && !p.has('calidad') && !p.has('ahorro');
  }

  /** Una vez por cuadro dibujado. `midiendo`: hay una pelea andando (no pausa, ni menús, ni cargas). */
  cuadro(ahora: number, midiendo: boolean): void {
    if (!this.activo || rendimiento.ahorro >= AHORRO_MAX) return;
    const dt = ahora - this.ultimo;
    this.ultimo = ahora;
    // Fuera de la pelea (menús, pausa, pestaña escondida) no se mide y se parte de nuevo.
    if (!midiendo || document.hidden) {
      this.cuadros = 0;
      this.lentas = 0;
      return;
    }
    // Un cuadro muy largo (una descarga, volver de otra pestaña) no cuenta, pero no borra lo medido:
    // en un aparato muy lento son frecuentes y, si lo borraran, nunca se alivianaría.
    if (dt > CORTE_MS) {
      this.cuadros = 0;
      return;
    }
    if (ahora < this.espera) return;
    if (!this.cuadros) this.desde = ahora - dt;
    this.cuadros++;
    const paso = ahora - this.desde;
    if (paso < VENTANA_MS) return;
    const fps = (this.cuadros * 1000) / paso;
    this.cuadros = 0;
    this.lentas = fps < FPS_MINIMO ? this.lentas + 1 : 0;
    if (this.lentas < VENTANAS) return;
    this.lentas = 0;
    this.espera = ahora + DESCANSO_MS;
    rendimiento.ahorro++;
    this.alCambiar(rendimiento.ahorro);
  }
}
