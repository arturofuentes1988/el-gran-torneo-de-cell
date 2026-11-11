// Web del juego: pestañas JUGAR (el juego, juego.html, dentro de un iframe) y RANKING
// (puntos de liga, victorias y mejor racha en línea, y campeones del ARCADE). El ranking se
// lee de Supabase sin cuenta, con las funciones públicas ranking_liga y ranking_arcade
// (supabase/migraciones/002_ranking_y_errores.sql): solo apodos y números.

import '@fontsource/oswald/500.css';
import '@fontsource/oswald/700.css';
import './portal.css';
import { abrirSelectorDeAvatar, urlAvatar } from '../online/avatares';
import { SUPABASE_KEY, SUPABASE_URL } from '../online/config';
import { alCambiarCuenta, apodo, avatar, cerrarSesion, conectado, guardarAvatar, iniciarCuenta } from '../online/cuenta';
import { mirarLobby } from '../online/lobby';
import { DIFFICULTIES, DIFFICULTY_NAME, type DifficultyId } from '../sim/difficulty';

type Pestana = 'jugar' | 'ranking';
type Tabla = 'puntos' | 'victorias' | 'racha' | 'arcade';

/**
 * Donaciones (Mercado Pago): un botón por enlace. Mientras esté vacío, la parte de DONAR no se ve.
 * Cada enlace de pago se crea en Mercado Pago (Cobrar → Link de pago) y se pega aquí.
 * Apagadas desde el 10 de noviembre a pedido del usuario ("por ahora nada de donaciones").
 */
const DONACIONES: ReadonlyArray<{ texto: string; url: string }> = [];

interface FilaLiga {
  apodo: string;
  avatar?: string | null;
  puntos: number;
  victorias: number;
  derrotas: number;
  racha: number;
  mejor_racha: number;
}

interface FilaArcade {
  apodo: string;
  avatar?: string | null;
  luchador: string;
  segundos: number;
  continues: number;
}

/** Nombre de cada luchador (las caras están en luchadores/<id>/cara.webp). */
const LUCHADORES: Record<string, string> = {
  rene: 'Tío René',
  pablito: 'Pablito Neuquén',
  flaitiano: 'Flaitiano',
  lena: 'Vendedor de Leña',
  carlitos: 'Carlitos Run',
};

const EXPLICA: Record<Tabla, string> = {
  puntos: 'TODOS PARTEN CON 1.000 PUNTOS. GANARLE A ALGUIEN CON MÁS PUNTOS DA MÁS; PERDER CON ALGUIEN CON MENOS QUITA MÁS.',
  victorias: 'PELEAS GANADAS CONTRA OTROS JUGADORES EN EL MODO EN LÍNEA.',
  racha:
    'MEJOR RACHA: TU RÉCORD DE PELEAS EN LÍNEA GANADAS SEGUIDAS, SIN PERDER NINGUNA ENTREMEDIO. RACHA ACTUAL: LAS QUE LLEVAS GANADAS SEGUIDAS AHORA (VUELVE A 0 CUANDO PIERDES).',
  arcade:
    'GANA EL QUE SE CORONÓ MÁS RÁPIDO: SE SUMA LO QUE DURARON TODAS SUS PELEAS DEL ARCADE, TAMBIÉN LAS QUE PERDIÓ Y TUVO QUE REPETIR. CADA DIFICULTAD TIENE SU RANKING. JUEGA ARCADE CON TU CUENTA PARA APARECER.',
};

const SIN_PELEAS = 'TODAVÍA NO HAY JUGADORES EN LA LIGA.\nCREA TU CUENTA Y ELIGE TU APODO EN EL JUEGO PARA APARECER.';

const juego = document.getElementById('juego') as HTMLIFrameElement;
const tablaEl = document.querySelector<HTMLElement>('#ranking .tabla')!;
const explicaEl = document.querySelector<HTMLElement>('#ranking .explica')!;
const dificultadesEl = document.querySelector<HTMLElement>('#ranking .dificultades')!;

let tabla: Tabla = 'puntos';
let dificultad: DifficultyId = 'normal';
/** Para no pintar una respuesta vieja si se cambió de tabla mientras cargaba. */
let pedido = 0;

// El juego recibe lo que venga en la dirección (?tactil=1, o ?code=… al volver de entrar con
// Google: el juego termina de entrar). Lo de Google se saca de la dirección de la web.
juego.src = `juego.html${location.search}`;
{
  const url = new URL(location.href);
  const google = ['code', 'error', 'error_code', 'error_description', 'state'];
  if (google.some((k) => url.searchParams.has(k))) {
    for (const k of google) url.searchParams.delete(k);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
juego.addEventListener('load', () => {
  if (!document.querySelector<HTMLElement>('#jugar')!.hidden) juego.focus();
});

function mostrar(p: Pestana): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pestana]')) b.classList.toggle('activa', b.dataset.pestana === p);
  for (const s of document.querySelectorAll<HTMLElement>('.pestana')) s.hidden = s.id !== p;
  // Escondido, el juego se calla (y el navegador deja de dibujarlo).
  juego.contentWindow?.postMessage({ torneo: p === 'jugar' ? 'visible' : 'escondido' }, location.origin);
  const url = new URL(location.href);
  url.hash = p === 'ranking' ? 'ranking' : '';
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (p === 'jugar') juego.focus();
  else void cargar();
}

function elegirTabla(t: Tabla): void {
  tabla = t;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tabla]')) b.classList.toggle('activa', b.dataset.tabla === t);
  dificultadesEl.hidden = t !== 'arcade';
  explicaEl.textContent = EXPLICA[t];
  void cargar();
}

/** Llama a una función pública de Supabase (GET a /rest/v1/rpc). */
async function rpc<T>(fn: string, params: Record<string, string | number>): Promise<T[]> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}?${q}`, { headers: { apikey: SUPABASE_KEY } });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return (await r.json()) as T[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function aviso(texto: string, reintentar = false): void {
  const p = el('div', 'vacio');
  for (const [i, linea] of texto.split('\n').entries()) {
    if (i) p.appendChild(el('br'));
    p.appendChild(document.createTextNode(linea));
  }
  if (reintentar) {
    const b = el('button', undefined, 'REINTENTAR');
    b.type = 'button';
    b.addEventListener('click', () => void cargar());
    p.appendChild(el('br'));
    p.appendChild(b);
  }
  tablaEl.replaceChildren(p);
}

/** Tabla con encabezados; cada fila es una lista de celdas (texto o un elemento ya armado). */
function pintar(columnas: Array<{ titulo: string; num?: boolean }>, filas: Array<Array<string | HTMLElement>>): void {
  const t = el('table');
  const head = el('tr');
  head.appendChild(el('th', undefined, '#'));
  for (const c of columnas) head.appendChild(el('th', c.num ? 'num' : undefined, c.titulo));
  t.appendChild(el('thead')).appendChild(head);
  const body = t.appendChild(el('tbody'));
  filas.forEach((celdas, i) => {
    const tr = el('tr', ['oro', 'plata', 'bronce'][i]);
    tr.appendChild(el('td', 'puesto', String(i + 1)));
    celdas.forEach((c, j) => {
      const td = el('td', j === 0 ? 'apodo' : columnas[j].num ? 'num' : undefined);
      if (typeof c === 'string') td.textContent = c;
      else td.appendChild(c);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  tablaEl.replaceChildren(t);
}

/** 332.4 → "5:32.4". */
function tiempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Avatar redondo: la cara elegida o, si no eligió, la inicial del apodo. */
function avatarEl(id: string | null | undefined, nombre: string): HTMLElement {
  const span = el('span', 'avatar');
  if (id) {
    const img = el('img');
    img.src = urlAvatar(id);
    img.alt = '';
    span.appendChild(img);
  } else {
    span.textContent = (nombre.trim()[0] ?? '?').toUpperCase();
  }
  return span;
}

/** El jugador en el ranking: su avatar y su apodo. */
function jugador(f: { apodo: string; avatar?: string | null }): HTMLElement {
  const span = el('span', 'jugador');
  span.append(avatarEl(f.avatar, f.apodo), document.createTextNode(f.apodo));
  return span;
}

function luchador(id: string): HTMLElement {
  const span = el('span', 'luchador');
  if (LUCHADORES[id]) {
    const img = el('img');
    img.src = `luchadores/${id}/cara.webp`;
    img.alt = '';
    span.appendChild(img);
  }
  span.appendChild(document.createTextNode(LUCHADORES[id] ?? id));
  return span;
}

async function cargar(): Promise<void> {
  const n = ++pedido;
  aviso('CARGANDO…');
  try {
    if (tabla === 'arcade') {
      const filas = await rpc<FilaArcade>('ranking_arcade', { dif: dificultad, limite: 50 });
      if (n !== pedido) return;
      if (!filas.length) return aviso(`NADIE SE HA CORONADO EN ${DIFFICULTY_NAME[dificultad]} TODAVÍA.\n¡JUEGA ARCADE CON TU CUENTA Y SÉ EL PRIMERO!`);
      pintar(
        [{ titulo: 'JUGADOR' }, { titulo: 'LUCHADOR' }, { titulo: 'TIEMPO', num: true }, { titulo: 'CONTINUES', num: true }],
        filas.map((f) => [jugador(f), luchador(f.luchador), tiempo(Number(f.segundos)), String(f.continues)]),
      );
      return;
    }
    const filas = await rpc<FilaLiga>('ranking_liga', { orden: tabla, limite: 50 });
    if (n !== pedido) return;
    if (!filas.length) return aviso(SIN_PELEAS);
    if (tabla === 'puntos') {
      pintar(
        [{ titulo: 'JUGADOR' }, { titulo: 'PUNTOS', num: true }, { titulo: 'GANADAS', num: true }, { titulo: 'PERDIDAS', num: true }],
        filas.map((f) => [jugador(f), String(f.puntos), String(f.victorias), String(f.derrotas)]),
      );
    } else if (tabla === 'victorias') {
      pintar(
        [{ titulo: 'JUGADOR' }, { titulo: 'GANADAS', num: true }, { titulo: 'PERDIDAS', num: true }, { titulo: '% GANADAS', num: true }],
        filas.map((f) => [jugador(f), String(f.victorias), String(f.derrotas), `${Math.round((100 * f.victorias) / Math.max(1, f.victorias + f.derrotas))}%`]),
      );
    } else {
      pintar(
        [{ titulo: 'JUGADOR' }, { titulo: 'MEJOR RACHA', num: true }, { titulo: 'RACHA ACTUAL', num: true }],
        filas.map((f) => [jugador(f), String(f.mejor_racha), String(f.racha)]),
      );
    }
  } catch (err) {
    if (n !== pedido) return;
    console.warn('No se pudo cargar el ranking.', err);
    const status = (err as { status?: number }).status;
    aviso(status === 404 ? 'EL RANKING SE ESTÁ PREPARANDO. VUELVE PRONTO.' : 'NO SE PUDO CARGAR EL RANKING · REVISA TU INTERNET', status !== 404);
  }
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pestana]')) {
  b.addEventListener('click', () => mostrar(b.dataset.pestana as Pestana));
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tabla]')) {
  b.addEventListener('click', () => elegirTabla(b.dataset.tabla as Tabla));
}
for (const d of DIFFICULTIES) {
  const b = el('button', d === dificultad ? 'activa' : undefined, DIFFICULTY_NAME[d]);
  b.type = 'button';
  b.addEventListener('click', () => {
    dificultad = d;
    for (const x of dificultadesEl.children) x.classList.toggle('activa', x === b);
    void cargar();
  });
  dificultadesEl.appendChild(b);
}
explicaEl.textContent = EXPLICA[tabla];

// Cuenta: si entraste (en el juego), tu avatar y tu apodo arriba a la derecha, con su menú.
const cuentaEl = document.getElementById('cuenta')!;
const chip = cuentaEl.querySelector<HTMLButtonElement>('.chip')!;
const menuCuenta = cuentaEl.querySelector<HTMLElement>('.menu-cuenta')!;
function pintarCuenta(): void {
  cuentaEl.hidden = !conectado();
  if (cuentaEl.hidden) {
    menuCuenta.hidden = true;
    return;
  }
  const nombre = apodo() ?? 'SIN APODO';
  chip.querySelector('.avatar')!.replaceWith(avatarEl(avatar(), nombre));
  chip.querySelector('.apodo')!.textContent = nombre;
  chip.title = nombre;
  // Con el ranking abierto, se vuelve a pedir (por si cambió el avatar).
  if (!document.querySelector<HTMLElement>('#ranking')!.hidden) void cargar();
}
chip.addEventListener('click', (e) => {
  e.stopPropagation();
  menuCuenta.hidden = !menuCuenta.hidden;
});
document.addEventListener('click', () => (menuCuenta.hidden = true));
menuCuenta.addEventListener('click', (e) => {
  const accion = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-accion]')?.dataset.accion;
  if (accion === 'avatar') abrirSelectorDeAvatar({ actual: avatar(), alElegir: guardarAvatar, alCerrar: () => undefined });
  else if (accion === 'salir') void cerrarSesion();
});
alCambiarCuenta(pintarCuenta);
// Solo si ya hay una sesión guardada baja la librería de Supabase (si no, la web sigue liviana).
iniciarCuenta();

// Abajo: DONAR (solo si hay enlaces de Mercado Pago).
if (DONACIONES.length) {
  const caja = document.querySelector<HTMLElement>('.pie .donar')!;
  const botones = caja.querySelector<HTMLElement>('.botones-donar')!;
  for (const d of DONACIONES) {
    const a = el('a', 'boton-donar', d.texto);
    a.href = d.url;
    a.target = '_blank';
    a.rel = 'noopener';
    botones.appendChild(a);
  }
  caja.hidden = false;
}

// Arriba: cuántos jugadores hay en EN LÍNEA (el lobby del juego, mirado sin contarse) y las visitas
// de la web (supabase/migraciones/005_visitas.sql: una por navegador por día). En el celular, arriba no
// cabe: se ve en el ranking.
const enVivoEl = document.querySelector<HTMLElement>('.cabecera .en-vivo')!;
const jugadoresEl = enVivoEl.querySelector<HTMLElement>('.jugadores')!;
const visitasEl = enVivoEl.querySelector<HTMLElement>('.visitas')!;
const estadisticasEl = document.querySelector<HTMLElement>('#ranking .estadisticas')!;
const CLAVE_VISITA = 'torneoDeCell.visita';
let jugadores: number | null = null;
let visitas: { hoy: number; total: number } | null = null;
const numero = (n: number): string => n.toLocaleString('es-CL');

function pintarEnVivo(): void {
  const enLinea = jugadores === null ? '' : `${numero(jugadores)} ${jugadores === 1 ? 'JUGADOR' : 'JUGADORES'} EN LÍNEA`;
  const vistas = visitas ? `${numero(visitas.total)} ${visitas.total === 1 ? 'VISITA' : 'VISITAS'}` : '';
  jugadoresEl.querySelector('.texto')!.textContent = enLinea;
  jugadoresEl.hidden = !enLinea;
  visitasEl.textContent = vistas;
  visitasEl.hidden = !vistas;
  enVivoEl.hidden = !enLinea && !vistas;
  const hoy = visitas ? `${vistas} (${numero(visitas.hoy)} HOY)` : '';
  estadisticasEl.textContent = [enLinea && `● ${enLinea}`, hoy].filter(Boolean).join('  ·  ');
  estadisticasEl.hidden = !estadisticasEl.textContent;
}

/** Lee las visitas; la primera vez del día en este navegador, además suma una. */
async function cargarVisitas(): Promise<void> {
  const hoy = new Date().toLocaleDateString('sv-SE');
  let contar = false;
  try {
    contar = localStorage.getItem(CLAVE_VISITA) !== hoy;
  } catch {
    // Sin almacenamiento (modo privado estricto): solo se leen.
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/visitas_web`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contar }),
    });
    // Mientras no se pegue la migración 005, la función no existe: no se muestran.
    if (!r.ok) return;
    const [f] = (await r.json()) as Array<{ hoy: number; total: number }>;
    if (!f) return;
    if (contar) {
      try {
        localStorage.setItem(CLAVE_VISITA, hoy);
      } catch {
        // Igual se muestra.
      }
    }
    visitas = { hoy: Number(f.hoy), total: Number(f.total) };
    pintarEnVivo();
  } catch {
    // Sin internet: no se muestran.
  }
}

void cargarVisitas();
setInterval(() => void cargarVisitas(), 60_000);
// Los jugadores en línea: la librería de Supabase baja un poco después, para no atrasar la página.
setTimeout(() => {
  mirarLobby((n) => {
    jugadores = n;
    pintarEnVivo();
  });
}, 1500);

// #ranking en la dirección abre directo el ranking (para compartirlo).
if (location.hash === '#ranking') mostrar('ranking');
