import type { Btn, MotionId } from '../sim/types';

// Bits de botones.
export const B_LP = 1;
export const B_HP = 2;
export const B_LK = 4;
export const B_HK = 8;
export const B_TAUNT = 32;
/** 2 VS 2: cambio de luchador y llamada de ayuda. */
export const B_TAG = 64;
export const B_ASSIST = 128;
/**
 * Botones atajo RODADA y MODO PODER: además de los dos botones juntos marcan que fue el atajo,
 * así pegado al rival siguen siendo rodada o Modo Poder y no agarre (golpe + patada).
 */
export const B_ROLL_KEY = 256;
export const B_POWER_KEY = 512;
export const B_ATTACK = B_LP | B_HP | B_LK | B_HK;

export const BTN_BIT: Record<Btn, number> = { lp: B_LP, hp: B_HP, lk: B_LK, hk: B_HK };

/**
 * Entrada de un cuadro. dir usa notación de teclado numérico ABSOLUTA:
 *   7 8 9
 *   4 5 6
 *   1 2 3
 */
export interface FrameInput {
  dir: number;
  held: number;
  pressed: number;
}

export const NEUTRAL_INPUT: FrameInput = { dir: 5, held: 0, pressed: 0 };

/** Espeja una dirección horizontalmente (para quien mira a la izquierda). */
export function mirrorDir(d: number): number {
  const col = (d - 1) % 3;
  const row = Math.floor((d - 1) / 3);
  return row * 3 + (2 - col) + 1;
}

export function dirFromAxes(left: boolean, right: boolean, up: boolean, down: boolean): number {
  // SOCD: izquierda+derecha = neutro, arriba+abajo = neutro.
  const h = (right ? 1 : 0) - (left ? 1 : 0);
  const v = (up ? 1 : 0) - (down ? 1 : 0);
  return 5 + h + v * 3;
}

export const isDown = (d: number) => d <= 3;
export const isUp = (d: number) => d >= 7;
export const isBack = (d: number) => d === 1 || d === 4 || d === 7;
export const isForward = (d: number) => d === 3 || d === 6 || d === 9;

const SIZE = 128;
/** Cuadros que hay que mantener atrás para cargar (medio segundo). */
export const CHARGE_FRAMES = 30;
/** Cuadros de tolerancia para soltar la carga y apretar adelante. */
const CHARGE_GRACE = 16;

type PatternId = Exclude<MotionId, 'charge' | 'ff' | 'bb' | 'dd' | 'bf' | 'fbf' | 'mash' | 'hold' | 'chargeSuper'>;

/** Patrones en direcciones RELATIVAS (6 = adelante). */
const PATTERNS: Record<PatternId, number[][][]> = {
  qcf: [[[1, 2], [3], [6]]],
  qcb: [[[3, 2], [1], [4]]],
  dp: [[[6], [1, 2], [3]], [[3], [2], [3]]],
  qcf2: [[[1, 2], [3], [6], [1, 2], [3], [6]]],
  // La U: tiene que partir atrás (o adelante) y pasar por abajo; las diagonales del medio pueden saltarse.
  hcf: [[[4, 7], [1, 2], [3], [6]], [[4, 7], [1], [2, 3], [6]]],
  hcb: [[[6, 9], [3, 2], [1], [4]], [[6, 9], [3], [2, 1], [4]]],
};
const WINDOWS: Record<PatternId, number> = { qcf: 16, qcb: 16, dp: 18, qcf2: 34, hcf: 24, hcb: 24 };
/** → →: cuadros hacia atrás en que tiene que estar todo el doble toque. */
const FF_WINDOW = 14;
/** Machacar: pulsaciones del botón y cuadros en que tienen que caer todas. */
export const MASH_COUNT = 4;
const MASH_WINDOW = 30;
/** Mantener y soltar: cuadros mínimos con el botón apretado antes de soltarlo (medio segundo). */
export const HOLD_FRAMES = 30;
/** Carga para súper (← cargado, luego → ← →): cuadros en que tiene que caer el → ← →. */
const CHARGE_SUPER_WINDOW = 50;
/** El último → de una carga o de un toque puede caer hasta estos cuadros antes del botón (o después: ver motion). */
const CHARGE_FWD_SLACK = 6;
/** ← → (sin cargar): cuadros en que tiene que caer el toque atrás antes de la →. */
const BF_WINDOW = 18;
/** → ← → (sin cargar): cuadros en que tiene que caer todo el comando. */
const FBF_WINDOW = 40;

export interface Press {
  age: number;
  bits: number;
}

/** Historial de entradas de un luchador, en direcciones relativas a hacia dónde mira. */
export class InputBuffer {
  private rel = new Uint8Array(SIZE).fill(5);
  private pressed = new Uint16Array(SIZE);
  private consumed = new Uint16Array(SIZE);
  private head = 0;
  private count = 0;
  held = 0;
  chargeBack = 0;
  private chargeValid = 0;
  /** Mantener y soltar: cuadros seguidos que lleva apretado cada botón (por bit). */
  private holdFrames = new Map<number, number>();
  /** Última soltada larga: botón, cuánto estuvo apretado, hace cuántos cuadros y si ya se usó. */
  private release = { bits: 0, frames: 0, age: 999, used: true };

  push(inp: FrameInput, facing: 1 | -1): void {
    this.head = (this.head + 1) % SIZE;
    const r = facing === 1 ? inp.dir : mirrorDir(inp.dir);
    this.rel[this.head] = r;
    this.pressed[this.head] = inp.pressed;
    this.consumed[this.head] = 0;
    this.count = Math.min(this.count + 1, SIZE);
    this.release.age++;
    for (const bit of [1, 2, 4, 8]) {
      const n = this.holdFrames.get(bit) ?? 0;
      if (inp.held & bit) this.holdFrames.set(bit, n + 1);
      else if (n > 0) {
        if (n >= HOLD_FRAMES) this.release = { bits: bit, frames: n, age: 0, used: false };
        this.holdFrames.set(bit, 0);
      }
    }
    this.held = inp.held;

    if (isBack(r)) {
      this.chargeBack++;
    } else {
      if (this.chargeBack >= CHARGE_FRAMES) this.chargeValid = CHARGE_GRACE;
      else if (this.chargeValid > 0) this.chargeValid--;
      this.chargeBack = 0;
    }
  }

  reset(): void {
    this.rel.fill(5);
    this.pressed.fill(0);
    this.consumed.fill(0);
    this.count = 0;
    this.held = 0;
    this.chargeBack = 0;
    this.chargeValid = 0;
    this.holdFrames.clear();
    this.release = { bits: 0, frames: 0, age: 999, used: true };
  }

  /** ¿Se soltó hace poco (≤ within cuadros) alguno de los botones después de mantenerlo HOLD_FRAMES o más? */
  findRelease(mask: number, within: number): boolean {
    const r = this.release;
    return !r.used && (r.bits & mask) !== 0 && r.age <= within;
  }

  consumeRelease(): void {
    this.release.used = true;
  }

  /** Cuadros que lleva apretado un botón (para mostrar la carga). */
  heldFor(bit: number): number {
    return this.holdFrames.get(bit) ?? 0;
  }

  private idx(age: number): number {
    return (this.head - age + SIZE * 2) % SIZE;
  }

  /** Dirección relativa hace `age` cuadros (0 = actual). */
  dir(age = 0): number {
    if (age >= this.count) return 5;
    return this.rel[this.idx(age)];
  }

  isHeld(bits: number): boolean {
    return (this.held & bits) !== 0;
  }

  /** Busca la pulsación no consumida más reciente de alguno de los bits. */
  findPress(mask: number, within: number): Press | null {
    const max = Math.min(within, this.count - 1, SIZE - 1);
    for (let age = 0; age <= max; age++) {
      const i = this.idx(age);
      const bits = this.pressed[i] & ~this.consumed[i] & mask;
      if (bits) return { age, bits };
    }
    return null;
  }

  consume(p: Press): void {
    this.consumed[this.idx(p.age)] |= p.bits;
  }

  /**
   * Busca todos los bits de `need` apretados "juntos" (a `spread` cuadros o
   * menos entre sí), con al menos uno sin consumir y reciente (≤ within).
   * Los ya consumidos cuentan: así, si el primer botón alcanzó a empezar un
   * golpe, el segundo todavía lo puede convertir (rodada, Modo Poder).
   */
  findCombo(need: number, within: number, spread = 3): Press | null {
    const max = Math.min(within, this.count - 1, SIZE - 1);
    for (let age = 0; age <= max; age++) {
      const i = this.idx(age);
      if (!(this.pressed[i] & ~this.consumed[i] & need)) continue;
      let union = 0;
      const last = Math.min(this.count - 1, SIZE - 1, age + spread);
      for (let a = Math.max(0, age - spread); a <= last; a++) union |= this.pressed[this.idx(a)];
      if ((union & need) === need) return { age, bits: need };
    }
    return null;
  }

  /** Todos los bits apretados en la ventana de una combinación (para saber si vino de un botón atajo). */
  bitsAround(p: Press, spread = 3): number {
    let union = 0;
    const last = Math.min(this.count - 1, SIZE - 1, p.age + spread);
    for (let a = Math.max(0, p.age - spread); a <= last; a++) union |= this.pressed[this.idx(a)];
    return union;
  }

  /** Consume los bits de una combinación en toda su ventana. */
  consumeCombo(p: Press, spread = 3): void {
    const last = Math.min(this.count - 1, SIZE - 1, p.age + spread);
    for (let a = Math.max(0, p.age - spread); a <= last; a++) {
      const i = this.idx(a);
      this.consumed[i] |= this.pressed[i] & p.bits;
    }
  }

  /** ¿Se ingresó el comando terminando cerca del cuadro `fromAge`? */
  motion(id: MotionId, fromAge: number, mask = 0): boolean {
    if (id === 'hold') return false; // se detecta al soltar (findRelease), no al apretar
    if (id === 'mash') return this.mashed(mask, fromAge);
    if (id === 'chargeSuper') return this.chargeSuper(fromAge);
    if (id === 'bf') return this.taps(fromAge, BF_WINDOW, [false]) >= 0;
    if (id === 'fbf') return this.taps(fromAge, FBF_WINDOW, [false, true]) >= 0;
    if (id === 'charge') {
      // A mano, la → y el botón rara vez caen en el mismo cuadro: sirve la → un poco antes del
      // botón o después (hasta ahora; si el botón ya empezó un golpe, el especial lo convierte).
      let fwd = false;
      for (let a = 0; a <= fromAge + CHARGE_FWD_SLACK && !fwd; a++) fwd = isForward(this.dir(a));
      return fwd && (this.chargeValid > 0 || this.chargeBack >= CHARGE_FRAMES);
    }
    if (id === 'ff') return this.doubleTap(fromAge, isForward);
    if (id === 'bb') return this.doubleTap(fromAge, isBack);
    if (id === 'dd') return this.doubleTap(fromAge, isDown);
    if (id === 'dp') {
      // El →↓↘ termina en ↘ (o abajo): así no se confunde con ↓↘→, que termina en →.
      // Se mira la última dirección no neutra de los cuadros recientes (tolera soltar el stick).
      let last = 5;
      for (let a = fromAge; a <= fromAge + 3 && last === 5; a++) last = this.dir(a);
      if (last !== 3 && last !== 2) return false;
    }
    for (const pattern of PATTERNS[id]) {
      if (this.matchPattern(pattern, fromAge, WINDOWS[id])) return true;
    }
    return false;
  }

  /** Machacar: MASH_COUNT pulsaciones (separadas) de alguno de los botones en MASH_WINDOW cuadros. */
  private mashed(mask: number, fromAge: number): boolean {
    if (!mask) return false;
    let n = 0;
    const last = Math.min(this.count - 1, fromAge + MASH_WINDOW);
    for (let a = fromAge; a <= last; a++) if (this.pressed[this.idx(a)] & mask) n++;
    return n >= MASH_COUNT;
  }

  /**
   * Carga para súper: ← mantenido CHARGE_FRAMES o más, luego → ← → dentro de
   * CHARGE_SUPER_WINDOW cuadros. El último → puede caer un poco antes del botón o después.
   */
  private chargeSuper(fromAge: number): boolean {
    let a = this.taps(fromAge, CHARGE_SUPER_WINDOW, [false, true]);
    if (a < 0) return false;
    // Antes: la carga atrás (se tolera un par de cuadros neutros al soltar).
    let gap = 0;
    while (a < this.count && !isBack(this.dir(a)) && gap < 3) {
      a++;
      gap++;
    }
    let carga = 0;
    while (a < this.count && isBack(this.dir(a))) {
      a++;
      carga++;
    }
    return carga >= CHARGE_FRAMES;
  }

  /**
   * Toques de dirección terminados en →: busca hacia atrás desde la → más reciente
   * (que puede caer un poco antes del botón o después) los toques de `steps`
   * (true = adelante, false = atrás), del último al primero, dentro de `window`
   * cuadros. Devuelve la edad donde termina el comando, o -1 si no está.
   */
  private taps(fromAge: number, window: number, steps: boolean[]): number {
    const last = Math.min(this.count - 1, fromAge + window);
    let a = 0;
    while (a <= fromAge + CHARGE_FWD_SLACK && a <= last && !isForward(this.dir(a))) a++;
    if (a > fromAge + CHARGE_FWD_SLACK || a > last) return -1;
    while (a <= last && isForward(this.dir(a))) a++;
    for (const fwd of steps) {
      const is = fwd ? isForward : isBack;
      while (a <= last && !is(this.dir(a))) a++;
      if (a > last) return -1;
      while (a <= last && is(this.dir(a))) a++;
    }
    return a;
  }

  /**
   * Doble toque (→ →, ← ←, ↓ ↓): la dirección, cualquier otra (el neutro sirve) y la
   * misma otra vez, todo dentro de FF_WINDOW cuadros y el último toque a 3 cuadros o
   * menos del botón. Mantenerla (caminar, cubrirse, agacharse) no cuenta: hay que soltarla
   * entre los dos toques.
   */
  private doubleTap(fromAge: number, is: (d: number) => boolean): boolean {
    const last = Math.min(this.count - 1, fromAge + FF_WINDOW);
    let a = fromAge;
    // Segundo toque: reciente.
    while (a <= fromAge + 3 && a <= last && !is(this.dir(a))) a++;
    if (a > fromAge + 3 || a > last) return false;
    // Recorre ese toque hacia atrás.
    while (a <= last && is(this.dir(a))) a++;
    // Hueco sin esa dirección (al menos un cuadro).
    const gap = a;
    while (a <= last && !is(this.dir(a))) a++;
    // Primer toque dentro de la ventana.
    return a > gap && a <= last;
  }

  private matchPattern(pattern: number[][], fromAge: number, window: number): boolean {
    let step = pattern.length - 1;
    const lastAge = Math.min(this.count - 1, fromAge + window);
    for (let age = fromAge; age <= lastAge; age++) {
      const d = this.dir(age);
      if (pattern[step].includes(d)) {
        // La última dirección del comando debe ser reciente.
        if (step === pattern.length - 1 && age - fromAge > 3) return false;
        step--;
        if (step < 0) return true;
      }
    }
    return false;
  }
}
