import { MAX_ROUNDS, ROUND_TIME, ROUNDS_TO_WIN, STAGE_W, VIEW_W, WALL_MARGIN } from '../config';
import { B_ASSIST, B_HP, B_LP, B_TAG, NEUTRAL_INPUT, type FrameInput } from '../input/buffer';
import type { SimEvent } from './events';
import {
  ACTIONABLE, Fighter, LAUNCH_FOLLOW, LOCKOUT_FRAMES, MAX_JUGGLE_LAUNCHED, lastGroup, ultraAnim, type Aabb, type StateName,
} from './fighter';
import { Rng } from './rng';
import type { FighterDef, HitProps, MoveDef, ProjectileDef } from './types';

export type Phase = 'intro' | 'fight' | 'ko' | 'timeover' | 'matchEnd';

// ---------------------------------------------------------------- 2 VS 2

/** Parte del daño que queda como vida roja (recuperable). */
const RED_SHARE = 0.5;
/** Vida roja que recupera por cuadro el compañero que descansa (fracción de la vida máxima: media barra en ~10 s). */
const RED_REGEN = 1 / 1200;
/** Cuadros de espera entre cambios. */
export const TAG_COOLDOWN = 180;
/** Cuadros de espera para volver a llamar a la ayuda, desde que se va (más si la golpearon). */
export const ASSIST_COOLDOWN = 240;
export const ASSIST_COOLDOWN_HIT = 360;
/** Cuadros desde el K.O. del punto hasta que entra el compañero. */
const KO_ENTRY_DELAY = 64;
/** Invulnerabilidad del que entra tras un K.O.: la caída (~28 cuadros) y ~40 más. */
const KO_ENTRY_INVULN = 68;
/** Altura desde la que cae a la pantalla el que entra. */
const ENTRY_Y = -200;
/** Cuadros que el caído queda en el suelo antes de desaparecer. */
export const DEAD_LINGER = 40;

// ---------------------------------------------------------------- combos Killer y ultra

/** Rival EN PELIGRO (su barra parpadea en rojo y se le puede hacer el ultra): vida igual o menor a esta fracción. */
export const DANGER = 0.25;
/** REMATE: daño extra por cada golpe que ya lleva el combo, con tope. */
const REMATE_PER_HIT = 6;
const REMATE_MAX = 120;
/** REMATE: el último golpe derriba al rival con esta velocidad. */
const REMATE_LAUNCH = { vx: 2.6, vy: -5.6 };
/** COMBO BREAKER: retroceso de quien estaba pegando y premio para quien lo rompe. */
const BREAK_RECOIL = 18;
const BREAK_INVULN = 14;
const BREAK_METER = 25;

/** Presentación del round: "ROUND N" al empezar (deja ~1,3 s para la voz) y "FIGHT!" en este cuadro. */
export const FIGHT_AT = 76;
/** Cuadro en que se suelta el control. */
const INTRO_END = 90;

/** Estados en que no se puede llamar a la ayuda (golpeado, en el suelo, fuera de la pelea). */
const NO_ASSIST: ReadonlySet<StateName> = new Set<StateName>([
  'hitstun', 'blockstun', 'airHit', 'knockdown', 'getup', 'thrown', 'ko', 'intro', 'win', 'lose',
]);

/**
 * Movimiento de ayuda: FighterDef.assist o el primer especial con un proyectil
 * que avanza (si no hay, uno con cualquier proyectil, o el primer especial).
 */
export function assistMoveId(def: FighterDef): string {
  if (def.assist && def.moves[def.assist]) return def.assist;
  const specials = def.specials.filter((id) => def.moves[id]?.kind === 'special' && def.moves[id].stance !== 'air');
  const proj = (id: string) => def.projectiles[def.moves[id].projectile ?? ''];
  return (
    specials.find((id) => (proj(id)?.speed ?? 0) > 0) ??
    specials.find((id) => proj(id)) ??
    specials[0] ??
    def.normals.stand.hp
  );
}

/** Súper del luchador (para el súper en equipo), o null. */
export function superMoveId(def: FighterDef): string | null {
  return def.specials.find((id) => def.moves[id]?.kind === 'super' && def.moves[id].stance !== 'air') ?? null;
}

export type ExtraRole = 'assist' | 'leaving' | 'dead';

/** Un luchador en pantalla que no es el punto: la ayuda, el que sale o el caído. */
export interface Extra {
  f: Fighter;
  role: ExtraRole;
  /** Cuadros en este rol (el caído cuenta solo mientras está en el suelo). */
  t: number;
  /** La ayuda ya empezó su movimiento. */
  started: boolean;
  /** La ayuda recibió un golpe (tarda más en volver). */
  hit: boolean;
  /** Va saliendo de un salto: sin colisiones. */
  flying: boolean;
  /** Movimiento de la ayuda. */
  moveId: string;
}

export interface Team {
  members: Fighter[];
  /** Índice del punto: el que pelea en pantalla (match.fighters[lado]). */
  point: number;
  /** Miembros fuera de combate. */
  out: boolean[];
  /** Cuadros que faltan para poder cambiar. */
  tagCd: number;
  /** Cuadros que faltan para poder llamar a la ayuda (corren cuando la ayuda ya se fue). */
  assistCd: number;
  /** Duración de la última espera de la ayuda (para la barrita del HUD). */
  assistCdMax: number;
  /** La ayuda en pantalla (o null). */
  assist: Extra | null;
  /** Cuadros que faltan para que entre el compañero tras el K.O. del punto (-1: nada pendiente). */
  incoming: number;
}

/** Lo que muestra el HUD de un equipo. */
export interface TeamStatus {
  partner: Fighter | null;
  /** 0..1: lista cuando llega a 1. */
  assist: number;
  tag: number;
}

export class Projectile {
  frame = 0;
  dead = false;
  cooldown = 0;
  hitstop = 0;
  /** Cuadros restantes "en contacto" (para frenar el súper mientras golpea). */
  hitting = 0;
  power: number;
  /** Solo se ve (la onda que tira un ultra): no choca ni golpea. */
  cosmetic = false;
  /** Lo lanzó un REMATE: su primer golpe suma el daño extra y el último derriba. */
  remate = false;

  constructor(
    readonly owner: Fighter,
    readonly def: ProjectileDef,
    public x: number,
    public y: number,
    public vx: number,
    public hitsLeft: number,
    public life: number,
    /** Hacia dónde mira (los proyectiles quietos, como un rayo, no tienen velocidad que lo diga). */
    readonly dir: 1 | -1 = vx < 0 ? -1 : 1,
  ) {
    this.power = def.strength;
    this.cooldown = def.delay ?? 0;
  }

  box(): Aabb {
    const b = this.def.box;
    const y0 = this.y + b.y;
    if (this.dir > 0) return { x0: this.x + b.x, y0, x1: this.x + b.x + b.w, y1: y0 + b.h };
    return { x0: this.x - b.x - b.w, y0, x1: this.x - b.x, y1: y0 + b.h };
  }
}

interface HitResult {
  att: Fighter;
  def: Fighter;
  props: HitProps;
  group: number;
  point: { x: number; y: number };
  proj: Projectile | null;
}

function overlapCenter(a: Aabb, b: Aabb): { x: number; y: number } | null {
  const x0 = Math.max(a.x0, b.x0);
  const x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0);
  const y1 = Math.min(a.y1, b.y1);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

function firstOverlap(a: Aabb, list: Aabb[]): { x: number; y: number } | null {
  for (const b of list) {
    const c = overlapCenter(a, b);
    if (c) return c;
  }
  return null;
}

/** Escalado de daño en combos: los primeros 2 golpes al 100%, luego baja hasta 40%. */
function comboScale(hitsTaken: number): number {
  return hitsTaken < 2 ? 1 : Math.max(0.4, 1 - 0.1 * (hitsTaken - 1));
}

const POSE_FROM: ReadonlySet<StateName> = new Set<StateName>([...ACTIONABLE, 'intro']);

/** Una pelea completa al mejor de 3 rounds. Determinista: mismas entradas = mismo resultado. */
export class Match {
  readonly fighters: [Fighter, Fighter];
  readonly projectiles: Projectile[] = [];
  readonly events: SimEvent[] = [];
  readonly rng: Rng;
  frame = 0;
  phase: Phase = 'intro';
  phaseFrame = 0;
  round = 1;
  timer = ROUND_TIME;
  private timerSub = 0;
  freeze = 0;
  freezeOwner: Fighter | null = null;
  slowmo = 0;
  /** Cuadros que el round 1 espera las frases de entrada antes del "ROUND 1" (y cuándo se canta en este round). */
  private introDelay = 0;
  private callAt = 0;
  camX = STAGE_W / 2;
  private serial = 0;
  roundWinner: 0 | 1 | -1 | null = null;
  matchWinner: 0 | 1 | -1 | null = null;
  over = false;

  /** Modo práctica: sin tiempo, sin K.O. ni fin de round. */
  readonly practice: boolean;
  /**
   * 2 VS 2 (null en 1 vs 1): dos luchadores por lado; fighters[lado] es el
   * punto y cambia con el CAMBIO o cuando el punto cae. Un solo round.
   */
  readonly teams: [Team, Team] | null;
  /** 2 VS 2: luchadores en pantalla que no son el punto (ayudas, el que sale, el caído). */
  readonly extras: Extra[] = [];

  constructor(
    defs: readonly [FighterDef, FighterDef],
    seed = 1,
    opts: {
      practice?: boolean;
      teams?: readonly [readonly FighterDef[], readonly FighterDef[]];
      /** Cuadros que esperan en el round 1 las frases de entrada de los luchadores antes del "ROUND 1". */
      introDelay?: number;
    } = {},
  ) {
    this.rng = new Rng(seed);
    this.practice = !!opts.practice;
    this.introDelay = Math.max(0, Math.round(opts.introDelay ?? 0));
    const teams = opts.teams && !this.practice && opts.teams[0].length && opts.teams[1].length ? opts.teams : null;
    if (teams) {
      const mk = (side: 0 | 1): Team => {
        const members = teams[side].map((d) => new Fighter(d, side));
        return {
          members, point: 0, out: members.map(() => false),
          tagCd: 0, assistCd: 0, assistCdMax: ASSIST_COOLDOWN, assist: null, incoming: -1,
        };
      };
      this.teams = [mk(0), mk(1)];
      this.fighters = [this.teams[0].members[0], this.teams[1].members[0]];
    } else {
      this.teams = null;
      this.fighters = [new Fighter(defs[0], 0), new Fighter(defs[1], 1)];
    }
    this.startRound();
  }

  /** Práctica: los dos al centro, vida completa, sin proyectiles; la pelea sigue. */
  practiceReset(): void {
    this.projectiles.length = 0;
    this.freeze = 0;
    this.freezeOwner = null;
    this.slowmo = 0;
    const [a, b] = this.fighters;
    a.resetForRound(STAGE_W / 2 - 70, 1);
    b.resetForRound(STAGE_W / 2 + 70, -1);
    for (const f of this.fighters) f.setState('idle', 'idle');
    this.camX = STAGE_W / 2;
  }

  /** Aplica daño; en práctica la vida nunca llega a 0 (no hay K.O.). En 2 VS 2 parte queda como vida roja. */
  private hurt(f: Fighter, amount: number): void {
    const before = f.health;
    f.health = Math.max(this.practice ? 1 : 0, f.health - amount);
    if (this.teams) f.red = f.health > 0 ? Math.min(f.def.health - f.health, f.red + (before - f.health) * RED_SHARE) : 0;
  }

  opponent(f: Fighter): Fighter {
    return this.fighters[f.side === 0 ? 1 : 0];
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  nextSerial(): number {
    return ++this.serial;
  }

  // ---------------------------------------------------------------- cuadro

  step(inputs: readonly [FrameInput, FrameInput]): void {
    if (this.over) return;
    this.frame++;
    const [a, b] = this.fighters;
    a.input.push(inputs[0], a.facing);
    b.input.push(inputs[1], b.facing);
    // Las ayudas y los que salen no leen al jugador: se mueven solos.
    for (const e of this.extras) e.f.input.push(NEUTRAL_INPUT, e.f.facing);

    // Cámara lenta del K.O.: la simulación avanza un cuadro de cada dos.
    if (this.slowmo > 0) {
      this.slowmo--;
      if (this.slowmo % 2 === 1) return;
    }
    // Flash de súper: todo congelado.
    if (this.freeze > 0) {
      this.freeze--;
      if (this.freeze === 0) this.freezeOwner = null;
      return;
    }

    this.phaseFrame++;
    this.updatePhase();
    if (this.teams) this.updateTeams();

    const active: [boolean, boolean] = [false, false];
    for (const f of this.fighters) {
      if (f.hitstop > 0) f.hitstop--;
      else active[f.side] = true;
    }
    const [p0, p1] = this.fighters;
    if (active[0]) p0.think(this);
    if (active[1]) p1.think(this);
    if (active[0]) p0.advance(this);
    if (active[1]) p1.advance(this);
    if (this.extras.length) this.stepExtras();

    this.updateUltras();
    this.updateThrows();
    this.resolvePush();
    this.updateCamera();
    this.updateFacing();
    this.updateProjectiles();
    this.detectHits();
  }

  // ---------------------------------------------------------------- rounds

  private startRound(): void {
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.timer = ROUND_TIME;
    this.timerSub = 0;
    this.projectiles.length = 0;
    this.freeze = 0;
    this.freezeOwner = null;
    this.slowmo = 0;
    this.roundWinner = null;
    this.extras.length = 0;
    const [a, b] = this.fighters;
    a.resetForRound(STAGE_W / 2 - 70, 1);
    b.resetForRound(STAGE_W / 2 + 70, -1);
    this.camX = STAGE_W / 2;
    // En práctica también hay presentación ("ROUND 1"… "FIGHT!"); después no hay rounds ni K.O.
    // Frase de entrada de cada luchador (si tiene, ej. Pablito: "Yo vengo deportado de Venecia").
    if (this.round === 1) for (const f of this.fighters) this.emit({ type: 'sfx', name: 'voz/intro', side: f.side, who: f.def.id });
    // En el round 1 el anunciador espera que terminen esas frases (una después de la otra).
    this.callAt = this.round === 1 ? this.introDelay : 0;
    if (this.callAt === 0) this.announceRound();
  }

  private announceRound(): void {
    const [a, b] = this.fighters;
    const final = a.wins === ROUNDS_TO_WIN - 1 && b.wins === ROUNDS_TO_WIN - 1;
    this.emit({ type: 'announce', text: final ? 'ROUND FINAL' : `ROUND ${this.round}`, kind: final ? 'final' : 'round' });
  }

  private updatePhase(): void {
    switch (this.phase) {
      case 'intro':
        if (this.callAt > 0 && this.phaseFrame === this.callAt) this.announceRound();
        if (this.phaseFrame === this.callAt + FIGHT_AT) {
          this.emit({ type: 'announce', text: 'FIGHT!', kind: 'fight' });
        }
        if (this.phaseFrame >= this.callAt + INTRO_END) {
          this.phase = 'fight';
          this.phaseFrame = 0;
          for (const f of this.fighters) if (f.state === 'intro') f.setState('idle', 'idle');
        }
        break;
      case 'fight':
        // El reloj se detiene en práctica y mientras corre un ultra.
        if (this.practice || this.ultraActive) break;
        if (++this.timerSub >= 60) {
          this.timerSub = 0;
          this.timer--;
          if (this.timer <= 0) {
            this.timer = 0;
            this.timeOver();
          }
        }
        break;
      case 'ko':
      case 'timeover': {
        const w = this.roundWinner;
        if (this.phaseFrame >= 90 && this.phaseFrame < 180) {
          for (const f of this.fighters) {
            if (w === f.side && f.state !== 'win') this.tryPose(f, 'win');
            else if (this.phase === 'timeover' && w !== f.side && f.state !== 'lose') this.tryPose(f, 'lose');
          }
        }
        if (this.phaseFrame === 110 && (w === 0 || w === 1)) {
          const f = this.fighters[w];
          const t = this.teams?.[w];
          const perfect = t ? t.members.every((mb, i) => !t.out[i] && mb.health === mb.def.health) : f.health === f.def.health;
          if (perfect) {
            this.emit({ type: 'announce', text: '¡PERFECT!', kind: 'perfect' });
            this.emit({ type: 'sfx', name: 'perfect' });
          }
        }
        if (this.phaseFrame >= 210) this.endRound();
        break;
      }
      case 'matchEnd':
        if (this.matchWinner === 0 || this.matchWinner === 1) {
          const f = this.fighters[this.matchWinner];
          if (f.state !== 'win') this.tryPose(f, 'win');
        }
        if (this.phaseFrame >= 240) this.over = true;
        break;
    }
  }

  private tryPose(f: Fighter, pose: 'win' | 'lose'): void {
    if (!f.grounded || !POSE_FROM.has(f.state)) return;
    f.vx = 0;
    f.setState(pose, pose);
    if (pose === 'win') this.emit({ type: 'sfx', name: 'voz/victoria', side: f.side, who: f.def.id });
  }

  private timeOver(): void {
    this.phase = 'timeover';
    this.phaseFrame = 0;
    // En 2 VS 2 gana el equipo con más vida en total (los caídos suman 0).
    const ratio = (side: 0 | 1): number => {
      const members = this.teams ? this.teams[side].members : [this.fighters[side]];
      let h = 0;
      let max = 0;
      for (const f of members) {
        h += f.health;
        max += f.def.health;
      }
      return h / Math.max(1, max);
    };
    const ra = ratio(0);
    const rb = ratio(1);
    this.roundWinner = ra > rb ? 0 : rb > ra ? 1 : -1;
    this.emit({ type: 'announce', text: '¡SE ACABÓ EL TIEMPO!', kind: 'time' });
    this.emit({ type: 'sfx', name: 'timeover' });
  }

  private onKO(victim: Fighter): void {
    if (this.teams && this.teamKO(victim)) return;
    if (this.phase === 'ko') {
      // Los dos cayeron en el mismo cuadro.
      if (this.roundWinner === victim.side || this.roundWinner === null) return;
      this.roundWinner = -1;
      this.emit({ type: 'announce', text: 'DOBLE K.O.', kind: 'ko' });
      return;
    }
    if (this.phase !== 'fight') return;
    this.phase = 'ko';
    this.phaseFrame = 0;
    this.roundWinner = this.opponent(victim).side;
    this.slowmo = 60;
    this.emit({ type: 'ko', side: victim.side, x: victim.x, y: victim.y - 70 });
    this.emit({ type: 'announce', text: 'K.O.', kind: 'ko' });
    this.emit({ type: 'sfx', name: 'ko' });
  }

  private endRound(): void {
    const [a, b] = this.fighters;
    if (this.roundWinner === 0) a.wins++;
    else if (this.roundWinner === 1) b.wins++;
    else {
      a.wins++;
      b.wins++;
    }
    // 2 VS 2: un solo round (termina cuando cae un equipo completo o se acaba el tiempo).
    const done = !!this.teams || a.wins >= ROUNDS_TO_WIN || b.wins >= ROUNDS_TO_WIN || this.round >= MAX_ROUNDS;
    if (!done) {
      this.round++;
      this.startRound();
      return;
    }
    this.phase = 'matchEnd';
    this.phaseFrame = 0;
    this.projectiles.length = 0;
    if (a.wins === b.wins) {
      this.matchWinner = -1;
      this.emit({ type: 'announce', text: '¡EMPATE!', kind: 'draw' });
    } else {
      const w = a.wins > b.wins ? a : b;
      this.matchWinner = w.side;
      this.emit({ type: 'announce', text: `¡GANA ${w.def.name.toUpperCase()}!`, kind: 'winner' });
    }
  }

  // ---------------------------------------------------------------- reglas

  /** ¿att está atacando de forma que def debería ponerse en guardia? */
  threatens(att: Fighter, def: Fighter): boolean {
    if (this.attackThreat(att, def)) return true;
    // En 2 VS 2 también amenazan la ayuda del rival y los proyectiles de todo su equipo.
    for (const e of this.extras) {
      if (e.f.side === att.side && !e.flying && e.role !== 'dead' && this.attackThreat(e.f, def)) return true;
    }
    for (const p of this.projectiles) {
      if (p.dead || p.cosmetic || p.owner.side !== att.side) continue;
      const dx = def.x - p.x;
      // Uno quieto (rayo, remolino) amenaza si está encima.
      if (p.vx === 0 ? Math.abs(dx) < 70 : Math.sign(dx) === Math.sign(p.vx) && Math.abs(dx) < 150) return true;
    }
    return false;
  }

  private attackThreat(att: Fighter, def: Fighter): boolean {
    return att.state === 'attack' && !!att.move && att.move.kind !== 'throw' && Math.abs(att.x - def.x) < 160;
  }

  canThrow(att: Fighter, def: Fighter): boolean {
    return this.phase === 'fight' && att.grounded && Math.abs(att.x - def.x) <= att.def.throwRange && def.throwable();
  }

  startThrow(att: Fighter, def: Fighter, back: boolean): void {
    att.startMove(this, att.def.throwMove);
    att.throwData = { victim: def, t: 0, back };
    def.endMove();
    def.vx = 0;
    def.slideV = 0;
    def.setState('thrown', 'hitHigh');
    def.thrownBy = att;
    this.emit({ type: 'grab', side: att.side });
  }

  private updateThrows(): void {
    for (const att of this.fighters) {
      const td = att.throwData;
      if (!td || att.hitstop > 0) continue;
      const v = td.victim;
      if (v.state !== 'thrown') {
        att.throwData = null;
        continue;
      }
      td.t++;
      v.x = att.x + att.facing * 34;
      v.y = 0;
      // Escape: el agarrado aprieta golpe en los primeros cuadros.
      const tech = td.t <= 10 ? v.input.findPress(B_HP | B_LP, 3) : null;
      if (tech) {
        v.input.consume(tech);
        att.throwData = null;
        v.thrownBy = null;
        att.enterBlockstun(14, false);
        v.enterBlockstun(14, false);
        att.slideV = -att.facing * 3.2;
        v.slideV = att.facing * 3.2;
        this.emit({ type: 'tech', x: (att.x + v.x) / 2, y: -100 });
        continue;
      }
      if (td.t >= 14) {
        const dir = td.back ? -att.facing : att.facing;
        if (td.back) v.x = att.x - att.facing * 28;
        att.throwData = null;
        v.thrownBy = null;
        const dmg = att.def.throwDamage;
        this.hurt(v, dmg);
        v.comboHits++;
        v.comboDamage += dmg;
        att.addMeter(12);
        v.addMeter(6);
        v.enterAirHit(dir * 3.4, -6.2);
        att.setAnim('throwToss');
        this.emit({ type: 'throw', side: att.side, x: v.x, y: -70 });
        this.emit({ type: 'hit', side: att.side, x: v.x, y: -80, dir, spark: 'heavy', damage: dmg, combo: v.comboHits, by: att.def.id, total: v.comboDamage });
        if (v.health <= 0) {
          v.ko = true;
          this.onKO(v);
        }
      }
    }
  }

  /** Empieza la pelá: elige la frase (con la semilla de la pelea), muestra el globo y suena su voz. */
  tauntStart(f: Fighter): void {
    const pick = f.def.taunts.length ? this.rng.pick(f.def.taunts) : '¡...!';
    const line = typeof pick === 'string' ? { text: pick } : pick;
    this.emit({ type: 'taunt', side: f.side, line: line.text });
    if (line.voice) this.emit({ type: 'sfx', name: line.voice, side: f.side, who: f.def.id });
  }

  /** La pelá terminó sin que la interrumpieran: el rival pierde media barra de súper (sin efecto de sonido: solo la voz). */
  tauntComplete(f: Fighter): void {
    const o = this.opponent(f);
    o.addMeter(-50);
  }

  /** Cinemática del súper: todo se congela mientras pasa el cartel. */
  superFlash(f: Fighter, mv: MoveDef): void {
    const c = mv.cinematic;
    this.freeze = c?.freeze ?? 44;
    this.freezeOwner = f;
    const sound = c?.sound && f.def.sounds?.[c.sound] ? c.sound : null;
    this.emit({
      type: 'superFlash',
      side: f.side,
      x: f.x,
      y: f.y - 90,
      name: mv.name,
      fighter: f.def.name,
      color: c?.color ?? f.def.ui.fx,
      freeze: this.freeze,
      sound,
      portrait: c?.portrait ?? f.def.anims.win?.frames.at(-1)?.tex ?? f.frame.tex,
      silhouette: !c?.portrait,
      id: f.def.id,
      ultra: mv.kind === 'ultra',
      song: c?.song ?? null,
    });
    if (!sound) this.emit({ type: 'sfx', name: 'super' });
  }

  /**
   * Fin del combo que recibía f. Avisa los golpes (y si terminó con REMATE,
   * con un ultra o roto por un COMBO BREAKER) y cierra el combo Killer del otro lado.
   */
  comboEnded(f: Fighter, broken = false): void {
    const att = this.opponent(f);
    if (f.comboHits >= 2) {
      this.emit({
        type: 'comboEnd', side: att.side, hits: f.comboHits, damage: f.comboDamage, by: att.def.id,
        ender: f.kiEnder, ultra: f.kiUltra, broken,
      });
    }
    f.comboHits = 0;
    f.comboDamage = 0;
    f.resetJuggle();
    f.kiEnder = false;
    f.kiUltra = false;
    for (const g of this.sideMembers(att.side)) g.resetKi();
  }

  /** Todos los luchadores de un lado (en 2 VS 2, el equipo completo). */
  private sideMembers(side: 0 | 1): Fighter[] {
    return this.teams ? this.teams[side].members : [this.fighters[side]];
  }

  // ---------------------------------------------------------------- combos Killer

  /** COMBO BREAKER acertado: quien pegaba sale despedido y la víctima queda libre. */
  comboBreaker(v: Fighter, att: Fighter): void {
    const x = (v.x + att.x) / 2;
    const away = Math.sign(att.x - v.x) || -v.facing;
    att.endMove();
    att.resetKi();
    att.enterHitstun(BREAK_RECOIL, false);
    att.slideV = away * 4.2;
    v.endMove();
    v.vx = 0;
    if (v.grounded) v.toNeutral();
    v.invulnTimer = Math.max(v.invulnTimer, BREAK_INVULN);
    v.throwProtect = Math.max(v.throwProtect, BREAK_INVULN);
    v.addMeter(BREAK_METER);
    v.lockout = 0;
    att.hitstop = 10;
    v.hitstop = 10;
    this.emit({ type: 'comboBreaker', side: v.side, x, y: -90 });
    this.comboEnded(v, true);
  }

  /** COMBO BREAKER equivocado (o fuera de un doble): BLOQUEO, sin poder intentarlo otra vez por un rato. */
  breakerLockout(v: Fighter): void {
    v.lockout = LOCKOUT_FRAMES;
    this.emit({ type: 'lockout', side: v.side, x: v.x, y: v.y - 120 });
    // Quien está pegando se ríe del intento fallido.
    const att = this.opponent(v);
    this.emit({ type: 'sfx', name: 'voz/risa', side: att.side, who: att.def.id });
  }

  // ---------------------------------------------------------------- ultra

  /** ¿Hay un ultra corriendo? (oscurece el escenario y detiene el reloj) */
  get ultraActive(): boolean {
    for (const f of this.combatants()) if (f.ultraRun && !f.ultraRun.done) return true;
    return false;
  }

  /** ¿f puede hacer este ultra ahora? Barra suficiente y rival EN PELIGRO (en práctica basta la barra). */
  canUltra(f: Fighter, mv: MoveDef): boolean {
    if (!mv.ultra || f.meter < (mv.meterCost ?? 200) || this.phase !== 'fight') return false;
    const o = this.opponent(f);
    if (o.ko) return false;
    return this.practice || o.health <= o.def.health * (mv.ultra.danger ?? DANGER);
  }

  /** ¿Tiene f un ultra listo para usar? (para el aviso del HUD y la CPU) */
  ultraReady(f: Fighter): boolean {
    for (const id of f.def.specials) {
      const mv = f.def.moves[id];
      if (mv?.kind === 'ultra' && this.canUltra(f, mv)) return true;
    }
    return false;
  }

  /** El arranque del ultra conectó: el rival queda pegado y empieza la secuencia. */
  private startUltra(att: Fighter, v: Fighter): void {
    const mv = att.move;
    const u = mv?.ultra;
    if (!mv || !u) return;
    att.ultraRun = { u, moveId: att.moveId, victim: v, step: -1, hits: 0, total: u.sequence.reduce((n, st) => n + st.hits, 0), done: false };
    v.endMove();
    v.vx = 0;
    v.vy = 0;
    v.slideV = 0;
    v.y = 0;
    v.grounded = true;
    v.pinnedBy = att;
    v.setState('pinned', 'hitHigh');
    att.vx = 0;
    att.slideV = 0;
    this.emit({ type: 'ultraStart', side: att.side, x: v.x, y: -80 });
    this.nextUltraStep(att);
  }

  /** Siguiente tramo de la secuencia (o el final). */
  nextUltraStep(att: Fighter): void {
    const run = att.ultraRun;
    if (!run) return;
    run.step++;
    if (run.step >= run.u.sequence.length) {
      // Si los tramos no alcanzaron a dar todos los golpes, el final sale igual.
      if (!run.done) this.ultraHit(att, run.total - run.hits);
      att.ultraRun = null;
      att.endMove();
      att.toNeutral();
      return;
    }
    att.setAnim(ultraAnim(att.def, run.moveId, run.u, run.step));
    const voice = run.u.sequence[run.step].voice;
    if (voice) this.emit({ type: 'sfx', name: voice, side: att.side, who: att.def.id, wait: 1.5 });
  }

  /** Golpes programados de la secuencia: sin escalado; el último lanza al rival (y lo deja K.O. si se acaba la vida). */
  ultraHit(att: Fighter, n: number): void {
    const run = att.ultraRun;
    if (!run || run.done) return;
    const v = run.victim;
    for (let k = 0; k < n && !run.done; k++) {
      run.hits++;
      const last = run.hits >= run.total;
      const dmg = last ? run.u.final.damage : run.u.damage;
      // Durante la secuencia nadie cae: el K.O. llega con el golpe final.
      if (last) this.hurt(v, dmg);
      else v.health = Math.max(1, v.health - dmg);
      v.comboHits++;
      v.comboDamage += dmg;
      att.addMeter(1);
      v.setAnim(run.hits % 2 ? 'hitLow' : 'hitHigh');
      const x = v.x - att.facing * 6;
      const y = v.y - 70 - (run.hits % 3) * 12;
      const spark = last ? 'super' : run.hits % 3 === 0 ? 'heavy' : 'light';
      this.emit({ type: 'hit', side: att.side, x, y, dir: att.facing, spark, damage: dmg, combo: v.comboHits, by: att.def.id, total: v.comboDamage });
      this.emit({ type: 'ultraHit', side: att.side, x, y, final: last });
      if (!last) {
        att.hitstop = 3;
        v.hitstop = 3;
        continue;
      }
      run.done = true;
      v.pinnedBy = null;
      v.kiUltra = true;
      att.hitstop = 18;
      v.hitstop = 18;
      const l = run.u.final.launch;
      if (v.health <= 0) {
        v.ko = true;
        v.enterAirHit(att.facing * l.vx, l.vy);
        this.onKO(v);
      } else {
        v.enterAirHit(att.facing * l.vx, l.vy);
        this.slowmo = Math.max(this.slowmo, 40);
      }
    }
  }

  /** La víctima del ultra queda pegada al frente de quien se lo hace. */
  private updateUltras(): void {
    for (const att of this.fighters) {
      const run = att.ultraRun;
      if (!run || run.done) continue;
      const v = run.victim;
      if (v.pinnedBy !== att) continue;
      v.x = att.x + att.facing * (run.u.distance ?? 42);
      v.y = 0;
      v.vx = 0;
      v.slideV = 0;
      att.vx = 0;
    }
  }


  // ---------------------------------------------------------------- espacio

  /** Límites horizontales: bordes del escenario y de la cámara. */
  bounds(): [number, number] {
    const half = VIEW_W / 2;
    return [
      Math.max(WALL_MARGIN, this.camX - half + WALL_MARGIN),
      Math.min(STAGE_W - WALL_MARGIN, this.camX + half - WALL_MARGIN),
    ];
  }

  private atWall(f: Fighter, dir: number): boolean {
    const [minX, maxX] = this.bounds();
    return dir < 0 ? f.x <= minX + 1 : f.x >= maxX - 1;
  }

  private resolvePush(): void {
    const [a, b] = this.fighters;
    if (a.state === 'thrown' || b.state === 'thrown') return;
    // La rodada atraviesa al rival.
    if (a.rollInvuln || b.rollInvuln) return;
    const pa = a.worldBox(a.pushbox());
    const pb = b.worldBox(b.pushbox());
    const ox = Math.min(pa.x1, pb.x1) - Math.max(pa.x0, pb.x0);
    const oy = Math.min(pa.y1, pb.y1) - Math.max(pa.y0, pb.y0);
    if (ox <= 0 || oy <= 0) return;
    let left = a;
    let right = b;
    if (a.x > b.x || (a.x === b.x && a.facing === -1)) {
      left = b;
      right = a;
    }
    left.x -= ox / 2;
    right.x += ox / 2;
    const [minX, maxX] = this.bounds();
    if (left.x < minX) {
      right.x += minX - left.x;
      left.x = minX;
    }
    if (right.x > maxX) {
      left.x -= right.x - maxX;
      right.x = maxX;
    }
  }

  private updateCamera(): void {
    const [a, b] = this.fighters;
    const half = VIEW_W / 2;
    this.camX = Math.max(half, Math.min(STAGE_W - half, (a.x + b.x) / 2));
    const [minX, maxX] = this.bounds();
    for (const f of this.fighters) f.x = Math.max(minX, Math.min(maxX, f.x));
  }

  private updateFacing(): void {
    for (const f of this.fighters) {
      const o = this.opponent(f);
      if (!f.grounded || o.x === f.x) continue;
      if (!ACTIONABLE.has(f.state) && f.state !== 'land' && f.state !== 'intro') continue;
      const want: 1 | -1 = o.x > f.x ? 1 : -1;
      if (want === f.facing) continue;
      f.facing = want;
      if (f.state === 'walkF' || f.state === 'walkB' || f.state === 'guard') {
        f.vx = 0;
        f.setState('idle', 'idle');
      }
    }
  }

  // ---------------------------------------------------------------- proyectiles

  spawnProjectile(f: Fighter, id: string): void {
    const pd = f.def.projectiles[id];
    if (!pd) return;
    // Rayo o remolino: cae sobre el rival (su x, en el suelo), aunque esté saltando.
    const target = pd.at === 'opponent' ? this.opponent(f) : null;
    const x = target ? target.x + pd.offset.x * f.facing : f.x + pd.offset.x * f.facing;
    const y = target ? pd.offset.y : f.y + pd.offset.y;
    const p = new Projectile(f, pd, x, y, pd.speed * f.facing, pd.hits, pd.life, f.facing);
    // La onda de un ultra solo se ve (los golpes los da la secuencia).
    p.cosmetic = !!f.ultraRun;
    p.remate = f.remate && !p.cosmetic;
    this.projectiles.push(p);
    f.projectileCount++;
    this.emit({ type: 'projectile', side: f.side, x: p.x, y: p.y, color: pd.glow });
  }

  private killProjectile(p: Projectile, burst: boolean): void {
    if (p.dead) return;
    p.dead = true;
    p.owner.projectileCount = Math.max(0, p.owner.projectileCount - 1);
    if (burst) this.emit({ type: 'projectileEnd', x: p.x, y: p.y, color: p.def.glow, big: p.def.strength > 1 });
  }

  private updateProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    const half = VIEW_W / 2;
    for (const p of this.projectiles) {
      if (p.hitstop > 0) {
        p.hitstop--;
        continue;
      }
      const k = p.hitting > 0 ? (p.def.slowOnHit ?? 1) : 1;
      p.x += p.vx * k;
      p.frame++;
      p.life--;
      if (p.cooldown > 0) p.cooldown--;
      if (p.hitting > 0) p.hitting--;
      if (p.life <= 0 || p.x < this.camX - half - 40 || p.x > this.camX + half + 40) this.killProjectile(p, false);
    }
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.dead || p.cosmetic) continue;
      for (let j = i + 1; j < this.projectiles.length; j++) {
        const q = this.projectiles[j];
        if (q.dead || q.cosmetic || q.owner === p.owner) continue;
        const c = overlapCenter(p.box(), q.box());
        if (!c) continue;
        const pp = p.power;
        p.power -= q.power;
        q.power -= pp;
        this.emit({ type: 'clash', x: c.x, y: c.y });
        this.emit({ type: 'sfx', name: 'clash' });
        if (p.power <= 0) this.killProjectile(p, true);
        if (q.power <= 0) this.killProjectile(q, true);
        if (p.dead) break;
      }
    }
  }

  // ---------------------------------------------------------------- golpes

  private detectHits(): void {
    const results: HitResult[] = [];
    // En 1 vs 1 son los dos luchadores; en 2 VS 2 también las ayudas (pegan y reciben).
    for (const att of this.combatants()) {
      const mv = att.move;
      if (att.state !== 'attack' || !mv) continue;
      const fr = att.frame;
      if (!fr.hit) continue;
      const targets = this.targetsOf(att.side).filter((d) => d.hittable());
      if (!targets.length) continue;
      const hurts = targets.map((d) => d.hurtboxes().map((h) => d.worldBox(h)));
      let found = false;
      for (const hb of fr.hit) {
        const g = hb.group ?? 0;
        if (att.groupsConnected & (1 << g)) continue;
        const box = att.worldBox(hb);
        for (let k = 0; k < targets.length && !found; k++) {
          const point = firstOverlap(box, hurts[k]);
          if (!point) continue;
          const props = hb.props ? { ...mv.hit, ...hb.props } : mv.hit;
          // Un agarre solo toma al que está en el suelo (el primer agarre; los golpes que siguen sí).
          if (props.groundOnly && !targets[k].grounded && !att.connected) continue;
          results.push({ att, def: targets[k], props, group: g, point, proj: null });
          found = true;
        }
        if (found) break;
      }
    }
    for (const p of this.projectiles) {
      if (p.dead || p.cosmetic || p.cooldown > 0 || p.hitstop > 0) continue;
      for (const def of this.targetsOf(p.owner.side)) {
        if (!def.hittable()) continue;
        const point = firstOverlap(p.box(), def.hurtboxes().map((h) => def.worldBox(h)));
        if (!point) continue;
        const last = p.hitsLeft <= 1;
        const props = last && p.def.finalHit ? { ...p.def.hit, ...p.def.finalHit } : p.def.hit;
        results.push({ att: p.owner, def, props, group: 0, point, proj: p });
        break;
      }
    }
    for (const r of results) this.applyHit(r);
  }

  private pushback(att: Fighter, def: Fighter, amount: number, dirAway: number, fromProjectile: boolean): void {
    const v = amount / 4.5;
    if (!fromProjectile && this.atWall(def, dirAway)) att.slideV = -dirAway * v;
    else def.slideV = dirAway * v;
  }

  private applyHit(r: HitResult): void {
    const { att, def, props, proj } = r;
    if (!def.hittable()) return;
    if (!proj) att.groupsConnected |= 1 << r.group;
    const guard = props.guard ?? 'mid';
    const srcX = proj ? proj.x : att.x;
    const dirAway = Math.sign(def.x - srcX) || att.facing;
    const spark = props.spark ?? (props.damage >= 60 ? 'heavy' : 'light');
    const hs = props.hitstop ?? 8;

    if (proj) {
      proj.hitsLeft--;
      proj.cooldown = proj.def.hitInterval ?? 0;
      proj.hitting = 10;
    } else {
      att.connected = true;
      att.connectFrame = this.frame;
      att.framesSinceConnect = 0;
    }

    // Modo Poder: el atacante pega más fuerte.
    const power = att.powerDamage;

    if (def.canBlock(srcX, guard)) {
      // Un bloqueo encadenado (varios golpes seguidos) mantiene el inicio del primero.
      if (def.state !== 'blockstun') def.blockStart = this.frame;
      def.enterBlockstun(props.blockstun, def.input.dir() <= 3);
      const chip = Math.round((props.chip ?? 0) * power);
      if (chip > 0) this.hurt(def, chip);
      const bhs = Math.max(4, hs - 2);
      def.hitstop = bhs;
      if (proj) proj.hitstop = bhs;
      else att.hitstop = bhs;
      att.addMeter((props.meter ?? 4) * 0.5);
      def.addMeter(2);
      this.pushback(att, def, (props.pushback ?? 12) * 1.15, dirAway, !!proj);
      this.emit({ type: 'block', side: att.side, x: r.point.x, y: r.point.y, dir: dirAway, spark });
      if (proj && proj.hitsLeft <= 0) this.killProjectile(proj, true);
      if (def.health <= 0) {
        // K.O. por daño de bloqueo
        def.ko = true;
        def.enterAirHit(dirAway * 3, -6.5);
        this.onKO(def);
      }
      return;
    }

    // REMATE: el primer golpe suma daño según el largo del combo; el último derriba.
    const src = proj ? proj.owner : att;
    const remate = proj ? proj.remate : att.remate;
    const remateFirst = remate && !src.remateHit;
    const remateLast = remate && (proj ? proj.hitsLeft <= 0 : r.group >= lastGroup(att.anim));
    const bonus = remateFirst ? Math.min(REMATE_MAX, REMATE_PER_HIT * def.comboHits) : 0;
    const dmg = Math.max(1, Math.round(props.damage * comboScale(def.comboHits) * power)) + bonus;
    this.hurt(def, dmg);
    def.comboHits++;
    def.comboDamage += dmg;
    if (remateFirst) {
      src.remateHit = true;
      def.kiEnder = true;
      this.emit({ type: 'remate', side: src.side, x: r.point.x, y: r.point.y, bonus });
      this.emit({ type: 'sfx', name: 'voz/remate', side: src.side, who: src.def.id });
    }
    // Combos Killer: un especial que conecta abre el DOBLE (también su proyectil, si sigue en el especial).
    if (!proj && att.move?.kind === 'special') att.openKi(this);
    else if (proj && src.state === 'attack' && src.move?.kind === 'special' && src.move.projectile && src.def.projectiles[src.move.projectile] === proj.def) {
      src.openKi(this);
    }
    if (!proj && att.isDoble) att.dobleHits++;
    // 2 VS 2: a la ayuda golpeada la sacan de la pelea (se va apenas se recupera y tarda más en volver).
    const ex = this.extras.length ? this.extraOf(def) : null;
    if (ex && ex.role === 'assist') {
      ex.hit = true;
      ex.role = 'leaving';
    }
    att.addMeter(props.meter ?? dmg * 0.12);
    def.addMeter(dmg * 0.08);
    def.hitstop = hs;
    if (proj) proj.hitstop = hs;
    else att.hitstop = hs;

    // Lanzador: manda al rival bien alto y abre el combo aéreo (supersalto con arriba).
    const launcher = !proj && att.grounded && att.moveId !== '' && att.moveId === att.launcherId;
    // Un proyectil de varios golpes (el remolino del súper) sigue pegándole en el aire hasta su último golpe.
    if (proj && proj.def.hits > 1) def.juggleCap = Math.max(def.juggleCap, def.juggle + proj.hitsLeft + 1);

    if (def.health <= 0) {
      def.ko = true;
      def.enterAirHit(dirAway * 3.2, -6.5);
      this.onKO(def);
    } else if (!proj && att.move?.kind === 'ultra' && !att.ultraRun) {
      // El arranque del ultra conectó: empieza la secuencia.
      this.startUltra(att, def);
    } else if (launcher) {
      const l = att.launchVel;
      if (def.grounded) def.juggleCap = Math.max(def.juggleCap, MAX_JUGGLE_LAUNCHED);
      def.enterAirHit(dirAway * l.vx, l.vy);
      att.launchFollow = LAUNCH_FOLLOW;
      this.emit({ type: 'launch', side: att.side, x: r.point.x, y: r.point.y });
    } else if (!def.grounded || props.launch || props.knockdown || remateLast) {
      // Golpe aire contra aire: empuja poco, para que el combo aéreo siga.
      const airToAir = !proj && !att.grounded && !def.grounded && !props.launch && !remateLast;
      const l = props.launch ?? (remateLast ? REMATE_LAUNCH : airToAir ? { vx: 1.1, vy: -3.6 } : props.knockdown ? { vx: 1.4, vy: -3.2 } : { vx: 2.4, vy: -4.5 });
      def.enterAirHit(dirAway * l.vx, l.vy);
    } else {
      def.enterHitstun(props.hitstun, guard === 'low');
      this.pushback(att, def, props.pushback ?? 12, dirAway, !!proj);
    }
    this.emit({
      type: 'hit', side: att.side, x: r.point.x, y: r.point.y, dir: dirAway, spark, damage: dmg, combo: def.comboHits,
      by: att.def.id, total: def.comboDamage,
      ...(proj ? { look: proj.def.look, last: proj.hitsLeft <= 0 } : { move: att.moveId }),
    });
    if (proj && proj.hitsLeft <= 0) this.killProjectile(proj, true);
  }

  // ---------------------------------------------------------------- 2 VS 2

  /** Índice del compañero que sigue en pie (no el punto), o -1. */
  private partnerIndex(t: Team): number {
    for (let i = 0; i < t.members.length; i++) if (i !== t.point && !t.out[i]) return i;
    return -1;
  }

  /** El compañero que sigue en pie (descansando, entrando o de ayuda), o null. */
  partnerOf(side: 0 | 1): Fighter | null {
    const t = this.teams?.[side];
    if (!t) return null;
    const i = this.partnerIndex(t);
    return i >= 0 ? t.members[i] : null;
  }

  extraOf(f: Fighter): Extra | null {
    for (const e of this.extras) if (e.f === f) return e;
    return null;
  }

  /** ¿Se ve en pantalla? (el punto o un extra) */
  onScreen(f: Fighter): boolean {
    return this.fighters[0] === f || this.fighters[1] === f || this.extraOf(f) !== null;
  }

  /** Los que pueden pegar y recibir golpes: los puntos, las ayudas y quien sale terminando su súper. */
  private combatants(): Fighter[] {
    const out: Fighter[] = [this.fighters[0], this.fighters[1]];
    for (const e of this.extras) if (e.role !== 'dead' && !e.flying) out.push(e.f);
    return out;
  }

  /** A quiénes puede golpear un luchador del lado `side`: el punto rival y sus ayudas. */
  private targetsOf(side: 0 | 1): Fighter[] {
    const other = side === 0 ? 1 : 0;
    const out: Fighter[] = [this.fighters[other]];
    for (const e of this.extras) if (e.f.side === other && e.role !== 'dead' && !e.flying) out.push(e.f);
    return out;
  }

  /** ¿El punto puede cambiar ahora? (en neutro y en el suelo, con el compañero disponible) */
  canTag(side: 0 | 1): boolean {
    const t = this.teams?.[side];
    if (!t || this.phase !== 'fight' || t.tagCd > 0 || t.incoming >= 0 || t.assist) return false;
    const partner = this.partnerOf(side);
    const p = this.fighters[side];
    return !!partner && !this.onScreen(partner) && !p.ko && p.grounded && ACTIONABLE.has(p.state);
  }

  /** ¿Se puede llamar a la ayuda? (también atacando, pero no golpeado ni bloqueando) */
  canAssist(side: 0 | 1): boolean {
    const t = this.teams?.[side];
    if (!t || this.phase !== 'fight' || t.assistCd > 0 || t.incoming >= 0 || t.assist) return false;
    const partner = this.partnerOf(side);
    const p = this.fighters[side];
    return !!partner && !this.onScreen(partner) && !p.ko && !NO_ASSIST.has(p.state);
  }

  private canTeamSuper(side: 0 | 1): boolean {
    const t = this.teams?.[side];
    const p = this.fighters[side];
    if (!t || this.phase !== 'fight' || t.assist || t.incoming >= 0 || p.state !== 'attack' || p.move?.kind !== 'super') return false;
    const partner = this.partnerOf(side);
    if (!partner || this.onScreen(partner)) return false;
    const sup = superMoveId(partner.def);
    return !!sup && p.meter >= (partner.def.moves[sup].meterCost ?? 100);
  }

  /** Estado del equipo para el HUD (null en 1 vs 1). */
  teamStatus(side: 0 | 1): TeamStatus | null {
    const t = this.teams?.[side];
    if (!t) return null;
    const partner = this.partnerOf(side);
    const free = !!partner && t.incoming < 0 && !t.assist && !this.onScreen(partner);
    return {
      partner,
      assist: free ? 1 - t.assistCd / Math.max(1, t.assistCdMax) : 0,
      tag: free ? 1 - t.tagCd / TAG_COOLDOWN : 0,
    };
  }

  /** Por cuadro: esperas, vida roja, barra compartida, entrada tras un K.O. y los botones CAMBIO y AYUDA. */
  private updateTeams(): void {
    for (const side of [0, 1] as const) {
      const t = this.teams![side];
      if (t.tagCd > 0) t.tagCd--;
      if (t.assistCd > 0 && !t.assist) t.assistCd--;
      // Vida roja: vuelve de a poco mientras descansa fuera de la pantalla.
      t.members.forEach((f, i) => {
        if (i === t.point || t.out[i] || f.red <= 0 || this.onScreen(f)) return;
        const n = Math.min(f.red, f.def.health * RED_REGEN);
        f.health = Math.min(f.def.health, f.health + n);
        f.red -= n;
      });
      // Barra de súper compartida: lo que ganan la ayuda o el que salió pasa al punto.
      const p = this.fighters[side];
      for (const f of t.members) {
        if (f !== p && f.meter > 0) {
          p.addMeter(f.meter);
          f.meter = 0;
        }
      }
      if (t.incoming > 0 && --t.incoming === 0) {
        t.incoming = -1;
        this.bringIn(side, 'entra');
        continue;
      }
      if (this.phase !== 'fight') continue;
      const tag = p.input.findPress(B_TAG, 4);
      if (tag && this.canTeamSuper(side)) {
        p.input.consume(tag);
        this.teamSuper(side);
        continue;
      }
      if (tag && this.canTag(side)) {
        p.input.consume(tag);
        this.bringIn(side, 'cambio');
        continue;
      }
      const call = p.input.findPress(B_ASSIST, 4);
      if (call && this.canAssist(side)) {
        p.input.consume(call);
        this.callAssist(side);
      }
    }
  }

  private newExtra(f: Fighter, role: ExtraRole, flying: boolean, moveId = ''): Extra {
    return { f, role, t: 0, started: false, hit: false, flying, moveId };
  }

  /** Entra el compañero: por CAMBIO (el punto sale de un salto) o tras el K.O. del punto. Cae por el borde de su lado. */
  private bringIn(side: 0 | 1, kind: 'cambio' | 'entra'): void {
    const t = this.teams![side];
    const idx = this.partnerIndex(t);
    if (idx < 0) return;
    const out = this.fighters[side];
    const inc = t.members[idx];
    const old = this.extraOf(inc);
    if (old) this.extras.splice(this.extras.indexOf(old), 1);
    const opp = this.fighters[side === 0 ? 1 : 0];
    const half = VIEW_W / 2;
    const fromLeft = out.x <= opp.x;
    const facing: 1 | -1 = fromLeft ? 1 : -1;
    const edge = fromLeft
      ? Math.max(WALL_MARGIN, this.camX - half + WALL_MARGIN + 4)
      : Math.min(STAGE_W - WALL_MARGIN, this.camX + half - WALL_MARGIN - 4);
    // Con CAMBIO cae donde estaba el que sale; tras un K.O., un poco adentro del borde.
    const landX = kind === 'cambio' ? out.x : edge + facing * 48;
    const g = inc.def.jump.gravity;
    const fall = (-1 + Math.sqrt(1 + 2 * g * -ENTRY_Y)) / g;
    inc.enterAt(edge, ENTRY_Y, Math.max(-6, Math.min(6, (landX - edge) / fall)), 1, facing);
    inc.addMeter(out.meter);
    out.meter = 0;
    if (kind === 'cambio') {
      out.startFlight();
      this.extras.push(this.newExtra(out, 'leaving', true));
      t.tagCd = TAG_COOLDOWN;
    } else {
      this.extras.push(this.newExtra(out, 'dead', false));
      inc.invulnTimer = KO_ENTRY_INVULN;
    }
    t.point = idx;
    this.fighters[side] = inc;
    this.emit({ type: 'tag', side, kind, name: inc.def.name, x: inc.x });
  }

  /** AYUDA: el compañero cae detrás del punto, hace su especial y se va de un salto. */
  private callAssist(side: 0 | 1): void {
    const t = this.teams![side];
    const idx = this.partnerIndex(t);
    if (idx < 0) return;
    const a = t.members[idx];
    const p = this.fighters[side];
    const opp = this.fighters[side === 0 ? 1 : 0];
    const facing: 1 | -1 = opp.x >= p.x ? 1 : -1;
    const [minX, maxX] = this.bounds();
    const x = Math.max(minX, Math.min(maxX, p.x - facing * 46));
    a.enterAt(x, -80, facing * 0.4, 3, facing);
    const ex = this.newExtra(a, 'assist', false, assistMoveId(a.def));
    this.extras.push(ex);
    t.assist = ex;
    this.emit({ type: 'tag', side, kind: 'ayuda', name: a.def.name, x });
  }

  /** SÚPER EN EQUIPO: durante el súper del punto, CAMBIO con barra: el compañero entra haciendo el suyo. */
  private teamSuper(side: 0 | 1): void {
    const t = this.teams![side];
    const idx = this.partnerIndex(t);
    if (idx < 0) return;
    const inc = t.members[idx];
    const sup = superMoveId(inc.def);
    if (!sup) return;
    const out = this.fighters[side];
    const opp = this.fighters[side === 0 ? 1 : 0];
    const facing: 1 | -1 = opp.x >= out.x ? 1 : -1;
    const [minX, maxX] = this.bounds();
    inc.enterAt(Math.max(minX, Math.min(maxX, out.x - facing * 40)), 0, 0, 0, facing);
    inc.addMeter(out.meter);
    out.meter = 0;
    // El que sale termina su súper y después se va.
    this.extras.push(this.newExtra(out, 'leaving', false));
    t.point = idx;
    t.tagCd = TAG_COOLDOWN;
    this.fighters[side] = inc;
    this.emit({ type: 'tag', side, kind: 'superEquipo', name: inc.def.name, x: inc.x });
    inc.startMove(this, sup);
  }

  /**
   * 2 VS 2 al caer un luchador. Devuelve true si el equipo sigue en pie (entra
   * el compañero o cayó la ayuda); false si quedó eliminado (K.O. normal).
   */
  private teamKO(victim: Fighter): boolean {
    const t = this.teams![victim.side];
    const i = t.members.indexOf(victim);
    if (i >= 0) t.out[i] = true;
    victim.red = 0;
    const ex = this.extraOf(victim);
    if (ex) {
      // Cayó la ayuda (o el que salía terminando su súper): queda fuera de combate.
      ex.role = 'dead';
      ex.t = 0;
      ex.flying = false;
      if (t.assist === ex) t.assist = null;
      this.emit({ type: 'ko', side: victim.side, x: victim.x, y: victim.y - 70 });
      this.emit({ type: 'sfx', name: 'ko' });
      return true;
    }
    const pi = this.partnerIndex(t);
    if (pi < 0) return false;
    if (this.phase !== 'fight') return true;
    this.slowmo = 30;
    this.emit({ type: 'ko', side: victim.side, x: victim.x, y: victim.y - 70 });
    this.emit({ type: 'sfx', name: 'ko' });
    const partner = t.members[pi];
    const asEx = this.extraOf(partner);
    if (asEx && !asEx.flying) {
      // El compañero ya estaba en pantalla (de ayuda): pasa a ser el punto al tiro.
      this.extras.splice(this.extras.indexOf(asEx), 1);
      if (t.assist === asEx) t.assist = null;
      this.extras.push(this.newExtra(victim, 'dead', false));
      partner.addMeter(victim.meter);
      victim.meter = 0;
      t.point = pi;
      this.fighters[victim.side] = partner;
      this.emit({ type: 'tag', side: victim.side, kind: 'entra', name: partner.def.name, x: partner.x });
    } else {
      t.incoming = KO_ENTRY_DELAY;
    }
    return true;
  }

  /** Avanza a los que no son el punto: la ayuda hace su movimiento y se va, el que sale vuela y el caído desaparece. */
  private stepExtras(): void {
    for (const e of this.extras) {
      const f = e.f;
      if (e.flying) {
        // Salto de salida: sin colisiones ni control.
        f.x += f.vx;
        f.y += f.vy;
        f.vy += 0.22;
        e.t++;
        continue;
      }
      if (f.hitstop > 0) {
        f.hitstop--;
        continue;
      }
      if (e.role === 'dead') {
        if (f.state === 'ko') e.t++;
      } else if (e.role === 'assist') {
        e.t++;
        if (!e.started && f.grounded && (ACTIONABLE.has(f.state) || f.state === 'land')) {
          f.startMove(this, e.moveId);
          e.started = true;
        } else if (e.started && ACTIONABLE.has(f.state)) {
          e.role = 'leaving';
        }
      }
      if (e.role === 'leaving' && f.grounded && (ACTIONABLE.has(f.state) || f.state === 'land')) {
        f.startFlight();
        e.flying = true;
        continue;
      }
      f.advance(this);
    }
    const half = VIEW_W / 2;
    for (let i = this.extras.length - 1; i >= 0; i--) {
      const e = this.extras[i];
      const gone = e.flying ? e.f.y < -330 || Math.abs(e.f.x - this.camX) > half + 90 : e.role === 'dead' && e.t > DEAD_LINGER;
      if (!gone) continue;
      this.extras.splice(i, 1);
      const t = this.teams?.[e.f.side];
      if (t && t.assist === e) {
        t.assist = null;
        t.assistCdMax = e.hit ? ASSIST_COOLDOWN_HIT : ASSIST_COOLDOWN;
        t.assistCd = t.assistCdMax;
      }
    }
  }
}
