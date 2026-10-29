// Colores alternativos de la ropa (como los trajes de color de los juegos de pelea):
// un filtro que respeta la piel (tonos cálidos medianamente saturados), gira el tono
// de los colores saturados (pelo, polerón, zapatillas) y tiñe la ropa blanca o gris.
// El color 0 es el original (sin filtro).

import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uHue;
uniform vec3 uTint;
uniform float uNeutral;

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

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a <= 0.002) {
    finalColor = src;
    return;
  }
  vec3 c = src.rgb / src.a;
  vec3 hsv = rgb2hsv(c);
  // Piel (y pelo café): tonos entre rojo y naranjo, ni grises ni muy saturados.
  bool skin = hsv.x < 0.125 && hsv.y > 0.15 && hsv.y < 0.72 && hsv.z > 0.08;
  vec3 outc = c;
  if (!skin) {
    if (hsv.y > 0.22) {
      outc = hsv2rgb(vec3(fract(hsv.x + uHue), hsv.y, hsv.z));
    } else if (hsv.z > 0.3) {
      // Ropa clara (blanca o gris): se tiñe más mientras más clara.
      outc = mix(c, c * uTint, uNeutral * smoothstep(0.3, 0.78, hsv.z));
    }
  }
  finalColor = vec4(outc * src.a, src.a);
}
`;

/** Colores que se pueden elegir por luchador (el 0 es el original). */
export const COSTUME_COUNT = 4;

const PRESETS: ReadonlyArray<{ hue: number; tint: [number, number, number]; neutral: number }> = [
  { hue: 0, tint: [1, 1, 1], neutral: 0 },
  { hue: 0.5, tint: [1.0, 0.36, 0.32], neutral: 0.85 },
  { hue: 0.28, tint: [0.36, 0.56, 1.0], neutral: 0.85 },
  { hue: 0.72, tint: [0.34, 0.31, 0.36], neutral: 0.9 },
];

let program: GlProgram | null = null;

/** Filtro del color `n` (1..3), o null para el original. */
export function costumeFilter(n: number): Filter | null {
  const p = PRESETS[n % COSTUME_COUNT];
  if (!p || n % COSTUME_COUNT === 0) return null;
  program ??= GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'costume-filter' });
  const costumeUniforms = new UniformGroup({
    uHue: { value: p.hue, type: 'f32' },
    uTint: { value: new Float32Array(p.tint), type: 'vec3<f32>' },
    uNeutral: { value: p.neutral, type: 'f32' },
  });
  return new Filter({ glProgram: program, resources: { costumeUniforms }, resolution: 'inherit', antialias: 'inherit' });
}
