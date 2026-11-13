// Qué se baja y cuándo. Al abrir el juego solo se baja lo de los menús (ver main.ts); lo de
// cada pelea (las texturas de pelea de sus luchadores, sus voces, los efectos y el escenario)
// se baja antes de empezarla, con barra de carga, y queda guardado para las siguientes. Para
// no llenar la memoria de video (lo que trababa a los celulares), lo que lleva rato sin usarse
// se suelta al empezar una pelea.

import type { Renderer, Texture, TextureSource } from 'pixi.js';
import type { Sfx } from '../audio/sfx';
import { calentarFiltros, subirTexturas } from '../render/calentar';
import type { StageView } from '../render/stage';
import { calidad } from './calidad';
import { loadSheets, Progreso } from './descargas';
import { validateFighter, type FighterAsset } from './loadFighter';
import type { StageLibrary } from './stages';
import { loadEffects } from './vfx';

/** Luchadores con texturas de pelea en memoria (como mínimo, los de la pelea en curso). */
const MAX_FIGHTERS = { hd: 4, liviano: 2 };
/** Escenarios en memoria (como mínimo, el de la pelea y los fondos de sus ultras). */
const MAX_STAGES = { hd: 3, liviano: 1 };

/** Lo que necesita una pelea: índices del plantel y escenario (id de la lista). */
export interface FightNeeds {
  fighters: number[];
  stage?: string | null;
}

export class Contenido {
  private sheets = new Map<FighterAsset, Promise<{ destroy(base?: boolean): void; textures: Record<string, Texture> }[]>>();
  private loaded = new Set<FighterAsset>();
  private effects: Promise<void> | null = null;
  private effectsReady = false;
  private voices = new Map<string, Promise<number>>();
  /** Orden de uso, del más antiguo al más reciente. */
  private recentFighters: FighterAsset[] = [];
  private recentStages: string[] = [];
  /** Las imágenes de los efectos (compartidas). */
  private effectSources: TextureSource[] = [];
  /** Quien dibuja (main.ts): con él, las texturas de cada pelea se suben antes de empezarla. */
  renderer: Renderer | null = null;

  constructor(
    private roster: FighterAsset[],
    /** Las texturas que usa el juego (game.assets.textures): aquí se agregan y se quitan. */
    private textures: Record<string, Texture>,
    private sfx: Sfx,
    private stages: StageLibrary,
  ) {}

  private fightersOf(needs: FightNeeds): FighterAsset[] {
    return [...new Set(needs.fighters.map((i) => this.roster[i]).filter((f): f is FighterAsset => !!f))];
  }

  /** Escenarios de la pelea: el elegido y los fondos de reemplazo de los ultras de sus luchadores. */
  private stagesOf(needs: FightNeeds): string[] {
    const ids = new Set<string>();
    if (needs.stage && this.stages.find(needs.stage)) ids.add(needs.stage);
    for (const f of this.fightersOf(needs)) {
      for (const mv of Object.values(f.def.moves)) {
        const id = mv.cinematic?.backdrop;
        if (id && this.stages.find(id)) ids.add(id);
      }
    }
    return [...ids];
  }

  /** ¿Está todo listo para esta pelea (sin bajar nada)? */
  isReady(needs: FightNeeds): boolean {
    return (
      this.effectsReady &&
      this.fightersOf(needs).every((f) => this.loaded.has(f) || !f.fightAtlases.length) &&
      this.stagesOf(needs).every((id) => this.stages.isReady(id))
    );
  }

  /** Baja lo que falte para esta pelea; devuelve el escenario elegido (null si no se pidió). */
  async prepare(needs: FightNeeds, prog = new Progreso()): Promise<StageView | null> {
    const fighters = this.fightersOf(needs);
    this.effects ??= loadEffects(calidad(), prog).then((t) => {
      Object.assign(this.textures, t);
      this.effectSources = [...new Set(Object.values(t).map((x) => x.source))];
      this.effectsReady = true;
    });
    const stageIds = this.stagesOf(needs);
    const stageJobs = stageIds.map((id) => this.stages.get(id, prog));
    // Los fondos de los ultras son opcionales: si fallan, el ultra se ve sobre el escenario.
    stageJobs.forEach((p, i) => {
      if (stageIds[i] !== needs.stage) p.catch(() => undefined);
    });
    await Promise.all([this.effects, ...fighters.map((f) => this.loadFight(f, prog)), ...fighters.map((f) => this.loadVoices(f, prog))]);
    // En desarrollo: avisa si a un luchador le falta algo (ya con todas sus texturas y los efectos).
    if (import.meta.env.DEV) {
      for (const f of fighters) {
        const problems = validateFighter(f.def, this.textures);
        if (problems.length) console.warn(`Luchador "${f.def.id}":\n- ${problems.join('\n- ')}`);
      }
    }
    const own = needs.stage ? stageIds.indexOf(needs.stage) : -1;
    const settled = await Promise.allSettled(stageJobs);
    const stage = own < 0 ? null : await stageJobs[own];
    await this.calentar(fighters, settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
    return stage;
  }

  /** Deja las texturas de la pelea en la tarjeta de video y los filtros compilados (sin tirones en plena pelea). */
  private async calentar(fighters: FighterAsset[], stages: StageView[]): Promise<void> {
    const r = this.renderer;
    if (!r) return;
    try {
      calentarFiltros(r);
      const sources: TextureSource[] = [...this.effectSources];
      for (const f of fighters) {
        for (const s of (await this.sheets.get(f)) ?? []) sources.push(...new Set(Object.values(s.textures).map((t) => t.source)));
      }
      for (const st of stages) sources.push(...st.fuentes);
      await subirTexturas(r, sources);
    } catch (err) {
      // No es grave: se suben solas al dibujarse.
      console.warn('No se pudieron preparar las texturas.', err);
    }
  }

  private loadFight(f: FighterAsset, prog: Progreso): Promise<unknown> {
    let p = this.sheets.get(f);
    if (!p) {
      p = loadSheets(f.fightAtlases, f.texOptions, prog);
      this.sheets.set(f, p);
      p.then(
        (sheets) => {
          for (const s of sheets) {
            Object.assign(f.textures, s.textures);
            Object.assign(this.textures, s.textures);
          }
          this.loaded.add(f);
        },
        () => this.sheets.delete(f),
      );
    }
    return p;
  }

  private loadVoices(f: FighterAsset, prog: Progreso): Promise<number> {
    let p = this.voices.get(f.def.id);
    if (!p) {
      p = this.sfx.loadManifest(`${f.folder}/voces/voces.json`, `${f.def.id}/`, prog);
      this.voices.set(f.def.id, p);
    }
    return p;
  }

  /**
   * Al empezar una pelea (cuando las escenas anteriores ya no dibujan nada): suelta las texturas
   * de pelea y los escenarios que llevan más rato sin usarse, dejando siempre los de esta pelea.
   */
  trim(needs: FightNeeds): void {
    const q = calidad();
    const fighters = this.fightersOf(needs);
    this.recentFighters = [...this.recentFighters.filter((f) => !fighters.includes(f)), ...fighters];
    const loaded = this.recentFighters.filter((f) => this.loaded.has(f));
    const extra = loaded.length - Math.max(MAX_FIGHTERS[q], fighters.length);
    for (const f of loaded.filter((x) => !fighters.includes(x)).slice(0, Math.max(0, extra))) this.unload(f);

    const stageIds = this.stagesOf(needs);
    this.recentStages = [...this.recentStages.filter((id) => !stageIds.includes(id)), ...stageIds];
    const keep = this.recentStages.slice(-Math.max(MAX_STAGES[q], stageIds.length));
    this.stages.evict([...keep, ...stageIds]);
  }

  private unload(f: FighterAsset): void {
    const p = this.sheets.get(f);
    this.sheets.delete(f);
    this.loaded.delete(f);
    void p?.then((sheets) => {
      for (const s of sheets) {
        for (const name of Object.keys(s.textures)) {
          delete f.textures[name];
          delete this.textures[name];
        }
        s.destroy(true);
      }
    });
  }
}
