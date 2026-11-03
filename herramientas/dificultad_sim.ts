// Torneo de la CPU contra la CPU entre niveles de dificultad, sin dibujar (solo la simulación).
// Sirve para revisar que FÁCIL, NORMAL, DIFÍCIL y MUY DIFÍCIL se distingan.
//
//   npx tsx herramientas/dificultad_sim.ts [semillas=2] [luchadores=rene,pablito,...]
//
// Por cada pareja de niveles juega todas las parejas de luchadores (en los dos lados) con
// varias semillas e informa el porcentaje de victorias y cómo pelea cada nivel: cuánto
// bloquea los primeros golpes, especiales, súper/ultra, combo más largo y cuánto se queda quieto.

import { readFileSync } from 'node:fs';
import { CpuController, type AiParams } from '../src/sim/ai';
import { DIFFICULTIES, type DifficultyId } from '../src/sim/difficulty';
import { ACTIONABLE } from '../src/sim/fighter';
import { Match } from '../src/sim/match';
import type { FighterDef } from '../src/sim/types';

const SEEDS = Number(process.argv[2] ?? 2);
const IDS = (process.argv[3] ?? 'rene,pablito,flaitiano,lena,carlitos').split(',');
const defs = IDS.map((id) => JSON.parse(readFileSync(`public/luchadores/${id}/${id}.json`, 'utf8')) as FighterDef);
/** Tope por pelea (5 rounds de 99 s, más presentaciones): si se pasa, se cuenta como trabada. */
const MAX_FRAMES = 60 * 60 * 12;

interface Stats {
  wins: number;
  games: number;
  firstHitsTaken: number;
  blocks: number;
  specials: number;
  supers: number;
  ultras: number;
  maxCombo: number;
  comboSum: number;
  combos: number;
  quiet: number;
  frames: number;
}

const blank = (): Stats => ({ wins: 0, games: 0, firstHitsTaken: 0, blocks: 0, specials: 0, supers: 0, ultras: 0, maxCombo: 0, comboSum: 0, combos: 0, quiet: 0, frames: 0 });
const byLevel = new Map<DifficultyId, Stats>(DIFFICULTIES.map((d) => [d, blank()]));
const table = new Map<string, { a: number; b: number; draw: number; stuck: number; frames: number; n: number }>();

function play(la: DifficultyId, lb: DifficultyId, da: FighterDef, db: FighterDef, seed: number): void {
  const m = new Match([da, db], seed);
  const cpus = [new CpuController(0, seed * 7 + 1, la), new CpuController(1, seed * 13 + 5, lb)];
  const st = [byLevel.get(la)!, byLevel.get(lb)!];
  const key = `${la}|${lb}`;
  const row = table.get(key) ?? { a: 0, b: 0, draw: 0, stuck: 0, frames: 0, n: 0 };
  table.set(key, row);
  while (!m.over && m.frame < MAX_FRAMES) {
    const ins = [cpus[0].update(m), cpus[1].update(m)] as const;
    if (m.phase === 'fight') {
      for (const i of [0, 1]) {
        st[i].frames++;
        // Quieto: pudiendo moverse, no hace nada (ni camina, ni se cubre, ni aprieta).
        if (ACTIONABLE.has(m.fighters[i].state) && ins[i].dir === 5 && ins[i].held === 0) st[i].quiet++;
      }
    }
    m.step(ins);
    for (const e of m.events) {
      if (e.type === 'hit' && e.combo === 1) st[1 - e.side].firstHitsTaken++;
      else if (e.type === 'block') st[1 - e.side].blocks++;
      else if (e.type === 'attack' && e.special) st[e.side].specials++;
      else if (e.type === 'superFlash') st[e.side][e.ultra ? 'ultras' : 'supers']++;
      else if (e.type === 'comboEnd') {
        st[e.side].maxCombo = Math.max(st[e.side].maxCombo, e.hits);
        st[e.side].comboSum += e.hits;
        st[e.side].combos++;
      }
    }
    m.events.length = 0;
  }
  row.n++;
  row.frames += m.frame;
  st[0].games++;
  st[1].games++;
  if (!m.over) row.stuck++;
  else if (m.matchWinner === 0) {
    row.a++;
    st[0].wins++;
  } else if (m.matchWinner === 1) {
    row.b++;
    st[1].wins++;
  } else row.draw++;
}

const t0 = Date.now();
for (let i = 0; i < DIFFICULTIES.length; i++) {
  for (let j = i + 1; j < DIFFICULTIES.length; j++) {
    const la = DIFFICULTIES[i];
    const lb = DIFFICULTIES[j];
    for (const da of defs) {
      for (const db of defs) {
        for (let s = 1; s <= SEEDS; s++) {
          // Los dos lados: el nivel de arriba a la izquierda y a la derecha.
          play(la, lb, da, db, s * 31 + 7);
          play(lb, la, da, db, s * 31 + 8);
        }
      }
    }
  }
}

const pct = (x: number, n: number) => (n ? `${Math.round((100 * x) / n)}%` : '-');
console.log(`\nVictorias (fila contra columna), ${SEEDS} semillas, ${defs.length} luchadores, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
const names: Record<DifficultyId, string> = { facil: 'FÁCIL', normal: 'NORMAL', dificil: 'DIFÍCIL', muyDificil: 'MUY DIF.' };
console.log(['', ...DIFFICULTIES.map((d) => names[d])].map((x) => x.padEnd(10)).join(''));
for (const a of DIFFICULTIES) {
  const cells = DIFFICULTIES.map((b) => {
    if (a === b) return '—';
    const r1 = table.get(`${a}|${b}`);
    const r2 = table.get(`${b}|${a}`);
    const wins = (r1?.a ?? 0) + (r2?.b ?? 0);
    const n = (r1?.n ?? 0) + (r2?.n ?? 0);
    return pct(wins, n);
  });
  console.log([names[a], ...cells].map((x) => x.padEnd(10)).join(''));
}
let stuck = 0;
let draws = 0;
let frames = 0;
let n = 0;
for (const r of table.values()) {
  stuck += r.stuck;
  draws += r.draw;
  frames += r.frames;
  n += r.n;
}
console.log(`\nPeleas: ${n}, empates: ${draws}, trabadas: ${stuck}, duración media: ${(frames / n / 60).toFixed(0)} s\n`);
// Contra rivales de referencia (parecidos a una persona): un NOVATO que aprieta botones y salta
// mucho, y uno INTERMEDIO. Cuánto le gana cada nivel y cuánta vida le saca por round.
const REF: Record<string, AiParams> = {
  novato: {
    reaction: 26, block: 0.18, blockCorrect: 0.5, antiAir: 0.01, specials: 0.35, combos: 0.15, launcher: 0, superUse: 0.15, powerUse: 0.02,
    roll: 0.02, guardCancel: 0, punish: 0.05, idle: [10, 28], mistake: 0.22, aggression: 1.2, assist: 0.05, breaker: 0.05,
    ultraUse: 0.1, wander: 0.05, guardHold: 0,
  },
  intermedio: {
    reaction: 11, block: 0.52, blockCorrect: 0.8, antiAir: 0.045, specials: 1, combos: 0.6, launcher: 0.5, superUse: 0.12, powerUse: 0.04,
    roll: 0.15, guardCancel: 0.12, punish: 0.3, idle: [6, 18], mistake: 0.06, aggression: 1, assist: 0.1, breaker: 0.15,
    ultraUse: 0.34, wander: 0.05, guardHold: 0,
  },
};
console.log('Contra rivales de referencia: victorias del nivel y vida que le saca al rival por round');
console.log('Nivel      vs NOVATO  daño/round   vs INTERMEDIO  daño/round');
for (const d of DIFFICULTIES) {
  const cells: string[] = [];
  for (const ref of Object.values(REF)) {
    let wins = 0;
    let games = 0;
    let dmg = 0;
    let rounds = 0;
    for (const da of defs) {
      for (const db of defs) {
        for (let s = 1; s <= SEEDS; s++) {
          for (const side of [0, 1] as const) {
            const seed = s * 53 + side;
            const m = new Match(side === 0 ? [da, db] : [db, da], seed);
            const lvl = new CpuController(side, seed * 7 + 1, d);
            const other = new CpuController(side === 0 ? 1 : 0, seed * 13 + 5, ref);
            while (!m.over && m.frame < MAX_FRAMES) {
              const a = lvl.update(m);
              const b = other.update(m);
              m.step(side === 0 ? [a, b] : [b, a]);
              for (const e of m.events) if (e.type === 'hit' && e.side === side) dmg += e.damage;
              m.events.length = 0;
            }
            rounds += m.round;
            games++;
            if (m.matchWinner === side) wins++;
          }
        }
      }
    }
    cells.push(pct(wins, games).padEnd(11), (dmg / Math.max(1, rounds)).toFixed(0).padEnd(13));
  }
  console.log([names[d].padEnd(11), cells[0], cells[1], '  ', cells[2], cells[3]].join(''));
}
console.log('');
console.log('Nivel      bloquea 1er golpe  especiales/min  súper/pelea  ultra/pelea  combo medio  combo máx  quieto');
for (const d of DIFFICULTIES) {
  const s = byLevel.get(d)!;
  const min = s.frames / 3600;
  console.log(
    [
      names[d].padEnd(11),
      pct(s.blocks, s.blocks + s.firstHitsTaken).padEnd(19),
      (s.specials / min).toFixed(1).padEnd(16),
      (s.supers / s.games).toFixed(2).padEnd(13),
      (s.ultras / s.games).toFixed(2).padEnd(13),
      (s.combos ? s.comboSum / s.combos : 0).toFixed(1).padEnd(13),
      String(s.maxCombo).padEnd(11),
      pct(s.quiet, s.frames),
    ].join(''),
  );
}
