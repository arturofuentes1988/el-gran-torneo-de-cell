// Puente para pruebas automáticas (solo con ?qa=1 en la URL): el estado del
// juego se escribe en un elemento oculto del DOM y los comandos se leen de
// otro. Así un navegador automatizado puede verificar la pelea sin acceder
// a las variables internas.

import { B_HK, B_HP, B_LK, B_LP, B_POWER_KEY, B_ROLL_KEY, B_TAUNT, type FrameInput } from '../input/buffer';
import { FightScene } from '../scenes/fight';
import type { Game } from './game';

const QA_BITS: Record<string, number> = {
  lp: B_LP, hp: B_HP, lk: B_LK, hk: B_HK, taunt: B_TAUNT,
  // Botones atajo de rodada y Modo Poder.
  roll: B_LP | B_LK | B_ROLL_KEY, power: B_HP | B_HK | B_POWER_KEY,
};

/**
 * Entradas forzadas: "6,5*2,6+lk,5*20,2+lp+lk" = un cuadro por elemento, dirección
 * de teclado numérico ABSOLUTA, botones apretados en ese cuadro y "*N" para repetir.
 * Un botón con "_" delante queda mantenido (sin pulsación nueva) en todos los cuadros
 * del elemento: "5+hk,5+_hk*55,5" = aprieta patada fuerte, la mantiene y la suelta.
 */
function parseInputs(spec: string): FrameInput[] {
  const out: FrameInput[] = [];
  for (const tok of spec.split(',')) {
    const [body, times] = tok.trim().split('*');
    const [d, ...btns] = body.split('+');
    let bits = 0;
    let hold = 0;
    for (const b of btns) {
      if (b.startsWith('_')) hold |= QA_BITS[b.slice(1)] ?? 0;
      else bits |= QA_BITS[b] ?? 0;
    }
    const n = Math.max(1, Number(times) || 1);
    for (let i = 0; i < n; i++) out.push({ dir: Number(d) || 5, held: (i === 0 ? bits : 0) | hold, pressed: i === 0 ? bits : 0 });
  }
  return out;
}

export function installQaBridge(game: Game): () => void {
  const state = document.createElement('pre');
  state.id = 'qa-state';
  state.style.display = 'none';
  const cmd = document.createElement('pre');
  cmd.id = 'qa-cmd';
  cmd.style.display = 'none';
  document.body.append(state, cmd);

  return () => {
    const scene = game.scene;
    const match = scene instanceof FightScene ? scene.match : null;
    const pending = cmd.textContent ?? '';
    if (pending) {
      cmd.textContent = '';
      for (const line of pending.split('\n')) {
        const [op, a, b] = line.trim().split(':');
        if (op === 'meter' && match) match.fighters[Number(a) as 0 | 1].meter = Number(b);
        if (op === 'health' && match) match.fighters[Number(a) as 0 | 1].health = Number(b);
        if (op === 'input' && scene instanceof FightScene) scene.qaInputs[Number(a) as 0 | 1].push(...parseInputs(b ?? ''));
      }
    }
    state.textContent = JSON.stringify({
      scene: scene?.constructor.name ?? null,
      practice: scene instanceof FightScene ? scene.practiceState : null,
      difficulty: scene instanceof FightScene ? scene.difficulty : null,
      live: scene instanceof FightScene ? scene.liveState : null,
      match: match && {
        frame: match.frame,
        phase: match.phase,
        round: match.round,
        timer: match.timer,
        freeze: match.freeze,
        projectiles: match.projectiles.filter((p) => !p.dead).length,
        // 2 VS 2: equipos (punto, vida, vida roja, esperas) y extras en pantalla.
        teams:
          match.teams?.map((t) => ({
            point: t.point,
            members: t.members.map((f, i) => ({
              id: f.def.id, health: f.health, red: Math.round(f.red), out: t.out[i], state: f.state, x: Math.round(f.x), y: Math.round(f.y),
            })),
            tagCd: t.tagCd,
            assistCd: t.assistCd,
            assist: t.assist ? t.assist.role : null,
            incoming: t.incoming,
          })) ?? null,
        extras: match.extras.map((e) => ({ id: e.f.def.id, side: e.f.side, role: e.role, flying: e.flying, state: e.f.state, x: Math.round(e.f.x) })),
        fighters: match.fighters.map((f) => ({
          id: f.def.id,
          state: f.state,
          move: f.moveId,
          anim: f.animName,
          health: f.health,
          meter: Math.floor(f.meter),
          x: Math.round(f.x),
          y: Math.round(f.y),
          combo: f.comboHits,
          wins: f.wins,
          power: f.powerTimer,
          juggle: f.juggle,
          jumpKind: f.jumpKind,
          grounded: f.grounded,
          vx: Math.round(f.vx * 10) / 10,
          // Combos Killer y ultra.
          ki: { window: f.kiWindow, dobles: f.kiDobles, combo: f.kiCombo, doble: f.isDoble, dobleHits: f.dobleHits, strong: f.moveStrong, remate: f.remate },
          lockout: f.lockout,
          ultra: f.ultraRun ? { step: f.ultraRun.step, hits: f.ultraRun.hits, total: f.ultraRun.total, done: f.ultraRun.done } : null,
          ultraReady: match.ultraReady(f),
        })),
      },
    });
  };
}
