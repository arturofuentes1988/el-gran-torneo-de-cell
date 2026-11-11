/**
 * Sala en línea entre dos jugadores: código de 4 letras y conexión directa entre los dos
 * navegadores (WebRTC).
 *
 * - Supabase Realtime solo los presenta. En el canal "sala-<CÓDIGO>" cada uno anuncia quién es
 *   (presencia), y por ahí se pasan la oferta, la respuesta y los caminos de red (ICE). Con la
 *   conexión directa abierta se sale del canal.
 * - Dos canales directos: "juego", sin orden ni reenvíos, para los controles de cada cuadro (el
 *   rollback reenvía lo que falte); y "control", seguro y en orden, para todo lo demás.
 * - Quien crea la sala es el lado izquierdo (lado 0) en la pelea; quien se une, el derecho.
 *
 * Las pantallas leen `estado`, `error`, `rival`, `seleccion` y la `bandeja` en cada cuadro.
 * Si las redes no se dejan conectar directo, la pelea pasa por el servidor de respaldo (TURN de
 * Cloudflare, claves por el Worker de cloudflare/turn-torneo.js; apagado si `TURN_URL` está vacío).
 * Si no se conectan, `informarFalla` deja anotado el porqué en la tabla `errores`.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { reportarError } from '../app/errores';
import type { FighterAsset } from '../content/loadFighter';
import { TURN_URL } from './config';
import { obtenerCliente } from './cuenta';
import { codificar, decodificar, type Paquete } from './rollback';

export type EstadoSala = 'conectando' | 'esperando' | 'negociando' | 'lista' | 'cerrada';

export interface Jugador {
  apodo: string;
  avatar: string | null;
}

/** Lo que eligió cada uno en ELIGE LUCHADOR (en cada vuelta: `ronda`). */
export interface Seleccion {
  ronda: number;
  /** Casilla marcada. */
  pos: number;
  /** Luchador elegido (índice del plantel), o -1. */
  elige: number;
}

/** Mensajes del canal de control que esperan a una pantalla. */
export type Mensaje =
  | { t: 'escenario'; ronda: number; id: string; luchadores: [number, number] }
  | { t: 'listo'; ronda: number }
  | { t: 'empezar'; ronda: number; semilla: number; intro: number };

type Control =
  | Mensaje
  | { t: 'hola'; apodo: string; avatar: string | null; version: string }
  | { t: 'sel'; ronda: number; pos: number; elige: number }
  | { t: 'adios' }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number };

/** Lo que se anuncia en el canal de Supabase. */
interface Presencia {
  rol: 'anfitrion' | 'invitado';
  apodo: string;
  avatar: string | null;
  version: string;
}

type Senal =
  | { t: 'oferta'; de: string; para: string; sdp: RTCSessionDescriptionInit }
  | { t: 'respuesta'; de: string; para: string; sdp: RTCSessionDescriptionInit }
  | { t: 'ice'; de: string; para: string; c: RTCIceCandidateInit }
  | { t: 'rechazo'; de: string; para: string; motivo: string };

/** Letras del código: sin I ni O (se confunden con 1 y 0). */
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Servidores que le dicen a cada navegador cómo se ve desde internet (STUN, gratis). */
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
/** Pruebas: `?relay=1` obliga a pasar por el TURN (como si las dos redes no se dejaran conectar directo). */
const SOLO_RELAY = new URLSearchParams(location.search).get('relay') === '1';
/** Segundos como máximo para conseguir las claves del TURN (si no, se intenta solo directo). */
const ESPERA_TURN = 4;

/** Claves del TURN ya conseguidas, hasta poco antes de que venzan. */
let turnGuardado: { servidores: RTCIceServer[]; vence: number } | null = null;

/**
 * STUN y, si hay Worker configurado y sesión iniciada, el TURN de Cloudflare (servidor de
 * respaldo: la pelea pasa por ahí cuando las redes no se dejan conectar directo).
 */
async function servidoresIce(): Promise<{ servidores: RTCIceServer[]; turn: boolean }> {
  if (!TURN_URL) return { servidores: STUN, turn: false };
  if (turnGuardado && Date.now() < turnGuardado.vence) return { servidores: turnGuardado.servidores, turn: true };
  const corte = new AbortController();
  const plazo = setTimeout(() => corte.abort(), ESPERA_TURN * 1000);
  try {
    const cliente = await obtenerCliente();
    const token = (await cliente.auth.getSession()).data.session?.access_token;
    if (!token) return { servidores: STUN, turn: false };
    const r = await fetch(TURN_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: corte.signal });
    if (!r.ok) throw new Error(`el Worker del TURN respondió ${r.status}`);
    const j = (await r.json()) as { iceServers: RTCIceServer[]; duracion: number };
    // De lo que manda Cloudflare, solo los TURN (los que traen usuario): el STUN ya está.
    const servidores = [...STUN, ...j.iceServers.filter((x) => x.username)];
    turnGuardado = { servidores, vence: Date.now() + Math.max(60, j.duracion - 3600) * 1000 };
    return { servidores, turn: true };
  } catch (err) {
    reportarError(err, 'sala: turn');
    return { servidores: STUN, turn: false };
  } finally {
    clearTimeout(plazo);
  }
}
/** Sube cuando cambia lo que se mandan los dos computadores. */
// 2: los controles llevan la pausa en línea (bits 24 y 25): un juego sin pausa no puede pelear con uno que la tiene.
const PROTOCOLO = 2;
/** Segundos sin noticias del otro para dar la conexión por cortada. */
const SIN_NOTICIAS = 6;
/** Segundos para lograr la conexión directa. */
const PLAZO_CONEXION = 20;
/** Segundos como máximo para recibir la lista de presentes al entrar al canal (datos móviles lentos). */
const ESPERA_PRESENTES = 5;
/**
 * Segundos que el invitado espera ver al anfitrión antes de decir que la sala no existe. La primera
 * lista a veces llega sin él: Supabase tiene varios servidores y el que le tocó al invitado puede
 * tardar en enterarse de quién está en el canal (medido: el anfitrión llegó en un segundo aviso).
 */
const ESPERA_ANFITRION = 8;

/** Versión del juego para comparar al conectarse: el protocolo y la definición de cada luchador. */
export function versionJuego(roster: readonly FighterAsset[]): string {
  let h = PROTOCOLO;
  for (const f of roster) h = (Math.imul(h ^ f.huella, 0x01000193) + roster.length) >>> 0;
  return `${PROTOCOLO}-${h.toString(36)}`;
}

/** Un código nuevo al azar. */
function codigoNuevo(): string {
  const r = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(r, (n) => LETRAS[n % LETRAS.length]).join('');
}

/** Un código que sale siempre igual del mismo texto (PARTIDA RÁPIDA: los dos lo calculan sin hablarse). */
export function codigoDe(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193);
  let out = '';
  for (let k = 0; k < 4; k++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    out += LETRAS[h % LETRAS.length];
  }
  return out;
}

/** Normaliza lo que escribe el jugador (minúsculas, espacios, guiones...). */
export function limpiarCodigo(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export const codigoValido = (s: string): boolean => s.length === 4 && [...s].every((c) => LETRAS.includes(c));

export class Sala {
  estado: EstadoSala = 'conectando';
  /** Por qué se cerró (para mostrarlo), o null. */
  error: string | null = null;
  rival: Jugador | null = null;
  /** Ida y vuelta de un mensaje, en milisegundos (0 si todavía no se mide). */
  ping = 0;
  /** Vuelta de ELIGE LUCHADOR en que va este jugador (sube cada vez que entra). */
  ronda = 0;
  /** Lo último que eligió el rival. */
  seleccion: Seleccion = { ronda: -1, pos: 0, elige: -1 };
  /** Mensajes de control que llegaron (las pantallas sacan los suyos con tomar()). */
  private bandeja: Mensaje[] = [];
  /** Llega un paquete de la pelea (lo conecta la pelea en línea). */
  alPaquete: ((p: Paquete) => void) | null = null;

  private readonly id = Math.random().toString(36).slice(2, 10);
  private canal: RealtimeChannel | null = null;
  private pc: RTCPeerConnection | null = null;
  private juego: RTCDataChannel | null = null;
  private control: RTCDataChannel | null = null;
  private iceEnEspera: RTCIceCandidateInit[] = [];
  private conRival: string | null = null;
  private ultimoContacto = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private plazo: ReturnType<typeof setTimeout> | null = null;
  private pings = new Map<number, number>();
  private nPing = 0;
  /** Para el informe si no se logra conectar: hasta dónde se llegó y cómo iba la red. */
  private readonly inicio = performance.now();
  private etapa = 'canal';
  private estadosIce: string[] = [];
  private iceMandados = 0;
  private iceRecibidos = 0;
  /** Los servidores ICE (se piden al crear la sala, para tenerlos listos cuando llegue el rival). */
  private readonly ice = servidoresIce();
  private conTurn = false;
  /** Ya llegó al menos una lista de presentes del canal. */
  private huboLista = false;
  /** Quien espera un cambio en la lista de presentes (ver esperarPresentes). */
  private alCambiarPresentes: (() => void) | null = null;
  /**
   * Mensajes directos que repiten cada segundo, mientras esperan, quien creó la sala ("aquí está
   * la sala") y quien entra ("hola"). Llegan al tiro entre los servidores de Supabase; la presencia
   * se pone al día recién cada 1,5 a 3 s.
   */
  private faro: ReturnType<typeof setInterval> | null = null;
  /** El invitado: el anfitrión que se oyó por mensaje (antes de verlo en la presencia). */
  private anfitrionOido: ({ id: string } & Presencia) | null = null;

  private constructor(
    readonly rol: 'anfitrion' | 'invitado',
    public codigo: string,
    private readonly yo: Jugador,
    private readonly version: string,
    /** El código lo puso quien llama (pruebas): no se cambia si está ocupado. */
    private readonly codigoFijo: boolean,
  ) {}

  /** Crea una sala nueva (con `codigo`, solo para pruebas). */
  static crear(yo: Jugador, version: string, codigo?: string): Sala {
    const s = new Sala('anfitrion', codigo ?? codigoNuevo(), yo, version, !!codigo);
    void s.entrarAlCanal();
    return s;
  }

  static unirse(codigo: string, yo: Jugador, version: string): Sala {
    const s = new Sala('invitado', codigo, yo, version, true);
    void s.entrarAlCanal();
    return s;
  }

  /** Lado en la pelea: quien creó la sala, a la izquierda. */
  get lado(): 0 | 1 {
    return this.rol === 'anfitrion' ? 0 : 1;
  }

  enviar(m: Control): void {
    if (this.control?.readyState === 'open') this.control.send(JSON.stringify(m));
  }

  enviarPaquete(p: Paquete): void {
    if (this.juego?.readyState === 'open') this.juego.send(codificar(p));
  }

  /** Saca de la bandeja el primer mensaje de ese tipo y de esta ronda (los de rondas viejas se botan). */
  tomar<T extends Mensaje['t']>(t: T, ronda: number): Extract<Mensaje, { t: T }> | null {
    this.bandeja = this.bandeja.filter((m) => m.ronda >= ronda);
    const i = this.bandeja.findIndex((m) => m.t === t && m.ronda === ronda);
    if (i < 0) return null;
    return this.bandeja.splice(i, 1)[0] as Extract<Mensaje, { t: T }>;
  }

  /** Si ya se cerró (se revisa después de cada espera: pudo cerrarse mientras tanto). */
  private cerrada(): boolean {
    return this.estado === 'cerrada';
  }

  /** Avisa al otro y corta todo. */
  cerrar(error: string | null = null): void {
    if (this.estado === 'cerrada') return;
    // Si no se alcanzó a conectar, queda anotado por qué (tabla `errores`), para poder arreglarlo.
    if (error && this.estado !== 'lista') void this.informarFalla(error);
    this.enviar({ t: 'adios' });
    this.estado = 'cerrada';
    this.error ??= error;
    if (this.reloj) clearInterval(this.reloj);
    if (this.plazo) clearTimeout(this.plazo);
    if (this.faro) clearInterval(this.faro);
    this.salirDelCanal();
    // Un momento para que alcance a salir el "adiós".
    const { juego, control, pc } = this;
    setTimeout(() => {
      juego?.close();
      control?.close();
      pc?.close();
    }, 200);
  }

  // ---------------------------------------------------------------- presentación (Supabase)

  private async entrarAlCanal(): Promise<void> {
    let cliente;
    try {
      cliente = await obtenerCliente();
    } catch {
      return this.cerrar('NO HAY CONEXIÓN A INTERNET');
    }
    if (this.estado === 'cerrada') return;
    const canal = cliente.channel(`sala-${this.codigo}`, { config: { broadcast: { self: false }, presence: { key: this.id } } });
    this.canal = canal;
    canal.on('broadcast', { event: 'senal' }, ({ payload }) => void this.senal(payload as Senal));
    canal.on('broadcast', { event: 'anfitrion' }, ({ payload }) => this.oirAnfitrion(payload as { id: string } & Presencia));
    canal.on('broadcast', { event: 'hola' }, ({ payload }) => this.oirInvitado(payload as { id: string } & Presencia));
    this.huboLista = false;
    canal.on('presence', { event: 'sync' }, () => {
      this.huboLista = true;
      this.alCambiarPresentes?.();
      this.revisarPresentes();
    });
    canal.subscribe((st) => {
      if (st === 'SUBSCRIBED') void this.anunciarse();
      else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && this.estado !== 'lista') this.cerrar('NO SE PUDO ABRIR LA SALA · REVISA TU INTERNET');
    });
  }

  private salirDelCanal(): void {
    const canal = this.canal;
    this.canal = null;
    if (canal) void obtenerCliente().then((c) => c.removeChannel(canal)).catch(() => undefined);
  }

  /**
   * Anota en la tabla `errores` por qué no se conectaron: la etapa a la que se llegó, los caminos
   * de red de cada uno (host = red local, srflx = dirección pública vía STUN, relay = TURN), los
   * estados de la conexión y el tipo de red del aparato si el navegador lo dice.
   */
  private async informarFalla(motivo: string): Promise<void> {
    const local = new Set<string>();
    const remoto = new Set<string>();
    let pares = 0;
    try {
      const stats = await this.pc?.getStats();
      stats?.forEach((r: { type: string; candidateType?: string; protocol?: string; state?: string }) => {
        if (r.type === 'local-candidate') local.add(`${r.candidateType}/${r.protocol}`);
        else if (r.type === 'remote-candidate') remoto.add(`${r.candidateType}/${r.protocol}`);
        else if (r.type === 'candidate-pair' && r.state === 'succeeded') pares++;
      });
    } catch {
      // Sin estadísticas: igual se manda lo demás.
    }
    const red = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } }).connection;
    const detalle = {
      rol: this.rol,
      etapa: this.etapa,
      segundos: Math.round((performance.now() - this.inicio) / 100) / 10,
      ice: this.estadosIce.join(' > ') || '-',
      conexion: this.pc?.connectionState ?? 'sin conexión',
      caminosPropios: [...local].join(', ') || '-',
      caminosDelRival: [...remoto].join(', ') || '-',
      iceMandados: this.iceMandados,
      iceRecibidos: this.iceRecibidos,
      paresQueFuncionaron: pares,
      servidorDeRespaldo: this.conTurn ? 'sí' : 'no',
      red: red ? `${red.type ?? '?'} ${red.effectiveType ?? ''}`.trim() : '?',
    };
    const e = new Error(`${motivo} (${this.rol}, ${this.etapa})`);
    e.stack = JSON.stringify(detalle, null, 1);
    reportarError(e, 'sala');
  }

  /** Presentes en el canal (menos yo). */
  private presentes(): Array<{ id: string } & Presencia> {
    const st = (this.canal?.presenceState() ?? {}) as Record<string, Presencia[]>;
    return Object.entries(st)
      .filter(([id, p]) => id !== this.id && p.length)
      .map(([id, p]) => ({ id, ...p[0] }));
  }

  /** Espera hasta que `listo()` se cumpla con la lista de presentes (se revisa con cada aviso) o hasta `seg` segundos. */
  private esperarPresentes(listo: () => boolean, seg: number): Promise<void> {
    return new Promise((r) => {
      const fin = (): void => {
        clearTimeout(plazo);
        this.alCambiarPresentes = null;
        r();
      };
      const plazo = setTimeout(fin, seg * 1000);
      this.alCambiarPresentes = () => {
        if (listo()) fin();
      };
      if (listo()) fin();
    });
  }

  private async anunciarse(): Promise<void> {
    // Antes de decidir nada, la lista de quién está. El anfitrión, con la primera lista le basta
    // (solo revisa que el código no esté ocupado); el invitado espera hasta ver al anfitrión.
    this.etapa = 'presentes';
    const hayAnfitrion = (): boolean => !!this.anfitrionOido || this.presentes().some((p) => p.rol === 'anfitrion');
    if (this.rol === 'anfitrion') await this.esperarPresentes(() => this.huboLista, ESPERA_PRESENTES);
    else await this.esperarPresentes(() => (this.huboLista || !!this.anfitrionOido) && hayAnfitrion(), ESPERA_ANFITRION);
    if (this.estado === 'cerrada' || !this.canal) return;
    const otros = this.presentes();
    const anfitrion = otros.find((p) => p.rol === 'anfitrion') ?? this.anfitrionOido ?? undefined;
    if (this.rol === 'anfitrion') {
      if (anfitrion) {
        // Código ocupado (muy raro): se prueba con otro.
        if (this.codigoFijo) return this.cerrar('ESE CÓDIGO YA ESTÁ EN USO');
        this.salirDelCanal();
        this.codigo = codigoNuevo();
        return this.entrarAlCanal();
      }
    } else {
      if (!anfitrion) return this.cerrar('NO HAY NINGUNA SALA CON ESE CÓDIGO');
      if (otros.some((p) => p.rol === 'invitado')) return this.cerrar('ESA SALA ESTÁ LLENA');
      if (anfitrion.version !== this.version) return this.cerrar('TU RIVAL TIENE OTRA VERSIÓN DEL JUEGO · RECARGUEN LA PÁGINA');
    }
    const yo: Presencia = { rol: this.rol, apodo: this.yo.apodo, avatar: this.yo.avatar, version: this.version };
    await this.canal.track(yo);
    this.etapa = this.rol === 'anfitrion' ? 'esperando' : 'esperando la oferta';
    if (this.estado === 'conectando') this.estado = this.rol === 'anfitrion' ? 'esperando' : 'negociando';
    if (this.rol === 'invitado') this.ponerPlazo();
    // Por mensaje, cada segundo: el anfitrión avisa que la sala está; el invitado saluda hasta que le ofrezcan.
    const aviso = { id: this.id, ...yo };
    const evento = this.rol === 'anfitrion' ? 'anfitrion' : 'hola';
    const sigue = (): boolean => (this.rol === 'anfitrion' ? this.estado === 'esperando' : this.estado === 'negociando' && !this.pc);
    const latir = (): void => {
      if (sigue()) void this.canal?.send({ type: 'broadcast', event: evento, payload: aviso }).catch(() => undefined);
      else if (this.faro) {
        clearInterval(this.faro);
        this.faro = null;
      }
    };
    latir();
    if (this.faro) clearInterval(this.faro);
    this.faro = setInterval(latir, 1000);
    this.revisarPresentes();
  }

  /** El invitado oye por mensaje que la sala está (antes de que la presencia lo diga). */
  private oirAnfitrion(a: { id: string } & Presencia): void {
    if (this.rol !== 'invitado' || !a?.id || a.id === this.id) return;
    this.anfitrionOido = a;
    this.alCambiarPresentes?.();
  }

  /** El anfitrión oye por mensaje a alguien que quiere entrar. */
  private oirInvitado(a: { id: string } & Presencia): void {
    if (this.rol !== 'anfitrion' || !a?.id || a.id === this.id || a.id === this.conRival) return;
    if (this.conRival || this.estado !== 'esperando') {
      // Ya hay rival: al otro se le avisa que la sala está llena.
      if (this.estado !== 'cerrada') void this.mandarSenal({ t: 'rechazo', de: this.id, para: a.id, motivo: 'llena' });
      return;
    }
    this.aceptar(a);
  }

  /** El anfitrión, al ver llegar a alguien (presencia): le ofrece la conexión directa. */
  private revisarPresentes(): void {
    if (this.rol !== 'anfitrion' || this.estado !== 'esperando' || this.conRival) return;
    const inv = this.presentes().find((p) => p.rol === 'invitado');
    if (inv) this.aceptar(inv);
  }

  /** El anfitrión acepta al invitado (si es de la misma versión) y le ofrece la conexión. */
  private aceptar(inv: { id: string } & Presencia): void {
    if (inv.version !== this.version) {
      void this.mandarSenal({ t: 'rechazo', de: this.id, para: inv.id, motivo: 'version' });
      return;
    }
    this.conRival = inv.id;
    this.rival = { apodo: inv.apodo, avatar: inv.avatar };
    this.estado = 'negociando';
    this.ponerPlazo();
    void this.ofrecer();
  }

  private ponerPlazo(): void {
    if (this.plazo) clearTimeout(this.plazo);
    this.plazo = setTimeout(() => {
      if (this.estado !== 'lista') this.cerrar('NO SE PUDO CONECTAR CON TU RIVAL · PRUEBEN CON OTRA RED (WIFI O DATOS)');
    }, PLAZO_CONEXION * 1000);
  }

  private async mandarSenal(s: Senal): Promise<void> {
    await this.canal?.send({ type: 'broadcast', event: 'senal', payload: s });
  }

  // ---------------------------------------------------------------- conexión directa (WebRTC)

  private async nuevaConexion(): Promise<RTCPeerConnection> {
    const { servidores, turn } = await this.ice;
    this.conTurn = turn;
    const pc = new RTCPeerConnection({ iceServers: servidores, iceTransportPolicy: SOLO_RELAY ? 'relay' : 'all' });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.conRival) return;
      this.iceMandados++;
      void this.mandarSenal({ t: 'ice', de: this.id, para: this.conRival, c: e.candidate.toJSON() });
    };
    pc.oniceconnectionstatechange = () => this.estadosIce.push(pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.cerrar(this.estado === 'lista' ? 'SE CORTÓ LA CONEXIÓN' : 'NO SE PUDO CONECTAR CON TU RIVAL');
    };
    pc.ondatachannel = (e) => this.usarCanal(e.channel);
    return pc;
  }

  private async ofrecer(): Promise<void> {
    try {
      const pc = await this.nuevaConexion();
      if (this.cerrada()) return;
      this.usarCanal(pc.createDataChannel('juego', { ordered: false, maxRetransmits: 0 }));
      this.usarCanal(pc.createDataChannel('control', { ordered: true }));
      await pc.setLocalDescription(await pc.createOffer());
      await this.mandarSenal({ t: 'oferta', de: this.id, para: this.conRival!, sdp: pc.localDescription!.toJSON() });
      this.etapa = 'oferta mandada';
    } catch (err) {
      console.warn('sala: no se pudo ofrecer la conexión', err);
      this.cerrar('NO SE PUDO CONECTAR CON TU RIVAL');
    }
  }

  private async senal(s: Senal): Promise<void> {
    if (s.para !== this.id || this.estado === 'cerrada') return;
    try {
      if (s.t === 'rechazo') {
        this.cerrar(
          s.motivo === 'version'
            ? 'TU RIVAL TIENE OTRA VERSIÓN DEL JUEGO · RECARGUEN LA PÁGINA'
            : s.motivo === 'llena'
              ? 'ESA SALA ESTÁ LLENA'
              : 'NO SE PUDO ENTRAR A LA SALA',
        );
      } else if (s.t === 'oferta' && this.rol === 'invitado' && !this.conRival) {
        this.conRival = s.de;
        this.etapa = 'oferta recibida';
        const pc = await this.nuevaConexion();
        if (this.cerrada()) return;
        await pc.setRemoteDescription(s.sdp);
        await this.iceGuardados();
        await pc.setLocalDescription(await pc.createAnswer());
        await this.mandarSenal({ t: 'respuesta', de: this.id, para: s.de, sdp: pc.localDescription!.toJSON() });
        this.etapa = 'respuesta mandada';
      } else if (s.t === 'respuesta' && this.pc && s.de === this.conRival) {
        this.etapa = 'respuesta recibida';
        await this.pc.setRemoteDescription(s.sdp);
        await this.iceGuardados();
      } else if (s.t === 'ice' && s.de === this.conRival) {
        this.iceRecibidos++;
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(s.c);
        else this.iceEnEspera.push(s.c);
      }
    } catch (err) {
      console.warn('sala: señal', s.t, err);
    }
  }

  private async iceGuardados(): Promise<void> {
    for (const c of this.iceEnEspera.splice(0)) await this.pc?.addIceCandidate(c).catch(() => undefined);
  }

  private usarCanal(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'juego') this.juego = ch;
    else this.control = ch;
    ch.onopen = () => this.alAbrir();
    ch.onclose = () => {
      if (this.estado !== 'cerrada') this.cerrar(this.estado === 'lista' ? 'SE CORTÓ LA CONEXIÓN' : 'NO SE PUDO CONECTAR CON TU RIVAL');
    };
    ch.onmessage = (e) => {
      this.ultimoContacto = performance.now();
      if (ch === this.juego) {
        const p = e.data instanceof ArrayBuffer ? decodificar(e.data) : null;
        if (p) this.alPaquete?.(p);
      } else if (typeof e.data === 'string') {
        this.recibir(JSON.parse(e.data) as Control);
      }
    };
  }

  /** Con los dos canales abiertos: la sala está lista y se deja el canal de Supabase. */
  private alAbrir(): void {
    if (this.juego?.readyState !== 'open' || this.control?.readyState !== 'open' || this.estado === 'lista') return;
    this.estado = 'lista';
    if (this.plazo) clearTimeout(this.plazo);
    this.salirDelCanal();
    this.ultimoContacto = performance.now();
    this.enviar({ t: 'hola', apodo: this.yo.apodo, avatar: this.yo.avatar, version: this.version });
    this.reloj = setInterval(() => {
      if (performance.now() - this.ultimoContacto > SIN_NOTICIAS * 1000) return this.cerrar('SE CORTÓ LA CONEXIÓN CON TU RIVAL');
      const n = ++this.nPing;
      this.pings.set(n, performance.now());
      this.enviar({ t: 'ping', n });
    }, 1000);
  }

  private recibir(m: Control): void {
    switch (m.t) {
      case 'hola':
        this.rival = { apodo: m.apodo, avatar: m.avatar };
        if (m.version !== this.version) this.cerrar('TU RIVAL TIENE OTRA VERSIÓN DEL JUEGO · RECARGUEN LA PÁGINA');
        break;
      case 'sel':
        if (m.ronda >= this.seleccion.ronda) this.seleccion = { ronda: m.ronda, pos: m.pos, elige: m.elige };
        break;
      case 'adios':
        this.error = 'TU RIVAL SALIÓ DE LA SALA';
        this.cerrar();
        break;
      case 'ping':
        this.enviar({ t: 'pong', n: m.n });
        break;
      case 'pong': {
        const t0 = this.pings.get(m.n);
        if (t0 !== undefined) {
          const rtt = performance.now() - t0;
          this.ping = this.ping ? this.ping * 0.7 + rtt * 0.3 : rtt;
          this.pings.delete(m.n);
        }
        break;
      }
      default:
        this.bandeja.push(m);
    }
  }
}
