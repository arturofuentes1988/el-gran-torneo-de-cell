import { loadControls } from '../app/settings';
import { B_ASSIST, B_HK, B_HP, B_LK, B_LP, B_POWER_KEY, B_ROLL_KEY, B_TAG, B_TAUNT, dirFromAxes, type FrameInput } from './buffer';

/** Teclas físicas (event.code), independientes de la distribución del teclado. */
export interface KeyBindings {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  lp: string[];
  hp: string[];
  lk: string[];
  hk: string[];
  /** Modo Poder: lo mismo que golpe fuerte + patada fuerte juntos. */
  power: string[];
  /** Rodada: lo mismo que golpe débil + patada débil juntos (con atrás, hacia atrás). */
  roll: string[];
  taunt: string[];
  /** 2 VS 2: cambiar de luchador. */
  tag: string[];
  /** 2 VS 2: llamar al compañero para que haga su especial de ayuda. */
  assist: string[];
}

export type Action = keyof KeyBindings;
/** Acciones que se pueden asignar a un botón del joystick (las direcciones van en la cruceta). */
export type PadAction = Exclude<Action, 'up' | 'down' | 'left' | 'right'>;
/** Botón del joystick (mapeo estándar) de cada acción. */
export type PadBindings = Record<PadAction, number>;

/** Acciones en el orden de la pantalla CONTROLES. */
export const ACTIONS: ReadonlyArray<{ id: Action; label: string }> = [
  { id: 'up', label: 'ARRIBA' },
  { id: 'down', label: 'ABAJO' },
  { id: 'left', label: 'IZQUIERDA' },
  { id: 'right', label: 'DERECHA' },
  { id: 'lp', label: 'GOLPE DÉBIL' },
  { id: 'hp', label: 'GOLPE FUERTE' },
  { id: 'lk', label: 'PATADA DÉBIL' },
  { id: 'hk', label: 'PATADA FUERTE' },
  { id: 'power', label: 'MODO PODER' },
  { id: 'roll', label: 'RODADA' },
  { id: 'taunt', label: 'PELÁ' },
  { id: 'tag', label: 'CAMBIO (2 VS 2)' },
  { id: 'assist', label: 'AYUDA (2 VS 2)' },
];

export const DEFAULT_KEYS: readonly [KeyBindings, KeyBindings] = [
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    lp: ['KeyA'], hp: ['KeyS'], lk: ['KeyZ'], hk: ['KeyX'], power: ['KeyD'], roll: ['KeyC'], taunt: ['ControlLeft'],
    tag: ['KeyF'], assist: ['KeyV'],
  },
  // Jugador 2 en el teclado numérico (con o sin Bloq Num: se usa event.code).
  {
    up: ['Numpad8'], down: ['Numpad5', 'Numpad2'], left: ['Numpad4'], right: ['Numpad6'],
    lp: ['Numpad7'], hp: ['Numpad9'], lk: ['Numpad1'], hk: ['Numpad3'],
    power: ['NumpadAdd'], roll: ['NumpadDecimal'], taunt: ['Numpad0'],
    tag: ['NumpadSubtract'], assist: ['NumpadMultiply'],
  },
];

/** Joystick: X/Y golpes, A/B patadas, RB Modo Poder, LB rodada, Select pelá, RT cambio y LT ayuda. */
export const DEFAULT_PAD: PadBindings = { lp: 2, hp: 3, lk: 0, hk: 1, power: 5, roll: 4, taunt: 8, tag: 7, assist: 6 };

function copyKeys(k: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const a of ACTIONS) out[a.id] = [...(k[a.id] ?? [])];
  return out;
}

/**
 * Teclas vigentes de cada jugador. Son objetos vivos: al cambiar los controles
 * se reemplazan sus listas, así quien los tenga guardados ve el cambio al tiro.
 */
export const P1_KEYS: KeyBindings = copyKeys(DEFAULT_KEYS[0]);
export const P2_KEYS: KeyBindings = copyKeys(DEFAULT_KEYS[1]);
/** Botones del joystick de cada jugador (joystick 1 = J1, joystick 2 = J2). */
export const PAD_KEYS: [PadBindings, PadBindings] = [{ ...DEFAULT_PAD }, { ...DEFAULT_PAD }];

/** Teclas que no se pueden asignar: pausa, depuración, sonido y las opciones de la práctica. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'Escape', 'F1', 'F2', 'F5', 'F11', 'F12', 'KeyM', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'MetaLeft', 'MetaRight', 'ContextMenu',
]);
/** Botones del joystick reservados: Start (pausa) y la cruceta. */
export const RESERVED_PAD: ReadonlySet<number> = new Set([9, 12, 13, 14, 15, 16]);

/** Copia de todos los controles (para editarlos sin tocar los vigentes). */
export interface ControlsState {
  keys: [KeyBindings, KeyBindings];
  pads: [PadBindings, PadBindings];
}

export function currentControls(): ControlsState {
  return { keys: [copyKeys(P1_KEYS), copyKeys(P2_KEYS)], pads: [{ ...PAD_KEYS[0] }, { ...PAD_KEYS[1] }] };
}

export function defaultControls(): ControlsState {
  return { keys: [copyKeys(DEFAULT_KEYS[0]), copyKeys(DEFAULT_KEYS[1])], pads: [{ ...DEFAULT_PAD }, { ...DEFAULT_PAD }] };
}

/** ¿Dos estados de controles son iguales? */
export function sameControls(a: ControlsState, b: ControlsState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let boundCodes = new Set<string>();

/** Deja vigentes unos controles (una pelea en curso los usa desde el cuadro siguiente). */
export function applyControls(c: ControlsState): void {
  [P1_KEYS, P2_KEYS].forEach((live, i) => {
    for (const a of ACTIONS) live[a.id] = [...c.keys[i][a.id]];
  });
  PAD_KEYS.forEach((live, i) => Object.assign(live, c.pads[i]));
  boundCodes = new Set([P1_KEYS, P2_KEYS].flatMap((k) => Object.values(k).flat()));
}

/** Valida lo guardado en el navegador: si algo no calza, esa acción queda con su valor por defecto. */
function sanitize(raw: unknown): ControlsState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { keys?: unknown[]; pads?: unknown[] };
  const out = defaultControls();
  for (let i = 0; i < 2; i++) {
    const k = r.keys?.[i] as Record<string, unknown> | undefined;
    const p = r.pads?.[i] as Record<string, unknown> | undefined;
    for (const a of ACTIONS) {
      const v = k?.[a.id];
      if (Array.isArray(v) && v.every((x) => typeof x === 'string' && !RESERVED_KEYS.has(x))) out.keys[i][a.id] = v as string[];
      if (a.id in DEFAULT_PAD) {
        const b = p?.[a.id];
        if (typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < 20 && !RESERVED_PAD.has(b)) out.pads[i][a.id as PadAction] = b;
      }
    }
  }
  return out;
}

applyControls(sanitize(loadControls()) ?? defaultControls());

/** Teclas de ataque de los dos jugadores (la pantalla de título parte con cualquiera). */
export function attackKeys(): string[] {
  return [P1_KEYS, P2_KEYS].flatMap((k) => [...k.lp, ...k.hp, ...k.lk, ...k.hk]);
}

// --- Nombres de teclas y botones para mostrar en pantalla ---

const NAMED: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ControlLeft: 'CTRL', ControlRight: 'CTRL DER', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT DER', AltLeft: 'ALT', AltRight: 'ALT GR',
  Space: 'ESPACIO', Enter: 'ENTER', Backspace: 'BORRAR', Tab: 'TAB', CapsLock: 'MAYÚS', Insert: 'INSERT', Delete: 'SUPR',
  Home: 'INICIO', End: 'FIN', PageUp: 'RE PÁG', PageDown: 'AV PÁG',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
  NumpadEnter: 'NUM ENTER', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};

/** Distribución real del teclado (Chrome/Edge): así la Ñ se ve como Ñ. */
let layout: Map<string, string> | null = null;
const kbApi = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
kbApi?.getLayoutMap?.().then((m) => (layout = m)).catch(() => undefined);

/** Nombre corto de una tecla física (event.code), para dibujarla como tecla. */
export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (/^Numpad\d$/.test(code)) return `NUM ${code.slice(6)}`;
  const fromLayout = code === 'Space' ? undefined : layout?.get(code);
  if (fromLayout && fromLayout.trim()) return fromLayout.toUpperCase();
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', '↑', '↓', '←', '→', 'HOME'];

/** Nombre de un botón del joystick (mapeo estándar, estilo Xbox). */
export function padLabel(button: number | undefined): string {
  if (button === undefined || button < 0) return '—';
  return PAD_NAMES[button] ?? `B${button}`;
}

/**
 * Teclas cuyo comportamiento por defecto del navegador hay que bloquear (desplazar
 * la página, y con Ctrl apretado: guardar, marcador, seleccionar todo, deshacer...).
 * Además de estas fijas se bloquean todas las teclas asignadas.
 */
const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F1', 'F2', 'Tab', 'Backspace']);

export class Keyboard {
  private down = new Set<string>();
  /** Teclas tocadas desde el último muestreo (para no perder toques muy cortos). */
  private tapped = new Set<string>();
  /** Teclas soltadas desde el último muestreo: cuentan como apretadas en ese cuadro. */
  private released = new Set<string>();
  /** Pulsaciones para atajos globales (F1, M, Esc...). */
  private hits: string[] = [];
  private listeners: Array<(code: string) => void> = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code) || boundCodes.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.tapped.add(e.code);
        this.hits.push(e.code);
        for (const l of this.listeners) l(e.code);
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (this.down.delete(e.code)) this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  /** Avisa en cada pulsación (sirve para desbloquear el audio). */
  onKey(fn: (code: string) => void): void {
    this.listeners.push(fn);
  }

  held(code: string): boolean {
    return this.down.has(code) || this.tapped.has(code) || this.released.has(code);
  }

  anyHeld(codes: readonly string[]): boolean {
    for (const c of codes) if (this.held(c)) return true;
    return false;
  }

  /** Llamar una vez por cuadro de simulación, después de muestrear. */
  endFrame(): void {
    this.tapped.clear();
    this.released.clear();
    this.hits.length = 0;
  }

  /** ¿Se pulsó la tecla en este cuadro? */
  hit(code: string): boolean {
    return this.hits.includes(code);
  }

  /** Teclas pulsadas en este cuadro (para asignar controles). */
  frameHits(): readonly string[] {
    return this.hits;
  }
}

export interface PadSnapshot {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Botones con el mapeo estándar (0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 9=Start...). */
  buttons: boolean[];
}

export class Gamepads {
  private snaps: Array<PadSnapshot | null> = [null, null, null, null];
  private prev: Array<boolean[]> = [[], [], [], []];

  /** Muestrea todos los joysticks (una vez por cuadro). */
  poll(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const p = pads[i];
      this.prev[i] = this.snaps[i]?.buttons ?? [];
      if (!p || !p.connected) {
        this.snaps[i] = null;
        continue;
      }
      const b = p.buttons.map((x) => x.pressed || x.value > 0.5);
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      this.snaps[i] = {
        up: !!b[12] || ay < -0.5,
        down: !!b[13] || ay > 0.5,
        left: !!b[14] || ax < -0.5,
        right: !!b[15] || ax > 0.5,
        buttons: b,
      };
    }
  }

  get(i: number): PadSnapshot | null {
    return this.snaps[i] ?? null;
  }

  /** ¿El botón se apretó en este cuadro? */
  pressed(i: number, button: number): boolean {
    const s = this.snaps[i];
    return !!s?.buttons[button] && !this.prev[i][button];
  }

  /** Primer botón apretado en este cuadro en el joystick i (o -1). */
  firstPressed(i: number): number {
    const s = this.snaps[i];
    if (!s) return -1;
    return s.buttons.findIndex((b, n) => b && !this.prev[i][n]);
  }

  /** Flanco de subida de una dirección (para menús). */
  any(): boolean {
    return this.snaps.some((s) => s !== null);
  }
}

/** Entrada de un jugador humano: teclado + joystick. */
export class PlayerInput {
  private prevHeld = 0;

  constructor(
    private kb: Keyboard,
    private pads: Gamepads,
    private keys: KeyBindings,
    private padIndex: number,
  ) {}

  sample(): FrameInput {
    const k = this.kb;
    const p = this.pads.get(this.padIndex);
    const up = k.anyHeld(this.keys.up) || !!p?.up;
    const down = k.anyHeld(this.keys.down) || !!p?.down;
    const left = k.anyHeld(this.keys.left) || !!p?.left;
    const right = k.anyHeld(this.keys.right) || !!p?.right;
    const pb = p?.buttons ?? [];
    // Botones del joystick de este jugador (configurables en CONTROLES).
    const m = PAD_KEYS[this.padIndex] ?? DEFAULT_PAD;
    let held = 0;
    if (k.anyHeld(this.keys.lp) || pb[m.lp]) held |= B_LP;
    if (k.anyHeld(this.keys.hp) || pb[m.hp]) held |= B_HP;
    if (k.anyHeld(this.keys.lk) || pb[m.lk]) held |= B_LK;
    if (k.anyHeld(this.keys.hk) || pb[m.hk]) held |= B_HK;
    // Botones atajo: equivalen a apretar los dos botones juntos (y se marcan: pegado al rival no son agarre).
    if (k.anyHeld(this.keys.power) || pb[m.power]) held |= B_HP | B_HK | B_POWER_KEY;
    if (k.anyHeld(this.keys.roll) || pb[m.roll]) held |= B_LP | B_LK | B_ROLL_KEY;
    if (k.anyHeld(this.keys.taunt) || pb[m.taunt]) held |= B_TAUNT;
    if (k.anyHeld(this.keys.tag) || pb[m.tag]) held |= B_TAG;
    if (k.anyHeld(this.keys.assist) || pb[m.assist]) held |= B_ASSIST;
    const pressed = held & ~this.prevHeld;
    this.prevHeld = held;
    return { dir: dirFromAxes(left, right, up, down), held, pressed };
  }

  reset(): void {
    this.prevHeld = 0;
  }
}

/** Entrada de menús: flechas (o cruceta), Enter/Espacio o el golpe débil de J1 para aceptar, Esc/Retroceso para volver. */
export class MenuInput {
  up = false;
  down = false;
  left = false;
  right = false;
  confirm = false;
  back = false;
  start = false;
  private prevDirs = [false, false, false, false];

  constructor(private kb: Keyboard, private pads: Gamepads) {}

  sample(): void {
    const k = this.kb;
    // Las flechas siempre navegan; también las direcciones que J1 tenga configuradas.
    let up = k.held('ArrowUp') || k.anyHeld(P1_KEYS.up);
    let down = k.held('ArrowDown') || k.anyHeld(P1_KEYS.down);
    let left = k.held('ArrowLeft') || k.anyHeld(P1_KEYS.left);
    let right = k.held('ArrowRight') || k.anyHeld(P1_KEYS.right);
    let confirm = k.hit('Enter') || k.hit('Space') || k.hit('NumpadEnter') || P1_KEYS.lp.some((c) => k.hit(c));
    let back = k.hit('Escape') || k.hit('Backspace');
    let start = k.hit('Escape') || k.hit('Enter');
    for (let i = 0; i < 4; i++) {
      const p = this.pads.get(i);
      if (!p) continue;
      up ||= p.up;
      down ||= p.down;
      left ||= p.left;
      right ||= p.right;
      confirm ||= this.pads.pressed(i, 0);
      back ||= this.pads.pressed(i, 1);
      start ||= this.pads.pressed(i, 9);
    }
    const dirs = [up, down, left, right];
    this.up = up && !this.prevDirs[0];
    this.down = down && !this.prevDirs[1];
    this.left = left && !this.prevDirs[2];
    this.right = right && !this.prevDirs[3];
    this.prevDirs = dirs;
    this.confirm = confirm;
    this.back = back;
    this.start = start;
  }
}
