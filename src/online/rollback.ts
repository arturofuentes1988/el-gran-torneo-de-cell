/**
 * Pelea en línea con "rollback" (como GGPO). Cada computador simula la pelea completa:
 *
 * - El control propio se aplica `retraso` cuadros después de apretarlo (2 cuadros, ~33 ms,
 *   casi no se nota y le da tiempo de llegar al otro).
 * - Del rival se usa lo último que llegó; si todavía no llega, se adivina que sigue igual.
 * - Cuando llega y no era lo adivinado, se carga la foto de ese cuadro y se rehacen los
 *   cuadros siguientes con el control verdadero. En pantalla se ve un saltito, pero nadie
 *   espera al otro.
 * - Si el rival se atrasa más de `maxRetroceso` cuadros, se espera (no se adivina tanto).
 *
 * Esta clase no sabe de redes: arma y recibe paquetes, y la conexión los lleva y trae.
 * `herramientas/rollback_prueba.ts` la prueba con dos computadores simulados y una red mala.
 */

import type { FrameInput } from '../input/buffer';
import { cargar, guardar, huella, type Estado } from '../sim/estado';
import type { SimEvent } from '../sim/events';
import type { Match } from '../sim/match';

/** Control de un cuadro en un número: dirección (4 bits), botones apretados (10) y recién apretados (10). */
export const empacar = (i: FrameInput): number => (i.dir & 15) | ((i.held & 1023) << 4) | ((i.pressed & 1023) << 14);

export const desempacar = (n: number): FrameInput => ({ dir: n & 15 || 5, held: (n >>> 4) & 1023, pressed: (n >>> 14) & 1023 });

const NEUTRO = empacar({ dir: 5, held: 0, pressed: 0 });
/** Lo que se adivina del rival: sigue igual (misma dirección y botones), sin apretar nada nuevo. */
const adivinar = (ultimo: number): number => ultimo & ~(1023 << 14);

/** Cada cuántos cuadros se compara la huella de la pelea con la del otro (para notar si se separaron). */
const CADA_HUELLA = 30;
/** Un aviso rehecho que ya salió a esta distancia (en cuadros) no se repite. */
const VENTANA_AVISOS = 3;
/** Tope de controles por paquete (si hay más sin confirmar, la conexión anda muy mal). */
const MAX_POR_PAQUETE = 64;

/** Lo que un computador le manda al otro (varias veces por cuadro da igual: se repite hasta que lo confirman). */
export interface Paquete {
  /** Cuadro del primer control de `entradas`. */
  desde: number;
  entradas: number[];
  /** Último cuadro con todos los controles del otro recibidos (el otro deja de reenviarlos). */
  ack: number;
  /** Cuadro en que va quien lo manda (para emparejar la velocidad de los dos). */
  cuadro: number;
  /** Huellas de cuadros ya definitivos: [cuadro, huella]. */
  huellas: [number, number][];
}

export interface OpcionesRollback {
  /** Cuadros entre que se aprieta y se aplica el control propio. */
  retraso?: number;
  /** Cuadros máximos que se adivinan del rival antes de esperarlo. */
  maxRetroceso?: number;
}

export class SesionRollback {
  readonly retraso: number;
  readonly maxRetroceso: number;
  /** Cuadros simulados (el próximo a simular). */
  cuadro = 0;
  /** Último cuadro del rival hasta el que llegaron todos sus controles. */
  remotoContiguo = -1;
  /** Cuadro en que iba el rival según su último paquete. */
  cuadroRemoto = 0;
  /** Primer cuadro en que las huellas no coincidieron (null: van iguales). */
  desincronizado: number | null = null;

  /** Para revisar cómo anda: veces que se rehízo, cuadros rehechos, el retroceso más largo y cuadros esperando. */
  readonly stats = { rollbacks: 0, rehechos: 0, maxRetroceso: 0, esperas: 0 };

  private readonly otro: 0 | 1;
  /** Controles por cuadro de cada lado (los propios desde que se aprietan, los del rival al llegar). */
  private readonly entradas: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  /** Control del rival con que se simuló cada cuadro (el verdadero o el adivinado). */
  private readonly usadas = new Map<number, number>();
  /** Foto de la pelea ANTES de cada cuadro reciente. */
  private readonly fotos = new Map<number, Estado>();
  /** Avisos que ya salieron a la pantalla por cuadro (para no repetirlos al rehacer). */
  private readonly entregados = new Map<number, string[]>();
  private readonly misHuellas = new Map<number, number>();
  private readonly susHuellas = new Map<number, number>();
  private ultimaHuella = 0;
  private primeraDiferencia = Infinity;
  /** Próximo cuadro al que se le asigna un control propio. */
  private localSiguiente: number;
  /** Último cuadro propio que el otro confirmó tener. */
  private ackLocal = -1;

  constructor(
    readonly match: Match,
    readonly lado: 0 | 1,
    opts: OpcionesRollback = {},
  ) {
    this.retraso = Math.max(0, Math.round(opts.retraso ?? 2));
    this.maxRetroceso = Math.max(1, Math.round(opts.maxRetroceso ?? 8));
    this.otro = lado === 0 ? 1 : 0;
    // Los primeros cuadros (antes de que llegue el primer control) van sin apretar nada.
    for (let f = 0; f < this.retraso; f++) this.entradas[lado].set(f, NEUTRO);
    this.localSiguiente = this.retraso;
  }

  /** ¿Se puede simular un cuadro más sin adivinar demasiado? */
  get puedeAvanzar(): boolean {
    return this.cuadro - this.remotoContiguo <= this.maxRetroceso;
  }

  /**
   * Un cuadro del juego: toma el control propio y avanza la pelea (rehaciendo lo que haga
   * falta). Devuelve los avisos para la pantalla, o null si hay que esperar al rival (en ese
   * caso el control no se toma: se vuelve a pedir el próximo cuadro).
   */
  avanzar(propio: FrameInput): SimEvent[] | null {
    if (!this.puedeAvanzar) {
      this.stats.esperas++;
      return null;
    }
    this.entradas[this.lado].set(this.localSiguiente++, empacar(propio));
    const avisos = this.corregir();
    this.simular(this.cuadro, avisos, false);
    this.cuadro++;
    this.anotarHuellas();
    this.podar();
    return avisos;
  }

  /**
   * Rehace lo que haga falta con los controles que llegaron, sin avanzar. avanzar() lo hace
   * solo; sirve al terminar la pelea, para que el resultado salga de los controles verdaderos.
   */
  corregir(): SimEvent[] {
    const avisos: SimEvent[] = [];
    if (this.primeraDiferencia < this.cuadro) this.rehacer(this.primeraDiferencia, avisos);
    this.primeraDiferencia = Infinity;
    return avisos;
  }

  /** ¿Ya llegaron todos los controles del rival hasta el último cuadro simulado? */
  get alDia(): boolean {
    return this.remotoContiguo >= this.cuadro - 1;
  }

  /** Paquete para el otro: los controles propios que todavía no confirma, más el estado. */
  armarPaquete(): Paquete {
    const desde = Math.max(this.ackLocal + 1, this.localSiguiente - MAX_POR_PAQUETE);
    const entradas: number[] = [];
    for (let f = desde; f < this.localSiguiente; f++) entradas.push(this.entradas[this.lado].get(f) ?? NEUTRO);
    const huellas: [number, number][] = [];
    for (const [f, h] of this.misHuellas) if (f > this.ultimaHuella - CADA_HUELLA * 4) huellas.push([f, h]);
    return { desde, entradas, ack: this.remotoContiguo, cuadro: this.cuadro, huellas };
  }

  recibirPaquete(p: Paquete): void {
    const suyas = this.entradas[this.otro];
    for (let k = 0; k < p.entradas.length; k++) {
      const f = p.desde + k;
      if (f <= this.remotoContiguo || suyas.has(f)) continue;
      const bits = p.entradas[k];
      suyas.set(f, bits);
      // Ya se simuló ese cuadro con otro control: hay que rehacer desde ahí.
      if (f < this.cuadro && this.usadas.get(f) !== bits) this.primeraDiferencia = Math.min(this.primeraDiferencia, f);
    }
    while (suyas.has(this.remotoContiguo + 1)) this.remotoContiguo++;
    this.ackLocal = Math.max(this.ackLocal, p.ack);
    this.cuadroRemoto = Math.max(this.cuadroRemoto, p.cuadro);
    for (const [f, h] of p.huellas) {
      this.susHuellas.set(f, h);
      this.compararHuella(f);
    }
  }

  /** Cuadros que este computador va adelantado al otro (positivo: conviene frenar un poquito). */
  get ventaja(): number {
    return this.cuadro - this.cuadroRemoto;
  }

  // ---------------------------------------------------------------- interno

  private rehacer(desde: number, avisos: SimEvent[]): void {
    const foto = this.fotos.get(desde);
    if (!foto) throw new Error(`rollback: no está la foto del cuadro ${desde} (van ${this.cuadro})`);
    cargar(foto);
    this.match.events.length = 0;
    this.stats.rollbacks++;
    this.stats.rehechos += this.cuadro - desde;
    this.stats.maxRetroceso = Math.max(this.stats.maxRetroceso, this.cuadro - desde);
    for (let f = desde; f < this.cuadro; f++) this.simular(f, avisos, true);
  }

  private simular(f: number, avisos: SimEvent[], rehecho: boolean): void {
    this.fotos.set(f, guardar(this.match));
    const propio = this.entradas[this.lado].get(f) ?? NEUTRO;
    const suyo = this.entradas[this.otro].get(f) ?? adivinar(this.entradas[this.otro].get(this.remotoContiguo) ?? NEUTRO);
    this.usadas.set(f, suyo);
    const a = desempacar(propio);
    const b = desempacar(suyo);
    this.match.step(this.lado === 0 ? [a, b] : [b, a]);
    const ev = this.match.events;
    if (ev.length) {
      for (const e of ev) if (this.entregar(f, e, rehecho)) avisos.push(e);
      ev.length = 0;
    }
  }

  /** ¿Sale este aviso a la pantalla? Al rehacer, no si ya salió uno igual en un cuadro cercano. */
  private entregar(f: number, e: SimEvent, rehecho: boolean): boolean {
    const clave = claveAviso(e);
    if (rehecho) {
      for (let g = f - VENTANA_AVISOS; g <= f + VENTANA_AVISOS; g++) if (this.entregados.get(g)?.includes(clave)) return false;
    }
    const lista = this.entregados.get(f);
    if (lista) lista.push(clave);
    else this.entregados.set(f, [clave]);
    return true;
  }

  /** Huella cada CADA_HUELLA cuadros, solo de cuadros ya definitivos (con los controles verdaderos de los dos). */
  private anotarHuellas(): void {
    // Foto "antes del cuadro k" = después de k-1: definitiva si k-1 ya no se va a rehacer.
    const hasta = Math.min(this.remotoContiguo + 1, this.cuadro - 1);
    for (let k = this.ultimaHuella + CADA_HUELLA; k <= hasta; k += CADA_HUELLA) {
      const foto = this.fotos.get(k);
      if (!foto) break;
      this.misHuellas.set(k, huella(foto));
      this.ultimaHuella = k;
      this.compararHuella(k);
    }
  }

  private compararHuella(f: number): void {
    const a = this.misHuellas.get(f);
    const b = this.susHuellas.get(f);
    if (a === undefined || b === undefined || this.desincronizado !== null) return;
    if (a !== b) this.desincronizado = f;
  }

  /** Suelta lo que ya no se puede volver a necesitar. */
  private podar(): void {
    const limite = this.cuadro - this.maxRetroceso - 2;
    for (const f of this.fotos.keys()) if (f < limite) this.fotos.delete(f);
    for (const f of this.usadas.keys()) if (f < limite) this.usadas.delete(f);
    for (const f of this.entregados.keys()) if (f < limite - VENTANA_AVISOS) this.entregados.delete(f);
    const propias = this.entradas[this.lado];
    for (const f of propias.keys()) if (f < limite && f <= this.ackLocal) propias.delete(f);
    const suyas = this.entradas[this.otro];
    for (const f of suyas.keys()) if (f < limite && f < this.remotoContiguo) suyas.delete(f);
    const viejas = this.ultimaHuella - CADA_HUELLA * 10;
    for (const f of this.misHuellas.keys()) if (f < viejas) this.misHuellas.delete(f);
    for (const f of this.susHuellas.keys()) if (f < viejas) this.susHuellas.delete(f);
  }
}

/** Qué aviso es, sin la posición (al rehacer, la chispa puede caer unos píxeles más allá). */
function claveAviso(e: SimEvent): string {
  const r = e as unknown as Record<string, unknown>;
  return `${e.type}|${r.side ?? ''}|${r.name ?? r.text ?? r.move ?? r.kind ?? ''}`;
}
