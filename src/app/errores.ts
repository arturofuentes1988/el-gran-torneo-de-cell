// Que un error no congele el juego. Antes, si algo fallaba en un cuadro, el bucle de dibujo
// se cortaba y la imagen quedaba pegada para siempre. Ahora:
// - el error se anota (consola y, para poder arreglarlo, la tabla `errores` de Supabase,
//   ver supabase/migraciones/) y el juego sigue con el cuadro siguiente;
// - si falla cuadro tras cuadro, vuelve al menú;
// - si el celular pierde la pantalla (WebGL "context lost", típico cuando se queda sin
//   memoria de video), avisa y, si no vuelve sola, ofrece recargar.

import { SUPABASE_KEY, SUPABASE_URL } from '../online/config';

/** Reportes por sesión como máximo (y cada error distinto una sola vez). */
const MAX_REPORTES = 8;
let enviados = 0;
const vistos = new Set<string>();
/** Datos del aparato y de la escena para el reporte (los pone main.ts). */
let contexto: () => { escena: string; pantalla: string } = () => ({ escena: '', pantalla: '' });

export function contextoDeErrores(fn: typeof contexto): void {
  contexto = fn;
}

/** Anota un error: consola siempre; a Supabase, los primeros de cada tipo. */
export function reportarError(err: unknown, donde: string): void {
  console.error(`[${donde}]`, err);
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const clave = `${donde}|${e.message}`;
  if (vistos.has(clave) || enviados >= MAX_REPORTES) return;
  vistos.add(clave);
  enviados++;
  let ctx = { escena: '', pantalla: '' };
  try {
    ctx = contexto();
  } catch {
    // Sin contexto: igual se manda el error.
  }
  const fila = {
    mensaje: `${donde}: ${e.message}`.slice(0, 2000),
    detalle: (e.stack ?? '').slice(0, 8000),
    escena: ctx.escena.slice(0, 80),
    aparato: navigator.userAgent.slice(0, 400),
    pantalla: ctx.pantalla.slice(0, 120),
  };
  void fetch(`${SUPABASE_URL}/rest/v1/errores`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(fila),
    keepalive: true,
  }).catch(() => undefined);
}

/** Errores sueltos fuera del bucle (promesas sin atrapar, scripts). */
export function vigilarErrores(): void {
  window.addEventListener('error', (e) => reportarError(e.error ?? e.message, 'ventana'));
  window.addEventListener('unhandledrejection', (e) => reportarError(e.reason, 'promesa'));
}

const CSS = `
#sin-pantalla { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center;
  flex-direction: column; gap: 14px; padding: 24px; text-align: center; background: rgba(7, 4, 12, 0.92);
  color: #fff4e0; font: 700 16px Oswald, 'Arial Narrow', sans-serif; letter-spacing: 1px; }
#sin-pantalla.on { display: flex; }
#sin-pantalla button { font: 700 15px Oswald, 'Arial Narrow', sans-serif; letter-spacing: 1px; color: #07030e; background: #ffd040;
  border: 0; border-radius: 6px; padding: 10px 22px; cursor: pointer; }
`;

/**
 * Pantalla perdida (WebGL): el navegador suele devolverla sola en un momento (Pixi vuelve a
 * subir las texturas). Si en 4 segundos no volvió, se ofrece recargar el juego.
 */
export function vigilarPantalla(canvas: HTMLCanvasElement): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const aviso = document.createElement('div');
  aviso.id = 'sin-pantalla';
  const texto = document.createElement('div');
  const boton = document.createElement('button');
  boton.textContent = 'RECARGAR EL JUEGO';
  boton.hidden = true;
  boton.addEventListener('click', () => location.reload());
  aviso.append(texto, boton);
  document.body.appendChild(aviso);
  let espera = 0;
  canvas.addEventListener('webglcontextlost', () => {
    reportarError(new Error('se perdió la pantalla (webglcontextlost)'), 'pantalla');
    texto.textContent = 'RECUPERANDO LA PANTALLA…';
    boton.hidden = true;
    aviso.classList.add('on');
    clearTimeout(espera);
    espera = window.setTimeout(() => {
      texto.textContent = 'EL CELULAR SE QUEDÓ SIN MEMORIA DE VIDEO. PRUEBA CON GRÁFICOS MÁS BAJOS EN OPCIONES.';
      boton.hidden = false;
    }, 4000);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(espera);
    aviso.classList.remove('on');
  });
}
