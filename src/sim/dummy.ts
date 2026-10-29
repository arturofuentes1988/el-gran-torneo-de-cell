// Muñeco del modo práctica: se queda con la guardia baja, agachado, salta,
// bloquea o pelea como la CPU. Genera entradas cuadro a cuadro como un jugador.

import { mirrorDir, type FrameInput } from '../input/buffer';
import { CpuController } from './ai';
import type { DifficultyId } from './difficulty';
import { ACTIONABLE, type Fighter } from './fighter';
import type { Match } from './match';

export type DummyMode = 'guardiaBaja' | 'agachado' | 'salta' | 'bloquea' | 'bloqueaTras' | 'cpu';

export const DUMMY_MODES: readonly DummyMode[] = ['guardiaBaja', 'agachado', 'salta', 'bloquea', 'bloqueaTras', 'cpu'];

export const DUMMY_NAME: Record<DummyMode, string> = {
  guardiaBaja: 'GUARDIA BAJA',
  agachado: 'AGACHADO',
  salta: 'SALTA',
  bloquea: 'BLOQUEA TODO',
  bloqueaTras: 'BLOQUEA TRAS EL 1ER GOLPE',
  cpu: 'CPU',
};

/** Cuadros que el muñeco sigue alerta (bloqueando) después del último golpe recibido. */
const ALERT_FRAMES = 60;

export class PracticeDummy {
  mode: DummyMode = 'guardiaBaja';
  private cpu: CpuController;
  private jumpHold = 0;
  private alert = 0;

  constructor(readonly side: 0 | 1, private seed: number, difficulty: DifficultyId) {
    this.cpu = new CpuController(side, seed, difficulty);
  }

  setMode(mode: DummyMode, difficulty: DifficultyId): void {
    this.mode = mode;
    this.jumpHold = 0;
    this.alert = 0;
    // CPU nueva al elegirla, para que no arrastre decisiones viejas.
    if (mode === 'cpu') this.cpu = new CpuController(this.side, this.seed + 101, difficulty);
  }

  update(m: Match): FrameInput {
    const me = m.fighters[this.side];
    const opp = m.opponent(me);
    if (this.mode === 'cpu') return this.cpu.update(m);
    let rel = 5;
    switch (this.mode) {
      case 'guardiaBaja':
        // Brazos abajo, indefenso: nunca bloquea (la pose relajada la pone la escena).
        break;
      case 'agachado':
        rel = 2;
        break;
      case 'salta':
        // Salta en el lugar una y otra vez: mantiene arriba unos cuadros al despegar.
        if (me.grounded && ACTIONABLE.has(me.state) && this.jumpHold === 0) this.jumpHold = 8;
        if (this.jumpHold > 0) {
          this.jumpHold--;
          rel = 8;
        }
        break;
      case 'bloquea':
        rel = this.blockDir(m, me, opp) ?? 5;
        break;
      case 'bloqueaTras':
        // Recibe el primer golpe; desde ahí bloquea todo lo que pueda hasta que lo dejan tranquilo.
        if (me.comboHits > 0 || me.state === 'hitstun' || me.state === 'airHit' || me.state === 'knockdown') this.alert = ALERT_FRAMES;
        else if (this.alert > 0 && !m.threatens(opp, me)) this.alert--;
        if (this.alert > 0) rel = this.blockDir(m, me, opp) ?? 4;
        break;
    }
    const dir = me.facing === 1 ? rel : mirrorDir(rel);
    return { dir, held: 0, pressed: 0 };
  }

  /**
   * Dirección relativa para bloquear lo que viene: agachado contra golpes
   * bajos, parado contra el resto. Si el rival quedó detrás (salto cruzado),
   * "atrás" es hacia el otro lado. null si no hay amenaza.
   */
  private blockDir(m: Match, me: Fighter, opp: Fighter): number | null {
    if (!m.threatens(opp, me)) return null;
    const low = !!opp.move && opp.move.hit.guard === 'low' && opp.grounded;
    const behind = Math.sign(opp.x - me.x) !== me.facing;
    if (behind) return low ? 3 : 6;
    return low ? 1 : 4;
  }
}
