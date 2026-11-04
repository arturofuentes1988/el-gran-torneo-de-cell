// Música: prenderla o apagarla con el botón de la esquina (junto al de pantalla completa) y su
// volumen en OPCIONES > MÚSICA. Queda guardado en el navegador. Los demás sonidos (golpes,
// voces) no cambian: esos se callan con SONIDO o la tecla M.

import type { Sfx } from '../audio/sfx';
import { botonDeEsquina } from './fullscreen';
import { loadMusic, saveMusic, type MusicPref } from './settings';

const ICON_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const ICON_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M3 3l18 18"/></svg>';

let sfx: Sfx | null = null;
let estado: MusicPref = loadMusic();
const boton = document.createElement('button');

export function musica(): MusicPref {
  return { ...estado };
}

export function cambiarMusica(c: Partial<MusicPref>): void {
  estado = { ...estado, ...c };
  saveMusic(estado);
  aplicar();
}

function aplicar(): void {
  sfx?.setMusicLevel(estado.activa ? estado.volumen / 10 : 0);
  boton.innerHTML = estado.activa ? ICON_ON : ICON_OFF;
  boton.title = estado.activa ? 'Apagar la música' : 'Prender la música';
  boton.setAttribute('aria-label', boton.title);
}

/** Llamar una vez al iniciar (después de installFullscreen). */
export function instalarMusica(s: Sfx): void {
  sfx = s;
  boton.id = 'musica';
  boton.className = 'solo-menus';
  boton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Al prenderla con el volumen en 0, vuelve a un volumen que se escuche.
    cambiarMusica({ activa: !estado.activa, volumen: estado.volumen || 7 });
    // Primer toque del jugador: el navegador recién deja sonar el audio.
    s.unlock();
  });
  botonDeEsquina(boton, true);
  aplicar();
}
