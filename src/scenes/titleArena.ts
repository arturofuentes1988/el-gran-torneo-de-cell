import { StageView } from '../render/stage';

/** Fondo del título y de los menús: el ring del torneo de artes marciales (public/torneo/, ilustración con video en loop). */
let arenaLoad: Promise<StageView> | null = null;
export function loadTitleArena(): Promise<StageView> {
  arenaLoad ??= StageView.load('torneo/escenario.json');
  return arenaLoad;
}
