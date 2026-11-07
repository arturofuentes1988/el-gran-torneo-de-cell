// Formularios HTML encima del juego (entrar con correo, elegir apodo): Pixi no tiene campos
// de texto, así que estos van en el DOM, con el estilo de los menús (morado, borde dorado y
// botones inclinados). Enter aprieta el botón principal y Esc el de volver. En el celular,
// cuando sale el teclado la caja se puede desplazar para que el campo no quede tapado.

import { tactil } from '../input/touch';

interface Campo {
  id: string;
  etiqueta: string;
  tipo?: 'text' | 'email' | 'password';
  valor?: string;
  /** Atributo autocomplete (así el navegador ofrece el correo y la contraseña guardados). */
  autocompletar?: string;
  max?: number;
}

interface Boton {
  id: string;
  texto: string;
  tipo?: 'principal' | 'normal' | 'volver';
}

interface OpcionesFormulario {
  titulo: string;
  nota?: string;
  campos: Campo[];
  botones: Boton[];
  /** Se llama al apretar un botón (Enter = el principal; Esc = el de volver). */
  alApretar: (id: string) => void;
}

export type TipoMensaje = 'info' | 'error' | 'ok';

export interface Formulario {
  valor(id: string): string;
  mensaje(texto: string, tipo?: TipoMensaje): void;
  /** Mientras espera a internet: todo queda apagado. */
  ocupado(on: boolean): void;
  enfocar(id: string): void;
  cerrar(): void;
}

const CSS = `
#formulario { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 20; display: flex; overflow-y: auto;
  box-sizing: border-box; padding: 12px; background: rgba(7, 4, 12, 0.55); touch-action: pan-y;
  -webkit-tap-highlight-color: transparent; font-family: Oswald, 'Arial Narrow', sans-serif; }
#formulario .caja { margin: auto; width: min(100%, 400px); box-sizing: border-box; padding: 18px 22px 16px; border-radius: 10px;
  background: linear-gradient(#2a0f3e, #14061f); border: 2px solid #ffd76a; color: #fff4e0;
  box-shadow: 0 0 0 1px #3a0a40, 0 10px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 58, 192, 0.25); }
#formulario h2 { margin: 0 0 6px; text-align: center; font-weight: 700; font-size: 22px; letter-spacing: 1.5px; text-shadow: 0 2px 0 #3a0a40; }
#formulario .acento { width: 92px; height: 2px; margin: 0 auto 12px; background: #ff4fd8; box-shadow: 0 3px 0 -1px #ffd040; }
#formulario .nota { margin: 0 0 12px; text-align: center; font-size: 13px; line-height: 1.35; letter-spacing: 0.5px; color: #d8cfe8; }
#formulario label { display: block; margin: 0 0 3px; font-size: 12px; letter-spacing: 1px; color: #ffd76a; }
#formulario input { display: block; width: 100%; box-sizing: border-box; margin: 0 0 10px; padding: 9px 11px; border-radius: 6px;
  font: 500 16px Oswald, 'Arial Narrow', sans-serif; letter-spacing: 0.5px; color: #fff; background: #0b0414;
  border: 1px solid rgba(185, 140, 255, 0.45); outline: none; user-select: text; -webkit-user-select: text; touch-action: manipulation; }
#formulario input:focus { border-color: #ffd76a; box-shadow: 0 0 0 2px rgba(255, 215, 106, 0.25); }
#formulario .mensaje { min-height: 18px; margin: 2px 0 10px; text-align: center; font-size: 13px; line-height: 1.35; letter-spacing: 0.5px; }
#formulario .mensaje.info { color: #ffe6a0; }
#formulario .mensaje.error { color: #ff8a8a; }
#formulario .mensaje.ok { color: #8affb0; }
#formulario .botones { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; }
#formulario button { flex: 1 1 auto; min-width: 90px; white-space: nowrap; padding: 9px 12px; border-radius: 4px; transform: skewX(-12deg); cursor: pointer;
  font: 700 15px Oswald, 'Arial Narrow', sans-serif; letter-spacing: 1px; color: #d8cfe8; background: #1a0c2e;
  border: 1px solid rgba(185, 140, 255, 0.45); touch-action: manipulation; }
#formulario button > span { display: inline-block; transform: skewX(12deg); }
#formulario button.principal { color: #fff; background: #b02a90; border-color: #ffd76a; box-shadow: 0 0 14px rgba(255, 58, 192, 0.35); }
#formulario button:hover:not(:disabled), #formulario button:focus-visible { filter: brightness(1.25); outline: none; }
#formulario button:disabled, #formulario input:disabled { opacity: 0.55; cursor: default; }
/* Celular horizontal: más apretado, para que quepa (y quede algo a la vista con el teclado abierto). */
@media (max-height: 460px) {
  #formulario { padding: 6px; }
  #formulario .caja { padding: 10px 16px 10px; width: min(100%, 460px); }
  #formulario h2 { font-size: 18px; margin-bottom: 4px; }
  #formulario .acento { margin-bottom: 8px; }
  #formulario .nota { font-size: 12px; margin-bottom: 8px; }
  #formulario input { padding: 6px 10px; margin-bottom: 7px; }
  #formulario .mensaje { margin: 0 0 6px; }
  #formulario button { padding: 7px 10px; }
}
`;

let estilo = false;

export function abrirFormulario(op: OpcionesFormulario): Formulario {
  if (!estilo) {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    estilo = true;
  }
  const root = document.createElement('div');
  root.id = 'formulario';
  const form = document.createElement('form');
  form.className = 'caja';
  form.noValidate = true;
  const h = document.createElement('h2');
  h.textContent = op.titulo;
  const acento = document.createElement('div');
  acento.className = 'acento';
  form.append(h, acento);
  if (op.nota) {
    const p = document.createElement('p');
    p.className = 'nota';
    p.textContent = op.nota;
    form.appendChild(p);
  }
  const inputs = new Map<string, HTMLInputElement>();
  for (const c of op.campos) {
    const label = document.createElement('label');
    label.textContent = c.etiqueta;
    label.htmlFor = `f-${c.id}`;
    const input = document.createElement('input');
    input.id = `f-${c.id}`;
    input.name = c.id;
    input.type = c.tipo ?? 'text';
    input.value = c.valor ?? '';
    if (c.autocompletar) input.autocomplete = c.autocompletar as AutoFill;
    if (c.max) input.maxLength = c.max;
    if (c.tipo === 'email') {
      input.inputMode = 'email';
      input.autocapitalize = 'off';
      input.spellcheck = false;
    }
    inputs.set(c.id, input);
    form.append(label, input);
  }
  const msg = document.createElement('div');
  msg.className = 'mensaje';
  const row = document.createElement('div');
  row.className = 'botones';
  const buttons: HTMLButtonElement[] = [];
  let busy = false;
  const principal = op.botones.find((b) => b.tipo === 'principal');
  const volver = op.botones.find((b) => b.tipo === 'volver');
  for (const b of op.botones) {
    const el = document.createElement('button');
    el.type = b === principal ? 'submit' : 'button';
    if (b.tipo === 'principal') el.className = 'principal';
    const span = document.createElement('span');
    span.textContent = b.texto;
    el.appendChild(span);
    if (b !== principal) el.addEventListener('click', () => !busy && op.alApretar(b.id));
    buttons.push(el);
    row.appendChild(el);
  }
  form.append(msg, row);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!busy && principal) op.alApretar(principal.id);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && volver && !busy) {
      e.preventDefault();
      op.alApretar(volver.id);
    }
  });
  root.appendChild(form);
  document.body.appendChild(root);

  // Con el teclado del celular abierto, la caja ocupa solo lo que queda visible.
  const vv = window.visualViewport;
  const ajustar = (): void => {
    if (!vv) return;
    root.style.height = `${vv.height}px`;
    root.style.top = `${vv.offsetTop}px`;
  };
  vv?.addEventListener('resize', ajustar);
  vv?.addEventListener('scroll', ajustar);
  ajustar();
  // En el computador se puede escribir al tiro; en el celular, el teclado sale al tocar el campo.
  const primero = inputs.values().next().value;
  if (primero && !tactil()) requestAnimationFrame(() => primero.focus());

  return {
    valor: (id) => inputs.get(id)?.value ?? '',
    mensaje: (texto, tipo = 'info') => {
      msg.textContent = texto;
      msg.className = `mensaje ${tipo}`;
    },
    ocupado: (on) => {
      busy = on;
      for (const el of buttons) el.disabled = on;
      for (const el of inputs.values()) el.disabled = on;
    },
    enfocar: (id) => inputs.get(id)?.focus(),
    cerrar: () => {
      vv?.removeEventListener('resize', ajustar);
      vv?.removeEventListener('scroll', ajustar);
      root.remove();
    },
  };
}
