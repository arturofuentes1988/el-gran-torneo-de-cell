/**
 * Lobby en línea: un canal de Supabase Realtime ("lobby") donde se anuncian (presencia) todos los
 * que están en EN LÍNEA, con su apodo, su avatar y qué están haciendo. Sirve para:
 * - contar cuántos jugadores hay en línea;
 * - listar las SALAS ABIERTAS (quien crea una se anuncia con su código);
 * - emparejar la PARTIDA RÁPIDA sin servidor propio: todos leen la misma lista de los que buscan,
 *   la ordenan igual (por cuándo empezaron a buscar) y se juntan de a dos (`pareja`).
 * Al salir de la pestaña o cerrar el juego, Supabase saca al jugador solo.
 *
 * Supabase tiene varios servidores y la presencia entre ellos se pone al día cada 1,5 a 3 s (medido).
 * Para no esperar eso, cada cambio también va por mensaje directo (que llega al tiro): quien entra
 * saluda ("hola") y los que buscan o tienen sala abierta le contestan con su estado, y lo repiten
 * cada pocos segundos. La presencia sigue siendo la que dice quién se fue.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerCliente } from './cuenta';

export type EstadoLobby = 'menu' | 'buscando' | 'sala' | 'jugando';

export interface EnLobby {
  /** Identificador de esta visita (no es la cuenta). */
  id: string;
  apodo: string;
  avatar: string | null;
  /** Versión del juego: solo se emparejan y se ven las salas de la misma. */
  version: string;
  estado: EstadoLobby;
  /** Sala abierta esperando rival: su código (las privadas no lo anuncian). */
  sala?: string;
  /** Desde cuándo está en este estado (reloj de quien lo anuncia; sirve para ordenar la fila). */
  desde: number;
  /** Número de anuncio (sube con cada cambio): entre presencia y mensaje, vale el más nuevo. */
  n: number;
}

type Yo = Omit<EnLobby, 'id'>;

/** Cada cuánto (ms) repite su estado por mensaje quien busca partida o tiene una sala abierta. */
const REPETIR_MS = 2500;
/** Lo que llegó por mensaje y la presencia todavía no confirma vale este tiempo (ms). */
const VALE_MS = 7000;

/** Canal del lobby. En pruebas (?qa&lobby=x) uno aparte, para no mezclarse con los jugadores de verdad. */
function nombreCanal(): string {
  const p = new URLSearchParams(location.search);
  const prueba = p.has('qa') ? p.get('lobby') : null;
  return prueba ? `lobby-${prueba.replace(/[^a-z0-9]/gi, '').slice(0, 12)}` : 'lobby';
}

class Lobby {
  readonly id = Math.random().toString(36).slice(2, 10);
  private canal: RealtimeChannel | null = null;
  private suscrito = false;
  private yo: Yo | null = null;
  /** Se está entrando o saliendo del canal (para no pisarse). */
  private cola: Promise<void> = Promise.resolve();
  /** Por presencia: los que están (lo último que anunció cada uno). */
  private presentes = new Map<string, EnLobby>();
  /** Por mensaje directo: lo último de cada uno y cuándo llegó (performance.now). */
  private mensajes = new Map<string, { e: EnLobby; t: number }>();
  private repetir: ReturnType<typeof setInterval> | null = null;
  private n = 0;

  /** Los demás que están en el lobby (sin mí): la presencia, con lo más nuevo que llegó por mensaje. */
  get otros(): EnLobby[] {
    const ahora = performance.now();
    const todos = new Map(this.presentes);
    for (const [id, m] of this.mensajes) {
      const p = todos.get(id);
      if (p ? m.e.n > p.n : ahora - m.t < VALE_MS) todos.set(id, m.e);
    }
    return [...todos.values()];
  }

  /** Entra al lobby (si no estaba) anunciándose con estos datos. */
  entrar(datos: { apodo: string; avatar: string | null; version: string }): void {
    const antes = this.yo;
    this.yo = { ...datos, estado: antes?.estado ?? 'menu', desde: antes?.desde ?? Date.now(), sala: antes?.sala, n: antes?.n ?? 0 };
    if (this.canal) {
      void this.anunciar();
      return;
    }
    this.cola = this.cola.then(() => this.conectar());
  }

  /** Sale del lobby (al volver al menú principal o cerrar sesión). */
  salir(): void {
    const canal = this.canal;
    if (canal && this.suscrito) void canal.send({ type: 'broadcast', event: 'adios', payload: { id: this.id } }).catch(() => undefined);
    if (this.repetir) clearInterval(this.repetir);
    this.repetir = null;
    this.canal = null;
    this.suscrito = false;
    this.yo = null;
    this.presentes.clear();
    this.mensajes.clear();
    if (canal) this.cola = this.cola.then(() => obtenerCliente().then((c) => void c.removeChannel(canal))).catch(() => undefined);
  }

  /**
   * Cambia lo que se anuncia. `desde` se renueva al cambiar de estado (al volver a buscar, la fila
   * se arma de nuevo con el que lleva más rato primero); `mismoDesde` lo deja como estaba.
   */
  poner(estado: EstadoLobby, sala?: string, mismoDesde = false): void {
    const yo = this.yo;
    if (!yo) return;
    if (yo.estado === estado && yo.sala === sala) return;
    if (yo.estado !== estado && !mismoDesde) yo.desde = Date.now();
    yo.estado = estado;
    yo.sala = sala;
    void this.anunciar();
  }

  /** Vuelve a la fila de PARTIDA RÁPIDA al final (después de un intento que no resultó). */
  alFinalDeLaFila(): void {
    if (!this.yo) return;
    this.yo.estado = 'buscando';
    this.yo.sala = undefined;
    this.yo.desde = Date.now();
    void this.anunciar();
  }

  /** Yo, como me ven los demás (null si no estoy en el lobby). */
  get yoMismo(): EnLobby | null {
    return this.yo ? { ...this.yo, id: this.id } : null;
  }

  /** ¿Ya llegó la lista de los que están? */
  get listo(): boolean {
    return this.suscrito;
  }

  /** Jugadores en EN LÍNEA ahora (contándome). */
  get cuantos(): number {
    return this.otros.length + (this.yo ? 1 : 0);
  }

  /** Salas abiertas esperando rival (de la misma versión del juego), la más antigua primero. */
  salasAbiertas(): EnLobby[] {
    const v = this.yo?.version;
    return this.otros.filter((o) => o.estado === 'sala' && !!o.sala && o.version === v).sort((a, b) => a.desde - b.desde);
  }

  /** Cuántos buscan PARTIDA RÁPIDA ahora (contándome si busco). */
  get buscando(): number {
    return this.otros.filter((o) => o.estado === 'buscando').length + (this.yo?.estado === 'buscando' ? 1 : 0);
  }

  private async conectar(): Promise<void> {
    if (!this.yo) return;
    try {
      const cliente = await obtenerCliente();
      if (!this.yo || this.canal) return;
      const canal = cliente.channel(nombreCanal(), { config: { presence: { key: this.id } } });
      this.canal = canal;
      canal.on('presence', { event: 'sync' }, () => this.leer());
      canal.on('broadcast', { event: 'estado' }, ({ payload }) => {
        const e = payload as EnLobby;
        if (e?.id && e.id !== this.id) this.mensajes.set(e.id, { e, t: performance.now() });
      });
      // Alguien entró: los que buscan o tienen sala abierta le cuentan su estado al tiro.
      canal.on('broadcast', { event: 'hola' }, () => this.difundirSiImporta());
      canal.on('broadcast', { event: 'adios' }, ({ payload }) => {
        const id = (payload as { id?: string })?.id;
        if (id) {
          this.mensajes.delete(id);
          this.presentes.delete(id);
        }
      });
      canal.subscribe((st) => {
        if (canal !== this.canal) return;
        if (st === 'SUBSCRIBED') {
          this.suscrito = true;
          void this.anunciar();
          void canal.send({ type: 'broadcast', event: 'hola', payload: { id: this.id } }).catch(() => undefined);
          if (!this.repetir) this.repetir = setInterval(() => this.difundirSiImporta(), REPETIR_MS);
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          this.suscrito = false;
        }
      });
    } catch {
      // Sin internet: el lobby queda vacío (las salas con código igual avisan su error).
    }
  }

  /** Anuncia el estado: presencia (la que vale para saber quién está) y mensaje (el que llega primero). */
  private async anunciar(): Promise<void> {
    if (!this.canal || !this.suscrito || !this.yo) return;
    this.yo.n = ++this.n;
    this.difundir();
    await this.canal.track({ ...this.yo }).catch(() => undefined);
  }

  private difundir(): void {
    if (this.canal && this.suscrito && this.yo) {
      void this.canal.send({ type: 'broadcast', event: 'estado', payload: { ...this.yo, id: this.id } }).catch(() => undefined);
    }
  }

  /** Solo quien busca partida o tiene una sala abierta repite su estado (es lo que otros necesitan al tiro). */
  private difundirSiImporta(): void {
    if (this.yo && (this.yo.estado === 'buscando' || this.yo.estado === 'sala')) this.difundir();
  }

  private leer(): void {
    const st = (this.canal?.presenceState() ?? {}) as Record<string, Yo[]>;
    // Cada vez que alguien cambia lo que anuncia, Supabase agrega el anuncio nuevo al final de su
    // lista (no reemplaza el anterior): vale el último.
    this.presentes = new Map(
      Object.entries(st)
        .filter(([id, p]) => id !== this.id && p.length)
        .map(([id, p]) => [id, { ...p[p.length - 1], id }] as const),
    );
  }
}

/**
 * Mirar el lobby sin entrar (la web): avisa cuántos hay en EN LÍNEA, sin contarse (no se anuncia).
 * Devuelve cómo dejar de mirar.
 */
export function mirarLobby(alCambiar: (cuantos: number) => void): () => void {
  let canal: RealtimeChannel | null = null;
  let fin = false;
  void obtenerCliente()
    .then((c) => {
      if (fin) return;
      const ch = c.channel(nombreCanal(), { config: { presence: { key: `web-${Math.random().toString(36).slice(2, 8)}` } } });
      canal = ch;
      const contar = (): void => alCambiar(Object.values(ch.presenceState()).filter((p) => p.length).length);
      ch.on('presence', { event: 'sync' }, contar);
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') contar();
      });
    })
    .catch(() => undefined);
  return () => {
    fin = true;
    const ch = canal;
    if (ch) void obtenerCliente().then((c) => c.removeChannel(ch));
  };
}

/** El lobby (uno solo por pestaña). */
export const lobby = new Lobby();
// Pruebas (?qa): el puente de pruebas lo lee desde la página.
if (new URLSearchParams(location.search).has('qa')) (window as unknown as { __lobby: Lobby }).__lobby = lobby;

/**
 * PARTIDA RÁPIDA: con quién me toca. Todos los que buscan (misma versión) se ordenan por cuándo
 * empezaron a buscar y se juntan de a dos (1.º con 2.º, 3.º con 4.º…); el primero de cada pareja
 * crea la sala y el código sale de los dos identificadores, así los dos llegan al mismo sin hablarse.
 * null: no hay con quién (o me toca esperar al siguiente).
 */
export function pareja(codigoDe: (texto: string) => string): { rival: EnLobby; anfitrion: boolean; codigo: string } | null {
  const yo = lobby.yoMismo;
  if (!yo || yo.estado !== 'buscando') return null;
  const fila = [yo, ...lobby.otros.filter((o) => o.estado === 'buscando' && o.version === yo.version)].sort(
    (a, b) => a.desde - b.desde || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const i = fila.findIndex((x) => x.id === yo.id);
  const j = i ^ 1;
  if (j >= fila.length) return null;
  const rival = fila[j];
  const [a, b] = i < j ? [yo, rival] : [rival, yo];
  return { rival, anfitrion: i < j, codigo: codigoDe(`${a.id}:${b.id}:${a.desde}`) };
}
