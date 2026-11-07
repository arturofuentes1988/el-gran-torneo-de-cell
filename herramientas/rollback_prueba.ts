// Prueba del juego en línea con rollback, sin navegador ni red de verdad.
//
//   npx tsx herramientas/rollback_prueba.ts [peleas=6]
//
// 1. Pelea de referencia: la CPU contra la CPU, sin red. Se anotan los controles y la huella
//    del estado en cada cuadro.
// 2. Guardar y cargar: en cuadros al azar se guarda, se avanza, se carga y se rehace; las
//    huellas tienen que salir iguales.
// 3. Dos computadores simulados juegan esa misma pelea (con esos controles) a través de una
//    red mala: atraso, saltos, paquetes perdidos y desordenados. Cada uno adivina y rehace.
//    Al final, cada cuadro definitivo de los dos tiene que ser idéntico a la referencia.
// 4. Cuánto tarda guardar, cargar y rehacer (un cuadro dura 16,7 ms).

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { NEUTRAL_INPUT, type FrameInput } from '../src/input/buffer';
import { SesionRollback, type Paquete } from '../src/online/rollback';
import { CpuController } from '../src/sim/ai';
import { cargar, guardar, huella } from '../src/sim/estado';
import { Match } from '../src/sim/match';
import type { FighterDef } from '../src/sim/types';

const PELEAS = Number(process.argv[2] ?? 6);
const IDS = ['rene', 'pablito', 'flaitiano', 'lena', 'carlitos', 'micky', 'maki', 'samurai'];
const defs = new Map(IDS.map((id) => [id, JSON.parse(readFileSync(`public/luchadores/${id}/${id}.json`, 'utf8')) as FighterDef]));
const MAX_FRAMES = 60 * 60 * 8;

/** Generador al azar propio de la prueba (para que se pueda repetir). */
function azar(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Huella independiente de estado.ts: recorre TODO el objeto de la pelea (no usa la lista de
 * campos fijos ni la foto), menos la definición del luchador y los avisos. Las partes de
 * definiciones a las que apunta (animación, movimiento...) cuentan por su contenido. Así, si
 * a guardar() se le escapa algo, esta huella lo nota aunque no cambie el resultado de la pelea.
 */
const contenido = new WeakMap<object, number>();
function huellaProfunda(raiz: object): number {
  let h = 0x811c9dc5;
  const mezclar = (n: number) => {
    h = Math.imul(h ^ (n >>> 0), 0x01000193);
  };
  const vistos = new Map<object, number>();
  const texto = (s: string) => {
    mezclar(s.length);
    for (let i = 0; i < s.length; i++) mezclar(s.charCodeAt(i));
  };
  const valor = (v: unknown): void => {
    if (typeof v === 'number') {
      const b = new Float64Array([v]);
      const u = new Uint32Array(b.buffer);
      mezclar(u[0]);
      mezclar(u[1]);
    } else if (typeof v === 'string') texto(v);
    else if (typeof v === 'boolean') mezclar(v ? 11 : 10);
    else if (v === undefined) mezclar(12);
    else if (v === null) mezclar(13);
    else if (typeof v === 'object') objeto(v);
  };
  const objeto = (o: object): void => {
    const visto = vistos.get(o);
    if (visto !== undefined) {
      mezclar(14);
      mezclar(visto);
      return;
    }
    vistos.set(o, vistos.size);
    if (ArrayBuffer.isView(o)) {
      for (const x of o as Uint8Array) valor(x);
    } else if (Array.isArray(o)) {
      mezclar(o.length);
      for (const x of o) valor(x);
    } else if (o instanceof Map) {
      for (const [k, x] of o) {
        valor(k);
        valor(x);
      }
    } else if (o instanceof Set) {
      for (const x of o) valor(x);
    } else {
      for (const k of Object.keys(o)) {
        if (k === 'def' || k === 'events') continue;
        texto(k);
        const x = (o as Record<string, unknown>)[k];
        if (['anim', 'move', 'lastHurt', 'guardCancelMove', 'u', 'props'].includes(k) && typeof x === 'object' && x !== null) {
          // Definición: por su contenido (se calcula una vez).
          let c = contenido.get(x);
          if (c === undefined) {
            c = 0;
            const j = JSON.stringify(x);
            for (let i = 0; i < j.length; i++) c = Math.imul(c ^ j.charCodeAt(i), 0x01000193);
            contenido.set(x, c);
          }
          mezclar(c);
        } else valor(x);
      }
    }
  };
  objeto(raiz);
  return h >>> 0;
}

interface Pelea {
  nombre: string;
  crear: () => Match;
}

interface Referencia {
  entradas: [FrameInput, FrameInput][];
  /** Huella del estado ANTES de cada cuadro (y una más al final). */
  huellas: number[];
  /** Lo mismo con la huella independiente. */
  profundas: number[];
  avisos: number;
  /** Tiempo medio de simular un cuadro (ms), sin contar las huellas. */
  msCuadro: number;
}

function referencia(p: Pelea, seed: number): Referencia {
  const m = p.crear();
  const cpus = [new CpuController(0, seed * 7 + 1, 'dificil'), new CpuController(1, seed * 13 + 5, 'muyDificil')];
  const entradas: [FrameInput, FrameInput][] = [];
  const huellas: number[] = [];
  const profundas: number[] = [];
  let avisos = 0;
  let ms = 0;
  while (!m.over && m.frame < MAX_FRAMES) {
    huellas.push(huella(guardar(m)));
    profundas.push(huellaProfunda(m));
    // Los primeros cuadros, sin controles (como en línea, mientras llega el primero).
    const ins: [FrameInput, FrameInput] = entradas.length < 10 ? [NEUTRAL_INPUT, NEUTRAL_INPUT] : [cpus[0].update(m), cpus[1].update(m)];
    entradas.push(ins);
    const t0 = performance.now();
    m.step(ins);
    ms += performance.now() - t0;
    avisos += m.events.length;
    m.events.length = 0;
  }
  huellas.push(huella(guardar(m)));
  profundas.push(huellaProfunda(m));
  return { entradas, huellas, profundas, avisos, msCuadro: ms / entradas.length };
}

/** Controles al azar con todos los botones (burla, cambio, ayuda, rodada, Modo Poder...). */
function controlAlAzar(r: () => number): FrameInput {
  const bits = () => {
    let b = 0;
    for (let k = 0; k < 10; k++) if (r() < 0.08) b |= 1 << k;
    return b & ~16;
  };
  const held = bits();
  return { dir: 1 + Math.floor(r() * 9), held, pressed: held & bits() };
}

/** Guardar en un cuadro, avanzar, cargar y rehacer: todo tiene que salir igual. */
function guardarYCargar(p: Pelea, ref: Referencia, seed: number): string | null {
  const m = p.crear();
  const r = azar(seed);
  const n = ref.entradas.length;
  for (let f = 0; f < n; ) {
    const largo = 1 + Math.floor(r() * 20);
    const foto = guardar(m);
    const hasta = Math.min(n, f + largo);
    // Primero un desvío con otros controles (como un rival mal adivinado; a veces los dos)...
    const ambos = r() < 0.3;
    for (let g = f; g < hasta; g++) m.step([ambos ? controlAlAzar(r) : ref.entradas[g][0], controlAlAzar(r)]);
    m.events.length = 0;
    // ...y después se vuelve y se juega lo verdadero.
    cargar(foto);
    for (let g = f; g < hasta; g++) {
      if (huella(guardar(m)) !== ref.huellas[g]) return `cuadro ${g}: distinto de la referencia después de cargar`;
      if (huellaProfunda(m) !== ref.profundas[g]) return `cuadro ${g}: la huella independiente no coincide (a guardar() se le escapa algo)`;
      m.step(ref.entradas[g]);
    }
    m.events.length = 0;
    f = hasta;
  }
  if (huellaProfunda(m) !== ref.profundas[n]) return 'el final no coincide (huella independiente)';
  return huella(guardar(m)) === ref.huellas[n] ? null : 'el final no coincide';
}

interface Red {
  atraso: number;
  salto: number;
  perdida: number;
}

interface Resultado {
  error: string | null;
  stats: SesionRollback['stats'][];
  avisos: number[];
  peorMs: number;
  ticks: number;
  vivas: number[];
}

/** Dos computadores jugando la pelea de referencia por una red simulada (tiempo en cuadros). */
function enLinea(p: Pelea, ref: Referencia, red: Red, seed: number): Resultado {
  const r = azar(seed);
  const n = ref.entradas.length;
  const sesiones = [new SesionRollback(p.crear(), 0), new SesionRollback(p.crear(), 1)];
  const retraso = sesiones[0].retraso;
  // Paquetes en camino: [llega en el tick, para quién, paquete].
  let enCamino: [number, number, Paquete][] = [];
  const avisos = [0, 0];
  let peorMs = 0;
  let tick = 0;
  // Cuadro definitivo ya revisado de cada uno.
  const revisado = [0, 0];
  // Veces que se comparó la pelea entera en pantalla.
  const vivas = [0, 0];
  const verificar = (i: number): string | null => {
    const s = sesiones[i];
    // Foto antes del cuadro k definitiva: k-1 <= remotoContiguo y k <= cuadro-1 (la tiene la sesión).
    const hasta = Math.min(s.remotoContiguo + 1, s.cuadro - 1, n);
    const fotos = (s as unknown as { fotos: Map<number, ReturnType<typeof guardar>> }).fotos;
    for (let k = revisado[i] + 1; k <= hasta; k++) {
      const foto = fotos.get(k);
      if (!foto) continue;
      if (huella(foto) !== ref.huellas[k]) return `computador ${i + 1}, cuadro ${k}: distinto de la referencia`;
      revisado[i] = k;
    }
    return null;
  };
  // Cada computador avanza a su ritmo; a veces uno se atrasa un poco (como un celular más lento).
  while ((sesiones[0].cuadro < n || sesiones[1].cuadro < n) && tick < n * 4 + 600) {
    tick++;
    for (const i of [0, 1]) {
      // Llegan los paquetes de este tick.
      const quedan: [number, number, Paquete][] = [];
      for (const q of enCamino) {
        if (q[1] === i && q[0] <= tick) sesiones[i].recibirPaquete(q[2]);
        else quedan.push(q);
      }
      enCamino = quedan;
      const s = sesiones[i];
      if (s.cuadro >= n) continue;
      if (r() < 0.03) continue; // se pierde un cuadro de pantalla
      const t0 = performance.now();
      // El control propio que se aprieta ahora se aplica `retraso` cuadros después.
      const f = s.cuadro + retraso;
      const propio = f < n ? ref.entradas[f][i] : NEUTRAL_INPUT;
      const ev = s.avanzar(propio);
      peorMs = Math.max(peorMs, performance.now() - t0);
      if (ev) avisos[i] += ev.length;
      // Manda su paquete (si no se pierde), con atraso y salto al azar.
      if (r() >= red.perdida) {
        const llega = tick + red.atraso + Math.floor(r() * (red.salto + 1));
        enCamino.push([llega, 1 - i, s.armarPaquete()]);
      }
      let e = verificar(i);
      // Si ya tiene todos los controles del otro, la pelea en pantalla es la definitiva: se compara entera.
      if (!e && ev && s.alDia) {
        vivas[i]++;
        if (huellaProfunda(s.match) !== ref.profundas[s.cuadro]) e = `computador ${i + 1}, cuadro ${s.cuadro}: la huella independiente no coincide`;
      }
      if (e) return { error: e, stats: sesiones.map((x) => x.stats), avisos, peorMs, ticks: tick, vivas };
      if (s.desincronizado !== null) return { error: `computador ${i + 1}: las huellas se separaron en el cuadro ${s.desincronizado}`, stats: sesiones.map((x) => x.stats), avisos, peorMs, ticks: tick, vivas };
    }
  }
  // Al final se entregan todos los paquetes que falten y se revisa todo.
  for (let k = 0; k < 40; k++) {
    for (const i of [0, 1]) sesiones[i].recibirPaquete(sesiones[1 - i].armarPaquete());
  }
  let error: string | null = null;
  for (const i of [0, 1]) {
    const s = sesiones[i];
    if (s.cuadro < n) error ??= `computador ${i + 1} no terminó (va en ${s.cuadro} de ${n})`;
    error ??= verificar(i);
    // La pelea al final, con todos los controles verdaderos: la de referencia (mismo ganador en los dos).
    s.corregir();
    if (!s.alDia) error ??= `computador ${i + 1}: faltan controles del otro al final`;
    else if (huella(guardar(s.match)) !== ref.huellas[n]) error ??= `computador ${i + 1}: el final no coincide`;
    else if (huellaProfunda(s.match) !== ref.profundas[n]) error ??= `computador ${i + 1}: el final no coincide (huella independiente)`;
  }
  if (revisado[0] < n - sesiones[0].maxRetroceso - 3 || revisado[1] < n - sesiones[1].maxRetroceso - 3) {
    error ??= `se revisaron pocos cuadros (${revisado.join(' y ')} de ${n})`;
  }
  return { error, stats: sesiones.map((x) => x.stats), avisos, peorMs, ticks: tick, vivas };
}

// ---------------------------------------------------------------- peleas

const pelea1v1 = (a: string, b: string, seed: number): Pelea => ({
  nombre: `${a} vs ${b} (semilla ${seed})`,
  crear: () => new Match([defs.get(a)!, defs.get(b)!], seed, { introDelay: 30 }),
});
const pelea2v2 = (a: string, b: string, c: string, d: string, seed: number): Pelea => ({
  nombre: `${a}+${b} vs ${c}+${d} (2 VS 2, semilla ${seed})`,
  crear: () => new Match([defs.get(a)!, defs.get(c)!], seed, { teams: [[defs.get(a)!, defs.get(b)!], [defs.get(c)!, defs.get(d)!]] }),
});

const peleas: Pelea[] = [];
const elegir = azar(2026);
for (let k = 0; k < PELEAS; k++) {
  const a = IDS[Math.floor(elegir() * IDS.length)];
  const b = IDS[Math.floor(elegir() * IDS.length)];
  peleas.push(pelea1v1(a, b, 100 + k));
}
peleas.push(pelea2v2('samurai', 'lena', 'micky', 'maki', 7));

const redes: [string, Red][] = [
  ['red perfecta', { atraso: 0, salto: 0, perdida: 0 }],
  ['50 ms', { atraso: 3, salto: 1, perdida: 0 }],
  ['100 ms con saltos y 10 % perdido', { atraso: 6, salto: 4, perdida: 0.1 }],
  ['170 ms con saltos y 25 % perdido', { atraso: 10, salto: 6, perdida: 0.25 }],
];

let fallas = 0;
for (const p of peleas) {
  const ref = referencia(p, 1);
  console.log(`\n${p.nombre}: ${ref.entradas.length} cuadros, ${ref.avisos} avisos (simular un cuadro: ${(ref.msCuadro * 1000).toFixed(0)} µs)`);
  const gc = guardarYCargar(p, ref, 5);
  console.log(`  guardar y cargar: ${gc ?? 'OK'}`);
  if (gc) fallas++;
  for (const [nombre, red] of redes) {
    const res = enLinea(p, ref, red, 9);
    const st = res.stats;
    const linea = `  ${nombre.padEnd(34)} ${res.error ? 'FALLA: ' + res.error : 'OK'} · rollbacks ${st[0].rollbacks}/${st[1].rollbacks}, retroceso máx ${st[0].maxRetroceso}/${st[1].maxRetroceso}, esperas ${st[0].esperas}/${st[1].esperas}, avisos ${res.avisos.join('/')} (ref ${ref.avisos}), peor cuadro ${res.peorMs.toFixed(1)} ms, comparadas enteras ${res.vivas.join("/")}`;
    console.log(linea);
    if (res.error) fallas++;
  }
}

// Costo de una foto.
{
  const p = pelea1v1('samurai', 'lena', 3);
  const m = p.crear();
  const cpus = [new CpuController(0, 1, 'dificil'), new CpuController(1, 2, 'dificil')];
  for (let f = 0; f < 900; f++) m.step([cpus[0].update(m), cpus[1].update(m)]);
  m.events.length = 0;
  const N = 3000;
  let t = performance.now();
  let foto = guardar(m);
  for (let k = 0; k < N; k++) foto = guardar(m);
  const tG = (performance.now() - t) / N;
  t = performance.now();
  for (let k = 0; k < N; k++) cargar(foto);
  const tC = (performance.now() - t) / N;
  t = performance.now();
  for (let k = 0; k < N; k++) huella(foto);
  const tH = (performance.now() - t) / N;
  console.log(`\nFoto de la pelea: ${foto.objs.length} objetos · guardar ${(tG * 1000).toFixed(0)} µs, cargar ${(tC * 1000).toFixed(0)} µs, huella ${(tH * 1000).toFixed(0)} µs`);
}

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
