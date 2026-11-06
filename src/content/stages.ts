// Biblioteca de escenarios para la pantalla "ELIGE ESCENARIO". La lista viene
// de public/escenarios/escenarios.json, con rutas relativas a ese archivo:
//   [{ "id": "rene", "nombre": "BATALLA DE RAP", "luchador": "rene",
//      "json": "rene/escenario.json", "miniatura": "rene/miniatura.webp" }]
// Los escenarios se cargan recién antes de su pelea (ver contenido.ts) y quedan
// en caché. El fondo del título y los menús tiene su propio archivo
// (public/torneo/escenario.json, ver scenes/titleArena.ts), fuera de la lista.
// Con "soloUltra": true el escenario no aparece en las listas: solo lo usa un ultra
// como fondo (cinematic.backdrop), por ejemplo los techos de Pudahuel del Samurai.

import type { Texture } from 'pixi.js';
import { StageView } from '../render/stage';
import { calidad } from './calidad';
import { bajarJson, bajarTextura, type Progreso } from './descargas';

/** Una entrada de la lista, con las rutas ya resueltas a URL absolutas. */
export interface StageEntry {
  id: string;
  nombre: string;
  /** Luchador dueño del escenario (id o nombre), si tiene. */
  luchador?: string;
  /** JSON del escenario (StageDef). */
  json: string;
  /** Miniatura 16:9 (~480x270). */
  miniatura?: string;
  /** Dónde queda en el mapa del ARCADE (latitud y longitud) y cómo se llama el lugar. */
  lugar?: StagePlace;
}

export interface StagePlace {
  nombre: string;
  lat: number;
  lon: number;
}

interface RawEntry {
  id?: string;
  nombre?: string;
  luchador?: string;
  json?: string;
  miniatura?: string;
  lugar?: StagePlace;
  soloUltra?: boolean;
}

export class StageLibrary {
  readonly entries: readonly StageEntry[];
  /** Todos, con los que solo usa un ultra (no salen en `entries`). */
  private all: readonly StageEntry[];
  private stages = new Map<string, Promise<StageView>>();
  private ready = new Set<string>();
  private thumbs = new Map<string, Promise<Texture | null>>();

  constructor(entries: StageEntry[], soloUltra: StageEntry[] = []) {
    this.entries = entries;
    this.all = [...entries, ...soloUltra];
  }

  /** Primer escenario de la lista: el de las peleas de prueba. */
  get first(): StageEntry {
    return this.entries[0];
  }

  /** Lee la lista (sin escenarios no se puede pelear: si falta o viene vacía, falla). */
  static async load(indexUrl: string, prog?: Progreso): Promise<StageLibrary> {
    const entries: StageEntry[] = [];
    const ocultos: StageEntry[] = [];
    const base = new URL(indexUrl, location.href);
    const abs = (p?: string) => (p ? new URL(p, base).href : undefined);
    const list = await bajarJson<unknown>(indexUrl, prog);
    for (const e of Array.isArray(list) ? (list as RawEntry[]) : []) {
      if (!e?.id || !e.json || entries.some((x) => x.id === e.id) || ocultos.some((x) => x.id === e.id)) continue;
      (e.soloUltra ? ocultos : entries).push({ id: e.id, nombre: e.nombre ?? e.id, luchador: e.luchador, json: abs(e.json)!, miniatura: abs(e.miniatura), lugar: e.lugar });
    }
    if (!entries.length) throw new Error(`No hay escenarios en ${indexUrl}`);
    return new StageLibrary(entries, ocultos);
  }

  find(id: string): StageEntry | undefined {
    return this.all.find((e) => e.id === id);
  }

  /** El escenario listo para usar (se carga la primera vez que se pide; `prog` anota lo que se baja). */
  get(id: string, prog?: Progreso): Promise<StageView> {
    let p = this.stages.get(id);
    if (!p) {
      const json = this.find(id)?.json;
      if (!json) return Promise.reject(new Error(`Escenario desconocido: ${id}`));
      p = StageView.load(json, calidad(), prog);
      this.stages.set(id, p);
      p.then(() => this.ready.add(id), () => undefined);
      // Si falla, se puede volver a intentar.
      p.catch(() => this.stages.delete(id));
    }
    return p;
  }

  /** ¿Ya está cargado (sin esperar)? */
  isReady(id: string): boolean {
    return this.ready.has(id);
  }

  /** Suelta los escenarios cargados que no están en `keep` (memoria de video de los celulares). */
  evict(keep: Iterable<string>): void {
    const k = new Set(keep);
    for (const id of [...this.ready]) {
      if (k.has(id)) continue;
      const p = this.stages.get(id);
      this.stages.delete(id);
      this.ready.delete(id);
      void p?.then((st) => st.destroy());
    }
  }

  /** Miniatura para la pantalla de selección (null si no tiene). */
  thumbnail(id: string): Promise<Texture | null> {
    let p = this.thumbs.get(id);
    if (!p) {
      const url = this.find(id)?.miniatura;
      p = url ? bajarTextura(url, { mipmaps: true }).catch(() => null) : Promise.resolve(null);
      this.thumbs.set(id, p);
    }
    return p;
  }
}
