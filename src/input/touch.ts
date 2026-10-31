// Controles táctiles para celulares y tablets: joystick flotante a la izquierda y botones a la
// derecha, en HTML encima del juego (semitransparentes, así se ve la pelea por debajo). Aprietan
// teclas virtuales del jugador 1 (Keyboard.press/release), así funcionan igual en la pelea, en los
// menús (el golpe débil acepta, ☰ vuelve o pausa) y en la pantalla de título.
//
// Se muestran en pantallas táctiles (puntero "grueso") o al primer toque; ?tactil=1 los fuerza
// (pruebas en el computador). Con el celular vertical el juego se sube arriba y los controles
// quedan debajo; en horizontal van encima de la pelea.

import type { Display } from '../app/display';
import { P1_KEYS, type Keyboard } from './devices';

type Dir = 'up' | 'down' | 'left' | 'right';

interface ButtonDef {
  id: string;
  top: string;
  bottom?: string;
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

const MAIN: ButtonDef[] = [
  { id: 'lp', top: 'G', bottom: 'débil', cls: 'b-lp', codes: () => uniq([P1_KEYS.lp[0]]) },
  { id: 'hp', top: 'G', bottom: 'fuerte', cls: 'b-hp', codes: () => uniq([P1_KEYS.hp[0]]) },
  { id: 'lk', top: 'P', bottom: 'débil', cls: 'b-lk', codes: () => uniq([P1_KEYS.lk[0]]) },
  { id: 'hk', top: 'P', bottom: 'fuerte', cls: 'b-hk', codes: () => uniq([P1_KEYS.hk[0]]) },
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
#tactil .zona { position: absolute; left: 0; bottom: 0; width: 48%; height: 72%; pointer-events: auto; touch-action: none; }
#tactil .base { position: absolute; width: var(--stick); height: var(--stick); margin: calc(var(--stick) / -2) 0 0 calc(var(--stick) / -2);
  border-radius: 50%; border: 2px solid rgba(255, 220, 140, 0.55); background: radial-gradient(circle, rgba(40, 20, 60, 0.35), rgba(20, 8, 30, 0.55));
  box-shadow: 0 0 18px rgba(176, 42, 144, 0.45); opacity: 0.55; transition: opacity 0.15s; }
#tactil .base.activa { opacity: 0.95; }
#tactil .perilla { position: absolute; left: 50%; top: 50%; width: 46%; height: 46%; margin: -23% 0 0 -23%; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffe7a8, #c8902a 60%, #6a3a08); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6); }
#tactil .flecha { position: absolute; color: rgba(255, 230, 170, 0.7); font-size: calc(var(--stick) * 0.13); line-height: 1; }
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
#tactil .girar { position: absolute; left: 0; right: 0; text-align: center; color: #ffd27a; font-size: 14px; letter-spacing: 1px;
  opacity: 0.85; display: none; }
body.tactil-vertical #tactil .girar { display: block; }
`;

export class TouchControls {
  private root = document.createElement('div');
  private base = document.createElement('div');
  private knob = document.createElement('div');
  private hint = document.createElement('div');
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private held = new Map<Dir, string[]>();
  private on = false;

  constructor(
    private kb: Keyboard,
    private display: Display,
  ) {
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
    document.body.classList.add('tactil-on');
    this.layout();
  }

  private build(): void {
    const zone = document.createElement('div');
    zone.className = 'zona';
    this.base.className = 'base';
    this.knob.className = 'perilla';
    this.base.appendChild(this.knob);
    for (const [txt, l, t] of [['▲', '50%', '6%'], ['▼', '50%', '94%'], ['◀', '6%', '50%'], ['▶', '94%', '50%']]) {
      const a = document.createElement('div');
      a.className = 'flecha';
      a.textContent = txt;
      a.style.left = l;
      a.style.top = t;
      a.style.transform = 'translate(-50%, -50%)';
      this.base.appendChild(a);
    }
    zone.appendChild(this.base);
    zone.addEventListener('pointerdown', (e) => this.stickDown(e, zone));
    zone.addEventListener('pointermove', (e) => this.stickMove(e));
    zone.addEventListener('pointerup', (e) => this.stickUp(e));
    zone.addEventListener('pointercancel', (e) => this.stickUp(e));
    this.root.appendChild(zone);

    const grid = document.createElement('div');
    grid.className = 'botones';
    for (const b of MAIN) grid.appendChild(this.button(b));
    const small = document.createElement('div');
    small.className = 'chicos';
    for (const b of SMALL) small.appendChild(this.button(b));
    this.root.append(grid, small);
    // ☰: pausa en la pelea y volver en los menús (Escape).
    this.root.appendChild(this.button({ id: 'menu', top: '☰', cls: 'b-menu', codes: () => ['Escape'] }));
    this.hint.className = 'girar';
    this.hint.textContent = 'GIRA EL CELULAR PARA VERLO MÁS GRANDE';
    this.root.appendChild(this.hint);
  }

  private button(def: ButtonDef): HTMLElement {
    const el = document.createElement('div');
    el.className = `b ${def.cls}`;
    el.innerHTML = `<span class="t">${def.top}</span>${def.bottom ? `<span class="s">${def.bottom}</span>` : ''}`;
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
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }

  // --- Joystick flotante: aparece donde se toca y marca 8 direcciones ---

  private restPos(zone: HTMLElement): { x: number; y: number } {
    const r = zone.getBoundingClientRect();
    const s = this.stickSize();
    return { x: s * 0.75 + 16, y: r.height - s * 0.75 - 10 };
  }

  private stickDown(e: PointerEvent, zone: HTMLElement): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    zone.setPointerCapture?.(e.pointerId);
    this.stickId = e.pointerId;
    const r = zone.getBoundingClientRect();
    this.origin = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.base.style.left = `${this.origin.x}px`;
    this.base.style.top = `${this.origin.y}px`;
    this.base.classList.add('activa');
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    const zone = this.base.parentElement as HTMLElement;
    const r = zone.getBoundingClientRect();
    const R = this.stickSize() / 2;
    let dx = e.clientX - r.left - this.origin.x;
    let dy = e.clientY - r.top - this.origin.y;
    const d = Math.hypot(dx, dy);
    // Si el dedo se aleja mucho, la base lo sigue (no hay que volver al centro exacto).
    if (d > R * 1.25) {
      const k = (d - R * 1.25) / d;
      this.origin.x += dx * k;
      this.origin.y += dy * k;
      this.base.style.left = `${this.origin.x}px`;
      this.base.style.top = `${this.origin.y}px`;
      dx -= dx * k;
      dy -= dy * k;
    }
    const lim = Math.min(1, R / Math.max(1, Math.hypot(dx, dy)));
    this.knob.style.transform = `translate(${dx * lim}px, ${dy * lim}px)`;
    const t = R * 0.38;
    this.setDirs({ up: dy < -t, down: dy > t, left: dx < -t, right: dx > t });
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.knob.style.transform = '';
    this.base.classList.remove('activa');
    this.setDirs({ up: false, down: false, left: false, right: false });
    const rest = this.restPos(this.base.parentElement as HTMLElement);
    this.base.style.left = `${rest.x}px`;
    this.base.style.top = `${rest.y}px`;
  }

  private setDirs(want: Record<Dir, boolean>): void {
    for (const dir of Object.keys(want) as Dir[]) {
      const cur = this.held.get(dir);
      if (want[dir] && !cur) {
        const codes = DIR_CODES[dir]();
        for (const c of codes) this.kb.press(c);
        this.held.set(dir, codes);
      } else if (!want[dir] && cur) {
        for (const c of cur) this.kb.release(c);
        this.held.delete(dir);
      }
    }
  }

  // --- Tamaños y orientación ---

  private stickSize(): number {
    const m = Math.min(window.innerWidth, window.innerHeight);
    return Math.round(Math.max(110, Math.min(190, m * 0.36)));
  }

  private layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = Math.min(w, h);
    const btn = Math.round(Math.max(50, Math.min(88, m * 0.17)));
    this.root.style.setProperty('--btn', `${btn}px`);
    this.root.style.setProperty('--stick', `${this.stickSize()}px`);
    this.root.style.setProperty('--m', `${Math.round(m * 0.03)}px`);
    const vertical = this.on && h > w;
    document.body.classList.toggle('tactil-vertical', vertical);
    // Vertical: el juego arriba y los controles en el espacio de abajo.
    this.display.alignTop = vertical;
    this.display.topOffset = Math.round(btn * 0.66 + 14);
    this.display.layout(true);
    if (vertical) {
      const gameH = (w * 270) / 480;
      this.hint.style.top = `${Math.round(this.display.topOffset + gameH + 14)}px`;
    }
    if (this.stickId === null) {
      const rest = this.restPos(this.base.parentElement as HTMLElement);
      this.base.style.left = `${rest.x}px`;
      this.base.style.top = `${rest.y}px`;
    }
  }
}
