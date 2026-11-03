import { calidad } from '../content/calidad';
import type { Progreso } from '../content/descargas';
import { StageView } from '../render/stage';

/** Fondo del título y de los menús: el ring del torneo de artes marciales (public/torneo/, ilustración con video en loop). */
let arenaLoad: Promise<StageView> | null = null;
export function loadTitleArena(prog?: Progreso): Promise<StageView> {
  arenaLoad ??= StageView.load('torneo/escenario.json', calidad(), prog);
  arenaLoad.catch(() => (arenaLoad = null));
  return arenaLoad;
}
