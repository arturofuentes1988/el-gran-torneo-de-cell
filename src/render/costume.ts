// Colores alternativos de la ropa (como los trajes de color de los juegos de pelea).
// Cada luchador dice cuál es su ropa (FighterDef.costume): ropa oscura (negra o gris
// oscuro), ropa clara (blanca o gris claro) y/o rangos de tono (un polerón amarillo,
// un chaleco azul). Solo esos pixeles cambian al color elegido; la piel, el pelo, la
// cara y los dientes quedan igual, y la franja de arriba (cabeza) y la de abajo
// (zapatillas) de cada cuadro no se tocan. El color 0 es el original (sin filtro).

import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';
import type { CostumeDef } from '../sim/types';

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTarget;
uniform float uDark;
uniform float uLight;
uniform vec3 uHue1;
uniform vec3 uHue2;
uniform float uHead;
uniform float uFeet;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

bool inHue(float h, float s, vec3 r) {
  if (s < r.z) return false;
  return r.x <= r.y ? (h >= r.x && h <= r.y) : (h >= r.x || h <= r.y);
}

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a <= 0.002) {
    finalColor = src;
    return;
  }
  // Posición dentro del cuadro (0 arriba, 1 abajo): la cabeza y los pies no se tocan.
  float y = vTextureCoord.y * uInputSize.y / uOutputFrame.w;
  if (y < uHead || y > 1.0 - uFeet) {
    finalColor = src;
    return;
  }
  vec3 c = src.rgb / src.a;
  vec3 hsv = rgb2hsv(c);
  bool skin = hsv.x < 0.125 && hsv.y > 0.15 && hsv.y < 0.62;
  vec3 outc = c;
  if (!skin && (inHue(hsv.x, hsv.y, uHue1) || inHue(hsv.x, hsv.y, uHue2))) {
    outc = hsv2rgb(vec3(uTarget, hsv.y, hsv.z));
  } else if (uDark > 0.5 && hsv.z > 0.08 && hsv.z < 0.5 && hsv.y < 0.35) {
    // Ropa oscura: se colorea manteniendo su luz y sombra (los contornos negros quedan).
    outc = hsv2rgb(vec3(uTarget, 0.72, clamp(hsv.z * 1.65 + 0.05, 0.0, 1.0)));
  } else if (uLight > 0.5 && hsv.z > 0.45 && hsv.y < 0.2) {
    // Ropa clara: se tiñe del color, más mientras más clara.
    outc = mix(c, hsv2rgb(vec3(uTarget, 0.55, hsv.z)), 0.88);
  }
  finalColor = vec4(outc * src.a, src.a);
}
`;

/** Colores que se pueden elegir por luchador (el 0 es el original). */
export const COSTUME_COUNT = 4;

/** Tono de cada color: rojo, azul y verde. */
const TARGETS = [0, 0.0, 0.6, 0.34];

/** Sin definición: toda la ropa oscura y clara del cuerpo (sin cabeza ni pies). */
const DEFAULT_COSTUME: CostumeDef = { dark: true, light: true, head: 0.2, feet: 0.08 };

const OFF: [number, number, number] = [0, 0, 2];

let program: GlProgram | null = null;

/** Filtro del color `n` (1..3) para la ropa de un luchador, o null para el original. */
export function costumeFilter(n: number, def: CostumeDef | undefined): Filter | null {
  const k = ((n % COSTUME_COUNT) + COSTUME_COUNT) % COSTUME_COUNT;
  if (k === 0) return null;
  const c = def ?? DEFAULT_COSTUME;
  program ??= GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'costume-filter' });
  const costumeUniforms = new UniformGroup({
    uTarget: { value: TARGETS[k], type: 'f32' },
    uDark: { value: c.dark ? 1 : 0, type: 'f32' },
    uLight: { value: c.light ? 1 : 0, type: 'f32' },
    uHue1: { value: new Float32Array(c.hues?.[0] ?? OFF), type: 'vec3<f32>' },
    uHue2: { value: new Float32Array(c.hues?.[1] ?? OFF), type: 'vec3<f32>' },
    uHead: { value: c.head ?? 0.2, type: 'f32' },
    uFeet: { value: c.feet ?? 0.08, type: 'f32' },
  });
  return new Filter({ glProgram: program, resources: { costumeUniforms }, resolution: 'inherit', antialias: 'inherit' });
}
