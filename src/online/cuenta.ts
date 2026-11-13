// Cuentas de jugador (Supabase): entrar con Google o con correo y contraseña, el apodo con que
// te ven los rivales y el avatar (la cara de un luchador) (tabla public.perfiles, ver
// supabase/migraciones/). La web y el juego (iframe) se avisan cuando la cuenta cambia.
// La librería de Supabase se baja solo cuando hace falta: al entrar, al tocar EN LÍNEA o,
// al abrir el juego, si ya hay una sesión guardada. ARCADE y CASUAL no la necesitan.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** Dónde guarda la sesión la librería (localStorage). */
const KEY_SESION = 'torneoDeCell.sesion';
/** Eligió JUGAR SIN CUENTA: no se le vuelve a preguntar al abrir el juego. */
const KEY_INVITADO = 'torneoDeCell.invitado';
/** Antes de ir a Google: a qué pantalla seguir cuando vuelva (sessionStorage). */
const KEY_VOLVER = 'torneoDeCell.volverA';

/** Desde dónde se pidió entrar: la primera pantalla después del título, o EN LÍNEA. */
export type Motivo = 'inicio' | 'online';

/** Mismas reglas que la tabla perfiles (3 a 14 letras, números, espacios, - y _). */
const APODO_OK = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _-]+$/;
const SIN_CONEXION = 'NO HAY CONEXIÓN · REVISA TU INTERNET';

let cliente: Promise<SupabaseClient> | null = null;
let usuario: User | null = null;
/** El apodo del que entró; null si todavía no elige; undefined si no se sabe (no se ha podido leer). */
let perfil: { apodo: string; avatar: string | null } | null | undefined;
/** Avisos a las pantallas (la web y el juego) cuando cambia la cuenta. */
const oyentes: Array<() => void> = [];
/** Conexión del arranque (sesión guardada o vuelta de Google) en curso. */
let pendiente: Promise<void> | null = null;
let sinConexion = false;
let errorVuelta: string | null = null;

/** El cliente de Supabase (se baja la librería la primera vez). También lo usan las salas en línea. */
export function obtenerCliente(): Promise<SupabaseClient> {
  cliente ??= import('@supabase/supabase-js').then(
    ({ createClient }) => {
      const c = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { flowType: 'pkce', storageKey: KEY_SESION, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      // La sesión cambia sola (se renueva, se cierra en otra pestaña): se sigue aquí.
      c.auth.onAuthStateChange((_evento, sesion) => {
        const antes = usuario?.id;
        usuario = sesion?.user ?? null;
        if (usuario?.id !== antes) perfil = usuario ? undefined : null;
      });
      return c;
    },
    (err: unknown) => {
      // Sin internet no baja la librería: se vuelve a intentar la próxima vez.
      cliente = null;
      throw err;
    },
  );
  return cliente;
}

/** Sin internet, las llamadas pueden tardar mucho en fallar: se cortan a los 12 segundos. */
function aTiempo<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

function leer(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function escribir(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado): solo dura esta sesión.
  }
}

/** ¿Es un error de red (sin internet, se cortó, tardó demasiado)? */
function esDeRed(err: { name?: string; message?: string; status?: number }): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return (
    msg === 'timeout' || err.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') ||
    msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed')
  );
}

/** Mensaje en español (para la pantalla) de un error de Supabase. */
function traducir(e: unknown): string {
  console.warn('Cuenta:', e);
  const err = (e ?? {}) as { name?: string; message?: string; code?: string; status?: number };
  if (esDeRed(err)) return SIN_CONEXION;
  const msg = (err.message ?? '').toLowerCase();
  switch (err.code) {
    case 'invalid_credentials':
      return 'CORREO O CONTRASEÑA INCORRECTOS';
    case 'user_already_exists':
    case 'email_exists':
      return 'YA HAY UNA CUENTA CON ESE CORREO · TOCA ENTRAR';
    case 'weak_password':
      return 'LA CONTRASEÑA ES MUY CORTA · USA AL MENOS 6 LETRAS O NÚMEROS';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'ESE CORREO NO ES VÁLIDO';
    case 'email_not_confirmed':
      return 'FALTA CONFIRMAR EL CORREO';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'DEMASIADOS INTENTOS · ESPERA UN RATO Y VUELVE A PROBAR';
    case 'signup_disabled':
    case 'email_provider_disabled':
    case 'email_address_not_authorized':
      return 'POR AHORA NO SE PUEDEN CREAR CUENTAS CON CORREO';
    case 'provider_disabled':
      return 'LA ENTRADA CON GOOGLE TODAVÍA NO ESTÁ LISTA · USA EL CORREO';
    case '23505':
      return 'ESE APODO YA LO TIENE OTRO JUGADOR';
    case '23514':
      return 'ESE APODO NO SIRVE: USA DE 3 A 14 LETRAS O NÚMEROS';
    case 'PGRST301':
    case 'PGRST303':
      return 'TU SESIÓN VENCIÓ · VUELVE A ENTRAR';
  }
  if (msg.includes('invalid login')) return 'CORREO O CONTRASEÑA INCORRECTOS';
  if (msg.includes('already registered')) return 'YA HAY UNA CUENTA CON ESE CORREO · TOCA ENTRAR';
  if (msg.includes('password')) return 'LA CONTRASEÑA DEBE TENER AL MENOS 6 LETRAS O NÚMEROS';
  return 'ALGO FALLÓ · VUELVE A INTENTARLO';
}

/** Saca de la dirección lo que dejó Google al volver (?code=…), sin tocar lo demás. */
function limpiarUrl(): void {
  const url = new URL(location.href);
  const keys = ['code', 'error', 'error_code', 'error_description', 'state'];
  if (!keys.some((k) => url.searchParams.has(k))) return;
  for (const k of keys) url.searchParams.delete(k);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

async function leerPerfil(): Promise<void> {
  if (!usuario) {
    perfil = null;
    return;
  }
  const c = await obtenerCliente();
  const leer = (columnas: string) => aTiempo(c.from('perfiles').select(columnas).eq('id', usuario!.id).maybeSingle());
  let r = await leer('apodo, avatar');
  // Sin la columna del avatar (falta pegar supabase/migraciones/003): solo el apodo.
  if (r.error?.code === '42703') r = await leer('apodo');
  if (r.error) {
    perfil = undefined;
    throw r.error;
  }
  const fila = r.data as { apodo: unknown; avatar?: unknown } | null;
  perfil = fila ? { apodo: String(fila.apodo), avatar: typeof fila.avatar === 'string' ? fila.avatar : null } : null;
}

/**
 * Al abrir el juego: si hay una sesión guardada o se vuelve de Google, conecta en segundo
 * plano (mientras bajan los luchadores). Si no, no baja nada.
 */
export function iniciarCuenta(): void {
  // La otra página (la web o el juego) avisa cuando entra, sale o cambia el apodo o el avatar.
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && (e.data as { torneo?: string } | null)?.torneo === 'cuenta') void refrescarCuenta();
  });
  const q = new URLSearchParams(location.search);
  const vueltaGoogle = q.has('code');
  if (q.has('error_description') || q.has('error')) {
    // Canceló en Google, o Google no dejó entrar.
    errorVuelta = q.get('error') === 'access_denied' ? 'NO SE ENTRÓ CON GOOGLE' : 'NO SE PUDO ENTRAR CON GOOGLE · VUELVE A INTENTARLO';
    limpiarUrl();
  }
  if (!vueltaGoogle && !leer(() => localStorage, KEY_SESION)) return;
  pendiente = (async () => {
    try {
      const c = await aTiempo(obtenerCliente());
      const { data } = await aTiempo(c.auth.getSession());
      usuario = data.session?.user ?? null;
      if (vueltaGoogle && !usuario) errorVuelta = 'NO SE PUDO ENTRAR CON GOOGLE · VUELVE A INTENTARLO';
    } catch (err) {
      console.warn('No se pudo conectar la cuenta.', err);
      sinConexion = true;
      return;
    } finally {
      limpiarUrl();
    }
    try {
      await leerPerfil();
    } catch (err) {
      console.warn('No se pudo leer el perfil.', err);
    }
  })().finally(() => {
    pendiente = null;
    // Recién entró con Google: la web (que lleva el juego dentro) también tiene que saberlo.
    if (vueltaGoogle && usuario) notificar();
    else for (const fn of oyentes) fn();
  });
}

/** Avisa cada vez que cambia la cuenta (entra, sale, apodo o avatar), también desde la otra página. */
export function alCambiarCuenta(fn: () => void): void {
  oyentes.push(fn);
}

/** Avisa aquí y a la otra página (la web al juego que tiene dentro, o el juego a la web). */
function notificar(): void {
  for (const fn of oyentes) fn();
  const msg = { torneo: 'cuenta' };
  try {
    if (window.parent !== window) window.parent.postMessage(msg, location.origin);
    for (const f of document.querySelectorAll('iframe')) f.contentWindow?.postMessage(msg, location.origin);
  } catch {
    // Dentro de otro sitio: no hay a quién avisar.
  }
}

/** Vuelve a leer la sesión y el perfil (la otra página cambió algo). */
async function refrescarCuenta(): Promise<void> {
  try {
    const c = await aTiempo(obtenerCliente());
    const { data } = await aTiempo(c.auth.getSession());
    usuario = data.session?.user ?? null;
    perfil = usuario ? undefined : null;
    if (usuario) await leerPerfil();
  } catch (err) {
    console.warn('No se pudo actualizar la cuenta.', err);
  }
  for (const fn of oyentes) fn();
}

/** La conexión del arranque, si todavía no termina (las pantallas esperan con "CONECTANDO…"). */
export function cuentaPendiente(): Promise<void> | null {
  return pendiente;
}

/** ¿Hay alguien conectado? */
export function conectado(): boolean {
  return !!usuario;
}

/** Apodo del que entró: null si todavía no elige uno; undefined si no se ha podido leer. */
export function apodo(): string | null | undefined {
  return perfil === undefined ? undefined : (perfil?.apodo ?? null);
}

/** Avatar del que entró (id de un luchador), o null si no eligió (o no se sabe). */
export function avatar(): string | null {
  return perfil?.avatar ?? null;
}

/** Guarda el avatar (la cara de un luchador); devuelve el error para mostrar, o null si quedó. */
export async function guardarAvatar(id: string): Promise<string | null> {
  if (!/^[a-z0-9-]{1,24}$/.test(id)) return 'ESE AVATAR NO EXISTE';
  if (!usuario) return 'TU SESIÓN SE CERRÓ · VUELVE A ENTRAR';
  if (!perfil) return 'PRIMERO ELIGE TU APODO EN EL JUEGO (EN LÍNEA)';
  try {
    const c = await aTiempo(obtenerCliente());
    const { error } = await aTiempo(c.from('perfiles').update({ avatar: id }).eq('id', usuario.id));
    if (error?.code === '42703' || error?.code === 'PGRST204') return 'LOS AVATARES TODAVÍA NO ESTÁN LISTOS';
    if (error) return traducir(error);
    perfil = { ...perfil, avatar: id };
    notificar();
    return null;
  } catch (err) {
    return traducir(err);
  }
}

/** Vuelve a leer el apodo; devuelve el error para mostrar, o null si se pudo. */
export async function cargarPerfil(): Promise<string | null> {
  try {
    await leerPerfil();
    return null;
  } catch (err) {
    return traducir(err);
  }
}

/** ¿Al abrir el juego no se pudo conectar (sin internet)? Entonces se sigue sin cuenta. */
export function quedoSinConexion(): boolean {
  return sinConexion;
}

export function esInvitado(): boolean {
  return leer(() => localStorage, KEY_INVITADO) === 'si';
}

export function marcarInvitado(): void {
  escribir(() => localStorage, KEY_INVITADO, 'si');
}

/** Al volver de Google: la pantalla a la que seguir (solo la primera vez que se pregunta). */
export function tomarVolverA(): Motivo | null {
  const v = leer(() => sessionStorage, KEY_VOLVER);
  escribir(() => sessionStorage, KEY_VOLVER, null);
  return v === 'inicio' || v === 'online' ? v : null;
}

/** Error al volver de Google (canceló, o falló), para mostrarlo una vez. */
export function tomarErrorDeVuelta(): string | null {
  const e = errorVuelta;
  errorVuelta = null;
  return e;
}

/**
 * Va a la página de Google para entrar (y vuelve al juego ya conectado). Si no se
 * puede, devuelve el error para mostrar; si va bien, devuelve null y la página cambia.
 */
export async function entrarConGoogle(motivo: Motivo): Promise<string | null> {
  // Antes de salir del juego se revisa que Google esté activado en el proyecto (si no,
  // la página de Supabase mostraría un error en inglés en vez de volver).
  let activo: boolean;
  try {
    const r = await aTiempo(fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } }));
    const s = (await r.json()) as { external?: { google?: boolean } };
    activo = !!s.external?.google;
  } catch (err) {
    return traducir(err);
  }
  if (!activo) return 'LA ENTRADA CON GOOGLE TODAVÍA NO ESTÁ LISTA · USA EL CORREO';
  // Google rechaza la entrada desde el navegador de dentro de otra app (muestra un error 403 en inglés
  // y no vuelve): se avisa antes de salir del juego.
  if (dentroDeUnaApp()) return 'GOOGLE NO DEJA ENTRAR DESDE DENTRO DE OTRA APP\nABRE EL JUEGO EN CHROME O SAFARI, O USA EL CORREO';
  try {
    const c = await aTiempo(obtenerCliente());
    escribir(() => sessionStorage, KEY_VOLVER, motivo);
    // Dentro de la web (iframe), Google no se deja mostrar en un marco: se va con la página
    // entera y vuelve a la web, que le pasa al juego lo que trae (?code=…).
    const arriba = ventanaDeArriba();
    const { data, error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: arriba.location.origin + arriba.location.pathname, skipBrowserRedirect: true },
    });
    if (error) return traducir(error);
    arriba.location.assign(data.url);
    return null;
  } catch (err) {
    return traducir(err);
  }
}

/**
 * ¿El juego está abierto en el navegador de dentro de otra app (TikTok, Instagram, Facebook…)?
 * Muchos llegan así, por un enlace: ahí Google no deja entrar (el correo sí funciona).
 */
export function dentroDeUnaApp(ua = navigator.userAgent): boolean {
  if (/musical_ly|BytedanceWebview|TikTok|Instagram|FBAN|FBAV|FB_IAB|; wv\)/i.test(ua)) return true;
  // iPhone y iPad: el navegador de dentro de una app no dice "Safari" (Safari, Chrome y los demás sí).
  return /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua);
}

/** La página de la web si el juego va dentro de ella (mismo sitio); si no, la del juego. */
function ventanaDeArriba(): Window {
  try {
    if (window.top && window.top !== window && window.top.location.origin === location.origin) return window.top;
  } catch {
    // Dentro de otro sitio: no se puede tocar la página de arriba.
  }
  return window;
}

/** Entra con correo y contraseña; devuelve el error para mostrar, o null si entró. */
export async function entrarConCorreo(correo: string, clave: string): Promise<string | null> {
  try {
    const c = await aTiempo(obtenerCliente());
    const { data, error } = await aTiempo(c.auth.signInWithPassword({ email: correo, password: clave }));
    if (error) return traducir(error);
    usuario = data.user;
  } catch (err) {
    return traducir(err);
  }
  try {
    await leerPerfil();
  } catch (err) {
    console.warn('No se pudo leer el perfil.', err);
  }
  notificar();
  return null;
}

/**
 * Crea una cuenta con correo y contraseña (y queda conectado). Si el proyecto pide
 * confirmar el correo, avisa con `confirmar` (hay que confirmar y después ENTRAR).
 */
export async function crearCuenta(correo: string, clave: string): Promise<{ error?: string; confirmar?: boolean }> {
  try {
    const c = await aTiempo(obtenerCliente());
    const { data, error } = await aTiempo(c.auth.signUp({ email: correo, password: clave }));
    if (error) return { error: traducir(error) };
    if (!data.session) return { confirmar: true };
    usuario = data.user;
    perfil = null;
    notificar();
    return {};
  } catch (err) {
    return { error: traducir(err) };
  }
}

/** Apodo con los espacios ordenados y las tildes en su forma normal (como se guarda). */
function limpiarApodo(a: string): string {
  return a.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** ¿El apodo cumple las reglas? Devuelve el problema para mostrar, o null. */
export function validarApodo(a: string): string | null {
  const s = limpiarApodo(a);
  if (s.length < 3) return 'EL APODO DEBE TENER AL MENOS 3 LETRAS';
  if (s.length > 14) return 'EL APODO PUEDE TENER HASTA 14 LETRAS';
  if (!APODO_OK.test(s)) return 'SOLO LETRAS, NÚMEROS, ESPACIOS, - Y _';
  return null;
}

/** Apodo sugerido: el nombre de pila de Google, o lo de antes de la @ del correo. */
export function sugerirApodo(): string {
  const m = (usuario?.user_metadata ?? {}) as Record<string, unknown>;
  const nombre = String(m.given_name ?? m.full_name ?? m.name ?? '').split(' ')[0];
  const base = nombre || (usuario?.email ?? '').split('@')[0];
  const s = limpiarApodo(base.normalize('NFC').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _-]/g, '').slice(0, 14));
  return validarApodo(s) ? '' : s;
}

/** Guarda el apodo; devuelve el error para mostrar (ej. ya lo tiene otro), o null si quedó. */
export async function guardarApodo(a: string): Promise<string | null> {
  const s = limpiarApodo(a);
  const malo = validarApodo(s);
  if (malo) return malo;
  if (!usuario) return 'TU SESIÓN SE CERRÓ · VUELVE A ENTRAR';
  try {
    const c = await aTiempo(obtenerCliente());
    const { error } = await aTiempo(c.from('perfiles').upsert({ id: usuario.id, apodo: s }));
    if (error) return traducir(error);
    perfil = { apodo: s, avatar: perfil?.avatar ?? null };
    notificar();
    return null;
  } catch (err) {
    return traducir(err);
  }
}

/** Un ARCADE ganado, para el ranking de campeones. */
interface RecordArcade {
  dificultad: string;
  luchador: string;
  segundos: number;
  continues: number;
}

/** Sube el tiempo de un ARCADE ganado; devuelve el aviso para mostrar si no se pudo, o null si quedó. */
export async function subirRecordArcade(r: RecordArcade): Promise<string | null> {
  if (!usuario) return 'ENTRA CON TU CUENTA PARA SALIR EN EL RANKING';
  if (perfil === undefined) await leerPerfil().catch(() => undefined);
  if (!perfil) return 'ELIGE TU APODO EN EN LÍNEA PARA SALIR EN EL RANKING';
  try {
    const c = await aTiempo(obtenerCliente());
    const fila = { dificultad: r.dificultad, luchador: r.luchador, segundos: Math.round(r.segundos * 10) / 10, continues: r.continues };
    const { error } = await aTiempo(c.from('arcade_records').insert(fila));
    if (!error) return null;
    if (error.code === '23514') return 'ESE TIEMPO NO SE PUEDE GUARDAR';
    if (error.code === 'PGRST205' || error.code === '42P01') return 'EL RANKING TODAVÍA NO ESTÁ LISTO';
    return traducir(error);
  } catch (err) {
    return traducir(err);
  }
}

/** Cierra la sesión en este aparato (y no se le vuelve a preguntar al abrir el juego). */
export async function cerrarSesion(): Promise<void> {
  try {
    const c = await aTiempo(obtenerCliente());
    await aTiempo(c.auth.signOut({ scope: 'local' }));
  } catch (err) {
    console.warn('No se pudo cerrar la sesión en el servidor.', err);
    escribir(() => localStorage, KEY_SESION, null);
  }
  usuario = null;
  perfil = null;
  marcarInvitado();
  notificar();
}
