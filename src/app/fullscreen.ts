// Pantalla completa. Los navegadores solo dejan entrar con un gesto del
// usuario: se pide al apretar una tecla o hacer clic en la pantalla de título.
// Alt+Enter la alterna en cualquier momento. Mientras dura, se bloquea Esc
// (Chrome y Edge) para que siga sirviendo de pausa; para salir se mantiene
// Esc apretado o se usa Alt+Enter.

interface KeyboardLock {
  lock?: (codes?: string[]) => Promise<void>;
  unlock?: () => void;
}

/** Se apaga si el jugador sale a propósito: el título ya no vuelve a pedirla. */
let auto = true;
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

/** Alt+Enter y el bloqueo de Esc. Llamar una vez al iniciar. */
export function installFullscreen(): void {
  document.addEventListener('fullscreenchange', () => {
    const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
    if (isFullscreen()) {
      wasFull = true;
      void kb?.lock?.(['Escape']).catch(() => undefined);
    } else {
      kb?.unlock?.();
      if (wasFull) auto = false;
    }
  });
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
