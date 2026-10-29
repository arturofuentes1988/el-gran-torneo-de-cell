// Biblioteca de escenarios para la pantalla "ELIGE ESCENARIO". La lista viene
// de public/escenarios/escenarios.json, con rutas relativas a ese archivo:
//   [{ "id": "rene", "nombre": "BATALLA DE RAP", "luchador": "rene",
//      "json": "rene/escenario.json", "miniatura": "rene/miniatura.webp" }]
// Los escenarios HD se cargan recién al elegirlos y quedan en caché. El
// escenario procedural de prueba solo aparece si la lista falta o está vacía
// (para que igual se pueda pelear). El fondo de la pantalla de título tiene su
// propio archivo (public/titulo/escenario.json), fuera de la lista.

import { Assets, Rectangle, type Renderer, type Texture } from 'pixi.js';
import { STAGE_W, VIEW_H, VIEW_W } from '../config';
import { StageView } from '../render/stage';

/** Una entrada de la lista, con las rutas ya resueltas a URL absolutas. */
export interface StageEntry {
  id: string;
  nombre: string;
  /** Luchador dueño del escenario (id o nombre), si tiene. */
  luchador?: string;
  /** JSON del escenario HD (StageDef). Sin esto es el escenario de prueba procedural. */
  json?: string;
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

/** Id del escenario de prueba procedural (respaldo si no hay escenarios HD; también ?escenario=prueba). */
export const BUILTIN_STAGE = 'prueba';

interface RawEntry {
  id?: string;
  nombre?: string;
  luchador?: string;
  json?: string;
  miniatura?: string;
  lugar?: StagePlace;
}

export class StageLibrary {
  readonly entries: readonly StageEntry[];
  private stages = new Map<string, Promise<StageView>>();
  private thumbs = new Map<string, Promise<Texture | null>>();

  constructor(entries: StageEntry[], builtin: StageView) {
    this.entries = entries.length ? entries : [{ id: BUILTIN_STAGE, nombre: 'ESCENARIO DE PRUEBA' }];
    this.stages.set(BUILTIN_STAGE, Promise.resolve(builtin));
  }

  /** Primer escenario de la lista: el de las peleas de prueba y los menús antes de elegir. */
  get first(): StageEntry {
    return this.entries[0];
  }

  /** Lee la lista. Si falta o está mal escrita, queda solo el escenario de prueba. */
  static async load(indexUrl: string, builtin: StageView): Promise<StageLibrary> {
    const entries: StageEntry[] = [];
    try {
      const res = await fetch(indexUrl);
      if (res.ok) {
        const base = new URL(indexUrl, location.href);
        const abs = (p?: string) => (p ? new URL(p, base).href : undefined);
        const list = (await res.json()) as unknown;
        for (const e of Array.isArray(list) ? (list as RawEntry[]) : []) {
          if (!e?.id || !e.json || e.id === BUILTIN_STAGE || entries.some((x) => x.id === e.id)) continue;
          entries.push({ id: e.id, nombre: e.nombre ?? e.id, luchador: e.luchador, json: abs(e.json), miniatura: abs(e.miniatura), lugar: e.lugar });
        }
      }
    } catch (err) {
      console.warn('No se pudo leer la lista de escenarios; queda solo el de prueba.', err);
    }
    return new StageLibrary(entries, builtin);
  }

  find(id: string): StageEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** El escenario listo para usar (se carga la primera vez que se pide). */
  get(id: string): Promise<StageView> {
    let p = this.stages.get(id);
    if (!p) {
      const json = this.find(id)?.json;
      if (!json) return Promise.reject(new Error(`Escenario desconocido: ${id}`));
      p = StageView.load(json);
      this.stages.set(id, p);
      // Si falla, se puede volver a intentar.
      p.catch(() => this.stages.delete(id));
    }
    return p;
  }

  /** Miniatura para la pantalla de selección (null si no tiene). */
  thumbnail(id: string, renderer: Renderer): Promise<Texture | null> {
    let p = this.thumbs.get(id);
    if (!p) {
      const entry = this.find(id);
      if (id === BUILTIN_STAGE) p = this.get(id).then((stage) => renderThumb(stage, renderer));
      else if (entry?.miniatura) p = Assets.load<Texture>(entry.miniatura).catch(() => null);
      else p = Promise.resolve(null);
      this.thumbs.set(id, p);
    }
    return p;
  }
}

/** Dibuja el escenario con la cámara al centro (miniatura del escenario de prueba). */
function renderThumb(stage: StageView, renderer: Renderer): Texture {
  stage.update((STAGE_W - VIEW_W) / 2, 0);
  return renderer.generateTexture({ target: stage.container, frame: new Rectangle(0, 0, VIEW_W, VIEW_H), resolution: 2 });
}
