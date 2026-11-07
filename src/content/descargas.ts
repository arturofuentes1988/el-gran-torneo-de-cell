// Descargas con progreso en bytes (para las barras de carga). Cada archivo se baja con
// fetch leyendo el cuerpo de a pedazos; el total sale de public/tamanos.json (lo arma
// herramientas/tamanos.mjs antes de cada build) o, si falta, del Content-Length.

import { Assets, ImageSource, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';

/** Lo que va bajado de un grupo de archivos. */
export class Progreso {
  private archivos = new Map<string, { total: number; cargado: number }>();

  get cargado(): number {
    let n = 0;
    for (const a of this.archivos.values()) n += a.cargado;
    return n;
  }

  get total(): number {
    let n = 0;
    for (const a of this.archivos.values()) n += Math.max(a.total, a.cargado);
    return n;
  }

  /** De 0 a 1 (1 si no hay nada que bajar). */
  get fraccion(): number {
    const t = this.total;
    return t > 0 ? Math.min(1, this.cargado / t) : 1;
  }

  /** "3,2 / 9,8 MB" */
  get texto(): string {
    return `${mb(this.cargado)} / ${mb(this.total)} MB`;
  }

  /** Anota un archivo por bajar (con su tamaño esperado) antes de pedirlo, para que el total no salte. */
  esperar(url: string): void {
    const k = clave(url);
    if (!this.archivos.has(k)) this.archivos.set(k, { total: tamano(url), cargado: 0 });
  }

  avanzar(url: string, cargado: number, total: number): void {
    const a = this.archivos.get(clave(url)) ?? { total: 0, cargado: 0 };
    a.cargado = cargado;
    if (total > 0 && a.total === 0) a.total = total;
    this.archivos.set(clave(url), a);
  }

  terminar(url: string): void {
    const a = this.archivos.get(clave(url));
    if (a) a.total = a.cargado;
  }
}

const mb = (b: number): string => (b / 1048576).toFixed(1).replace('.', ',');

/** Carpeta base del juego (en GitHub Pages, /el-gran-torneo-de-cell/). */
const BASE = new URL(import.meta.env.BASE_URL, location.href).pathname;
let tamanos: Record<string, number> = {};

/** Ruta relativa a public/ ("luchadores/rene/hd/menu-0.webp"). */
function clave(url: string): string {
  const p = decodeURI(new URL(url, location.href).pathname);
  return p.startsWith(BASE) ? p.slice(BASE.length) : p;
}

/** Tamaño esperado de un archivo según tamanos.json (0 si no está). */
export function tamano(url: string): number {
  return tamanos[clave(url)] ?? 0;
}

/** Lee la lista de tamaños. Sin ella, las barras igual avanzan con lo que diga cada respuesta. */
export async function cargarTamanos(): Promise<void> {
  try {
    const res = await fetch('tamanos.json', { cache: 'no-cache' });
    if (res.ok) tamanos = (await res.json()) as Record<string, number>;
  } catch {
    tamanos = {};
  }
}

/**
 * Baja un archivo entero anotando el avance. `cache: 'no-cache'` pregunta al servidor si cambió antes de usar la copia
 * guardada (si no cambió, responde sin volver a mandarlo).
 */
export async function bajar(url: string, prog?: Progreso, cache?: RequestCache): Promise<Blob> {
  prog?.esperar(url);
  const res = await fetch(url, cache ? { cache } : undefined);
  if (!res.ok) throw new Error(`No se pudo bajar ${url} (${res.status})`);
  if (!prog || !res.body) {
    const blob = await res.blob();
    prog?.terminar(url);
    return blob;
  }
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const partes: BlobPart[] = [];
  let cargado = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    partes.push(value);
    cargado += value.byteLength;
    prog.avanzar(url, cargado, total);
  }
  prog.terminar(url);
  return new Blob(partes, { type: res.headers.get('content-type') ?? '' });
}

/**
 * Las definiciones (escenarios, luchadores) siempre se revisan con el servidor: GitHub Pages deja guardar 10 minutos,
 * y una definición vieja con imágenes o videos nuevos descuadra todo (un video a otra escala parte el fondo).
 */
export async function bajarJson<T>(url: string, prog?: Progreso): Promise<T> {
  return JSON.parse(await (await bajar(url, prog, 'no-cache')).text()) as T;
}

export interface OpcionesTextura {
  scaleMode?: 'linear' | 'nearest';
  mipmaps?: boolean;
}

/** Imagen → textura (decodificada fuera del hilo principal con createImageBitmap). */
export async function bajarTextura(url: string, op: OpcionesTextura = {}, prog?: Progreso): Promise<Texture> {
  const blob = await bajar(url, prog);
  const bitmap = await createImageBitmap(blob);
  const source = new ImageSource({
    resource: bitmap,
    alphaMode: 'premultiply-alpha-on-upload',
    scaleMode: op.scaleMode ?? 'linear',
    autoGenerateMipmaps: op.mipmaps ?? false,
  });
  return new Texture({ source, label: url });
}

/** Atlas de Pixi (JSON + imagen). Respeta "scale" del JSON: los atlas livianos se dibujan del mismo tamaño. */
export async function bajarAtlas(jsonUrl: string, op: OpcionesTextura = {}, prog?: Progreso): Promise<Spritesheet> {
  const data = await bajarJson<SpritesheetData>(jsonUrl, prog);
  const imagen = new URL(data.meta.image ?? '', new URL(jsonUrl, location.href)).href;
  const tex = await bajarTextura(imagen, op, prog);
  const sheet = new Spritesheet(tex, data);
  await sheet.parse();
  return sheet;
}

/** Anota de antemano un atlas (su JSON y su imagen) para que el total de la barra no salte. */
export function expectAtlas(prog: Progreso, jsonUrl: string): void {
  prog.esperar(jsonUrl);
  prog.esperar(jsonUrl.replace(/\.json$/, '.webp'));
}

/** Varios atlas a la vez. */
export async function loadSheets(urls: string[], op: OpcionesTextura, prog?: Progreso): Promise<Spritesheet[]> {
  if (prog) for (const u of urls) expectAtlas(prog, u);
  return Promise.all(urls.map((u) => bajarAtlas(u, op, prog)));
}

/**
 * Video en loop, mudo. Se baja entero primero (así cuenta en la barra y no se corta después).
 * Si el navegador no lo deja preparar (ahorro de batería en iPhone), a los 8 s se sigue sin él.
 */
export async function bajarVideo(url: string, prog?: Progreso): Promise<Texture | null> {
  const blob = await bajar(url, prog);
  const src = URL.createObjectURL(blob);
  const listo = Assets.load<Texture>({
    src,
    parser: 'loadVideo',
    data: { mime: 'video/mp4', autoPlay: true, loop: true, muted: true, playsinline: true, preload: true, scaleMode: 'linear', autoGenerateMipmaps: false },
  });
  const plazo = new Promise<null>((r) => setTimeout(() => r(null), 8000));
  const tex = await Promise.race([listo, plazo]);
  if (!tex) console.warn(`El video ${url} no partió; queda la imagen fija.`);
  return tex;
}
