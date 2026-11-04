// Avatares: la cara de un luchador (public/luchadores/<id>/cara.webp). El selector es HTML y lo
// usan la web (arriba a la derecha, junto al apodo) y el juego (EN LÍNEA > CAMBIAR AVATAR).

export const AVATARES: ReadonlyArray<{ id: string; nombre: string }> = [
  { id: 'rene', nombre: 'Loco René' },
  { id: 'pablito', nombre: 'Pablito Neuquén' },
  { id: 'flaitiano', nombre: 'Flaitiano' },
  { id: 'lena', nombre: 'Vendedor de Leña' },
  { id: 'carlitos', nombre: 'Carlitos Run' },
];

/** La imagen de un avatar (relativa: sirve en la web y en el juego, que están en la misma carpeta). */
export function urlAvatar(id: string): string {
  return `luchadores/${id}/cara.webp`;
}

const CSS = `
#avatares { position: fixed; inset: 0; z-index: 25; display: flex; overflow-y: auto; box-sizing: border-box; padding: 12px;
  background: rgba(7, 4, 12, 0.6); font-family: Oswald, 'Arial Narrow', sans-serif; -webkit-tap-highlight-color: transparent; }
#avatares .caja { margin: auto; width: min(100%, 460px); box-sizing: border-box; padding: 18px 20px 16px; border-radius: 10px;
  background: linear-gradient(#2a0f3e, #14061f); border: 2px solid #ffd76a; color: #fff4e0; text-align: center;
  box-shadow: 0 0 0 1px #3a0a40, 0 10px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 58, 192, 0.25); }
#avatares h2 { margin: 0 0 6px; font-size: 22px; letter-spacing: 1.5px; text-shadow: 0 2px 0 #3a0a40; }
#avatares .acento { width: 92px; height: 2px; margin: 0 auto 14px; background: #ff4fd8; box-shadow: 0 3px 0 -1px #ffd040; }
#avatares .caras { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 10px; }
#avatares .cara { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 4px 6px; cursor: pointer;
  font: 700 11px Oswald, 'Arial Narrow', sans-serif; letter-spacing: 0.5px; color: #d8cfe8; background: #1a0c2e;
  border: 1px solid rgba(185, 140, 255, 0.45); border-radius: 8px; touch-action: manipulation; transform: none; }
#avatares .cara img { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; }
#avatares .cara.actual { color: #fff; background: #b02a90; border-color: #ffd76a; box-shadow: 0 0 14px rgba(255, 58, 192, 0.35); }
#avatares .cara:hover:not(:disabled) { filter: brightness(1.2); }
#avatares .cara:disabled { opacity: 0.55; cursor: default; }
#avatares .mensaje { min-height: 18px; margin: 12px 0 8px; font-size: 13px; letter-spacing: 0.5px; }
#avatares .mensaje.error { color: #ff8a8a; }
#avatares .mensaje.info { color: #ffe6a0; }
#avatares .volver { font: 700 15px Oswald, 'Arial Narrow', sans-serif; letter-spacing: 1px; color: #d8cfe8; background: #1a0c2e;
  border: 1px solid rgba(185, 140, 255, 0.45); border-radius: 4px; padding: 8px 26px; cursor: pointer; transform: skewX(-12deg); }
`;

let estilo = false;

/**
 * Abre el selector: un toque en una cara la guarda (`alElegir` devuelve el error o null) y cierra.
 * VOLVER, Esc o tocar afuera cierran sin cambiar nada.
 */
export function abrirSelectorDeAvatar(op: {
  actual: string | null;
  alElegir: (id: string) => Promise<string | null>;
  alCerrar: () => void;
}): { cerrar(): void } {
  if (!estilo) {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    estilo = true;
  }
  const root = document.createElement('div');
  root.id = 'avatares';
  const caja = document.createElement('div');
  caja.className = 'caja';
  const h = document.createElement('h2');
  h.textContent = 'ELIGE TU AVATAR';
  const acento = document.createElement('div');
  acento.className = 'acento';
  const grid = document.createElement('div');
  grid.className = 'caras';
  const msg = document.createElement('div');
  msg.className = 'mensaje';
  const volver = document.createElement('button');
  volver.type = 'button';
  volver.className = 'volver';
  volver.textContent = 'VOLVER';
  let ocupado = false;
  let cerrado = false;
  const cerrar = (): void => {
    if (cerrado) return;
    cerrado = true;
    root.remove();
    op.alCerrar();
  };
  const botones: HTMLButtonElement[] = [];
  for (const a of AVATARES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cara${a.id === op.actual ? ' actual' : ''}`;
    const img = document.createElement('img');
    img.src = urlAvatar(a.id);
    img.alt = '';
    b.append(img, document.createTextNode(a.nombre.toUpperCase()));
    b.addEventListener('click', () => {
      if (ocupado) return;
      ocupado = true;
      for (const x of botones) x.disabled = true;
      msg.className = 'mensaje info';
      msg.textContent = 'GUARDANDO…';
      void op.alElegir(a.id).then((err) => {
        if (cerrado) return;
        if (!err) return cerrar();
        ocupado = false;
        for (const x of botones) x.disabled = false;
        msg.className = 'mensaje error';
        msg.textContent = err;
      });
    });
    botones.push(b);
    grid.appendChild(b);
  }
  volver.addEventListener('click', () => !ocupado && cerrar());
  root.addEventListener('click', (e) => {
    if (e.target === root && !ocupado) cerrar();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ocupado) cerrar();
  });
  caja.append(h, acento, grid, msg, volver);
  root.appendChild(caja);
  document.body.appendChild(root);
  return { cerrar };
}
