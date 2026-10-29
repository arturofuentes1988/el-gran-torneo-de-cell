// Voz del anunciador: qué muestra de audio corresponde a cada anuncio de la
// pelea. Las muestras se cargan desde public/voces/voces.json (Sfx.loadSample);
// si una no existe, Sfx.play no hace nada.

/** Muestra de voz para un anuncio (evento 'announce' de la simulación), o null si no lleva voz. */
export function announcerVoice(kind: string, text: string): string | null {
  switch (kind) {
    case 'round': {
      const n = /(\d+)/.exec(text)?.[1];
      return n ? `voz/round${n}` : null;
    }
    case 'final':
      return 'voz/final';
    case 'fight':
      // También en práctica: "PRÁCTICA" en pantalla y la voz dice "Fight!".
      return 'voz/fight';
    case 'ko':
      return /DOBLE/.test(text) ? 'voz/doubleKo' : 'voz/ko';
    case 'perfect':
      return 'voz/perfect';
    case 'time':
      return 'voz/time';
    case 'draw':
      return 'voz/draw';
    case 'winner':
      return 'voz/winner';
    default:
      return null;
  }
}
