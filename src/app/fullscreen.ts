// Pantalla completa. Los navegadores solo dejan entrar con un gesto del
// usuario: se pide al apretar una tecla o hacer clic en la pantalla de título.
// Alt+Enter la alterna en cualquier momento, y también el botón de la esquina
// inferior derecha (en la pelea con controles táctiles sube junto a ☰ para no
// tapar los botones de ataque). En el celular, al entrar se queda horizontal.
// Mientras dura, se bloquea Esc (Chrome y Edge) para que siga sirviendo de
// pausa; para salir se mantiene Esc apretado, Alt+Enter o el botón.

interface KeyboardLock {
  lock?: (codes?: string[]) => Promise<void>;
  unlock?: () => void;
}

/**
 * Se apaga si el jugador sale a propósito: el título ya no vuelve a pedirla. Dentro de la web
 * (iframe) parte apagada: ahí la pantalla completa se pide con el botón, no al primer toque.
 */
let auto = window.top === window;
let wasFull = false;

export function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

export async function enterFullscreen(): Promise<void> {
  if (isFullscreen() || !document.fullscreenEnabled) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Sin gesto válido o bloqueado por el navegador: se sigue en ventana.
  }
}

/** Para la pantalla de título: entra a pantalla completa salvo que el jugador haya salido antes. */
export function autoFullscreen(): void {
  if (auto) void enterFullscreen();
}

export function toggleFullscreen(): void {
  if (isFullscreen()) void document.exitFullscreen().catch(() => undefined);
  else void enterFullscreen();
}

const ICON_EXPAND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_SHRINK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

/** Mismo tamaño que el ☰ de los controles táctiles (botón de ataque × 0,66, más su borde). */
const TOUCH_SIZE = 'calc(clamp(33px, 11.2vmin, 58px) + 4px)';

const CSS = `
#pantalla-completa { position: fixed; z-index: 11; right: calc(env(safe-area-inset-right) + 8px);
  bottom: calc(env(safe-area-inset-bottom) + 8px); width: 30px; height: 30px; padding: 0; margin: 0;
  display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff4e0;
  background: rgba(30, 10, 40, 0.6); border: 1.5px solid rgba(255, 255, 255, 0.45); border-radius: 8px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5); opacity: 0.5; transition: opacity 0.25s;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; outline: none; }
#pantalla-completa:hover { opacity: 0.95; }
#pantalla-completa svg { width: 64%; height: 64%; fill: none; stroke: currentColor; stroke-width: 2.6;
  stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 1px #000); }
body:has(#loading) #pantalla-completa { display: none; }
body.tactil-on #pantalla-completa { width: ${TOUCH_SIZE}; height: ${TOUCH_SIZE}; border-radius: 12px; border-width: 2px;
  background: rgba(30, 10, 40, 0.7); border-color: rgba(255, 255, 255, 0.55); opacity: 0.62; }
body.tactil-on.tactil-pelea #pantalla-completa { bottom: auto; top: calc(env(safe-area-inset-top) + 6px);
  right: calc(env(safe-area-inset-right) + 16px + ${TOUCH_SIZE}); }
body.puntero-quieto:not(.tactil-on) #pantalla-completa { opacity: 0; pointer-events: none; }
`;

/** Bloquea el celular en horizontal al entrar a pantalla completa y lo suelta al salir (Android). */
function orientation(): (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }) | undefined {
  return screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
}

/**
 * Botón de pantalla completa: un toque entra (y en el celular se pone horizontal), otro sale.
 * No se crea donde no hay pantalla completa (iPhone, o un iframe sin allow="fullscreen").
 */
function installButton(): void {
  if (!document.fullscreenEnabled) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const b = document.createElement('button');
  b.id = 'pantalla-completa';
  b.type = 'button';
  b.tabIndex = -1;
  const refresh = (): void => {
    const full = isFullscreen();
    b.innerHTML = full ? ICON_SHRINK : ICON_EXPAND;
    b.title = full ? 'Salir de pantalla completa' : 'Pantalla completa';
    b.setAttribute('aria-label', b.title);
  };
  refresh();
  document.addEventListener('fullscreenchange', refresh);
  // El toque es solo del botón: no llega al juego (ni al "primer gesto" que pide pantalla completa sola).
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Sin foco: así Espacio o Enter siguen siendo del juego y no vuelven a apretar el botón.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFullscreen()) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void enterFullscreen().then(() => {
        if (isFullscreen() && matchMedia('(pointer: coarse)').matches) orientation()?.lock?.('landscape').catch(() => undefined);
      });
    }
  });
  document.body.appendChild(b);
  // Con mouse, el botón se esconde si el puntero se queda quieto (no tapa la pelea).
  let idle = 0;
  const wake = (): void => {
    document.body.classList.remove('puntero-quieto');
    clearTimeout(idle);
    idle = window.setTimeout(() => document.body.classList.add('puntero-quieto'), 2500);
  };
  window.addEventListener('mousemove', wake, { passive: true });
  wake();
}

/** Alt+Enter, el botón de pantalla completa y el bloqueo de Esc. Llamar una vez al iniciar. */
export function installFullscreen(): void {
  document.addEventListener('fullscreenchange', () => {
    const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
    if (isFullscreen()) {
      wasFull = true;
      void kb?.lock?.(['Escape']).catch(() => undefined);
    } else {
      kb?.unlock?.();
      try {
        orientation()?.unlock?.();
      } catch {
        // Sin bloqueo de orientación (computador, iPhone): nada que soltar.
      }
      if (wasFull) auto = false;
    }
  });
  installButton();
  // En la fase de captura y sin propagar: el juego no ve este Enter (no pausa ni acepta).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      if (!e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) toggleFullscreen();
    },
    { capture: true },
  );
}
