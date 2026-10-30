import { MAX_METER } from '../config';
import {
  B_ATTACK, B_HK, B_HP, B_LK, B_LP, B_POWER_KEY, B_ROLL_KEY, B_TAUNT, BTN_BIT,
  InputBuffer, isBack, isDown, isForward, isUp, type Press,
} from '../input/buffer';
import type { Match } from './match';
import type {
  AnimDef, Box, Btn, FighterDef, FrameDef, GuardType, HitProps, MechanicsDef, MotionId, MoveDef, MoveKind, Stance, UltraDef,
} from './types';

export type StateName =
  | 'intro' | 'idle' | 'walkF' | 'walkB' | 'crouchDown' | 'crouch' | 'crouchUp' | 'guard'
  | 'preJump' | 'jump' | 'land' | 'attack' | 'blockstun' | 'hitstun' | 'airHit'
  | 'knockdown' | 'getup' | 'thrown' | 'taunt' | 'ko' | 'win' | 'lose'
  | 'roll' | 'powerUp'
  /** Pegado al frente de quien le hace un ultra (la secuencia lo golpea sola). */
  | 'pinned';

/** Estados desde los que el jugador tiene control total. */
export const ACTIONABLE: ReadonlySet<StateName> = new Set<StateName>([
  'idle', 'walkF', 'walkB', 'crouchDown', 'crouch', 'crouchUp', 'guard',
]);

/** Cuadros de búfer para los botones. */
const BUFFER = 4;
/** Golpes máximos a un rival en el aire antes de que sea intocable. */
export const MAX_JUGGLE = 3;
/** Golpes máximos en el aire después de un lanzador (combo aéreo). */
export const MAX_JUGGLE_LAUNCHED = 8;
/** Orden de las cadenas: débil → fuerte (golpe débil, patada débil, golpe fuerte, patada fuerte). */
const CHAIN_ORDER: readonly Btn[] = ['lp', 'lk', 'hp', 'hk'];
const CHAIN_RANK: Record<Btn, number> = { lp: 0, lk: 1, hp: 2, hk: 3 };
/** Cuadros entre dos botones para que cuenten como apretados "juntos". */
const COMBO_SPREAD = 4;
/** Agarre con dos botones: un golpe y una patada juntos (cualquiera de cada uno), pegado al rival. */
const THROW_PAIRS: readonly number[] = [B_LP | B_LK, B_HP | B_HK, B_LP | B_HK, B_HP | B_LK];
/** Cuadros al inicio de un normal en que todavía puede convertirse en rodada o Modo Poder. */
const KARA = 3;
/** Agarre con dos botones: diferencia máxima entre los dos (cuadros) y hasta cuándo un normal recién empezado se convierte en agarre. */
const THROW_SPREAD = 6;
const KARA_THROW = 6;
/** Cuadros al inicio de un normal en que un especial que se completa recién (el botón cayó un pelo antes que la última flecha) lo convierte. */
const KARA_SPECIAL = 6;
/** Cuadros hacia atrás en que un "abajo" previo convierte el salto en supersalto. */
const SUPERJUMP_WINDOW = 10;
/** Cuadros para cancelar el lanzador en supersalto después de conectar. */
export const LAUNCH_FOLLOW = 26;

// ---------------------------------------------------------------- combos Killer
/** Cuadros (sin contar el congelamiento de impacto) para empezar un DOBLE después de que conecta un especial. */
export const KI_WINDOW = 18;
/** DOBLES máximos por combo. */
export const MAX_DOBLES = 4;
/** Cuadros de BLOQUEO tras un COMBO BREAKER equivocado. */
export const LOCKOUT_FRAMES = 120;
/** Golpes del DOBLE: débil y fuerte (la animación es la del normal parado de ese botón, más rápida). */
const DOBLE_HIT: Record<'debil' | 'fuerte', Partial<HitProps>> = {
  debil: { damage: 22, hitstun: 22, blockstun: 14, hitstop: 6, pushback: 3, meter: 3, spark: 'light', guard: 'mid' },
  fuerte: { damage: 34, hitstun: 24, blockstun: 16, hitstop: 8, pushback: 4, meter: 4, spark: 'heavy', guard: 'mid' },
};
/** Velocidad del DOBLE (fracción de la duración de cada cuadro del normal). */
const DOBLE_SPEED = { debil: 0.75, fuerte: 0.7 };
/** Distancia máxima al rival para empezar un DOBLE (de lejos, el botón hace su golpe normal). */
const DOBLE_RANGE = 110;

export const isStrong = (b: Btn): boolean => b === 'hp' || b === 'hk';

/** Ultra en curso: secuencia, víctima pegada y golpes dados. */
export interface UltraRun {
  u: UltraDef;
  moveId: string;
  victim: Fighter;
  step: number;
  hits: number;
  total: number;
  /** Ya dio el golpe final (el resto de la animación corre sin golpes). */
  done: boolean;
}

/**
 * DOBLE de un botón: la animación del normal parado dos veces seguidas (la
 * segunda desde un poco antes del cuadro activo), más rápida y con un golpe en
 * cada vuelta. Se arma una vez por luchador y queda en def.anims.
 */
function dobleMove(def: FighterDef, btn: Btn): { id: string; move: MoveDef } | null {
  const id = `__doble_${btn}`;
  const anim = `__doble_${btn}`;
  const base = def.moves[def.normals.stand[btn]];
  const src = base && def.anims[base.anim];
  if (!base || !src) return null;
  const strength = isStrong(btn) ? 'fuerte' : 'debil';
  if (!def.anims[anim]) {
    const frames = src.frames;
    const active = frames.map((f, i) => (f.hit?.length ? i : -1)).filter((i) => i >= 0);
    if (!active.length) return null;
    const a = active[0];
    const b = active[active.length - 1];
    const k = DOBLE_SPEED[strength];
    const copy = (f: FrameDef, group: number): FrameDef => {
      const o: FrameDef = { ...f, dur: Math.max(1, Math.round(f.dur * k)) };
      delete o.spawn;
      delete o.vel;
      delete o.move;
      if (f.hit) o.hit = f.hit.map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h, group }));
      return o;
    };
    def.anims[anim] = {
      frames: [...frames.slice(0, b + 1).map((f) => copy(f, 0)), ...frames.slice(Math.max(0, a - 2)).map((f) => copy(f, 1))],
    };
  }
  const move: MoveDef = {
    name: 'Doble',
    anim,
    kind: 'normal',
    stance: 'stand',
    hit: { ...base.hit, launch: undefined, knockdown: false, chip: 0, ...DOBLE_HIT[strength] } as HitProps,
    cancelInto: ['special', 'super'],
  };
  return { id, move };
}

/** Grupo de golpe más alto de una animación (el último golpe de un especial multigolpe). */
export function lastGroup(anim: AnimDef | undefined): number {
  let g = 0;
  for (const f of anim?.frames ?? []) for (const h of f.hit ?? []) g = Math.max(g, h.group ?? 0);
  return g;
}

/**
 * Animación de un tramo del ultra: la del luchador más rápida, sin cajas de
 * golpe ni desplazamientos (el rival está pegado) y con los golpes programados:
 * en el primer cuadro de cada golpe de la animación o, si no alcanzan, repartidos.
 */
export function ultraAnim(def: FighterDef, moveId: string, u: UltraDef, i: number): string {
  const key = `__ultra_${moveId}_${i}`;
  if (def.anims[key]) return key;
  const st = u.sequence[i];
  const src = def.anims[st.anim] ?? def.anims.idle;
  const speed = st.speed ?? u.speed ?? 1.25;
  const frames: FrameDef[] = src.frames.map((f) => {
    const o: FrameDef = { tex: f.tex, dur: Math.max(1, Math.round(f.dur / speed)) };
    if (f.hurt) o.hurt = f.hurt;
    if (f.push) o.push = f.push;
    if (f.spawn) o.spawn = f.spawn;
    if (f.sfx && !f.sfx.startsWith('voz/')) o.sfx = f.sfx;
    return o;
  });
  // Primer cuadro de cada golpe de la animación original.
  const starts: number[] = [];
  src.frames.forEach((f, j) => {
    if (!f.hit?.length) return;
    const prev = src.frames[j - 1];
    const g = f.hit[0].group ?? 0;
    if (!prev?.hit?.length || (prev.hit[0].group ?? 0) !== g) starts.push(j);
  });
  const n = frames.length;
  let marks: number[];
  if (starts.length >= st.hits) {
    marks = starts.slice(0, st.hits);
  } else {
    // Sin golpes propios (proyectil, súper): desde que lanza (o desde un cuarto) hasta el penúltimo cuadro.
    const spawnAt = src.frames.findIndex((f) => !!f.spawn);
    const from = starts[0] ?? (spawnAt >= 0 ? spawnAt : Math.floor(n * 0.25));
    const to = Math.max(from, n - 2);
    marks = Array.from({ length: st.hits }, (_, k) => Math.round(from + ((to - from) * k) / Math.max(1, st.hits - 1)));
  }
  for (const j of marks) {
    const fr = frames[Math.max(0, Math.min(n - 1, j))];
    fr.ultraHit = (fr.ultraHit ?? 0) + 1;
  }
  def.anims[key] = { frames };
  return key;
}

export type JumpKind = 'normal' | 'short' | 'super';

export interface Aabb {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ThrowData {
  victim: Fighter;
  t: number;
  back: boolean;
}

function strongestButton(bits: number): Btn | null {
  if (bits & B_HP) return 'hp';
  if (bits & B_HK) return 'hk';
  if (bits & B_LP) return 'lp';
  if (bits & B_LK) return 'lk';
  return null;
}

export class Fighter {
  readonly input = new InputBuffer();
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  slideV = 0;
  facing: 1 | -1 = 1;
  grounded = true;
  health: number;
  meter = 0;
  wins = 0;

  state: StateName = 'intro';
  stateFrame = 0;
  animName = '';
  anim!: AnimDef;
  frameIdx = 0;
  frameTime = -1;
  animDone = false;

  move: MoveDef | null = null;
  moveId = '';
  /** Botón del normal en curso (para las cadenas). */
  moveBtn: Btn | null = null;
  attackSerial = 0;
  private relaxedIdle = false;
  groupsConnected = 0;
  connected = false;
  connectFrame = 0;
  framesSinceConnect = 0;

  hitstop = 0;
  stun = 0;
  blockCrouch = false;
  /** Cuadro de la pelea en que empezó el bloqueo actual (para la ventana del contraataque). */
  blockStart = 0;
  landTimer = 0;
  knockTimer = 0;
  jumpDir = 0;
  jumpKind: JumpKind = 'normal';
  private superJumpQueued = false;
  airAttackUsed = false;
  /** Botones ya usados en el aire durante este salto (cada uno una vez en las cadenas aéreas). */
  airUsed = 0;
  juggle = 0;
  /** Tope de golpes en el aire del combo actual (sube con un lanzador). */
  juggleCap = MAX_JUGGLE;
  /** Cuadros restantes para cancelar el lanzador en supersalto. */
  launchFollow = 0;
  comboHits = 0;
  comboDamage = 0;
  invulnTimer = 0;
  throwProtect = 0;
  projectileCount = 0;
  /** Cuadros restantes del Modo Poder (0 = inactivo). */
  powerTimer = 0;
  /** 2 VS 2: vida roja (recuperable) que vuelve mientras descansa fuera de la pantalla. */
  red = 0;
  /** 2 VS 2: va cayendo a la pantalla (cambio o reemplazo); la cámara no lo sigue hacia arriba. */
  entering = false;
  ko = false;
  throwData: ThrowData | null = null;
  thrownBy: Fighter | null = null;
  private lastHurt: Box[] | null = null;
  private guardCancelMove: MoveDef | null = null;

  // Combos Killer (DOBLE, ENLACE, REMATE, COMBO BREAKER).
  /** Cuadros que quedan para empezar un DOBLE (los abre un especial que conecta de golpe). */
  kiWindow = 0;
  /** Cuadro de la pelea en que se abrió la ventana del DOBLE. */
  kiOpenFrame = 0;
  /** DOBLES usados en el combo actual. */
  kiDobles = 0;
  /** Este combo ya es "Killer" (conectó un especial): el rival puede intentar un COMBO BREAKER. */
  kiCombo = false;
  /** El movimiento en curso se hizo con un botón fuerte (el DOBLE en curso es fuerte). */
  moveStrong = false;
  /** Pulsación que empezó el normal actual (cuadro de la pelea y botones), para convertirlo en especial al inicio. */
  private karaPress: { frame: number; bits: number } | null = null;
  /** El especial en curso es un REMATE (súper, ultra o especial fuerte cancelando un DOBLE). */
  remate = false;
  /** El REMATE en curso ya conectó (bonificación y voz una sola vez). */
  remateHit = false;
  /** Golpes del DOBLE en curso que conectaron (el breaker vale hasta el segundo). */
  dobleHits = 0;
  /** Cuadro de la pelea en que empezó el DOBLE en curso. */
  dobleStart = 0;
  /** Víctima: cuadros de BLOQUEO (no puede intentar otro COMBO BREAKER). */
  lockout = 0;
  /** Víctima: el combo terminó con un REMATE / con un ultra (para el nombre del combo). */
  kiEnder = false;
  kiUltra = false;
  /** Ultra en curso (null si no). */
  ultraRun: UltraRun | null = null;
  /** Víctima: quién la tiene pegada con un ultra. */
  pinnedBy: Fighter | null = null;

  constructor(readonly def: FighterDef, readonly side: 0 | 1) {
    this.health = def.health;
    this.setAnim('intro');
  }

  get frame(): FrameDef {
    return this.anim.frames[this.frameIdx];
  }

  get moveKind(): MoveKind | null {
    return this.move?.kind ?? null;
  }

  private get mech(): MechanicsDef {
    return this.def.mechanics ?? {};
  }

  /** Id del lanzador ('' si el luchador no tiene). */
  get launcherId(): string {
    const l = this.mech.launcher;
    return l === undefined ? this.def.normals.crouch.hp : l;
  }

  get launchVel(): { vx: number; vy: number } {
    return this.mech.launchVel ?? { vx: 0.5, vy: -9.6 };
  }

  /** Duración total del Modo Poder (para la barra del HUD). */
  get powerMax(): number {
    return this.mech.powerMode?.duration ?? 360;
  }

  get powerDamage(): number {
    return this.powerTimer > 0 ? (this.mech.powerMode?.damage ?? 1.15) : 1;
  }

  private get rollFrames(): number {
    return this.mech.roll?.frames ?? 28;
  }

  /** ¿Está en la parte invulnerable de la rodada? (atraviesa al rival y a los proyectiles) */
  get rollInvuln(): boolean {
    return this.state === 'roll' && this.stateFrame < (this.mech.roll?.invuln ?? 18);
  }

  get crouching(): boolean {
    switch (this.state) {
      case 'crouch':
      case 'crouchDown':
        return true;
      case 'attack':
        return this.move?.stance === 'crouch';
      case 'blockstun':
        return this.blockCrouch;
      case 'hitstun':
        return this.animName === 'hitCrouch';
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- animación

  setState(s: StateName, anim?: string): void {
    this.state = s;
    this.stateFrame = 0;
    if (anim) this.setAnim(anim);
  }

  /**
   * Guardia baja (muñeco de práctica): su "idle" pasa a ser la pose relajada
   * 'idleRelax', si el luchador la tiene. Cambia la animación en el acto si está quieto.
   */
  get relaxed(): boolean {
    return this.relaxedIdle;
  }

  set relaxed(on: boolean) {
    if (on === this.relaxedIdle) return;
    this.relaxedIdle = on;
    if (this.state === 'idle') this.setAnim('idle');
  }

  setAnim(name: string): void {
    if (name === 'idle' && this.relaxedIdle && this.def.anims.idleRelax) name = 'idleRelax';
    this.animName = name;
    this.anim = this.def.anims[name] ?? this.def.anims.idle;
    this.frameIdx = 0;
    this.frameTime = -1;
    this.animDone = false;
  }

  private stepAnim(m: Match): void {
    if (this.animDone) return;
    this.frameTime++;
    let f = this.anim.frames[this.frameIdx];
    if (this.frameTime >= f.dur) {
      if (this.frameIdx + 1 < this.anim.frames.length) {
        this.frameIdx++;
        this.frameTime = 0;
        // Agarre que no tomó a nadie: salta directo a la recuperación (no le pega al aire).
        const w = this.state === 'attack' && !this.ultraRun ? this.move?.whiffTo : undefined;
        if (w && this.frameIdx === w.at && !this.connected) this.frameIdx = Math.min(w.to, this.anim.frames.length - 1);
      } else if (this.anim.loop) {
        this.frameIdx = 0;
        this.frameTime = 0;
      } else {
        this.animDone = true;
        this.frameTime = f.dur - 1;
        return;
      }
      f = this.anim.frames[this.frameIdx];
    }
    if (this.frameTime === 0) this.enterFrame(f, m);
  }

  private enterFrame(f: FrameDef, m: Match): void {
    if (f.move) this.x += f.move * this.facing;
    if (f.vel) {
      if (f.vel.x !== undefined) this.vx = f.vel.x * this.facing;
      if (f.vel.y !== undefined) this.vy = f.vel.y;
    }
    if (f.airborne) this.grounded = false;
    if (f.spawn) m.spawnProjectile(this, f.spawn);
    if (f.sfx) m.emit({ type: 'sfx', name: f.sfx, side: this.side, who: this.def.id });
    if (f.ultraHit && this.ultraRun && !this.ultraRun.done) m.ultraHit(this, f.ultraHit);
  }

  // ---------------------------------------------------------------- decisiones

  /** Lee la entrada y decide transiciones. No corre durante el congelamiento de impacto. */
  think(m: Match): void {
    if (m.phase !== 'fight') {
      // Sin control fuera de la pelea: quien venía caminando se detiene.
      if (this.state === 'walkF' || this.state === 'walkB' || this.state === 'guard') {
        this.vx = 0;
        this.setState('idle', 'idle');
      }
      return;
    }
    const s = this.state;
    if (ACTIONABLE.has(s)) {
      this.neutral(m);
    } else if (s === 'jump') {
      if (!this.airAttackUsed) this.tryAirNormal(m);
    } else if (s === 'attack') {
      if (this.ultraRun) return;
      // Mantener y soltar: al apretar sale el golpe normal; si se suelta mientras dura, igual sale el especial.
      if (this.move?.kind === 'normal' && this.tryHoldRelease(m)) return;
      if (this.tryMash(m)) return;
      if (this.tryKara(m)) return;
      if (this.tryLauncherJump(m)) return;
      if (this.tryDoble(m)) return;
      if (this.canCancel()) this.tryCancel(m);
    } else if (s === 'blockstun') {
      this.tryGuardCancel(m);
    } else if (s === 'hitstun' || s === 'airHit') {
      this.tryBreaker(m);
    }
  }

  private neutral(m: Match): void {
    const opp = m.opponent(this);
    if (this.tryDoble(m)) return;
    if (this.tryGroundActions(m, opp)) return;
    const d = this.input.dir();
    if (isUp(d)) {
      this.jumpDir = d === 9 ? 1 : d === 7 ? -1 : 0;
      // Abajo y luego arriba rápido: supersalto.
      let sj = false;
      for (let a = 1; a <= SUPERJUMP_WINDOW && !sj; a++) sj = isDown(this.input.dir(a));
      this.superJumpQueued = sj;
      this.vx = 0;
      this.setState('preJump', 'preJump');
      return;
    }
    if (isDown(d)) {
      this.vx = 0;
      if (this.state !== 'crouch' && this.state !== 'crouchDown') {
        this.setState('crouchDown', 'crouchDown');
      } else if (this.state === 'crouch') {
        const want = d === 1 && m.threatens(opp, this) ? 'blockCrouch' : 'crouch';
        if (this.animName !== want) this.setAnim(want);
      }
      return;
    }
    if (this.state === 'crouch' || this.state === 'crouchDown') {
      this.vx = 0;
      this.setState('crouchUp', 'crouchUp');
      return;
    }
    if (this.state === 'crouchUp') return;
    if (d === 6) {
      if (this.state !== 'walkF') this.setState('walkF', 'walkF');
      this.vx = this.def.walkF * this.facing;
    } else if (d === 4) {
      if (m.threatens(opp, this)) {
        if (this.state !== 'guard') this.setState('guard', 'blockStand');
        this.vx = 0;
      } else {
        if (this.state !== 'walkB') this.setState('walkB', 'walkB');
        this.vx = -this.def.walkB * this.facing;
      }
    } else {
      if (this.state !== 'idle') this.setState('idle', 'idle');
      this.vx = 0;
    }
  }

  private tryGroundActions(m: Match, opp: Fighter): boolean {
    // Especiales de "mantener y soltar": salen al soltar el botón (no hay pulsación nueva).
    if (this.tryHoldRelease(m)) return true;
    const press = this.input.findPress(B_ATTACK | B_TAUNT, BUFFER);
    if (!press) return false;
    const d = this.input.dir();
    if (press.bits & B_TAUNT) {
      this.input.consume({ age: press.age, bits: B_TAUNT });
      this.vx = 0;
      this.setState('taunt', 'taunt');
      m.tauntStart(this);
      return true;
    }
    // Pegado al rival, un golpe y una patada juntos: agarre (con ← lo tira hacia atrás).
    if (this.tryThrowButtons(m, opp)) return true;
    // Dos botones juntos: rodada (débiles) o Modo Poder (fuertes).
    if (this.tryCombos(m)) return true;
    const special = this.findSpecial(m, press, ['special', 'super']);
    if (special) {
      this.input.consume(press);
      this.startMove(m, special);
      this.moveStrong = this.pressStrong(press, special);
      return true;
    }
    if ((press.bits & B_HP) && (d === 4 || d === 6) && m.canThrow(this, opp)) {
      this.input.consume(press);
      m.startThrow(this, opp, d === 4);
      return true;
    }
    const btn = strongestButton(press.bits);
    if (!btn) return false;
    this.input.consume(press);
    this.startNormal(m, isDown(d) ? 'crouch' : 'stand', btn);
    this.karaPress = { frame: m.frame - press.age, bits: press.bits };
    return true;
  }

  /** Rodada (golpe débil + patada débil) o Modo Poder (golpe fuerte + patada fuerte). Solo en el suelo. */
  private tryCombos(m: Match): boolean {
    if (!this.grounded) return false;
    const pm = this.mech.powerMode ?? {};
    const cost = pm.cost ?? 100;
    if (this.powerTimer === 0 && this.meter >= cost) {
      const p = this.input.findCombo(B_HP | B_HK, BUFFER, COMBO_SPREAD);
      if (p) {
        this.input.consumeCombo(p, COMBO_SPREAD);
        this.startPowerMode(m, cost, pm.duration ?? 360);
        return true;
      }
    }
    const r = this.input.findCombo(B_LP | B_LK, BUFFER, COMBO_SPREAD);
    if (r) {
      this.input.consumeCombo(r, COMBO_SPREAD);
      this.startRoll(m, isBack(this.input.dir(r.age)));
      return true;
    }
    return false;
  }

  /**
   * Agarre con botones: pegado al rival, un golpe y una patada juntos. Los botones atajo de
   * RODADA y MODO PODER no cuentan (siguen siendo rodada y Modo Poder aunque esté pegado).
   */
  private tryThrowButtons(m: Match, opp: Fighter): boolean {
    if (!this.grounded || !m.canThrow(this, opp)) return false;
    for (const need of THROW_PAIRS) {
      const p = this.input.findCombo(need, BUFFER, THROW_SPREAD);
      if (!p || this.input.bitsAround(p, THROW_SPREAD) & (B_ROLL_KEY | B_POWER_KEY)) continue;
      this.input.consumeCombo(p, THROW_SPREAD);
      this.endMove();
      m.startThrow(this, opp, isBack(this.input.dir(p.age)));
      return true;
    }
    return false;
  }

  /**
   * En los primeros cuadros de un normal, el segundo botón todavía lo convierte en agarre
   * (hasta KARA_THROW cuadros: dos botones apretados "juntos" a mano rara vez caen en el mismo cuadro),
   * rodada o Modo Poder (hasta KARA).
   */
  private tryKara(m: Match): boolean {
    if (this.move?.kind !== 'normal' || this.connected || !this.grounded || this.throwData) return false;
    if (this.stateFrame <= KARA_THROW && this.tryThrowButtons(m, m.opponent(this))) return true;
    if (this.stateFrame <= KARA && this.tryCombos(m)) return true;
    // El botón del especial cayó un pelo antes que la última flecha (la → de una carga, por ejemplo):
    // el golpe que alcanzó a empezar se convierte en el especial.
    if (this.stateFrame <= KARA_SPECIAL && this.karaPress) {
      const press = { age: m.frame - this.karaPress.frame, bits: this.karaPress.bits };
      const special = this.findSpecial(m, press, ['special', 'super']);
      if (special) {
        this.startMove(m, special);
        this.moveStrong = this.pressStrong(press, special);
        return true;
      }
    }
    return false;
  }

  /**
   * Machacar: los golpes que se aprietan mientras dura un normal también cuentan, y al
   * completar las pulsaciones el especial sale aunque el normal no haya conectado.
   */
  private tryMash(m: Match): boolean {
    if (this.move?.kind !== 'normal' || !this.grounded || this.throwData) return false;
    const press = this.input.findPress(B_ATTACK, BUFFER);
    if (!press) return false;
    const special = this.findSpecial(m, press, ['special'], null, 'mash');
    if (!special) return false;
    this.input.consume(press);
    this.startMove(m, special);
    this.moveStrong = this.pressStrong(press, special);
    return true;
  }

  private startRoll(m: Match, back: boolean): void {
    this.endMove();
    this.vx = (this.mech.roll?.speed ?? 3.6) * (back ? -1 : 1) * this.facing;
    this.setState('roll', this.def.anims.roll ? 'roll' : 'crouch');
    m.emit({ type: 'roll', side: this.side, x: this.x });
  }

  private startPowerMode(m: Match, cost: number, duration: number): void {
    this.endMove();
    this.meter -= cost;
    this.powerTimer = duration;
    this.vx = 0;
    const anim = this.def.anims.powerUp ? 'powerUp' : this.def.anims.taunt ? 'taunt' : 'intro';
    this.setState('powerUp', anim);
    this.invulnTimer = Math.max(this.invulnTimer, 20);
    m.emit({ type: 'powerMode', side: this.side, x: this.x, y: this.y - 70, color: this.def.ui.fx, on: true });
    m.emit({ type: 'sfx', name: 'voz/poder', side: this.side, who: this.def.id });
  }

  /** Lanzador que conectó + arriba: supersalto para seguir al rival. */
  private tryLauncherJump(m: Match): boolean {
    if (this.launchFollow <= 0 || !this.grounded || !this.connected || this.moveId !== this.launcherId) return false;
    const d = this.input.dir();
    if (!isUp(d)) return false;
    this.endMove();
    this.launchFollow = 0;
    this.jumpDir = d === 7 ? -1 : 1;
    this.launchJump(m, 'super', 1.4);
    return true;
  }

  /** Contraataque: adelante + golpe débil + patada débil durante el bloqueo. */
  private tryGuardCancel(m: Match): void {
    const gc = this.mech.guardCancel ?? {};
    const cost = gc.cost ?? 100;
    if (this.meter < cost || !this.grounded) return;
    // La ventana cubre el congelamiento del bloqueo: se puede apretar apenas se ve el golpe.
    const within = Math.max(BUFFER, m.frame - this.blockStart + BUFFER);
    const p = this.input.findCombo(B_LP | B_LK, within, COMBO_SPREAD);
    if (!p) return;
    // Adelante en el cuadro del botón o cerca (al pasar de atrás a adelante hay un cuadro neutro).
    let fwd = false;
    for (let a = 0; a <= p.age + 2 && !fwd; a++) fwd = isForward(this.input.dir(a));
    if (!fwd) return;
    const mv = this.guardCancelDef();
    if (!mv) return;
    this.input.consumeCombo(p, COMBO_SPREAD);
    this.meter -= cost;
    this.startMoveDef(m, '__contra', mv);
    this.invulnTimer = Math.max(this.invulnTimer, 10);
    m.emit({ type: 'guardCancel', side: this.side, x: this.x + this.facing * 24, y: this.y - 84 });
  }

  /** Movimiento del contraataque: la animación de un normal con propiedades propias (aleja al rival). */
  private guardCancelDef(): MoveDef | null {
    if (this.guardCancelMove) return this.guardCancelMove;
    const gc = this.mech.guardCancel ?? {};
    const base = this.def.moves[gc.move ?? this.def.normals.stand.hp];
    if (!base) return null;
    this.guardCancelMove = {
      ...base,
      name: 'Contraataque',
      kind: 'normal',
      stance: 'stand',
      cancelInto: undefined,
      hit: {
        ...base.hit,
        damage: gc.damage ?? 40,
        guard: 'mid',
        launch: { vx: 4.2, vy: -5 },
        hitstop: 12,
        meter: 0,
        spark: 'heavy',
      },
    };
    return this.guardCancelMove;
  }

  private tryAirNormal(m: Match): void {
    const press = this.input.findPress(B_ATTACK, BUFFER);
    if (!press) return;
    const btn = strongestButton(press.bits);
    if (!btn) return;
    this.input.consume(press);
    this.airAttackUsed = true;
    this.airUsed |= BTN_BIT[btn];
    this.startNormal(m, 'air', btn);
  }

  private canCancel(): boolean {
    return !!this.move && this.connected && this.framesSinceConnect <= 14;
  }

  private tryCancel(m: Match): void {
    const mv = this.move;
    if (!mv) return;
    // La ventana cubre el congelamiento de impacto, donde también se guardan pulsaciones.
    const window = m.frame - this.connectFrame + BUFFER + 1;
    const press = this.input.findPress(B_ATTACK, window);
    if (!press) return;
    // Especial o súper. En Modo Poder, un especial se cancela en otro distinto.
    const powerChain = this.powerTimer > 0 && mv.kind === 'special';
    const kinds = powerChain ? ['special', 'super'] : (mv.cancelInto ?? []);
    if (kinds.length) {
      const special = this.findSpecial(m, press, kinds, powerChain ? this.moveId : null);
      if (special) {
        // Combos Killer: desde un DOBLE, el especial es ENLACE (botón débil) o REMATE (fuerte, súper o ultra).
        const fromDoble = this.isDoble;
        const strong = this.pressStrong(press, special);
        this.input.consume(press);
        this.startMove(m, special);
        this.moveStrong = strong;
        if (fromDoble) {
          const k = this.def.moves[special]?.kind;
          this.remate = strong || k === 'super' || k === 'ultra';
          m.emit({ type: 'kiLink', side: this.side, remate: this.remate });
        }
        return;
      }
    }
    // Cadena de normales: débil → fuerte, cada botón una vez por salto en el aire.
    if (mv.kind !== 'normal' || !this.moveBtn || this.mech.chains === false || this.throwData) return;
    const btn = this.chainButton(press.bits);
    if (!btn) return;
    this.input.consume(press);
    if (this.grounded) {
      this.startNormal(m, isDown(this.input.dir()) ? 'crouch' : 'stand', btn);
    } else {
      this.airUsed |= BTN_BIT[btn];
      this.startNormal(m, 'air', btn);
    }
  }

  /** El botón más débil apretado que sigue la cadena (más fuerte que el actual). */
  private chainButton(bits: number): Btn | null {
    const cur = this.moveBtn ? CHAIN_RANK[this.moveBtn] : 99;
    for (const b of CHAIN_ORDER) {
      if (!(bits & BTN_BIT[b]) || CHAIN_RANK[b] <= cur) continue;
      if (!this.grounded && (this.airUsed & BTN_BIT[b])) continue;
      return b;
    }
    return null;
  }

  /** ¿El botón que activó el especial es fuerte? (golpe fuerte o patada fuerte entre sus botones) */
  private pressStrong(press: Press, id: string): boolean {
    const mv = this.def.moves[id];
    let mask = 0;
    for (const b of mv?.buttons ?? []) mask |= BTN_BIT[b];
    const bits = press.bits & (mask || B_ATTACK);
    return (bits & (B_HP | B_HK)) !== 0 && (bits & (B_LP | B_LK)) === 0;
  }

  /** El movimiento en curso es un DOBLE. */
  get isDoble(): boolean {
    return this.moveId.startsWith('__doble_');
  }

  /** El DOBLE en curso todavía se puede romper (desde que empieza hasta su segundo golpe). */
  get dobleBreakable(): boolean {
    return this.state === 'attack' && this.isDoble && this.dobleHits < 2;
  }

  /** Recibiendo un combo (golpeado o volando, con golpes en la cuenta). */
  get inCombo(): boolean {
    return this.comboHits > 0 && !this.ko && (this.state === 'hitstun' || this.state === 'airHit');
  }

  /** Abre la ventana del DOBLE: lo llama la pelea cuando un especial suyo conecta de golpe. */
  openKi(m: Match): void {
    this.kiCombo = true;
    if (this.remate || this.kiDobles >= MAX_DOBLES) return;
    this.kiWindow = KI_WINDOW;
    this.kiOpenFrame = m.frame;
  }

  /** Fin del combo Killer (terminó, lo rompieron o empieza otro round). */
  resetKi(): void {
    this.kiWindow = 0;
    this.kiDobles = 0;
    this.kiCombo = false;
  }

  /**
   * DOBLE: con la ventana abierta (un especial acaba de conectar) y el rival
   * todavía golpeado, un botón hace dos golpes automáticos.
   */
  private tryDoble(m: Match): boolean {
    if (this.kiWindow <= 0 || this.kiDobles >= MAX_DOBLES || !this.grounded || this.throwData) return false;
    if (this.state === 'attack' && this.move?.kind !== 'special') return false;
    const opp = m.opponent(this);
    if (!opp.inCombo || Math.abs(opp.x - this.x) > DOBLE_RANGE) return false;
    const press = this.input.findPress(B_ATTACK, Math.max(BUFFER, m.frame - this.kiOpenFrame + BUFFER + 1));
    if (!press) return false;
    const btn = strongestButton(press.bits);
    const d = btn ? dobleMove(this.def, btn) : null;
    if (!btn || !d) return false;
    this.input.consume(press);
    this.startMoveDef(m, d.id, d.move);
    this.moveStrong = isStrong(btn);
    this.kiDobles++;
    this.kiWindow = 0;
    this.dobleHits = 0;
    this.dobleStart = m.frame;
    m.emit({ type: 'doble', side: this.side, x: this.x + this.facing * 26, y: this.y - 86, strong: this.moveStrong });
    return true;
  }

  /**
   * COMBO BREAKER: recibiendo un DOBLE, los dos botones de su fuerza juntos
   * (débiles contra un doble débil, fuertes contra uno fuerte). Equivocarse, o
   * intentarlo en otra parte de un combo Killer, deja en BLOQUEO.
   */
  private tryBreaker(m: Match): void {
    if (this.lockout > 0 || this.comboHits === 0 || this.ko || this.pinnedBy) return;
    const att = m.opponent(this);
    if (!att.kiCombo) return;
    const breakable = att.dobleBreakable;
    // Desde que empezó el doble (las pulsaciones del congelamiento de impacto cuentan); si no, solo las recientes.
    const within = breakable ? Math.max(BUFFER, Math.min(40, m.frame - att.dobleStart + BUFFER)) : BUFFER;
    const weak = this.input.findCombo(B_LP | B_LK, within, COMBO_SPREAD);
    const strong = this.input.findCombo(B_HP | B_HK, within, COMBO_SPREAD);
    const p = weak && strong ? (weak.age <= strong.age ? weak : strong) : weak ?? strong;
    if (!p) return;
    this.input.consumeCombo(p, COMBO_SPREAD);
    const guessStrong = p === strong;
    if (breakable && guessStrong === att.moveStrong) m.comboBreaker(this, att);
    else m.breakerLockout(this);
  }

  private findSpecial(m: Match, press: Press, kinds: readonly string[], exclude: string | null = null, only?: MotionId): string | null {
    for (const id of this.def.specials) {
      if (id === exclude) continue;
      const mv = this.def.moves[id];
      if (only && mv?.motion !== only) continue;
      // El ultra sale donde sale el súper (de neutro y cancelando).
      if (!mv || !(kinds.includes(mv.kind) || (mv.kind === 'ultra' && kinds.includes('super')))) continue;
      if ((mv.stance === 'air') === this.grounded) continue;
      if (mv.kind === 'super' && this.meter < (mv.meterCost ?? 100)) continue;
      if (mv.kind === 'ultra' && !m.canUltra(this, mv)) continue;
      if (mv.projectile && this.projectileCount > 0) continue;
      if (mv.motion && mv.buttons) {
        let mask = 0;
        for (const b of mv.buttons) mask |= BTN_BIT[b];
        if ((press.bits & mask) && this.input.motion(mv.motion, press.age, mask)) return id;
      }
    }
    return null;
  }

  /** Mantener y soltar: el botón estuvo apretado HOLD_FRAMES o más y se acaba de soltar. */
  private tryHoldRelease(m: Match): boolean {
    for (const id of this.def.specials) {
      const mv = this.def.moves[id];
      if (!mv || mv.motion !== 'hold' || !mv.buttons || (mv.stance === 'air') === this.grounded) continue;
      if (mv.kind === 'super' && this.meter < (mv.meterCost ?? 100)) continue;
      if (mv.kind === 'ultra' && !m.canUltra(this, mv)) continue;
      if (mv.projectile && this.projectileCount > 0) continue;
      let mask = 0;
      for (const b of mv.buttons) mask |= BTN_BIT[b];
      if (!this.input.findRelease(mask, BUFFER + 6)) continue;
      this.input.consumeRelease();
      this.startMove(m, id);
      return true;
    }
    return false;
  }

  startMove(m: Match, id: string): void {
    const mv = this.def.moves[id];
    if (mv) this.startMoveDef(m, id, mv);
  }

  private startNormal(m: Match, stance: Stance, btn: Btn): void {
    this.startMove(m, this.def.normals[stance][btn]);
    if (this.move) this.moveBtn = btn;
  }

  private startMoveDef(m: Match, id: string, mv: MoveDef): void {
    if (this.ultraRun) this.releaseUltra();
    this.karaPress = null;
    this.move = mv;
    this.moveId = id;
    this.moveBtn = null;
    this.attackSerial = m.nextSerial();
    this.groupsConnected = 0;
    this.connected = false;
    this.framesSinceConnect = 0;
    this.launchFollow = 0;
    this.moveStrong = false;
    this.remate = false;
    this.remateHit = false;
    if (mv.stance !== 'air') this.vx = 0;
    this.setState('attack', mv.anim);
    if (mv.kind === 'super' || mv.kind === 'ultra') {
      this.meter -= mv.meterCost ?? (mv.kind === 'ultra' ? 200 : 100);
      m.superFlash(this, mv);
      if (mv.kind === 'ultra') m.emit({ type: 'sfx', name: 'voz/ultra', side: this.side, who: this.def.id });
    } else if (mv.kind === 'special') {
      this.addMeter(3);
    }
    m.emit({ type: 'attack', side: this.side, heavy: mv.hit.damage >= 60, special: mv.kind !== 'normal' });
  }

  endMove(): void {
    if (this.throwData) {
      const v = this.throwData.victim;
      this.throwData = null;
      if (v.state === 'thrown') v.toNeutral();
      v.thrownBy = null;
    }
    if (this.ultraRun) this.releaseUltra();
    this.move = null;
    this.moveId = '';
    this.moveBtn = null;
    this.connected = false;
  }

  /** Corta el ultra en curso (lo interrumpieron o terminó): la víctima queda libre. */
  releaseUltra(): void {
    const run = this.ultraRun;
    this.ultraRun = null;
    if (!run) return;
    const v = run.victim;
    if (v.pinnedBy !== this) return;
    v.pinnedBy = null;
    if (v.state === 'pinned') {
      v.stun = 18;
      v.setState('hitstun', 'hitHigh');
    }
  }

  toNeutral(): void {
    this.vx = 0;
    if (isDown(this.input.dir())) this.setState('crouch', 'crouch');
    else this.setState('idle', 'idle');
  }

  addMeter(n: number): void {
    this.meter = Math.max(0, Math.min(MAX_METER, this.meter + n));
  }

  /** Fin del combo: vuelve el tope normal de golpes en el aire. */
  resetJuggle(): void {
    this.juggle = 0;
    this.juggleCap = MAX_JUGGLE;
  }

  // ---------------------------------------------------------------- avance

  /** Avanza la animación, los temporizadores y la física un cuadro. */
  advance(m: Match): void {
    this.stateFrame++;
    if (this.invulnTimer > 0) this.invulnTimer--;
    if (this.throwProtect > 0) this.throwProtect--;
    if (this.connected) this.framesSinceConnect++;
    if (this.launchFollow > 0) this.launchFollow--;
    if (this.kiWindow > 0 && !(this.state === 'attack' && this.move?.kind === 'special')) this.kiWindow--;
    if (this.lockout > 0) this.lockout--;
    if (this.powerTimer > 0 && --this.powerTimer === 0) {
      m.emit({ type: 'powerMode', side: this.side, x: this.x, y: this.y - 70, color: this.def.ui.fx, on: false });
    }
    this.stepAnim(m);

    switch (this.state) {
      case 'crouchDown':
        if (this.animDone) this.setState('crouch', 'crouch');
        break;
      case 'crouchUp':
        if (this.animDone) this.setState('idle', 'idle');
        break;
      case 'preJump':
        if (this.animDone) {
          // Arriba soltado antes de despegar: salto corto.
          const kind: JumpKind = this.superJumpQueued ? 'super' : isUp(this.input.dir()) ? 'normal' : 'short';
          this.launchJump(m, kind);
        }
        break;
      case 'jump': {
        const want = this.vy < -2 ? 'jumpUp' : this.vy < 2 ? 'jumpTop' : 'jumpFall';
        if (this.animName !== want) this.setAnim(want);
        break;
      }
      case 'land':
        if (--this.landTimer <= 0) this.toNeutral();
        break;
      case 'attack':
        this.advanceAttack(m);
        break;
      case 'pinned':
        // Lo mueve y lo golpea la secuencia del ultra (Match.updateUltras).
        this.vx = 0;
        this.vy = 0;
        break;
      case 'blockstun':
      case 'hitstun':
        if (--this.stun <= 0) {
          const wasHit = this.state === 'hitstun';
          this.toNeutral();
          this.throwProtect = 6;
          if (wasHit) m.comboEnded(this);
        }
        break;
      case 'airHit':
        if (this.vy > 0.5 && this.animName !== 'fall') this.setAnim('fall');
        break;
      case 'knockdown':
        if (!this.ko && --this.knockTimer <= 0) this.setState('getup', 'getup');
        break;
      case 'getup':
        if (this.animDone) {
          this.toNeutral();
          this.invulnTimer = 3;
          this.throwProtect = 10;
        }
        break;
      case 'taunt':
        if (this.animDone) {
          m.tauntComplete(this);
          this.toNeutral();
        }
        break;
      case 'roll':
        // Al final de la rodada frena y queda vulnerable (castigable).
        if (!this.rollInvuln) this.vx *= 0.72;
        if (this.stateFrame >= this.rollFrames) this.toNeutral();
        break;
      case 'powerUp':
        // Con animación propia dura lo que dura; con la de reemplazo, medio segundo.
        if (this.def.anims.powerUp ? this.animDone : this.stateFrame >= 30) this.toNeutral();
        break;
      default:
        break;
    }
    this.integrate(m);
  }

  /** Despega. vxFollow fija la velocidad horizontal (supersalto tras un lanzador). */
  private launchJump(m: Match, kind: JumpKind, vxFollow?: number): void {
    const j = this.def.jump;
    let vy = j.vy;
    let vx = j.vx;
    if (kind === 'super') {
      vy = this.mech.superJump?.vy ?? j.vy * 1.3;
      vx = this.mech.superJump?.vx ?? j.vx * 1.25;
    } else if (kind === 'short') {
      vy = this.mech.shortHop?.vy ?? j.vy * 0.7;
      vx = this.mech.shortHop?.vx ?? j.vx * 1.05;
    }
    this.jumpKind = kind;
    this.superJumpQueued = false;
    this.grounded = false;
    this.vy = -vy;
    this.vx = this.jumpDir * (vxFollow ?? vx) * this.facing;
    this.airAttackUsed = false;
    this.airUsed = 0;
    this.setState('jump', 'jumpUp');
    m.emit({ type: 'jump', side: this.side, x: this.x, kind });
  }

  private advanceAttack(m: Match): void {
    if (this.ultraRun) {
      if (this.animDone) m.nextUltraStep(this);
      return;
    }
    if (!this.animDone || !this.move || this.throwData) return;
    if (this.move.endsInAir && !this.grounded) return; // mantiene el último cuadro hasta aterrizar
    if (this.move.stance === 'air' && !this.grounded) {
      this.endMove();
      this.state = 'jump';
      this.stateFrame = 0;
      this.airAttackUsed = true;
      this.setAnim(this.vy < 0 ? 'jumpUp' : 'jumpFall');
      return;
    }
    this.endMove();
    this.toNeutral();
  }

  private gravityNow(): number {
    const g = this.frame.gravity;
    if (g !== undefined && this.state === 'attack') return g;
    // En el aire tras varios golpes cae cada vez más rápido (evita combos infinitos).
    if (this.state === 'airHit') return 0.42 + 0.03 * Math.max(0, this.juggle - 2);
    return this.def.jump.gravity;
  }

  private integrate(m: Match): void {
    if (this.state === 'thrown') return;
    if (!this.grounded) {
      this.vy += this.gravityNow();
      this.x += this.vx;
      this.y += this.vy;
      if (this.y >= 0 && this.vy >= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.entering = false;
        this.onLand(m);
      }
    } else {
      this.x += this.vx;
      this.y = 0;
    }
    if (this.slideV !== 0) {
      this.x += this.slideV;
      this.slideV *= 0.78;
      if (Math.abs(this.slideV) < 0.05) this.slideV = 0;
    }
  }

  private onLand(m: Match): void {
    switch (this.state) {
      case 'jump':
        this.vx = 0;
        this.landTimer = this.jumpKind === 'short' ? 2 : 4;
        this.setState('land', 'land');
        m.emit({ type: 'land', side: this.side, x: this.x, heavy: this.jumpKind === 'super' });
        break;
      case 'attack':
        this.vx = 0;
        this.landTimer = this.move?.landRecovery ?? 3;
        this.endMove();
        this.setState('land', 'land');
        m.emit({ type: 'land', side: this.side, x: this.x, heavy: false });
        break;
      case 'airHit':
        this.vx = 0;
        if (this.ko) {
          this.setState('ko', 'knockdown');
        } else {
          this.knockTimer = 32;
          this.setState('knockdown', 'knockdown');
        }
        m.emit({ type: 'land', side: this.side, x: this.x, heavy: true });
        m.comboEnded(this);
        break;
      default:
        this.vx = 0;
        break;
    }
  }

  // ---------------------------------------------------------------- golpes recibidos

  enterHitstun(stun: number, low: boolean): void {
    const crouch = this.crouching;
    this.endMove();
    this.vx = 0;
    this.stun = stun;
    this.setState('hitstun', crouch ? 'hitCrouch' : low ? 'hitLow' : 'hitHigh');
  }

  enterBlockstun(stun: number, crouch: boolean): void {
    this.endMove();
    this.vx = 0;
    this.stun = stun;
    this.blockCrouch = crouch;
    this.setState('blockstun', crouch ? 'blockCrouch' : 'blockStand');
  }

  enterAirHit(vx: number, vy: number): void {
    this.endMove();
    this.grounded = false;
    this.vx = vx;
    this.vy = vy;
    this.juggle++;
    this.setState('airHit', 'airHit');
  }

  hittable(): boolean {
    if (this.invulnTimer > 0) return false;
    switch (this.state) {
      case 'knockdown':
      case 'getup':
      case 'ko':
      case 'thrown':
      case 'pinned':
      case 'intro':
      case 'win':
        return false;
      default:
        break;
    }
    if (this.state === 'airHit' && (this.ko || this.juggle > this.juggleCap)) return false;
    if (this.rollInvuln) return false;
    return !this.frame.invuln;
  }

  throwable(): boolean {
    if (!this.grounded || this.throwProtect > 0 || this.invulnTimer > 0 || this.frame.throwInvuln) return false;
    return ACTIONABLE.has(this.state) || this.state === 'attack' || this.state === 'taunt' || this.state === 'land';
  }

  /** ¿Puede bloquear un golpe que viene desde srcX? */
  canBlock(srcX: number, guard: GuardType): boolean {
    if (guard === 'unblockable' || !this.grounded) return false;
    if (!ACTIONABLE.has(this.state) && this.state !== 'blockstun') return false;
    const d = this.input.dir();
    const towards = Math.sign(srcX - this.x) || this.facing;
    // "Atrás" es alejarse del atacante (sirve también contra ataques cruzados).
    const away = towards === this.facing ? isBack(d) : isForward(d);
    if (!away) return false;
    const crouch = isDown(d);
    if (guard === 'low' && !crouch) return false;
    if (guard === 'high' && crouch) return false;
    return true;
  }

  // ---------------------------------------------------------------- cajas

  pushbox(): Box {
    const f = this.frame;
    if (f.push) return f.push;
    if (!this.grounded) return this.def.push.air;
    return this.crouching ? this.def.push.crouch : this.def.push.stand;
  }

  hurtboxes(): Box[] {
    const f = this.frame;
    if (f.hurt) {
      this.lastHurt = f.hurt;
      return f.hurt;
    }
    return this.lastHurt ?? [this.pushbox()];
  }

  worldBox(b: Box): Aabb {
    const y0 = this.y + b.y;
    const y1 = y0 + b.h;
    if (this.facing === 1) return { x0: this.x + b.x, y0, x1: this.x + b.x + b.w, y1 };
    return { x0: this.x - b.x - b.w, y0, x1: this.x - b.x, y1 };
  }

  /**
   * 2 VS 2: prepara al luchador para entrar a la pantalla (cambio, ayuda o
   * reemplazo tras un K.O.). Con y < 0 cae desde ahí con la velocidad dada
   * (puede atacar en el aire al caer); con y = 0 aparece parado.
   */
  enterAt(x: number, y: number, vx: number, vy: number, facing: 1 | -1): void {
    this.endMove();
    this.x = x;
    this.y = Math.min(0, y);
    this.vx = vx;
    this.vy = vy;
    this.slideV = 0;
    this.facing = facing;
    this.grounded = y >= 0;
    this.hitstop = 0;
    this.stun = 0;
    this.comboHits = 0;
    this.comboDamage = 0;
    this.resetJuggle();
    this.invulnTimer = 0;
    this.throwProtect = 0;
    this.powerTimer = 0;
    this.launchFollow = 0;
    this.airUsed = 0;
    this.airAttackUsed = false;
    this.jumpKind = 'normal';
    this.jumpDir = 0;
    this.superJumpQueued = false;
    this.thrownBy = null;
    this.lastHurt = null;
    this.resetKiAll();
    this.input.reset();
    this.entering = !this.grounded;
    if (this.grounded) this.setState('idle', 'idle');
    else this.setState('jump', 'jumpFall');
  }

  /** 2 VS 2: sale de la pantalla de un salto hacia atrás (sin control ni colisiones; lo mueve la pelea). */
  startFlight(): void {
    this.endMove();
    this.vx = -this.facing * 7;
    this.vy = -11;
    this.grounded = false;
    this.invulnTimer = 9999;
    this.powerTimer = 0;
    this.entering = false;
    this.setState('jump', 'jumpUp');
  }

  resetForRound(x: number, facing: 1 | -1): void {
    this.endMove();
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.slideV = 0;
    this.facing = facing;
    this.grounded = true;
    this.health = this.def.health;
    this.ko = false;
    this.resetJuggle();
    this.comboHits = 0;
    this.comboDamage = 0;
    this.hitstop = 0;
    this.stun = 0;
    this.invulnTimer = 0;
    this.throwProtect = 0;
    this.projectileCount = 0;
    this.powerTimer = 0;
    this.red = 0;
    this.entering = false;
    this.launchFollow = 0;
    this.airUsed = 0;
    this.jumpKind = 'normal';
    this.superJumpQueued = false;
    this.thrownBy = null;
    this.lastHurt = null;
    this.resetKiAll();
    this.input.reset();
    // Espera en guardia; la animación de entrada la pone el Match una sola vez, justo antes del "FIGHT!".
    this.setState('intro', 'idle');
  }

  /** Todo el estado de combos Killer y del ultra en cero (round nuevo, entrada en 2 VS 2). */
  private resetKiAll(): void {
    this.resetKi();
    this.lockout = 0;
    this.kiEnder = false;
    this.kiUltra = false;
    this.remate = false;
    this.remateHit = false;
    this.dobleHits = 0;
    this.ultraRun = null;
    this.pinnedBy = null;
  }
}
