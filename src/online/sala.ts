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
 * Sin servidor de respaldo (TURN, Paso C), algunas redes no se dejan conectar directo.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import type { FighterAsset } from '../content/loadFighter';
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
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
/** Sube cuando cambia lo que se mandan los dos computadores. */
const PROTOCOLO = 1;
/** Segundos sin noticias del otro para dar la conexión por cortada. */
const SIN_NOTICIAS = 6;
/** Segundos para lograr la conexión directa. */
const PLAZO_CONEXION = 20;

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

  /** Avisa al otro y corta todo. */
  cerrar(error: string | null = null): void {
    if (this.estado === 'cerrada') return;
    this.enviar({ t: 'adios' });
    this.estado = 'cerrada';
    this.error ??= error;
    if (this.reloj) clearInterval(this.reloj);
    if (this.plazo) clearTimeout(this.plazo);
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
    canal.on('presence', { event: 'sync' }, () => this.revisarPresentes());
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

  /** Presentes en el canal (menos yo). */
  private presentes(): Array<{ id: string } & Presencia> {
    const st = (this.canal?.presenceState() ?? {}) as Record<string, Presencia[]>;
    return Object.entries(st)
      .filter(([id, p]) => id !== this.id && p.length)
      .map(([id, p]) => ({ id, ...p[0] }));
  }

  private async anunciarse(): Promise<void> {
    // Un momento para saber quién está (la presencia llega justo después de entrar).
    await new Promise((r) => setTimeout(r, 900));
    if (this.estado === 'cerrada' || !this.canal) return;
    const otros = this.presentes();
    const anfitrion = otros.find((p) => p.rol === 'anfitrion');
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
    if (this.estado === 'conectando') this.estado = this.rol === 'anfitrion' ? 'esperando' : 'negociando';
    if (this.rol === 'invitado') this.ponerPlazo();
    this.revisarPresentes();
  }

  /** El anfitrión, al ver llegar a alguien: le ofrece la conexión directa. */
  private revisarPresentes(): void {
    if (this.rol !== 'anfitrion' || this.estado !== 'esperando' || this.conRival) return;
    const inv = this.presentes().find((p) => p.rol === 'invitado');
    if (!inv) return;
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

  private nuevaConexion(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate && this.conRival) void this.mandarSenal({ t: 'ice', de: this.id, para: this.conRival, c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.cerrar(this.estado === 'lista' ? 'SE CORTÓ LA CONEXIÓN' : 'NO SE PUDO CONECTAR CON TU RIVAL');
    };
    pc.ondatachannel = (e) => this.usarCanal(e.channel);
    return pc;
  }

  private async ofrecer(): Promise<void> {
    try {
      const pc = this.nuevaConexion();
      this.usarCanal(pc.createDataChannel('juego', { ordered: false, maxRetransmits: 0 }));
      this.usarCanal(pc.createDataChannel('control', { ordered: true }));
      await pc.setLocalDescription(await pc.createOffer());
      await this.mandarSenal({ t: 'oferta', de: this.id, para: this.conRival!, sdp: pc.localDescription!.toJSON() });
    } catch (err) {
      console.warn('sala: no se pudo ofrecer la conexión', err);
      this.cerrar('NO SE PUDO CONECTAR CON TU RIVAL');
    }
  }

  private async senal(s: Senal): Promise<void> {
    if (s.para !== this.id || this.estado === 'cerrada') return;
    try {
      if (s.t === 'rechazo') {
        this.cerrar(s.motivo === 'version' ? 'TU RIVAL TIENE OTRA VERSIÓN DEL JUEGO · RECARGUEN LA PÁGINA' : 'NO SE PUDO ENTRAR A LA SALA');
      } else if (s.t === 'oferta' && this.rol === 'invitado' && !this.pc) {
        this.conRival = s.de;
        const pc = this.nuevaConexion();
        await pc.setRemoteDescription(s.sdp);
        await this.iceGuardados();
        await pc.setLocalDescription(await pc.createAnswer());
        await this.mandarSenal({ t: 'respuesta', de: this.id, para: s.de, sdp: pc.localDescription!.toJSON() });
      } else if (s.t === 'respuesta' && this.pc && s.de === this.conRival) {
        await this.pc.setRemoteDescription(s.sdp);
        await this.iceGuardados();
      } else if (s.t === 'ice' && s.de === this.conRival) {
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
