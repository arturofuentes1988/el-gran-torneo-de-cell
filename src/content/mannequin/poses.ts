// Biblioteca de poses del maniquí (mirando a la derecha, pies en 0,0).
import { mixPose, type PoseSpec } from './rig';

export const mix = mixPose;

export const STANCE: PoseSpec = {
  hip: [-2, -76], torso: 12, head: 6,
  hF: [27, -117], hB: [17, -108],
  fF: [18, -5], fB: [-20, -5], fAF: 88, fAB: 76,
};

/** Baja cadera y manos (respiración). */
export function breathe(p: PoseSpec, dy: number): PoseSpec {
  return {
    ...p,
    hip: [p.hip[0], p.hip[1] + dy],
    hF: [p.hF[0], p.hF[1] + dy],
    hB: [p.hB[0], p.hB[1] + dy],
  };
}

/** Ciclo de caminata (fase 0..1). Los pies no se cruzan: se mantiene la guardia. */
export function walkPose(ph: number): PoseSpec {
  const step = (p: number, back: number, front: number): [number, number] => {
    if (p < 0.5) {
      const t = p / 0.5;
      return [front + (back - front) * t, -5];
    }
    const t = (p - 0.5) / 0.5;
    return [back + (front - back) * t, -5 - Math.sin(t * Math.PI) * 9];
  };
  const bob = Math.cos(ph * Math.PI * 4) * 1.2;
  const sway = Math.sin(ph * Math.PI * 2) * 1.5;
  return {
    ...STANCE,
    hip: [0, -77 + bob], torso: 13,
    hF: [27 + sway, -117 + bob], hB: [17 - sway, -108 + bob],
    fF: step(ph, -2, 24), fB: step((ph + 0.5) % 1, -24, 2), fAF: 88, fAB: 80,
  };
}

export const CROUCH: PoseSpec = {
  hip: [-2, -48], torso: 24, head: 12,
  hF: [26, -86], hB: [16, -78],
  fF: [24, -5], fB: [-20, -5], fAF: 88, fAB: 80,
};

export const PREJUMP: PoseSpec = {
  hip: [0, -62], torso: 20, head: 10,
  hF: [26, -102], hB: [14, -94],
  fF: [18, -5], fB: [-18, -5],
};

export const JUMP_UP: PoseSpec = {
  hip: [0, -84], torso: 8, head: 4,
  hF: [24, -126], hB: [12, -118],
  fF: [14, -40], fB: [-6, -30], fAF: 120, fAB: 100,
};

export const JUMP_TOP: PoseSpec = {
  hip: [0, -82], torso: 14, head: 8,
  hF: [26, -120], hB: [14, -112],
  fF: [20, -48], fB: [2, -42], fAF: 125, fAB: 110,
};

export const JUMP_FALL: PoseSpec = {
  hip: [0, -78], torso: 6, head: 2,
  hF: [24, -122], hB: [10, -116],
  fF: [12, -14], fB: [-12, -10], fAF: 100, fAB: 85,
};

export const BLOCK_STAND: PoseSpec = {
  hip: [-5, -76], torso: 2, head: -4,
  hF: [18, -126], hB: [14, -116],
  fF: [14, -5], fB: [-24, -5], fAF: 88, fAB: 76,
};

export const BLOCK_CROUCH: PoseSpec = {
  ...CROUCH, hip: [-5, -48], torso: 14, head: 4,
  hF: [20, -92], hB: [16, -84],
};

export const HIT_HIGH: PoseSpec = {
  hip: [-6, -75], torso: -14, head: -26,
  hF: [8, -104], hB: [-4, -98],
  fF: [12, -5], fB: [-24, -5],
};

export const HIT_LOW: PoseSpec = {
  hip: [-6, -72], torso: 34, head: 24,
  hF: [14, -84], hB: [6, -80],
  fF: [14, -5], fB: [-22, -5],
};

export const HIT_CROUCH: PoseSpec = {
  ...CROUCH, hip: [-6, -46], torso: 4, head: -18,
  hF: [12, -78], hB: [4, -72],
};

export const AIR_HIT: PoseSpec = {
  hip: [0, -66], torso: -42, head: -60,
  hF: [-10, -116], hB: [-22, -100],
  fF: [26, -30], fB: [14, -20], fAF: 130, fAB: 120,
};

export const FALL: PoseSpec = {
  hip: [0, -46], torso: -78, head: -90,
  hF: [-40, -66], hB: [-30, -52],
  fF: [34, -42], fB: [26, -30], fAF: 150, fAB: 140,
};

/** Tendido de espaldas. */
export const DOWN: PoseSpec = {
  hip: [0, -12], torso: -92, head: -94,
  hF: [-34, -7], hB: [-22, -5],
  fF: [44, -6], fB: [38, -5], fAF: 175, fAB: 175,
};

export const GETUP1: PoseSpec = {
  hip: [-4, -18], torso: -40, head: -30,
  hF: [-28, -10], hB: [-20, -8],
  fF: [34, -6], fB: [24, -5], fAF: 150, fAB: 140,
};

export const GETUP2: PoseSpec = {
  hip: [-2, -44], torso: 30, head: 16,
  hF: [22, -60], hB: [6, -40],
  fF: [20, -5], fB: [-18, -5],
};

export const GRAB: PoseSpec = {
  hip: [4, -76], torso: 18, head: 10,
  hF: [42, -110], hB: [38, -104],
  fF: [24, -5], fB: [-18, -5],
};

export const TOSS1: PoseSpec = {
  hip: [0, -78], torso: -6, head: -8,
  hF: [34, -146], hB: [28, -140],
  fF: [20, -5], fB: [-22, -5],
};

export const TOSS2: PoseSpec = {
  hip: [6, -74], torso: 34, head: 24,
  hF: [56, -96], hB: [50, -92],
  fF: [28, -5], fB: [-20, -5],
};

/** Pelá: apunta al rival con la mano en la cintura. */
export const TAUNT1: PoseSpec = {
  hip: [-2, -77], torso: -2, head: 10,
  hF: [44, -124], hB: [-12, -86],
  fF: [16, -5], fB: [-18, -5],
};

export const TAUNT2: PoseSpec = { ...TAUNT1, hF: [30, -134], head: 4 };

export const WIN1: PoseSpec = {
  hip: [0, -78], torso: -2, head: -4,
  hF: [18, -122], hB: [-12, -88],
  fF: [16, -5], fB: [-16, -5],
};

export const WIN2: PoseSpec = {
  hip: [0, -79], torso: -4, head: -12,
  hF: [12, -178], hB: [-12, -88],
  fF: [16, -5], fB: [-16, -5],
};

export const LOSE: PoseSpec = {
  hip: [-2, -72], torso: 26, head: 40,
  hF: [14, -80], hB: [6, -76],
  fF: [14, -5], fB: [-16, -5],
};

/** Guardia baja: brazos colgando a los costados y manos abiertas (el muñeco de práctica indefenso). */
export const RELAX: PoseSpec = {
  hip: [0, -77], torso: 7, head: 20,
  hF: [15, -68], hB: [-12, -70],
  fF: [12, -5], fB: [-14, -5], fAF: 88, fAB: 80,
  eF: -1, eB: -1,
  open: true,
};

export const INTRO: PoseSpec = {
  hip: [0, -78], torso: 2, head: 0,
  hF: [14, -112], hB: [18, -106],
  fF: [12, -5], fB: [-14, -5],
};

// ---------------------------------------------------------------- normales

export const LP1: PoseSpec = { ...STANCE, torso: 14, hF: [36, -120] };
export const LP2: PoseSpec = { ...STANCE, hip: [1, -76], torso: 17, hF: [58, -121], hB: [14, -110] };

export const HP1: PoseSpec = { ...STANCE, hip: [-5, -76], torso: 4, hF: [16, -114], hB: [10, -108] };
export const HP2: PoseSpec = {
  hip: [4, -75], torso: 20, head: 12, hF: [40, -121], hB: [10, -106], fF: [24, -5], fB: [-20, -5],
};
export const HP3: PoseSpec = {
  hip: [8, -74], torso: 26, head: 16, hF: [70, -121], hB: [8, -104], fF: [28, -5], fB: [-18, -5],
};

export const LK1: PoseSpec = { ...STANCE, hip: [-3, -79], torso: 4, fF: [16, -38], fAF: 120 };
export const LK2: PoseSpec = {
  hip: [-4, -80], torso: -4, head: 0, hF: [22, -120], hB: [6, -112], fF: [62, -58], fAF: 105, fB: [-18, -5],
};

export const HK1: PoseSpec = { ...STANCE, hip: [-4, -79], torso: 0, fF: [8, -42], fAF: 120 };
export const HK2: PoseSpec = {
  hip: [-6, -81], torso: -12, head: -4, hF: [16, -124], hB: [-10, -112], fF: [30, -84], fAF: 140, fB: [-16, -5],
};
export const HK3: PoseSpec = {
  hip: [-8, -82], torso: -26, head: -10, hF: [10, -126], hB: [-24, -110], fF: [72, -118], fAF: 140, fB: [-14, -5],
};

export const CLP: PoseSpec = { ...CROUCH, torso: 26, hF: [54, -88] };

export const CHP1: PoseSpec = { ...CROUCH, torso: 30, hF: [20, -74] };
export const CHP2: PoseSpec = {
  hip: [4, -58], torso: 6, head: -4, hF: [32, -150], hB: [8, -96], fF: [26, -5], fB: [-18, -5],
};

export const CLK: PoseSpec = { ...CROUCH, torso: 30, fF: [62, -6], fAF: 92 };

export const CHK1: PoseSpec = {
  ...CROUCH, hip: [-6, -42], torso: 40, head: 26, hF: [20, -60], hB: [30, -24], fF: [30, -6],
};
export const CHK2: PoseSpec = {
  hip: [-8, -40], torso: 46, head: 32, hF: [16, -56], hB: [28, -10], fF: [76, -6], fAF: 92, fB: [-22, -5],
};

export const JLP: PoseSpec = { ...JUMP_TOP, torso: 16, hF: [46, -84] };
export const JHP: PoseSpec = { ...JUMP_TOP, torso: 28, head: 22, hF: [50, -66], hB: [10, -96] };
export const JLK: PoseSpec = { ...JUMP_TOP, fF: [46, -46], fAF: 110 };
export const JHK: PoseSpec = {
  hip: [0, -82], torso: -8, head: -2, hF: [18, -116], hB: [-10, -108],
  fF: [60, -40], fAF: 115, fB: [-6, -58], fAB: 60,
};

// ---------------------------------------------------------------- especiales

/** Bola de energía: carga atrás y empuja con las dos palmas. */
export const PJ1: PoseSpec = {
  hip: [-8, -72], torso: -2, head: 6, hF: [-8, -94], hB: [-12, -98],
  armsFront: true, open: true, fF: [22, -5], fB: [-24, -5],
};
export const PJ2: PoseSpec = {
  hip: [6, -70], torso: 24, head: 16, hF: [56, -108], hB: [52, -112],
  armsFront: true, open: true, fF: [32, -5], fB: [-24, -5],
};

/** Gancho volador (antiaéreo invulnerable). */
export const DP1: PoseSpec = {
  hip: [0, -60], torso: 26, head: 14, hF: [22, -78], hB: [10, -74], fF: [22, -5], fB: [-18, -5],
};
export const DP2: PoseSpec = {
  hip: [4, -86], torso: 0, head: -6, hF: [26, -156], hB: [-6, -108],
  fF: [16, -40], fAF: 120, fB: [-2, -4], fAB: 20,
};
export const DP3: PoseSpec = {
  hip: [2, -88], torso: -6, head: -12, hF: [14, -176], hB: [-10, -108],
  fF: [14, -44], fAF: 120, fB: [-4, -8], fAB: 30,
};
export const DP4: PoseSpec = {
  hip: [0, -84], torso: -4, head: -8, hF: [10, -150], hB: [-12, -104],
  fF: [10, -30], fB: [-8, -14],
};

/** Patada remolino: alterna pierna adelante / atrás en el aire. */
export const TK0: PoseSpec = { ...CROUCH, torso: 10, head: 4 };
export const TKA: PoseSpec = {
  hip: [0, -88], torso: -4, head: 0, hF: [12, -118], hB: [-18, -116],
  fF: [64, -82], fAF: 95, fB: [-4, -50], fAB: 60,
};
export const TKB: PoseSpec = {
  hip: [0, -88], torso: 4, head: 6, hF: [16, -116], hB: [-14, -118],
  fF: [4, -52], fAF: 60, fB: [-62, -84], fAB: -85,
};

/** Embestida: carga de hombro. */
export const EM0: PoseSpec = { ...CROUCH, torso: 36, head: 20 };
export const EM1: PoseSpec = {
  hip: [8, -66], torso: 52, head: 36, hF: [44, -100], hB: [26, -94],
  fF: [30, -5], fB: [-34, -5], fAB: 70,
};

/** Súper del Azul: ráfaga de golpes en carrera y remate hacia arriba. */
export const RUSH0: PoseSpec = {
  hip: [-6, -60], torso: 30, head: 18, hF: [6, -84], hB: [-6, -80],
  fF: [24, -5], fB: [-26, -5],
};
export const RUSH1: PoseSpec = {
  hip: [6, -72], torso: 24, head: 14, hF: [62, -112], hB: [12, -100],
  fF: [30, -5], fB: [-22, -5],
};
export const RUSH2: PoseSpec = {
  hip: [8, -72], torso: 26, head: 16, hF: [18, -108], hB: [60, -108], armsFront: true,
  fF: [30, -5], fB: [-22, -5],
};
export const RUSH3: PoseSpec = {
  hip: [6, -80], torso: -4, head: -10, hF: [24, -160], hB: [-6, -104],
  fF: [24, -5], fB: [-18, -5],
};

/** Súper: carga a la cadera y suelta con las dos palmas. */
export const SU0: PoseSpec = {
  hip: [-10, -66], torso: -6, head: 0, hF: [-14, -86], hB: [-18, -90],
  armsFront: true, open: true, fF: [24, -5], fB: [-28, -5],
};
export const SU1: PoseSpec = {
  hip: [8, -68], torso: 22, head: 14, hF: [58, -106], hB: [54, -110],
  armsFront: true, open: true, fF: [36, -5], fB: [-26, -5],
};
