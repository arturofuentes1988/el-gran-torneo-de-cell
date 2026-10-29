import { B_ASSIST, B_HK, B_HP, B_LK, B_LP, B_POWER_KEY, B_ROLL_KEY, B_TAG, B_TAUNT, BTN_BIT, CHARGE_FRAMES, mirrorDir, type FrameInput, HOLD_FRAMES } from '../input/buffer';
import type { DifficultyId } from './difficulty';
import { ACTIONABLE, MAX_DOBLES, isStrong, type Fighter, type StateName } from './fighter';
import type { Match, Projectile } from './match';
import { Rng } from './rng';
import type { Btn, MotionId, MoveDef } from './types';

export interface AiParams {
  /** Cuadros que tarda en reaccionar a lo que viene de lejos (saltos, especiales lentos, proyectiles). */
  reaction: number;
  /** Probabilidad de bloquear un golpe o un proyectil (de cerca: ya tenía la guardia puesta). */
  block: number;
  /** Probabilidad de acertar la altura del bloqueo (bajo / alto). */
  blockCorrect: number;
  /** Probabilidad por cuadro de antiaéreo cuando el rival le salta encima. */
  antiAir: number;
  /** Cuánto usa especiales (multiplica sus pesos). */
  specials: number;
  /** Cuánto usa cadenas y combos de normales a especial. */
  combos: number;
  /** Cuánto usa el lanzador con combo aéreo. */
  launcher: number;
  /** Probabilidad de tirar el súper cuando tiene barra y está a distancia. */
  superUse: number;
  /** Probabilidad de activar el Modo Poder cuando tiene barra. */
  powerUse: number;
  /** Probabilidad de rodar para atravesar un proyectil. */
  roll: number;
  /** Probabilidad de contraatacar desde el bloqueo (si tiene barra). */
  guardCancel: number;
  /** Probabilidad de castigar después de bloquear o cuando el rival falla un golpe cerca. */
  punish: number;
  /** Cuadros de pausa entre decisiones (mínimo, máximo). */
  idle: [number, number];
  /** Probabilidad de equivocarse en una decisión (botón al azar, quedarse quieto). */
  mistake: number;
  /** Agresividad: multiplica los pesos de acercarse y atacar. */
  aggression: number;
  /** 2 VS 2: probabilidad de llamar a la ayuda en cada decisión (si está lista). */
  assist: number;
  /** Probabilidad de intentar un COMBO BREAKER contra cada DOBLE (acierta la fuerza ~70% de las veces). */
  breaker: number;
}

/** Parámetros de cada nivel de dificultad. Todo determinista: solo cambian probabilidades y tiempos. */
export const AI_LEVELS: Record<DifficultyId, AiParams> = {
  // Lento, bloquea poco, casi no combea: le gana un principiante.
  facil: {
    reaction: 22, block: 0.22, blockCorrect: 0.55, antiAir: 0.008,
    specials: 0.45, combos: 0.12, launcher: 0, superUse: 0.03, powerUse: 0,
    roll: 0.02, guardCancel: 0, punish: 0.05, idle: [18, 42], mistake: 0.2, aggression: 0.65, assist: 0.04, breaker: 0.05,
  },
  normal: {
    reaction: 11, block: 0.52, blockCorrect: 0.8, antiAir: 0.045,
    specials: 1, combos: 0.6, launcher: 0.5, superUse: 0.12, powerUse: 0.04,
    roll: 0.15, guardCancel: 0.12, punish: 0.3, idle: [6, 18], mistake: 0.06, aggression: 1, assist: 0.1, breaker: 0.15,
  },
  dificil: {
    reaction: 5, block: 0.78, blockCorrect: 0.93, antiAir: 0.1,
    specials: 1.2, combos: 1, launcher: 1, superUse: 0.2, powerUse: 0.08,
    roll: 0.3, guardCancel: 0.28, punish: 0.62, idle: [3, 10], mistake: 0.02, aggression: 1.15, assist: 0.16, breaker: 0.3,
  },
  // Reacciona casi al instante, bloquea casi todo y castiga.
  muyDificil: {
    reaction: 2, block: 0.95, blockCorrect: 0.98, antiAir: 0.2,
    specials: 1.3, combos: 1.3, launcher: 1.4, superUse: 0.3, powerUse: 0.12,
    roll: 0.45, guardCancel: 0.45, punish: 0.9, idle: [1, 6], mistake: 0, aggression: 1.3, assist: 0.22, breaker: 0.45,
  },
};

/** Más cerca que esto un golpe sale antes de lo que alguien alcanza a reaccionar. */
const CLOSE = 100;

/** Un cuadro de entrada de la CPU, en dirección RELATIVA (6 = adelante). */
interface Step {
  dir: number;
  press: number;
  /** Botones que siguen apretados en este cuadro (mantener y soltar). */
  hold?: number;
}

const s = (dir: number, press = 0, hold = 0): Step => ({ dir, press, hold });
const repeat = (step: Step, n: number): Step[] => Array.from({ length: n }, () => ({ ...step }));

/** Entradas (direcciones relativas) de un comando, con el botón en el último cuadro. */
function motionSteps(motion: MotionId | undefined, press: number): Step[] {
  switch (motion) {
    case 'qcf': return [s(2), s(2), s(3), s(3), s(6, press)];
    case 'qcb': return [s(2), s(2), s(1), s(1), s(4, press)];
    case 'dp': return [s(6), s(2), s(3, press)];
    case 'qcf2': return [s(2), s(2), s(3), s(3), s(6), s(2), s(2), s(3), s(3), s(6, press)];
    case 'hcf': return [s(4), s(4), s(1), s(2), s(2), s(3), s(3), s(6, press)];
    case 'hcb': return [s(6), s(6), s(3), s(2), s(2), s(1), s(1), s(4, press)];
    case 'ff': return [s(6), s(6), s(5), s(5), s(6, press)];
    case 'bf': return [s(4), s(4), s(6, press)];
    case 'fbf': return [s(6), s(6), s(4), s(4), s(6, press)];
    case 'charge': return [...repeat(s(4), CHARGE_FRAMES + 2), s(6, press)];
    case 'chargeSuper': return [...repeat(s(4), CHARGE_FRAMES + 2), s(6), s(6), s(4), s(4), s(6, press)];
    case 'mash': return [s(5, press), s(5), s(5, press), s(5), s(5, press), s(5), s(5, press)];
    case 'hold': return [s(5, press), ...repeat(s(5, 0, press), HOLD_FRAMES + 2), s(5)];
    default: return [s(5, press)];
  }
}

/** Botón de un especial con la fuerza pedida (o el que tenga). */
function buttonOf(mv: MoveDef, strong: boolean): number {
  const bs: Btn[] = mv.buttons?.length ? mv.buttons : ['lp', 'hp'];
  const b = bs.find((x) => isStrong(x) === strong) ?? bs[0];
  return BTN_BIT[b];
}

/** Acepta un nivel por nombre, una tabla propia o el número viejo (0..1). */
function levelFrom(l: DifficultyId | AiParams | number): AiParams {
  if (typeof l === 'string') return AI_LEVELS[l];
  if (typeof l === 'number') return AI_LEVELS[l < 0.35 ? 'facil' : l < 0.7 ? 'normal' : l < 0.9 ? 'dificil' : 'muyDificil'];
  return l;
}

/**
 * CPU determinista: decide con su propio generador con semilla y genera
 * entradas cuadro a cuadro, igual que un jugador (los comandos pasan por el
 * mismo detector de movimientos). La dificultad (AI_LEVELS) cambia su tiempo
 * de reacción, cuánto bloquea y castiga, y qué tanto combea.
 */
export class CpuController {
  private rng: Rng;
  private p: AiParams;
  private queue: Step[] = [];
  private holdDir = 5;
  private holdFrames = 0;
  private cooldown = 40;
  private blockFrames = 0;
  private blockLow = false;
  /** Cuadro en que empieza a bloquear (tiempo de reacción); -1 si no hay nada pendiente. */
  private blockAt = -1;
  private pendingLow = false;
  private seenSerial = -1;
  private seenAssistSerial = -1;
  private seenProj = new Set<Projectile>();
  private lastState: StateName | '' = '';
  /** 2 VS 2: el punto que controlaba (al cambiar de luchador se olvida lo que tenía en cola). */
  private lastPoint: Fighter | null = null;
  /** Combos Killer: ventana de DOBLE, DOBLE y DOBLE rival ya decididos (una decisión por cada uno). */
  private kiSeenWindow = -1;
  private kiSeenDoble = -1;
  private breakSeen = -1;

  constructor(readonly side: 0 | 1, seed: number, level: DifficultyId | AiParams | number = 'normal') {
    this.rng = new Rng(seed);
    this.p = levelFrom(level);
  }

  /** Cambia la dificultad en caliente (muñeco de práctica). */
  setLevel(level: DifficultyId | AiParams): void {
    this.p = levelFrom(level);
  }

  update(m: Match): FrameInput {
    const me = m.fighters[this.side];
    const opp = m.opponent(me);
    if (me !== this.lastPoint) {
      this.lastPoint = me;
      this.queue.length = 0;
      this.holdFrames = 0;
      this.blockFrames = 0;
      this.blockAt = -1;
      this.cooldown = Math.max(this.cooldown, 12);
      this.lastState = '';
    }
    const st = this.react(m, me, opp) ?? this.killer(m, me, opp) ?? (this.queue.length ? this.queue.shift()! : this.decide(m, me, opp));
    const dir = me.facing === 1 ? st.dir : mirrorDir(st.dir);
    return { dir, held: st.press | (st.hold ?? 0), pressed: st.press };
  }

  /** Reacciones que pueden interrumpir lo que estaba haciendo: bloqueo, castigo, contraataque, rodada. */
  private react(m: Match, me: Fighter, opp: Fighter): Step | null {
    const prev = this.lastState;
    this.lastState = me.state;
    if (m.phase !== 'fight') {
      this.queue.length = 0;
      this.blockFrames = 0;
      this.blockAt = -1;
      return s(5);
    }
    const r = this.rng;
    const P = this.p;
    const dist = Math.abs(opp.x - me.x);
    const canAct = ACTIONABLE.has(me.state);

    // COMBO BREAKER: una decisión por cada DOBLE que recibe (fuerza correcta ~70%).
    if (opp.dobleBreakable && me.inCombo && me.lockout === 0 && opp.attackSerial !== this.breakSeen) {
      this.breakSeen = opp.attackSerial;
      if (r.chance(P.breaker)) {
        const strong = r.chance(0.7) ? opp.moveStrong : !opp.moveStrong;
        this.queue = [...repeat(s(5), r.int(1, 3)), s(5, strong ? B_HP | B_HK : B_LP | B_LK)];
        return this.queue.shift()!;
      }
    }

    // Al entrar al bloqueo decide una sola vez si contraataca (gasta 1 barra).
    if (me.state === 'blockstun' && prev !== 'blockstun' && me.meter >= 100 && r.chance(P.guardCancel)) {
      this.blockFrames = 0;
      this.blockAt = -1;
      return s(6, B_LP | B_LK);
    }
    // Al salir del bloqueo, si el rival quedó cerca: castiga.
    if (prev === 'blockstun' && canAct && dist < 80 && r.chance(P.punish)) {
      this.blockFrames = 0;
      this.blockAt = -1;
      this.queue = this.punish(dist);
      return this.queue.shift()!;
    }

    // Golpe nuevo del rival: decide si lo bloquea y a qué altura. De cerca, bloquear significa que lo
    // esperaba (guardia inmediata); de lejos se pone en guardia después de su tiempo de reacción.
    if (opp.state === 'attack' && opp.move && opp.move.kind !== 'throw' && opp.attackSerial !== this.seenSerial) {
      this.seenSerial = opp.attackSerial;
      if (dist < 175 && r.chance(P.block)) {
        const low = opp.move.hit.guard === 'low' && opp.grounded;
        this.pendingLow = r.chance(P.blockCorrect) ? low : !low;
        this.blockAt = m.frame + (dist < CLOSE ? 0 : Math.round(P.reaction * (0.75 + r.next() * 0.5)));
      }
    }
    // 2 VS 2: la ayuda del rival también ataca.
    const oa = m.teams?.[opp.side].assist?.f;
    if (oa && oa.state === 'attack' && oa.move && oa.attackSerial !== this.seenAssistSerial) {
      this.seenAssistSerial = oa.attackSerial;
      if (Math.abs(oa.x - me.x) < 175 && r.chance(P.block)) {
        this.pendingLow = oa.move.hit.guard === 'low' && oa.grounded && r.chance(P.blockCorrect);
        this.blockAt = m.frame + Math.round(P.reaction * 0.8);
      }
    }
    // Proyectil que se acerca: rodar, bloquear o nada (una decisión por proyectil).
    for (const pr of m.projectiles) {
      if (pr.dead || pr.owner.side === me.side || this.seenProj.has(pr)) continue;
      const dx = me.x - pr.x;
      if (pr.vx === 0 ? Math.abs(dx) > 70 : Math.sign(dx) !== Math.sign(pr.vx) || Math.abs(dx) > 150) continue;
      this.seenProj.add(pr);
      if (canAct && Math.abs(dx) > 45 && r.chance(P.roll)) {
        this.blockAt = -1;
        return s(6, B_LP | B_LK | B_ROLL_KEY);
      }
      if (r.chance(P.block)) {
        this.pendingLow = false;
        this.blockAt = m.frame + Math.round(P.reaction * 0.8);
      }
    }
    for (const pr of this.seenProj) if (pr.dead) this.seenProj.delete(pr);

    // Empieza a bloquear cuando pasa el tiempo de reacción (si puede moverse); si llega tarde, lo olvida.
    if (this.blockAt >= 0 && m.frame > this.blockAt + 25) this.blockAt = -1;
    if (this.blockAt >= 0 && m.frame >= this.blockAt && (canAct || me.state === 'blockstun')) {
      this.blockAt = -1;
      this.blockLow = this.pendingLow;
      this.blockFrames = 18;
      this.queue.length = 0;
      this.holdFrames = 0;
    }
    if (this.blockFrames > 0) {
      this.blockFrames--;
      return s(this.blockLow ? 1 : 4);
    }
    if (me.state === 'blockstun') return s(this.blockLow ? 1 : 4);
    return null;
  }

  /**
   * Combos Killer: cuando un especial suyo conecta, a veces hace un DOBLE; al
   * conectar el doble, sigue con un ENLACE (especial débil) o lo cierra con un
   * REMATE (especial fuerte, súper o ultra). Cuánto según `combos`.
   */
  private killer(m: Match, me: Fighter, opp: Fighter): Step | null {
    if (m.phase !== 'fight') return null;
    const r = this.rng;
    const P = this.p;
    // Ventana de DOBLE abierta: ¿lo hace?
    if (me.kiWindow > 0 && opp.inCombo && me.kiOpenFrame !== this.kiSeenWindow) {
      this.kiSeenWindow = me.kiOpenFrame;
      if (me.kiDobles < MAX_DOBLES && r.chance(Math.min(0.95, 0.35 + 0.5 * P.combos))) {
        const strong = r.chance(0.4);
        this.queue = [s(5, strong ? r.pick([B_HP, B_HK]) : r.pick([B_LP, B_LK]))];
        return this.queue.shift()!;
      }
    }
    // El DOBLE conectó dos veces: enlace o remate.
    if (me.isDoble && me.dobleHits >= 2 && me.attackSerial !== this.kiSeenDoble) {
      this.kiSeenDoble = me.attackSerial;
      if (!r.chance(Math.min(0.97, 0.5 + 0.4 * P.combos))) return null;
      const ultra = this.ultraMove(m, me);
      if (ultra && r.chance(0.8)) {
        this.queue = motionSteps(ultra.motion, buttonOf(ultra, false));
        return this.queue.shift()!;
      }
      const remate = me.kiDobles >= MAX_DOBLES || me.kiDobles >= 1 + r.int(0, Math.round(P.combos * 2)) || r.chance(0.25);
      const sup = this.superMove(me);
      if (remate && sup && me.meter >= (sup.meterCost ?? 100) && r.chance(P.superUse)) {
        this.queue = motionSteps(sup.motion, buttonOf(sup, true));
        return this.queue.shift()!;
      }
      const mv = this.linkMove(me, remate);
      if (mv) {
        this.queue = motionSteps(mv.motion, buttonOf(mv, remate));
        return this.queue.shift()!;
      }
    }
    return null;
  }

  /** Especiales normales del luchador (con comando), sin súper ni ultra. */
  private specialMoves(me: Fighter): MoveDef[] {
    return me.def.specials
      .map((id) => me.def.moves[id])
      .filter((mv): mv is MoveDef => !!mv && mv.kind === 'special' && mv.stance !== 'air' && !!mv.motion);
  }

  /** Especial para seguir un DOBLE: cuerpo a cuerpo o proyectil que avanza, con la fuerza pedida. */
  private linkMove(me: Fighter, strong: boolean): MoveDef | null {
    const opts = this.specialMoves(me).filter((mv) => {
      const pd = mv.projectile ? me.def.projectiles[mv.projectile] : null;
      if (pd && (pd.speed <= 0 || me.projectileCount > 0)) return false;
      return (mv.buttons ?? ['lp', 'hp']).some((b) => isStrong(b) === strong);
    });
    return opts.length ? this.rng.pick(opts) : null;
  }

  private superMove(me: Fighter): MoveDef | null {
    for (const id of me.def.specials) if (me.def.moves[id]?.kind === 'super') return me.def.moves[id];
    return null;
  }

  /** El ultra si se puede hacer ahora (barra y rival en peligro). */
  private ultraMove(m: Match, me: Fighter): MoveDef | null {
    for (const id of me.def.specials) {
      const mv = me.def.moves[id];
      if (mv?.kind === 'ultra' && m.canUltra(me, mv)) return mv;
    }
    return null;
  }

  /** Un especial del luchador que cumpla la condición (o null). */
  private pickSpecial(me: Fighter, ok: (mv: MoveDef) => boolean): MoveDef | null {
    const opts = this.specialMoves(me).filter(ok);
    return opts.length ? this.rng.pick(opts) : null;
  }

  private decide(m: Match, me: Fighter, opp: Fighter): Step {
    const r = this.rng;
    const P = this.p;
    const dist = Math.abs(opp.x - me.x);
    if (!ACTIONABLE.has(me.state)) return s(5);

    // Antiaéreo.
    const approaching = !opp.grounded && opp.state === 'jump' && Math.sign(opp.vx) === Math.sign(me.x - opp.x);
    if (approaching && dist < 125 && r.chance(P.antiAir)) {
      const dp = this.pickSpecial(me, (mv) => mv.motion === 'dp');
      this.queue = dp && r.chance(0.6) ? motionSteps('dp', buttonOf(dp, true)) : [s(2, B_HP)];
      return this.queue.shift()!;
    }
    // Castiga un golpe fallado cerca.
    if (opp.state === 'attack' && !opp.connected && opp.stateFrame > 6 && dist < 90 && r.chance(P.punish * 0.15)) {
      this.queue = this.punish(dist);
      return this.queue.shift()!;
    }

    if (this.holdFrames > 0) {
      this.holdFrames--;
      return s(this.holdDir);
    }
    if (--this.cooldown > 0) return s(5);
    this.cooldown = r.int(P.idle[0], P.idle[1]);

    // Se equivoca: un botón al azar o se queda quieto un rato.
    if (r.chance(P.mistake)) {
      if (r.chance(0.5)) this.queue = [s(r.pick([5, 2, 6, 4]), r.pick([B_LP, B_HP, B_LK, B_HK]))];
      else this.walk(r.pick([5, 4, 6]), r.int(10, 30));
      return this.queue.length ? this.queue.shift()! : s(this.holdDir);
    }

    // 2 VS 2: cambia si su punto está mal y el compañero mejor; a veces llama a la ayuda
    // (de cerca, para alargar una cadena).
    if (m.teams) {
      const partner = m.partnerOf(this.side);
      const mine = me.health / me.def.health;
      if (partner && m.canTag(this.side) && mine < 0.35 && partner.health / partner.def.health > mine + 0.12 && r.chance(0.4)) {
        this.queue = [s(5, B_TAG)];
        return this.queue.shift()!;
      }
      if (m.canAssist(this.side) && r.chance(P.assist * (dist > 105 ? 1.3 : 0.8))) {
        this.queue = dist < 90 && r.chance(0.5)
          ? [s(5, B_ASSIST), ...repeat(s(5), 8), s(5, B_LP), ...repeat(s(5), 8), s(5, B_LK), ...repeat(s(5), 9), s(5, B_HP)]
          : [s(5, B_ASSIST)];
        return this.queue.shift()!;
      }
    }

    // Ultra si el rival está en peligro (de cerca), súper o Modo Poder si hay barra.
    const ultra = this.ultraMove(m, me);
    if (ultra && dist < 85 && r.chance(Math.min(0.9, P.superUse * 2 + 0.1))) {
      this.queue = motionSteps(ultra.motion, buttonOf(ultra, false));
      return this.queue.shift()!;
    }
    const sup = this.superMove(me);
    if (sup && me.meter >= (sup.meterCost ?? 100) && dist < 230 && r.chance(P.superUse)) {
      this.queue = motionSteps(sup.motion, buttonOf(sup, true));
      return this.queue.shift()!;
    }
    if (me.meter >= 100 && me.powerTimer === 0 && dist < 260 && r.chance(P.powerUse)) {
      this.queue = [s(5, B_HP | B_HK | B_POWER_KEY)];
      return this.queue.shift()!;
    }

    const proj = (mv: MoveDef) => (mv.projectile ? me.def.projectiles[mv.projectile] : null);
    // Proyectil que avanza (¡Dicen!, bola), trampa que se queda (El parlante) y especiales cuerpo a cuerpo.
    const fireballMv = this.pickSpecial(me, (mv) => (proj(mv)?.speed ?? 0) > 0 && mv.motion !== 'charge');
    const trapMv = this.pickSpecial(me, (mv) => !!proj(mv) && (proj(mv)?.speed ?? 0) <= 0);
    const meleeMv = this.pickSpecial(me, (mv) => !mv.projectile && mv.motion !== 'charge');
    const chargeMv = this.pickSpecial(me, (mv) => mv.motion === 'charge');
    const hasFireball = !!fireballMv;
    const A = P.aggression;
    const opts: Array<[number, () => void]> = [];
    if (dist > 220) {
      opts.push([0.4 * A, () => this.walk(6, r.int(16, 34))]);
      if (hasFireball && me.projectileCount === 0) opts.push([0.22 * P.specials, () => this.fireball()]);
      opts.push([0.12 * A, () => this.jumpIn()]);
      if (opp.state === 'knockdown') opts.push([0.06, () => (this.queue = [s(5, B_TAUNT)])]);
      if (chargeMv) opts.push([0.06 * P.specials, () => (this.queue = motionSteps('charge', buttonOf(chargeMv, false)))]);
      opts.push([0.14, () => this.walk(5, r.int(8, 20))]);
    } else if (dist > 105) {
      opts.push([0.34 * A, () => this.walk(6, r.int(10, 24))]);
      if (hasFireball && me.projectileCount === 0) opts.push([0.18 * P.specials, () => this.fireball()]);
      opts.push([0.18 * A, () => this.jumpIn()]);
      opts.push([0.1, () => this.walk(4, r.int(10, 20))]);
      if (trapMv && me.projectileCount === 0) opts.push([0.08 * P.specials, () => (this.queue = motionSteps(trapMv.motion, buttonOf(trapMv, r.chance(0.5))))]);
      // Especial cuerpo a cuerpo (gancho, ¿Querí too?) para cortar el avance.
      if (meleeMv) opts.push([0.06 * P.specials, () => (this.queue = motionSteps(meleeMv.motion, buttonOf(meleeMv, true)))]);
      opts.push([0.06, () => this.walk(5, r.int(6, 14))]);
    } else {
      if (me.launcherId) opts.push([0.1 * P.launcher, () => (this.queue = this.launcherCombo())]);
      opts.push([0.1 * P.combos, () => this.chainCombo()]);
      const opener = meleeMv ?? fireballMv;
      if (opener) {
        opts.push([0.08 * P.combos * P.specials, () => (this.queue = [s(2, B_LK), ...repeat(s(2), 9), ...motionSteps(opener.motion, buttonOf(opener, false))])]);
        // Abre un combo Killer directo con el especial débil.
        opts.push([0.07 * P.combos * P.specials, () => (this.queue = motionSteps(opener.motion, buttonOf(opener, false)))]);
      }
      opts.push([0.14 * A, () => (this.queue = [s(5, B_LP)])]);
      opts.push([0.12 * A, () => (this.queue = [s(5, r.chance(0.5) ? B_HP : B_HK)])]);
      if (dist < 50) opts.push([0.1 * A, () => (this.queue = [s(6, B_HP)])]);
      opts.push([0.12 * A, () => (this.queue = [s(2, B_HK)])]);
      opts.push([0.1 * A, () => (this.queue = [s(2, B_LP)])]);
      opts.push([0.1, () => this.walk(4, r.int(8, 18))]);
      if (meleeMv) opts.push([0.06 * P.specials, () => (this.queue = motionSteps(meleeMv.motion, buttonOf(meleeMv, false)))]);
      opts.push([0.06, () => this.walk(5, r.int(4, 10))]);
    }
    this.choose(opts);
    return this.queue.length ? this.queue.shift()! : s(this.holdDir);
  }

  /** Elige una opción según su peso. */
  private choose(opts: Array<[number, () => void]>): void {
    let total = 0;
    for (const [w] of opts) total += Math.max(0, w);
    if (total <= 0) return;
    let x = this.rng.next() * total;
    for (const [w, fn] of opts) {
      x -= Math.max(0, w);
      if (x <= 0) {
        fn();
        return;
      }
    }
    opts[opts.length - 1][1]();
  }

  private walk(dir: number, frames: number): void {
    this.holdDir = dir;
    this.holdFrames = frames;
  }

  private fireball(): void {
    const me = this.lastPoint;
    const mv = me ? this.pickSpecial(me, (x) => !!x.projectile && (me.def.projectiles[x.projectile]?.speed ?? 0) > 0) : null;
    this.queue = motionSteps(mv?.motion ?? 'qcf', mv ? buttonOf(mv, this.rng.chance(0.5)) : this.rng.chance(0.5) ? B_LP : B_HP);
  }

  private jumpIn(): void {
    const btn = this.rng.chance(0.6) ? B_HK : B_HP;
    // Mantiene arriba unos cuadros (tocarlo apenas sería un salto corto); a veces salta corto a propósito.
    const short = this.rng.chance(0.25);
    this.queue = short
      ? [s(9), ...repeat(s(5), 10 + this.rng.int(0, 4)), s(5, btn)]
      : [...repeat(s(9), 6), ...repeat(s(5), 13 + this.rng.int(0, 6)), s(5, btn)];
  }

  /** Cadena débil → fuerte; en niveles altos la cancela en un especial débil (que abre un combo Killer). */
  private chainCombo(): void {
    const q = [s(5, B_LP), ...repeat(s(5), 8), s(5, B_LK), ...repeat(s(5), 9), s(5, B_HP)];
    const me = this.lastPoint;
    const mv = me ? (this.pickSpecial(me, (x) => !x.projectile && x.motion !== 'charge') ?? this.pickSpecial(me, (x) => !!x.projectile)) : null;
    if (mv && this.rng.chance(Math.min(1, this.p.specials * 0.5))) q.push(...repeat(s(5), 3), ...motionSteps(mv.motion, buttonOf(mv, false)));
    this.queue = q;
  }

  /** Lanzador agachado, supersalto y cadena aérea débil → fuerte. */
  private launcherCombo(): Step[] {
    return [
      s(2, B_HP), ...repeat(s(2), 12), ...repeat(s(8), 8), ...repeat(s(5), 5),
      s(5, B_LP), ...repeat(s(5), 6), s(5, B_LK), ...repeat(s(5), 6), s(5, B_HP), ...repeat(s(5), 6), s(5, B_HK),
    ];
  }

  /** Castigo según la distancia y el nivel. */
  private punish(dist: number): Step[] {
    const r = this.rng;
    if (this.p.launcher > 0 && dist < 70 && r.chance(Math.min(0.9, 0.35 * this.p.launcher))) return this.launcherCombo();
    const me = this.lastPoint;
    const mv = me ? this.pickSpecial(me, (x) => !x.projectile && x.motion !== 'charge') : null;
    if (mv && r.chance(0.4)) return motionSteps(mv.motion, buttonOf(mv, r.chance(0.5)));
    return dist < 60 ? [s(5, B_HP)] : [s(2, B_HK)];
  }
}
