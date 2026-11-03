// Controles táctiles para celulares y tablets: cruceta a la izquierda y botones a la
// derecha, en HTML encima del juego (semitransparentes, así se ve la pelea por debajo). Aprietan
// teclas virtuales del jugador 1 (Keyboard.press/release), así funcionan igual que el teclado.
// La cruceta y los botones de golpe salen solo en la pelea (mandosDePelea): en los menús las
// opciones se tocan directo (MenuInput.tap) y queda solo ☰, que vuelve atrás o pausa.
// En la práctica sale además una barra abajo al centro (mandosDePractica) con las opciones 1-4
// (súper infinito, sparring, vida y posición): aprieta las teclas 1-4, como en el teclado.
//
// Se muestran en pantallas táctiles (puntero "grueso") o al primer toque; ?tactil=1 los fuerza
// (pruebas en el computador). Con el celular vertical el juego se sube arriba y los controles
// quedan debajo; en horizontal van encima de la pelea.

import type { Display } from '../app/display';
import { P1_KEYS, type Keyboard } from './devices';

type Dir = 'up' | 'down' | 'left' | 'right';

let activo = false;
let instancia: TouchControls | null = null;

/** ¿Se están usando los controles táctiles? (los textos de ayuda dicen "TOCA" en vez de ENTER o ESC). */
export function tactil(): boolean {
  return activo;
}

/** Muestra la cruceta y los botones de golpe (en la pelea) o los esconde (menús y pausa: no tapan las opciones). */
export function mandosDePelea(on: boolean): void {
  if (!on) instancia?.soltar();
  document.body.classList.toggle('tactil-pelea', on);
}

/** Barra de opciones de la práctica (abajo al centro). Sale junto con los mandos de pelea: la pausa la esconde. */
export function mandosDePractica(on: boolean): void {
  if (!on) instancia?.soltar();
  document.body.classList.toggle('tactil-practica', on);
}

interface ButtonDef {
  id: string;
  top: string;
  bottom?: string;
  /** Ícono SVG (las fuentes no traen ∞, ♥ ni ↺ en todos los celulares). */
  icon?: string;
  cls: string;
  codes: () => string[];
}

const uniq = (xs: Array<string | undefined>): string[] => [...new Set(xs.filter((x): x is string => !!x))];

/** Teclas de cada dirección: las flechas (menús) y la del J1 si la cambió en CONTROLES. */
const DIR_CODES: Record<Dir, () => string[]> = {
  up: () => uniq(['ArrowUp', P1_KEYS.up[0]]),
  down: () => uniq(['ArrowDown', P1_KEYS.down[0]]),
  left: () => uniq(['ArrowLeft', P1_KEYS.left[0]]),
  right: () => uniq(['ArrowRight', P1_KEYS.right[0]]),
};

// "Combo" es puñetazo en Chile.
const MAIN: ButtonDef[] = [
  { id: 'lp', top: 'COMBO', bottom: 'DÉBIL', cls: 'b-ataque b-lp', codes: () => uniq([P1_KEYS.lp[0]]) },
  { id: 'hp', top: 'COMBO', bottom: 'FUERTE', cls: 'b-ataque b-hp', codes: () => uniq([P1_KEYS.hp[0]]) },
  { id: 'lk', top: 'PATADA', bottom: 'DÉBIL', cls: 'b-ataque b-lk', codes: () => uniq([P1_KEYS.lk[0]]) },
  { id: 'hk', top: 'PATADA', bottom: 'FUERTE', cls: 'b-ataque b-hk', codes: () => uniq([P1_KEYS.hk[0]]) },
];

const svg = (body: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

/** Opciones de la práctica: las mismas teclas 1-4 del teclado (FightScene.practiceKeys). */
const PRACTICE: ButtonDef[] = [
  {
    id: 'p1', top: '', bottom: 'SÚPER', cls: 'b-prac p-super', codes: () => ['Digit1'],
    icon: svg('<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>'),
  },
  {
    id: 'p2', top: '', bottom: 'SPARRING', cls: 'b-prac p-sparring', codes: () => ['Digit2'],
    icon: svg('<circle cx="12" cy="6.5" r="3.5"/><path d="M5 21v-2.5A5.5 5.5 0 0 1 10.5 13h3a5.5 5.5 0 0 1 5.5 5.5V21"/>'),
  },
  {
    id: 'p3', top: '', bottom: 'VIDA', cls: 'b-prac p-vida', codes: () => ['Digit3'],
    icon: svg('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  },
  {
    id: 'p4', top: '', bottom: 'POSICIÓN', cls: 'b-prac p-pos', codes: () => ['Digit4'],
    icon: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  },
];

/** Donde empiezan las barras de súper del HUD (unidades de pantalla): la barra de la práctica no las tapa. */
const SUPER_TOP = 241;

/** Diagonales de la cruceta: clase, las dos direcciones que aprieta y su flecha (triángulo hacia la esquina). */
const DIAGS: ReadonlyArray<[string, Dir, Dir, string]> = [
  ['d-ul', 'up', 'left', '3,3 12,3 3,12'],
  ['d-ur', 'up', 'right', '13,3 4,3 13,12'],
  ['d-dl', 'down', 'left', '3,13 3,4 12,13'],
  ['d-dr', 'down', 'right', '13,13 13,4 4,13'],
];

const SMALL: ButtonDef[] = [
  { id: 'roll', top: 'RODAR', cls: 'b-small', codes: () => uniq([P1_KEYS.roll[0]]) },
  { id: 'power', top: 'PODER', cls: 'b-small', codes: () => uniq([P1_KEYS.power[0]]) },
  { id: 'taunt', top: 'PELÁ', cls: 'b-small', codes: () => uniq([P1_KEYS.taunt[0]]) },
];

const CSS = `
#tactil { position: fixed; inset: 0; pointer-events: none; display: none; z-index: 10;
  font-family: Oswald, 'Arial Narrow', sans-serif; -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
body.tactil-on #tactil { display: block; }
body:not(.tactil-pelea) #tactil .zona, body:not(.tactil-pelea) #tactil .botones, body:not(.tactil-pelea) #tactil .chicos { display: none; }
#tactil .zona { position: absolute; left: calc(env(safe-area-inset-left) + var(--m) - var(--pad) * 0.25);
  bottom: calc(env(safe-area-inset-bottom) + var(--m) - var(--pad) * 0.25); width: calc(var(--pad) * 1.5); height: calc(var(--pad) * 1.5);
  pointer-events: auto; touch-action: none; }
#tactil .cruz { position: absolute; left: 50%; top: 50%; width: var(--pad); height: var(--pad); margin: calc(var(--pad) / -2) 0 0 calc(var(--pad) / -2);
  opacity: 0.62; transition: opacity 0.1s; filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.6)); }
#tactil .cruz.activa { opacity: 0.95; }
#tactil .brazo { position: absolute; box-sizing: border-box; background: linear-gradient(#3a1a50, #1a0828); border: 2px solid rgba(255, 220, 140, 0.6);
  display: flex; align-items: center; justify-content: center; color: rgba(255, 230, 170, 0.85); font-size: calc(var(--pad) * 0.13); }
#tactil .brazo.on { background: linear-gradient(#ffd27a, #c8902a); color: #3a1a08; border-color: #fff4d0; }
#tactil .arriba, #tactil .abajo { left: 33%; width: 34%; height: 37%; }
#tactil .arriba { top: 0; border-radius: 10px 10px 3px 3px; border-bottom: 0; }
#tactil .abajo { bottom: 0; border-radius: 3px 3px 10px 10px; border-top: 0; }
#tactil .izquierda, #tactil .derecha { top: 33%; height: 34%; width: 37%; }
#tactil .izquierda { left: 0; border-radius: 10px 3px 3px 10px; border-right: 0; }
#tactil .derecha { right: 0; border-radius: 3px 10px 10px 3px; border-left: 0; }
#tactil .centro { position: absolute; left: 33%; top: 33%; width: 34%; height: 34%; background: #1a0828; }
#tactil .centro::after { content: ''; position: absolute; inset: 28%; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #5a3a70, #24102e); }
#tactil .diag { position: absolute; width: 21%; height: 21%; box-sizing: border-box; border-radius: 50%;
  background: linear-gradient(#3a1a50, #1a0828); border: 2px solid rgba(255, 220, 140, 0.5);
  display: flex; align-items: center; justify-content: center; color: rgba(255, 230, 170, 0.8); }
#tactil .diag svg { width: 46%; height: 46%; fill: currentColor; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
#tactil .diag.on { background: linear-gradient(#ffd27a, #c8902a); color: #3a1a08; border-color: #fff4d0; }
#tactil .d-ul { left: 8%; top: 8%; }
#tactil .d-ur { right: 8%; top: 8%; }
#tactil .d-dl { left: 8%; bottom: 8%; }
#tactil .d-dr { right: 8%; bottom: 8%; }
#tactil .botones { position: absolute; right: calc(env(safe-area-inset-right) + var(--m)); bottom: calc(env(safe-area-inset-bottom) + var(--m));
  display: grid; grid-template-columns: repeat(2, var(--btn)); gap: calc(var(--btn) * 0.16); pointer-events: none; }
#tactil .chicos { position: absolute; right: calc(env(safe-area-inset-right) + var(--m)); bottom: calc(env(safe-area-inset-bottom) + var(--m) + var(--btn) * 2.5);
  display: flex; gap: calc(var(--btn) * 0.12); pointer-events: none; }
#tactil .b { pointer-events: auto; touch-action: none; display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: #fff; text-shadow: 0 1px 2px #000; border-radius: 50%; width: var(--btn); height: var(--btn); opacity: 0.62;
  border: 2px solid rgba(255, 255, 255, 0.55); box-shadow: 0 3px 10px rgba(0, 0, 0, 0.55), inset 0 -4px 8px rgba(0, 0, 0, 0.35);
  transition: transform 0.05s, opacity 0.05s; }
#tactil .b .t { font-size: calc(var(--btn) * 0.38); font-weight: 700; line-height: 1; }
#tactil .b .s { font-size: calc(var(--btn) * 0.17); line-height: 1.1; letter-spacing: 0.5px; text-transform: uppercase; }
#tactil .b.on { transform: scale(0.9); opacity: 0.95; filter: brightness(1.35); }
#tactil .b-ataque .t { font-size: calc(var(--btn) * 0.22); letter-spacing: 0.5px; }
#tactil .b-ataque .s { font-size: calc(var(--btn) * 0.185); font-weight: 700; letter-spacing: 0.5px; }
#tactil .b-lp { background: radial-gradient(circle at 35% 30%, #6fc8ff, #1e5fb8 65%, #0c2a5a); }
#tactil .b-hp { background: radial-gradient(circle at 35% 30%, #ff8a8a, #c8202a 65%, #5a080c); }
#tactil .b-lk { background: radial-gradient(circle at 35% 30%, #8affb0, #1e9a48 65%, #0a3a1a); transform: translateX(calc(var(--btn) * -0.35)); }
#tactil .b-hk { background: radial-gradient(circle at 35% 30%, #ffe08a, #c8902a 65%, #5a3a08); transform: translateX(calc(var(--btn) * -0.35)); }
#tactil .b-lk.on, #tactil .b-hk.on { transform: translateX(calc(var(--btn) * -0.35)) scale(0.9); }
#tactil .b-small { width: auto; height: auto; border-radius: 999px; padding: calc(var(--btn) * 0.1) calc(var(--btn) * 0.22);
  background: linear-gradient(#5a2a7a, #2a0a3a); border-color: rgba(255, 210, 120, 0.6); }
#tactil .b-small .t { font-size: calc(var(--btn) * 0.2); letter-spacing: 1px; }
#tactil .b-menu { position: absolute; top: calc(env(safe-area-inset-top) + 6px); right: calc(env(safe-area-inset-right) + 8px);
  width: calc(var(--btn) * 0.66); height: calc(var(--btn) * 0.66); background: rgba(30, 10, 40, 0.7); border-radius: 12px; }
#tactil .b-menu .t { font-size: calc(var(--btn) * 0.32); }
#tactil .practica { position: absolute; display: none; gap: var(--pg); pointer-events: none; }
body.tactil-pelea.tactil-practica #tactil .practica { display: flex; }
#tactil .b-prac { box-sizing: border-box; width: var(--pw); height: var(--ph); border-radius: 12px; gap: 1px;
  background: linear-gradient(#5a2a7a, #2a0a3a); border-color: rgba(255, 210, 120, 0.6); }
#tactil .b-prac svg { width: calc(var(--ph) * 0.44); height: calc(var(--ph) * 0.44); fill: none; stroke: currentColor;
  stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 1px #000); }
#tactil .b-prac .s { font-size: calc(var(--ph) * 0.2); font-weight: 700; letter-spacing: 0.5px; }
#tactil .p-super svg { color: #ffd76a; }
#tactil .p-sparring svg { color: #8ae8ff; }
#tactil .p-vida svg { color: #ff7a8a; fill: currentColor; stroke-width: 1.5; }
#tactil .p-pos svg { color: #8affb0; }
#tactil .girar { position: absolute; left: 0; right: 0; text-align: center; color: #ffd27a; font-size: 14px; letter-spacing: 1px;
  opacity: 0.85; display: none; }
body.tactil-vertical #tactil .girar { display: block; }
`;

export class TouchControls {
  private root = document.createElement('div');
  private pad = document.createElement('div');
  private arms = new Map<Dir, HTMLElement>();
  private hint = document.createElement('div');
  private padId: number | null = null;
  private held = new Map<Dir, string[]>();
  private on = false;
  /** Sueltan cada botón (al esconder los mandos con un dedo encima). */
  private releases: Array<() => void> = [];
  private diags = new Map<string, HTMLElement>();
  private prac = document.createElement('div');
  /** Para leer los bordes seguros (muesca del celular) en pixeles. */
  private safe = document.createElement('div');

  constructor(
    private kb: Keyboard,
    private display: Display,
  ) {
    instancia = this;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.id = 'tactil';
    this.build();
    document.body.appendChild(this.root);
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse || new URLSearchParams(location.search).has('tactil')) this.enable();
    // Un toque en cualquier parte (un tablet con mouse, por ejemplo) los muestra.
    window.addEventListener('touchstart', () => this.enable(), { passive: true });
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
    // En pantalla completa, el celular se queda horizontal (Android; iPhone no lo permite).
    document.addEventListener('fullscreenchange', () => {
      if (!this.on || !document.fullscreenElement) return;
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('landscape').catch(() => undefined);
    });
  }

  private enable(): void {
    if (this.on) return;
    this.on = true;
    activo = true;
    document.body.classList.add('tactil-on');
    this.layout();
  }

  private build(): void {
    // Cruceta: la zona que recibe el dedo es un poco más grande que el dibujo.
    const zone = document.createElement('div');
    zone.className = 'zona';
    this.pad.className = 'cruz';
    const arms: Array<[Dir, string, string]> = [['up', 'arriba', '▲'], ['down', 'abajo', '▼'], ['left', 'izquierda', '◀'], ['right', 'derecha', '▶']];
    for (const [dir, cls, txt] of arms) {
      const arm = document.createElement('div');
      arm.className = `brazo ${cls}`;
      arm.textContent = txt;
      this.arms.set(dir, arm);
      this.pad.appendChild(arm);
    }
    const center = document.createElement('div');
    center.className = 'centro';
    this.pad.appendChild(center);
    // Diagonales: más chicas que los brazos, en las esquinas (se marcan apretando ahí o entre dos brazos).
    for (const [cls, , , points] of DIAGS) {
      const d = document.createElement('div');
      d.className = `diag ${cls}`;
      d.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><polygon points="${points}"/></svg>`;
      this.diags.set(cls, d);
      this.pad.appendChild(d);
    }
    zone.appendChild(this.pad);
    zone.addEventListener('pointerdown', (e) => this.padDown(e, zone));
    zone.addEventListener('pointermove', (e) => this.padMove(e));
    zone.addEventListener('pointerup', (e) => this.padUp(e));
    zone.addEventListener('pointercancel', (e) => this.padUp(e));
    zone.addEventListener('lostpointercapture', (e) => this.padUp(e));
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.appendChild(zone);

    const grid = document.createElement('div');
    grid.className = 'botones';
    for (const b of MAIN) grid.appendChild(this.button(b));
    const small = document.createElement('div');
    small.className = 'chicos';
    for (const b of SMALL) small.appendChild(this.button(b));
    this.root.append(grid, small);
    // Práctica: súper infinito, sparring, vida y posición (abajo al centro).
    this.prac.className = 'practica';
    for (const b of PRACTICE) this.prac.appendChild(this.button(b));
    this.root.appendChild(this.prac);
    this.safe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
    this.root.appendChild(this.safe);
    // ☰: pausa en la pelea y volver en los menús (Escape).
    this.root.appendChild(this.button({ id: 'menu', top: '☰', cls: 'b-menu', codes: () => ['Escape'] }));
    this.hint.className = 'girar';
    this.hint.textContent = 'GIRA EL CELULAR PARA VERLO MÁS GRANDE';
    this.root.appendChild(this.hint);
  }

  private button(def: ButtonDef): HTMLElement {
    const el = document.createElement('div');
    el.className = `b ${def.cls}`;
    const top = def.icon ?? (def.top ? `<span class="t">${def.top}</span>` : '');
    el.innerHTML = `${top}${def.bottom ? `<span class="s">${def.bottom}</span>` : ''}`;
    let codes: string[] = [];
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      codes = def.codes();
      for (const c of codes) this.kb.press(c);
      el.classList.add('on');
      navigator.vibrate?.(8);
    };
    const up = (): void => {
      for (const c of codes) this.kb.release(c);
      codes = [];
      el.classList.remove('on');
    };
    this.releases.push(up);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }

  /** Suelta todo lo que esté apretado (se esconden los mandos). */
  soltar(): void {
    for (const up of this.releases) up();
    this.padId = null;
    this.pad.classList.remove('activa');
    this.setDirs({ up: false, down: false, left: false, right: false });
  }

  // --- Cruceta fija: 4 direcciones y las diagonales (apretando entre dos brazos) ---

  private padDown(e: PointerEvent, zone: HTMLElement): void {
    if (this.padId !== null) return;
    e.preventDefault();
    zone.setPointerCapture?.(e.pointerId);
    this.padId = e.pointerId;
    this.pad.classList.add('activa');
    this.padMove(e);
  }

  private padMove(e: PointerEvent): void {
    if (e.pointerId !== this.padId) return;
    const r = this.pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // Al centro, nada. Afuera, por ángulo: 50° para cada dirección y 40° para cada diagonal
    // (así es fácil marcar abajo-atrás para cubrirse agachado y los cuartos de círculo).
    if (Math.hypot(dx, dy) < r.width * 0.12) {
      this.setDirs({ up: false, down: false, left: false, right: false });
      return;
    }
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    this.setDirs({
      right: Math.abs(deg) < 65,
      left: Math.abs(deg) > 115,
      down: deg > 25 && deg < 155,
      up: deg < -25 && deg > -155,
    });
  }

  private padUp(e: PointerEvent): void {
    if (e.pointerId !== this.padId) return;
    this.padId = null;
    this.pad.classList.remove('activa');
    this.setDirs({ up: false, down: false, left: false, right: false });
  }

  private setDirs(want: Record<Dir, boolean>): void {
    // En diagonal se ilumina la diagonal (no los dos brazos).
    const diagonal = (want.up || want.down) && (want.left || want.right);
    for (const [cls, a, b] of DIAGS) this.diags.get(cls)?.classList.toggle('on', want[a] && want[b]);
    for (const dir of Object.keys(want) as Dir[]) {
      const cur = this.held.get(dir);
      if (want[dir] && !cur) {
        const codes = DIR_CODES[dir]();
        for (const c of codes) this.kb.press(c);
        this.held.set(dir, codes);
        navigator.vibrate?.(6);
      } else if (!want[dir] && cur) {
        for (const c of cur) this.kb.release(c);
        this.held.delete(dir);
      }
      this.arms.get(dir)?.classList.toggle('on', want[dir] && !diagonal);
    }
  }

  // --- Tamaños y orientación ---

  private padSize(): number {
    const m = Math.min(window.innerWidth, window.innerHeight);
    return Math.round(Math.max(120, Math.min(200, m * 0.38)));
  }

  private layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = Math.min(w, h);
    const btn = Math.round(Math.max(50, Math.min(88, m * 0.17)));
    this.root.style.setProperty('--btn', `${btn}px`);
    this.root.style.setProperty('--pad', `${this.padSize()}px`);
    this.root.style.setProperty('--m', `${Math.round(m * 0.03)}px`);
    const vertical = this.on && h > w;
    document.body.classList.toggle('tactil-vertical', vertical);
    // Vertical: el juego arriba y los controles en el espacio de abajo.
    this.display.alignTop = vertical;
    this.display.topOffset = Math.round(btn * 0.66 + 14);
    this.display.layout(true);
    const gameH = (w * 270) / 480;
    if (vertical) this.hint.style.top = `${Math.round(this.display.topOffset + gameH + 14)}px`;
    this.layoutPractice(w, m, btn, vertical, gameH);
  }

  /**
   * Barra de la práctica: en horizontal, abajo al centro del espacio libre entre la cruceta y
   * los botones de ataque, justo encima de las barras de súper (o en la franja negra de abajo si
   * cabe); en vertical, bajo el juego (abajo no queda espacio entre la cruceta y los botones).
   */
  private layoutPractice(w: number, m: number, btn: number, vertical: boolean, gameH: number): void {
    const ph = Math.round(Math.max(40, Math.min(vertical ? 58 : 52, btn * (vertical ? 0.8 : 0.74))));
    const pg = Math.round(ph * 0.16);
    const st = this.prac.style;
    let pw: number;
    if (vertical) {
      pw = Math.min(Math.round(ph * 1.6), Math.floor((w - 24 - 3 * pg) / 4));
      st.left = `${Math.round((w - (4 * pw + 3 * pg)) / 2)}px`;
      st.top = `${Math.round(this.display.topOffset + gameH + 46)}px`;
      st.bottom = '';
    } else {
      const cs = getComputedStyle(this.safe);
      const safeL = parseFloat(cs.paddingLeft) || 0;
      const safeR = parseFloat(cs.paddingRight) || 0;
      const mm = Math.round(m * 0.03);
      // Borde derecho de la zona de la cruceta y borde izquierdo de los botones (los de patada van corridos).
      const left = safeL + mm + this.padSize() * 1.25 + 8;
      const right = w - safeR - mm - btn * (2.16 + 0.35) - 8;
      const free = Math.max(0, right - left);
      pw = Math.max(46, Math.min(Math.round(ph * 1.6), Math.floor((free - 3 * pg) / 4)));
      st.left = `${Math.round(left + (free - (4 * pw + 3 * pg)) / 2)}px`;
      st.top = '';
      // Las barras de súper empiezan en y = SUPER_TOP (unidades de pantalla): la barra va encima.
      // (El juego va centrado; se calcula aquí porque Pixi actualiza su tamaño un cuadro después.)
      const h = window.innerHeight;
      const scale = Math.min(w / 480, h / 270);
      const gameTop = (h - 270 * scale) / 2;
      const band = h - (gameTop + 270 * scale);
      const bottom = band >= ph + mm * 2 ? mm : Math.round(h - (gameTop + SUPER_TOP * scale) + 3);
      st.bottom = `${bottom}px`;
    }
    this.root.style.setProperty('--pw', `${pw}px`);
    this.root.style.setProperty('--ph', `${ph}px`);
    this.root.style.setProperty('--pg', `${pg}px`);
  }
}
