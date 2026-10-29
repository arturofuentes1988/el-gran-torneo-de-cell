// Luchadores provisorios ("Luchador Rojo" y "Luchador Azul"). Son temporales:
// sirven para probar el motor hasta tener los sprites definitivos.

import type { Texture } from 'pixi.js';
import type { FighterDef, HitProps, MoveDef, ProjectileDef, SoundLayer, SoundSpec } from '../../sim/types';
import { makeEnergyFrames } from '../energy';
import { bakeFighter, type AnimSpec, type PFrame } from './build';
import * as P from './poses';
import type { FighterStyle, Ramp } from './raster';
import type { PoseSpec } from './rig';

const HOLD = 600;
const f = (pose: PoseSpec, dur: number, more: Partial<PFrame> = {}): PFrame => ({ pose, dur, ...more });

type Kit = 'rojo' | 'azul';

function anims(kit: Kit): Record<string, AnimSpec> {
  const walk = Array.from({ length: 8 }, (_, i) => P.walkPose(i / 8));
  const idle2 = P.breathe(P.STANCE, 1);
  const idle3 = P.breathe(P.STANCE, 2);
  const crouchMid = P.mix(P.STANCE, P.CROUCH, 0.5);
  const a: Record<string, AnimSpec> = {
    intro: { loop: true, frames: [f(P.INTRO, 12), f(P.breathe(P.INTRO, 1), 12)] },
    idle: { loop: true, frames: [f(P.STANCE, 8), f(idle2, 8), f(idle3, 8), f(idle2, 8)] },
    // Guardia baja del muñeco de práctica: respira lento con los brazos abajo.
    idleRelax: {
      loop: true,
      frames: [f(P.RELAX, 14), f(P.breathe(P.RELAX, 1), 14), f(P.breathe(P.RELAX, 2), 14), f(P.breathe(P.RELAX, 1), 14)],
    },
    walkF: { loop: true, frames: walk.map((p, i) => f(p, [3, 3, 4, 3, 3, 3, 4, 3][i])) },
    walkB: { loop: true, frames: [...walk].reverse().map((p) => f(p, 4)) },
    crouchDown: { frames: [f(crouchMid, 2)] },
    crouch: { frames: [f(P.CROUCH, HOLD)] },
    crouchUp: { frames: [f(crouchMid, 2)] },
    preJump: { frames: [f(P.PREJUMP, 4)] },
    jumpUp: { frames: [f(P.JUMP_UP, HOLD)] },
    jumpTop: { frames: [f(P.JUMP_TOP, HOLD)] },
    jumpFall: { frames: [f(P.JUMP_FALL, HOLD)] },
    land: { frames: [f(P.PREJUMP, 3), f(P.mix(P.PREJUMP, P.STANCE, 0.5), HOLD)] },
    blockStand: { frames: [f(P.BLOCK_STAND, HOLD)] },
    blockCrouch: { frames: [f(P.BLOCK_CROUCH, HOLD)] },
    hitHigh: { frames: [f(P.HIT_HIGH, 6), f(P.mix(P.HIT_HIGH, P.STANCE, 0.4), HOLD)] },
    hitLow: { frames: [f(P.HIT_LOW, 6), f(P.mix(P.HIT_LOW, P.STANCE, 0.4), HOLD)] },
    hitCrouch: { frames: [f(P.HIT_CROUCH, 6), f(P.mix(P.HIT_CROUCH, P.CROUCH, 0.4), HOLD)] },
    airHit: { frames: [f(P.AIR_HIT, HOLD)] },
    fall: { frames: [f(P.FALL, HOLD)] },
    knockdown: { frames: [f(P.DOWN, HOLD)] },
    getup: { frames: [f(P.GETUP1, 8), f(P.GETUP2, 8), f(P.mix(P.GETUP2, P.STANCE, 0.5), 6)] },
    throwGrab: { frames: [f(P.GRAB, 18)] },
    throwToss: { frames: [f(P.TOSS1, 6), f(P.TOSS2, 10), f(P.mix(P.TOSS2, P.STANCE, 0.5), 6)] },
    taunt: { frames: [f(P.TAUNT1, 10), f(P.TAUNT2, 8), f(P.TAUNT1, 8), f(P.TAUNT2, 8), f(P.TAUNT1, 11)] },
    win: { frames: [f(P.WIN1, 10), f(P.WIN2, HOLD)] },
    lose: { frames: [f(P.LOSE, HOLD)] },

    // Normales parados: arranque / activo / recuperación en cuadros.
    sLP: { frames: [f(P.LP1, 2), f(P.mix(P.LP1, P.LP2, 0.5), 2), f(P.LP2, 2, { hit: 'hF' }), f(P.LP1, 3), f(P.STANCE, 4)] },
    sHP: {
      frames: [
        f(P.HP1, 3), f(P.HP2, 3), f(P.HP3, 3, { hit: 'hF' }),
        f(P.HP2, 6), f(P.mix(P.HP2, P.STANCE, 0.5), 6), f(P.STANCE, 4),
      ],
    },
    sLK: { frames: [f(P.LK1, 2), f(P.mix(P.LK1, P.LK2, 0.5), 3), f(P.LK2, 3, { hit: 'fF' }), f(P.LK1, 4), f(P.STANCE, 5)] },
    sHK: {
      frames: [
        f(P.HK1, 3), f(P.mix(P.HK1, P.HK2, 0.5), 3), f(P.HK2, 3), f(P.HK3, 4, { hit: 'fF' }),
        f(P.HK2, 6), f(P.HK1, 7), f(P.STANCE, 7),
      ],
    },
    // Normales agachados.
    cLP: {
      frames: [
        f(P.mix(P.CROUCH, P.CLP, 0.4), 2), f(P.mix(P.CROUCH, P.CLP, 0.7), 2), f(P.CLP, 2, { hit: 'hF' }),
        f(P.mix(P.CROUCH, P.CLP, 0.5), 3), f(P.CROUCH, 3),
      ],
    },
    cHP: {
      frames: [
        f(P.CHP1, 3), f(P.mix(P.CHP1, P.CHP2, 0.5), 3), f(P.CHP2, 4, { hit: 'hF' }),
        f(P.mix(P.CHP2, P.CROUCH, 0.5), 8), f(P.CROUCH, 10),
      ],
    },
    cLK: {
      frames: [
        f(P.mix(P.CROUCH, P.CLK, 0.5), 2), f(P.mix(P.CROUCH, P.CLK, 0.8), 2), f(P.CLK, 3, { hit: 'fF' }),
        f(P.mix(P.CROUCH, P.CLK, 0.5), 4), f(P.CROUCH, 4),
      ],
    },
    cHK: {
      frames: [
        f(P.CHK1, 4), f(P.mix(P.CHK1, P.CHK2, 0.5), 4), f(P.CHK2, 4, { hit: 'fF' }),
        f(P.mix(P.CHK2, P.CHK1, 0.5), 8), f(P.CHK1, 8), f(P.CROUCH, 8),
      ],
    },
    // Normales en el aire.
    jLP: { frames: [f(P.mix(P.JUMP_TOP, P.JLP, 0.5), 2), f(P.mix(P.JUMP_TOP, P.JLP, 0.8), 2), f(P.JLP, 8, { hit: 'hF' }), f(P.mix(P.JUMP_TOP, P.JLP, 0.5), 4)] },
    jHP: { frames: [f(P.mix(P.JUMP_TOP, P.JHP, 0.5), 3), f(P.mix(P.JUMP_TOP, P.JHP, 0.8), 3), f(P.JHP, 6, { hit: 'hF' }), f(P.mix(P.JUMP_TOP, P.JHP, 0.5), 6)] },
    jLK: { frames: [f(P.mix(P.JUMP_TOP, P.JLK, 0.5), 2), f(P.JLK, 10, { hit: 'fF' }), f(P.mix(P.JUMP_TOP, P.JLK, 0.5), 4)] },
    jHK: { frames: [f(P.mix(P.JUMP_TOP, P.JHK, 0.5), 3), f(P.mix(P.JUMP_TOP, P.JHK, 0.8), 3), f(P.JHK, 7, { hit: 'fF' }), f(P.mix(P.JUMP_TOP, P.JHK, 0.5), 6)] },

    // Especiales comunes.
    bolaL: {
      frames: [
        f(P.PJ1, 9), f(P.mix(P.PJ1, P.PJ2, 0.5), 4), f(P.PJ2, 4, { extra: { spawn: 'bolaL' } }),
        f(P.PJ2, 20), f(P.mix(P.PJ2, P.STANCE, 0.5), 6), f(P.STANCE, 4),
      ],
    },
    bolaH: {
      frames: [
        f(P.PJ1, 9), f(P.mix(P.PJ1, P.PJ2, 0.5), 4), f(P.PJ2, 4, { extra: { spawn: 'bolaH' } }),
        f(P.PJ2, 22), f(P.mix(P.PJ2, P.STANCE, 0.5), 6), f(P.STANCE, 4),
      ],
    },
    dp: {
      frames: [
        f(P.DP1, 3, { extra: { invuln: true } }),
        f(P.DP2, 4, {
          hit: 'hF', group: 0,
          extra: { invuln: true, airborne: true, vel: { x: 1.8, y: -8.4 }, sfx: 'whooshH' },
        }),
        f(P.DP3, 6, { hit: 'hF', group: 1, props: { damage: 50, launch: { vx: 1.8, vy: -8 } } }),
        f(P.DP4, HOLD),
      ],
    },
  };

  if (kit === 'rojo') {
    // Súper: el primer cuadro se mantiene durante la cinemática.
    a.super = {
      frames: [
        f(P.SU0, 1), f(P.SU0, 6), f(P.mix(P.SU0, P.SU1, 0.5), 4),
        f(P.SU1, 30, { extra: { spawn: 'super', sfx: 'superSuelta' } }), f(P.mix(P.SU1, P.STANCE, 0.5), 10), f(P.STANCE, 6),
      ],
    };
    const air = { airborne: true, vel: { x: 2.6, y: -3.4 }, gravity: 0.16 };
    a.remolino = {
      frames: [
        f(P.TK0, 5),
        f(P.TKA, 4, { hit: 'fF', group: 0, extra: { ...air, sfx: 'whooshL' } }),
        f(P.TKB, 4, { extra: { gravity: 0.16 } }),
        f(P.TKA, 4, { hit: 'fF', group: 1, extra: { gravity: 0.16, sfx: 'whooshL' } }),
        f(P.TKB, 4, { extra: { gravity: 0.16 } }),
        f(P.TKA, 4, {
          hit: 'fF', group: 2, props: { damage: 44, launch: { vx: 2.6, vy: -6 } },
          extra: { gravity: 0.16, sfx: 'whooshL' },
        }),
        f(P.TKB, 4, { extra: { gravity: 0.3 } }),
        f(P.JUMP_FALL, HOLD, { extra: { vel: { x: 1 } } }),
      ],
    };
  } else {
    a.embestida = {
      frames: [
        f(P.EM0, 6),
        f(P.EM1, 18, { hit: 'body', extra: { vel: { x: 7.2 }, sfx: 'whooshH' } }),
        f(P.mix(P.EM1, P.STANCE, 0.5), 10, { extra: { vel: { x: 0 } } }),
        f(P.STANCE, 8),
      ],
    };
    // Súper: ráfaga en carrera (4 golpes) y remate que lanza al rival.
    const rush = { vel: { x: 6 } };
    a.super = {
      frames: [
        f(P.RUSH0, 1), f(P.RUSH0, 5, { extra: { sfx: 'superRafaga' } }),
        f(P.RUSH1, 4, { hit: 'hF', group: 0, extra: rush }),
        f(P.RUSH2, 4, { hit: 'hB', group: 1 }),
        f(P.RUSH1, 4, { hit: 'hF', group: 2 }),
        f(P.RUSH2, 4, { hit: 'hB', group: 3 }),
        f(P.RUSH3, 8, {
          hit: 'hF', group: 4, props: { damage: 70, hitstop: 16, pushback: 8, launch: { vx: 2.6, vy: -7.5 } },
          extra: { vel: { x: 0.5 }, sfx: 'whooshH' },
        }),
        f(P.mix(P.RUSH3, P.STANCE, 0.5), 14, { extra: { vel: { x: 0 } } }),
        f(P.STANCE, 6),
      ],
    };
  }
  return a;
}

// ---------------------------------------------------------------- sonidos propios (datos)

const ROJO_SOUNDS: Record<string, SoundSpec> = {
  // Carga del súper: energía que sube.
  superCarga: {
    layers: [
      { wave: 'saw', freq: [90, 420], dur: 0.95, attack: 0.05, decay: 0.8, vol: 0.35, vibrato: [7, 0.03], lowpass: [400, 4200] },
      { wave: 'square', freq: [180, 840], dur: 0.95, attack: 0.05, decay: 0.9, vol: 0.14 },
      { wave: 'noise', freq: [300, 5200], dur: 0.95, attack: 0.6, decay: 2, vol: 0.35 },
      { wave: 'sin', freq: [55, 110], dur: 0.95, attack: 0.1, decay: 0.6, vol: 0.5 },
    ],
    echo: { delay: 0.08, feedback: 0.3, mix: 0.3 },
    drive: 1.2,
  },
  // Al soltar la bola gigante.
  superSuelta: {
    layers: [
      { wave: 'noise', freq: [6000, 400], dur: 0.6, decay: 4, vol: 0.9 },
      { wave: 'saw', freq: [440, 110], dur: 0.5, decay: 5, vol: 0.4 },
      { wave: 'sin', freq: [90, 40], dur: 0.7, decay: 3.5, vol: 0.7 },
    ],
    drive: 1.6,
  },
};

const AZUL_SOUNDS: Record<string, SoundSpec> = {
  // Carga del súper: golpe metálico y "whoom" que baja.
  superCarga: {
    layers: [
      { wave: 'triangle', freq: [880, 220], dur: 0.7, decay: 2, vol: 0.4 },
      { wave: 'sin', freq: [1320, 1320], dur: 0.9, decay: 4, vol: 0.25 },
      { wave: 'sin', freq: [1980, 1975], start: 0.05, dur: 0.9, decay: 5, vol: 0.15 },
      { wave: 'square', freq: [110, 55], dur: 0.8, decay: 3, vol: 0.25, lowpass: [2000, 300] },
      { wave: 'noise', freq: [8000, 800], dur: 0.5, attack: 0.05, decay: 6, vol: 0.4 },
    ],
    echo: { delay: 0.11, feedback: 0.35, mix: 0.35 },
  },
  // Ráfaga: ráfaga de golpes secos.
  superRafaga: {
    layers: [
      ...[0, 0.07, 0.14, 0.21, 0.28].map((start, i): SoundLayer => ({
        wave: 'noise', freq: [3000, 900], start, dur: 0.08, decay: 30, vol: 0.6, seed: 10 + i,
      })),
      { wave: 'sin', freq: [220, 60], dur: 0.45, decay: 4, vol: 0.6 },
    ],
    drive: 1.4,
  },
};

// ---------------------------------------------------------------- golpes

const light = (damage: number, extra: Partial<HitProps> = {}): HitProps => ({
  damage, hitstun: 13, blockstun: 9, hitstop: 7, pushback: 10, meter: 5, ...extra,
});
const heavy = (damage: number, extra: Partial<HitProps> = {}): HitProps => ({
  damage, hitstun: 19, blockstun: 15, hitstop: 11, pushback: 16, meter: 10, ...extra,
});
const NONE: HitProps = { damage: 0, hitstun: 0, blockstun: 0 };
const CANCEL: MoveDef['cancelInto'] = ['special', 'super'];

function moves(kit: Kit, k: number): Record<string, MoveDef> {
  // k: multiplicador de daño (el Azul pega un poco más fuerte).
  const d = (n: number) => Math.round(n * k);
  const m: Record<string, MoveDef> = {
    sLP: { name: 'Jab', anim: 'sLP', kind: 'normal', stance: 'stand', hit: light(d(30)), cancelInto: CANCEL },
    sHP: { name: 'Directo', anim: 'sHP', kind: 'normal', stance: 'stand', hit: heavy(d(80)), cancelInto: CANCEL },
    sLK: { name: 'Patada corta', anim: 'sLK', kind: 'normal', stance: 'stand', hit: light(d(35), { hitstun: 14, blockstun: 10, pushback: 12 }), cancelInto: CANCEL },
    sHK: { name: 'Patada alta', anim: 'sHK', kind: 'normal', stance: 'stand', hit: heavy(d(90), { hitstun: 20, hitstop: 12, pushback: 22 }) },
    cLP: { name: 'Jab agachado', anim: 'cLP', kind: 'normal', stance: 'crouch', hit: light(d(25), { hitstun: 12, blockstun: 8, hitstop: 6, pushback: 8 }), cancelInto: CANCEL },
    cHP: { name: 'Gancho agachado', anim: 'cHP', kind: 'normal', stance: 'crouch', hit: heavy(d(75), { hitstun: 18, blockstun: 14, pushback: 14 }), cancelInto: CANCEL },
    cLK: { name: 'Patada baja', anim: 'cLK', kind: 'normal', stance: 'crouch', hit: light(d(25), { guard: 'low', hitstun: 12, blockstun: 8, hitstop: 6 }), cancelInto: CANCEL },
    cHK: { name: 'Barrida', anim: 'cHK', kind: 'normal', stance: 'crouch', hit: heavy(d(70), { guard: 'low', knockdown: true, blockstun: 14 }) },
    jLP: { name: 'Puño aéreo', anim: 'jLP', kind: 'normal', stance: 'air', hit: light(d(35), { guard: 'high', hitstun: 14, blockstun: 10 }) },
    jHP: { name: 'Puño aéreo fuerte', anim: 'jHP', kind: 'normal', stance: 'air', hit: heavy(d(70), { guard: 'high', pushback: 12 }) },
    jLK: { name: 'Patada aérea', anim: 'jLK', kind: 'normal', stance: 'air', hit: light(d(35), { guard: 'high', hitstun: 14, blockstun: 10 }) },
    jHK: { name: 'Patada voladora', anim: 'jHK', kind: 'normal', stance: 'air', hit: heavy(d(75), { guard: 'high', pushback: 12 }) },
    throw: { name: 'Agarre', anim: 'throwGrab', kind: 'throw', stance: 'stand', hit: NONE },
    bolaL: {
      name: kit === 'rojo' ? 'Bola de Fuego' : 'Onda Azul', anim: 'bolaL', kind: 'special', stance: 'stand',
      hit: NONE, motion: 'qcf', buttons: ['lp'], projectile: 'bolaL',
    },
    bolaH: {
      name: kit === 'rojo' ? 'Bola de Fuego' : 'Onda Azul', anim: 'bolaH', kind: 'special', stance: 'stand',
      hit: NONE, motion: 'qcf', buttons: ['hp'], projectile: 'bolaH',
    },
    dp: {
      name: kit === 'rojo' ? 'Gancho Volador' : 'Puño Ascendente', anim: 'dp', kind: 'special', stance: 'stand',
      hit: { damage: d(60), chip: 10, hitstun: 20, blockstun: 18, hitstop: 10, launch: { vx: 1.2, vy: -7.5 }, meter: 8, spark: 'heavy' },
      motion: 'dp', buttons: ['lp', 'hp'], endsInAir: true, landRecovery: 16, cancelInto: ['super'],
    },
    super: kit === 'rojo'
      ? {
          name: 'SÚPER BOLA DE FUEGO', anim: 'super', kind: 'super', stance: 'stand',
          hit: NONE, motion: 'qcf2', buttons: ['lp', 'hp'], meterCost: 100,
          cinematic: { freeze: 60, color: 0xff7a2a, sound: 'superCarga' },
        }
      : {
          name: 'RÁFAGA AZUL', anim: 'super', kind: 'super', stance: 'stand',
          hit: { damage: d(34), chip: 6, hitstun: 22, blockstun: 16, hitstop: 6, pushback: 2, spark: 'super', meter: 0 },
          motion: 'qcf2', buttons: ['lp', 'hp'], meterCost: 100,
          cinematic: { freeze: 60, color: 0x4ac0ff, sound: 'superCarga' },
        },
  };
  if (kit === 'rojo') {
    m.remolino = {
      name: 'Patada Remolino', anim: 'remolino', kind: 'special', stance: 'stand',
      hit: { damage: d(36), chip: 6, hitstun: 16, blockstun: 14, hitstop: 8, pushback: 6, meter: 5 },
      motion: 'qcb', buttons: ['lk', 'hk'], endsInAir: true, landRecovery: 10,
    };
  } else {
    m.embestida = {
      name: 'Embestida', anim: 'embestida', kind: 'special', stance: 'stand',
      hit: { damage: d(90), chip: 14, hitstun: 20, blockstun: 16, hitstop: 12, pushback: 18, launch: { vx: 4, vy: -4.5 }, meter: 10, spark: 'heavy' },
      motion: 'charge', buttons: ['lp', 'hp'],
    };
  }
  return m;
}

function projectiles(kit: Kit, tex: Record<string, Texture>): Record<string, ProjectileDef> {
  const rampSmall: Ramp = kit === 'rojo'
    ? [0x7a1408, 0xd4381a, 0xff7a24, 0xffc040, 0xfff6c8]
    : [0x0c2a7a, 0x1a64d8, 0x2cb4ff, 0x8ae8ff, 0xf0ffff];
  const glow = kit === 'rojo' ? 0xff7a2a : 0x3ab8ff;
  // Energía pintada 3 veces más fina que el mundo (HD): texScale = 1/3.
  const RES = 3;
  const small = makeEnergyFrames(`${kit}-bola`, rampSmall, 34, 22, 4, tex, RES);
  const base = (speed: number): ProjectileDef => ({
    frames: small, frameDur: 4, texScale: 1 / RES, speed, box: { x: -12, y: -9, w: 22, h: 18 }, hits: 1, life: 260,
    hit: { damage: 70, chip: 12, hitstun: 18, blockstun: 16, hitstop: 9, pushback: 14, meter: 8, spark: 'heavy' },
    offset: { x: 60, y: -108 }, glow, glowSize: 26, strength: 1,
  });
  const out: Record<string, ProjectileDef> = { bolaL: base(3.4), bolaH: base(5.2) };
  if (kit === 'rojo') {
    out.super = {
      frames: makeEnergyFrames(`${kit}-super`, rampSmall, 72, 48, 4, tex, RES), frameDur: 3, texScale: 1 / RES, speed: 4.4,
      box: { x: -26, y: -20, w: 50, h: 40 }, hits: 5, hitInterval: 5, life: 220,
      hit: { damage: 44, chip: 9, hitstun: 24, blockstun: 18, hitstop: 6, pushback: 3, spark: 'super', meter: 0 },
      finalHit: { damage: 52, hitstop: 16, launch: { vx: 3.2, vy: -7 } },
      offset: { x: 66, y: -104 }, glow, glowSize: 64, strength: 5, slowOnHit: 0.25,
    };
  }
  return out;
}

const ROJO_STYLE: FighterStyle = {
  ramps: {
    skin: [0x4a2418, 0x8a4a30, 0xc8794f, 0xeaa678, 0xffd3a8],
    top: [0x420a12, 0x7a1220, 0xc0202c, 0xeb4a40, 0xff8e6c],
    pants: [0x3a0810, 0x6e1020, 0xa81c2a, 0xd23c36, 0xf27a5c],
    belt: [0x0b0a10, 0x1c1924, 0x2e2a3a, 0x48425a, 0x6c6584],
    glove: [0x585870, 0x9696ae, 0xd6d6e6, 0xf2f2fa, 0xffffff],
    shoe: [0x4a2418, 0x8a4a30, 0xc8794f, 0xeaa678, 0xffd3a8],
    hair: [0x140a08, 0x2e1a12, 0x4e2e20, 0x744632, 0x9c6448],
    band: [0x585870, 0x9696ae, 0xd6d6e6, 0xf2f2fa, 0xffffff],
  },
  outline: 0x140a18,
  eye: 0x140a18,
  hair: 'spiky',
  bareFeet: true,
};

const AZUL_STYLE: FighterStyle = {
  ramps: {
    skin: [0x4c2c22, 0x8c5c44, 0xcc9068, 0xeebb90, 0xffe2c2],
    top: [0x081438, 0x12276a, 0x1f4fc0, 0x3c86ee, 0x8cc6ff],
    pants: [0x0c1022, 0x18203c, 0x283660, 0x435688, 0x6c84b6],
    belt: [0x1a0e06, 0x3a220e, 0x5e3a18, 0x86562a, 0xb07a44],
    glove: [0x08080c, 0x16161e, 0x26262f, 0x3c3c48, 0x5a5a68],
    shoe: [0x3a080c, 0x741420, 0xc02a34, 0xee5450, 0xff9484],
    hair: [0x5a3a0c, 0x996a16, 0xd8a62c, 0xf4d45a, 0xfff2a6],
    band: [0x3a080c, 0x741420, 0xc02a34, 0xee5450, 0xff9484],
  },
  outline: 0x0c0a18,
  eye: 0x0c0a18,
  hair: 'cap',
  bareFeet: false,
};

export interface FighterAsset {
  def: FighterDef;
  textures: Record<string, Texture>;
  /** Solo los provisorios: atlas generado (para el visor de depuración). */
  atlas?: HTMLCanvasElement;
  /** Cara para las casillas de ELIGE LUCHADOR (public/luchadores/<id>/cara.webp). */
  face?: Texture;
}

function build(kit: Kit): FighterAsset {
  const rojo = kit === 'rojo';
  const id = rojo ? 'rojo' : 'azul';
  const baked = bakeFighter(id, rojo ? ROJO_STYLE : AZUL_STYLE, anims(kit));
  const textures = { ...baked.textures };
  const def: FighterDef = {
    id,
    name: rojo ? 'Luchador Rojo' : 'Luchador Azul',
    // Pixel art horneado a escala de mundo: un pixel de textura = una unidad.
    texScale: 1,
    texFilter: 'nearest',
    health: 1000,
    walkF: rojo ? 2.0 : 1.8,
    walkB: rojo ? 1.6 : 1.5,
    jump: { vy: 8.4, vx: rojo ? 2.6 : 2.4, gravity: 0.45 },
    push: {
      stand: { x: -14, y: -100, w: 28, h: 100 },
      crouch: { x: -15, y: -64, w: 30, h: 64 },
      air: { x: -12, y: -112, w: 24, h: 78 },
    },
    anims: baked.anims,
    moves: moves(kit, rojo ? 1 : 1.08),
    normals: {
      stand: { lp: 'sLP', hp: 'sHP', lk: 'sLK', hk: 'sHK' },
      crouch: { lp: 'cLP', hp: 'cHP', lk: 'cLK', hk: 'cHK' },
      air: { lp: 'jLP', hp: 'jHP', lk: 'jLK', hk: 'jHK' },
    },
    specials: rojo ? ['super', 'dp', 'remolino', 'bolaH', 'bolaL'] : ['super', 'dp', 'embestida', 'bolaH', 'bolaL'],
    throwMove: 'throw',
    throwRange: 54,
    throwDamage: 120,
    projectiles: projectiles(kit, textures),
    sounds: rojo ? ROJO_SOUNDS : AZUL_SOUNDS,
    ui: rojo ? { color: 0xe8423a, fx: 0xff8a2a } : { color: 0x3a7cf0, fx: 0x4ac0ff },
    taunts: rojo
      ? ['¡ANDA A ACOSTARTE!', '¡ERÍ MÁS LENTO QUE MICRO EN TACO!', '¡QUEDASTE PA\'L GATO!']
      : ['¡TE FALTA CALLE, COMPADRE!', '¡ESO FUE TODO?', '¡CORRE, QUE TE PILLO!'],
  };
  return { def, textures, atlas: baked.atlas };
}

export function buildPlaceholderFighters(): [FighterAsset, FighterAsset] {
  return [build('rojo'), build('azul')];
}
