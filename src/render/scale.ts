// Escala de dibujo del mundo: cuántos pixeles reales hay por unidad de mundo.
// La simulación trabaja en unidades de la pantalla de 480x270; el mundo se
// dibuja S veces más fino (S entre 2 y 4, según la pantalla). Las posiciones
// se ajustan a esa grilla fina, así los sprites HD se mueven suaves y nítidos.

export const renderScale = { s: 2 };

/** Ajusta una coordenada de mundo a la grilla de pixeles reales (1/S). */
export function snap(v: number): number {
  const s = renderScale.s;
  return Math.round(v * s) / s;
}
