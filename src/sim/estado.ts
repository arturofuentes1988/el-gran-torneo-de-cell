/**
 * Guardar y cargar el estado completo de una pelea (para el juego en línea con "rollback":
 * cuando llega tarde el control del rival, se vuelve a un cuadro guardado y se rehace).
 *
 * Recorre todos los objetos que cambian durante la pelea (la pelea, los luchadores, sus
 * controles, los proyectiles, los equipos, el generador al azar...) y copia sus campos. Al
 * cargar, los escribe de vuelta EN LOS MISMOS OBJETOS: así la pantalla, que tiene un dibujo
 * por luchador, sigue funcionando. Las definiciones (luchadores, movimientos, animaciones)
 * no cambian durante la pelea: se guardan solo como referencia, sin copiarlas.
 *
 * Un objeto que existía al guardar y después se descartó (un proyectil que ya chocó) queda
 * vivo dentro del guardado y vuelve tal cual al cargar.
 */

/** Campos que apuntan a definiciones fijas: se guarda la referencia, sin recorrerlas. */
const FIJOS: ReadonlySet<string> = new Set(['def', 'anim', 'move', 'lastHurt', 'guardCancelMove', 'u', 'props']);
/** Campos que no son estado de la pelea: los avisos para la pantalla (sonidos, chispas...). */
const OMITIR: ReadonlySet<string> = new Set(['events']);

type Plano = Record<string, unknown>;
type TipoGuardado = 0 | 1 | 2 | 3 | 4;
const T_OBJETO = 0;
const T_LISTA = 1;
const T_NUMEROS = 2;
const T_MAPA = 3;
const T_CONJUNTO = 4;

type Numeros = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;

/** Foto del estado de una pelea. Se puede cargar varias veces. */
export interface Estado {
  /** Los objetos que cambian (el primero es la pelea). */
  readonly objs: object[];
  readonly tipos: TipoGuardado[];
  /** Por objeto: [claves, valores] (objeto), la copia (lista o números) o las entradas (mapa o conjunto). */
  readonly datos: unknown[];
}

const esObjeto = (v: unknown): v is object => typeof v === 'object' && v !== null;

/** Foto de todo lo que cambia en la pelea `raiz` (una Match). */
export function guardar(raiz: object): Estado {
  const vistos = new Set<object>();
  const objs: object[] = [];
  const tipos: TipoGuardado[] = [];
  const datos: unknown[] = [];
  const pendientes: object[] = [raiz];
  vistos.add(raiz);
  const visitar = (v: unknown): void => {
    if (esObjeto(v) && !vistos.has(v)) {
      vistos.add(v);
      pendientes.push(v);
    }
  };
  // En anchura y en el orden de los campos: dos pelas iguales dan la misma lista (sirve para la huella).
  for (let i = 0; i < pendientes.length; i++) {
    const o = pendientes[i];
    objs.push(o);
    if (ArrayBuffer.isView(o)) {
      tipos.push(T_NUMEROS);
      datos.push((o as Numeros).slice());
    } else if (Array.isArray(o)) {
      tipos.push(T_LISTA);
      const copia = o.slice();
      datos.push(copia);
      for (const v of copia) visitar(v);
    } else if (o instanceof Map) {
      tipos.push(T_MAPA);
      const e = [...o.entries()];
      datos.push(e);
      for (const [k, v] of e) {
        visitar(k);
        visitar(v);
      }
    } else if (o instanceof Set) {
      tipos.push(T_CONJUNTO);
      const e = [...o];
      datos.push(e);
      for (const v of e) visitar(v);
    } else {
      tipos.push(T_OBJETO);
      const p = o as Plano;
      const claves = Object.keys(p).filter((k) => !OMITIR.has(k));
      const valores = claves.map((k) => p[k]);
      datos.push([claves, valores]);
      for (let k = 0; k < claves.length; k++) if (!FIJOS.has(claves[k])) visitar(valores[k]);
    }
  }
  return { objs, tipos, datos };
}

/** Deja la pelea exactamente como estaba en la foto. */
export function cargar(e: Estado): void {
  for (let i = 0; i < e.objs.length; i++) {
    const o = e.objs[i];
    const d = e.datos[i];
    switch (e.tipos[i]) {
      case T_NUMEROS:
        (o as Numeros).set(d as Numeros);
        break;
      case T_LISTA: {
        const a = o as unknown[];
        const c = d as unknown[];
        a.length = c.length;
        for (let k = 0; k < c.length; k++) a[k] = c[k];
        break;
      }
      case T_MAPA: {
        const m = o as Map<unknown, unknown>;
        m.clear();
        for (const [k, v] of d as [unknown, unknown][]) m.set(k, v);
        break;
      }
      case T_CONJUNTO: {
        const s = o as Set<unknown>;
        s.clear();
        for (const v of d as unknown[]) s.add(v);
        break;
      }
      default: {
        const p = o as Plano;
        const [claves, valores] = d as [string[], unknown[]];
        for (let k = 0; k < claves.length; k++) p[claves[k]] = valores[k];
        // Un campo que apareció después de la foto se borra (los de las clases nunca cambian).
        const actuales = Object.keys(p);
        if (actuales.length > claves.length) {
          const quedan = new Set(claves);
          for (const k of actuales) if (!quedan.has(k) && !OMITIR.has(k)) delete p[k];
        }
      }
    }
  }
}

// ---------------------------------------------------------------- huella

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/**
 * Número de 32 bits que resume la foto. Dos computadores con la misma pelea dan la misma
 * huella; si difieren, las pelas se separaron (desincronización). Las referencias a otros
 * objetos de la pelea cuentan por su posición en la foto; las definiciones fijas no cuentan
 * (lo que importa de ellas ya está en otros campos, como el nombre de la animación).
 */
export function huella(e: Estado): number {
  let h = 0x811c9dc5;
  const mezclar = (n: number): void => {
    h = Math.imul(h ^ (n >>> 0), 0x01000193);
  };
  const indice = new Map<object, number>();
  e.objs.forEach((o, i) => indice.set(o, i));
  const valor = (v: unknown, fijo: boolean): void => {
    switch (typeof v) {
      case 'number':
        if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff && !Object.is(v, -0)) {
          mezclar(1);
          mezclar(v);
        } else {
          f64[0] = v;
          mezclar(2);
          mezclar(u32[0]);
          mezclar(u32[1]);
        }
        return;
      case 'string':
        mezclar(3);
        mezclar(v.length);
        for (let i = 0; i < v.length; i++) mezclar(v.charCodeAt(i));
        return;
      case 'boolean':
        mezclar(v ? 5 : 4);
        return;
      case 'undefined':
        mezclar(6);
        return;
      default:
        if (v === null) mezclar(7);
        else if (fijo) mezclar(8);
        else {
          mezclar(9);
          mezclar(indice.get(v as object) ?? -1);
        }
    }
  };
  for (let i = 0; i < e.objs.length; i++) {
    const d = e.datos[i];
    mezclar(100 + e.tipos[i]);
    switch (e.tipos[i]) {
      case T_NUMEROS: {
        const n = d as Numeros;
        mezclar(n.length);
        for (let k = 0; k < n.length; k++) valor(n[k], false);
        break;
      }
      case T_LISTA:
      case T_CONJUNTO: {
        const a = d as unknown[];
        mezclar(a.length);
        for (const v of a) valor(v, false);
        break;
      }
      case T_MAPA: {
        const a = d as [unknown, unknown][];
        mezclar(a.length);
        for (const [k, v] of a) {
          valor(k, false);
          valor(v, false);
        }
        break;
      }
      default: {
        const [claves, valores] = d as [string[], unknown[]];
        mezclar(claves.length);
        for (let k = 0; k < claves.length; k++) {
          valor(claves[k], false);
          valor(valores[k], FIJOS.has(claves[k]));
        }
      }
    }
  }
  return h >>> 0;
}
