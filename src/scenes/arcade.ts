// ARCADE: el jugador elige su luchador y tiene que ganarle a cada uno de los demás,
// uno tras otro, contra la CPU (la última pelea es un poco más difícil).
// Entre peleas: la pantalla VS (con el escenario del rival). Si pierde: ¿CONTINUAR?
// (cuenta regresiva; con aceptar repite esa pelea). Si gana todas: ¡CAMPEÓN!

import { Container, Graphics, Sprite, type Filter, type Text, type Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { loadDifficulty } from '../app/settings';
import { costumeFilter } from '../render/costume';
import { NEON_CYAN, NEON_PINK } from '../render/live';
import { arcade, outlinedText } from '../render/text';
import { DIFFICULTIES } from '../sim/difficulty';
import { FightScene } from './fight';
import { MainMenuScene } from './modeSelect';
import { backdrop } from './backdrop';

/** Una partida de ARCADE: el luchador del jugador (índice del plantel), su color y los rivales en orden. */
export interface ArcadeRun {
  player: number;
  color: number;
  opponents: number[];
  /** Pelea que toca (0 = la primera). */
  index: number;
}

/** Empieza el ARCADE: los rivales son todos los demás luchadores del plantel. */
export function startArcade(game: Game, player: number, color: number): Scene {
  const opponents = game.assets.roster.map((_, i) => i).filter((i) => i !== player);
  // Con un solo luchador en el plantel, pelea contra sí mismo (de otro color).
  if (!opponents.length) opponents.push(player);
  return new ArcadeVsScene(game, { player, color, opponents, index: 0 });
}

type Frames = Array<{ tex: Texture; dur: number }>;

/** Luchador grande animado (guardia o victoria), mirando hacia `facing`. */
class BigFighter {
  readonly sprite = new Sprite();
  private frames: Frames;
  private fi = 0;
  private ft = 0;

  constructor(game: Game, index: number, anim: string, height: number, facing: 1 | -1, filter: Filter | null) {
    const a = game.assets.roster[index];
    const list = a.def.anims[anim]?.frames ?? a.def.anims.idle.frames;
    this.frames = list.map((fr) => ({ tex: game.assets.textures[fr.tex], dur: fr.dur })).filter((fr) => fr.tex);
    const k = ((a.def.texScale ?? 1) * height) / 160;
    this.sprite.scale.set(k * facing, k);
    if (filter) this.sprite.filters = [filter];
    this.show();
  }

  private show(): void {
    const tex = this.frames[this.fi]?.tex;
    if (!tex) return;
    this.sprite.texture = tex;
    this.sprite.anchor.set(tex.defaultAnchor?.x ?? 0.5, tex.defaultAnchor?.y ?? 1);
  }

  step(loop = true): void {
    if (!this.frames.length) return;
    if (++this.ft < this.frames[this.fi].dur) return;
    this.ft = 0;
    if (this.fi + 1 < this.frames.length) this.fi++;
    else if (loop) this.fi = 0;
    this.show();
  }
}

/** Escena de menú simple con el fondo de luces del título. */
abstract class ArcadeScreen implements Scene {
  readonly music = 'titulo';
  protected ui = new Container();
  protected t = 0;

  constructor(protected game: Game) {
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a0414, alpha: 0.6 });
    this.ui.addChild(bg);
  }

  enter(): void {
    backdrop.attach(this.game);
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    backdrop.detach(this.game);
    this.game.display.hud.removeChild(this.ui);
    this.ui.destroy({ children: true });
  }

  abstract step(): void;

  render(): void {
    backdrop.render();
  }

  protected text(s: string, size: number, x: number, y: number, fill = 0xffffff, stroke = 0x0a0610): Text {
    const t = outlinedText(s, size, fill, stroke, Math.max(2, Math.round(size / 5)));
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.ui.addChild(t);
    return t;
  }
}

/** Antes de cada pelea: el jugador contra el rival que toca, con su número de pelea. */
class ArcadeVsScene extends ArcadeScreen {
  private left: BigFighter;
  private right: BigFighter;
  private go: Text;
  private loaded = false;
  private failed = false;

  constructor(game: Game, private run: ArcadeRun) {
    super(game);
    const roster = game.assets.roster;
    const opp = run.opponents[run.index];
    const n = run.opponents.length;
    this.text('ARCADE', 12, VIEW_W / 2, 18, 0xfff4e0, 0x5a0a10);
    this.text(arcade(run.index === n - 1 && n > 1 ? `PELEA FINAL · ${n} DE ${n}` : `PELEA ${run.index + 1} DE ${n}`), 8, VIEW_W / 2, 36, 0xffd040);
    this.left = new BigFighter(game, run.player, 'idle', 160, 1, costumeFilter(run.color));
    this.right = new BigFighter(game, opp, 'idle', 160, -1, opp === run.player ? costumeFilter(run.color + 1) : null);
    this.left.sprite.position.set(104, 226);
    this.right.sprite.position.set(VIEW_W - 104, 226);
    const glowL = new Graphics().ellipse(104, 226, 52, 9).fill({ color: NEON_PINK, alpha: 0.3 });
    const glowR = new Graphics().ellipse(VIEW_W - 104, 226, 52, 9).fill({ color: NEON_CYAN, alpha: 0.3 });
    this.ui.addChild(glowL, glowR, this.left.sprite, this.right.sprite);
    this.text(arcade(roster[run.player].def.name.toUpperCase()), 9, 104, 240, NEON_PINK);
    this.text(arcade(roster[opp].def.name.toUpperCase()), 9, VIEW_W - 104, 240, NEON_CYAN);
    this.text('VS', 34, VIEW_W / 2, 118, 0xffd040, 0x5a0a10);
    this.go = this.text('', 7, VIEW_W / 2, 196, 0xd8d0e8);
    // El escenario del rival (o, si no tiene, uno de la lista según la pelea).
    const lib = game.assets.stages;
    const owned = lib.entries.find((e) => e.luchador === roster[opp].def.id);
    const entry = owned ?? lib.entries[run.index % Math.max(1, lib.entries.length)];
    this.text(arcade(entry ? entry.nombre : ''), 7, VIEW_W / 2, 150, 0xffffff);
    if (entry) {
      lib.get(entry.id).then(
        (st) => {
          game.assets.stage = st;
          this.loaded = true;
        },
        () => {
          this.loaded = true;
          this.failed = true;
        },
      );
    } else this.loaded = true;
  }

  step(): void {
    this.t++;
    this.left.step();
    this.right.step();
    this.go.text = arcade(this.loaded ? 'ACEPTAR PARA PELEAR' : 'CARGANDO...');
    this.go.visible = !this.loaded || Math.floor(this.t / 20) % 2 === 0;
    const m = this.game.menu;
    if (m.back && this.t > 10) {
      this.game.sfx.play('menuBack');
      this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.loaded && ((m.confirm && this.t > 20) || this.t >= 210)) this.fight();
  }

  private fight(): void {
    const g = this.game;
    const run = this.run;
    const n = run.opponents.length;
    const opp = run.opponents[run.index];
    // La dificultad elegida; la pelea final, un nivel más (y uno más cada 3 peleas).
    const base = DIFFICULTIES.indexOf(loadDifficulty());
    const level = Math.min(DIFFICULTIES.length - 1, base + Math.floor(run.index / 3) + (run.index === n - 1 && n > 1 ? 1 : 0));
    g.sfx.play('menuConfirm');
    if (this.failed) console.warn('ARCADE: no se pudo cargar el escenario del rival; se usa el actual.');
    g.setScene(
      new FightScene(g, 'cpu', undefined, {
        fighters: [run.player, opp],
        colors: [run.color, opp === run.player ? run.color + 1 : 0],
        difficulty: DIFFICULTIES[level],
        next: (winner) => {
          if (winner !== 0) return new ArcadeContinueScene(g, run);
          if (run.index + 1 < n) return new ArcadeVsScene(g, { ...run, index: run.index + 1 });
          return new ArcadeEndScene(g, run);
        },
      }),
    );
  }

  override render(): void {
    super.render();
  }
}

/** Perdió una pelea: ¿CONTINUAR? con cuenta regresiva (aceptar repite esa pelea). */
class ArcadeContinueScene extends ArcadeScreen {
  private count: Text;
  private sub: Text;
  private left = 10;
  private over = -1;
  private fighter: BigFighter;

  constructor(game: Game, private run: ArcadeRun) {
    super(game);
    this.fighter = new BigFighter(game, run.player, 'lose', 130, 1, costumeFilter(run.color));
    this.fighter.sprite.position.set(VIEW_W / 2, 236);
    this.fighter.sprite.alpha = 0.85;
    this.ui.addChild(this.fighter.sprite);
    this.text('¿CONTINUAR?', 22, VIEW_W / 2, 46, 0xfff4e0, 0x5a0a10);
    this.count = this.text('9', 40, VIEW_W / 2, 94, 0xffd040, 0x5a0a10);
    this.sub = this.text(arcade('ACEPTAR PARA SEGUIR · ESC PARA SALIR'), 6, VIEW_W / 2, 128, 0xd8d0e8);
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (this.over >= 0) {
      if (++this.over >= 120 || (m.confirm && this.over > 30)) this.game.setScene(new MainMenuScene(this.game));
      return;
    }
    if (this.t % 60 === 1) {
      this.left--;
      this.count.text = String(this.left);
      if (this.left >= 0) this.game.sfx.play('menuMove');
    }
    if (m.confirm && this.t > 15) {
      this.game.sfx.play('menuConfirm');
      this.game.setScene(new ArcadeVsScene(this.game, this.run));
      return;
    }
    if (m.back || this.left < 0) {
      // GAME OVER.
      this.over = 0;
      this.count.text = 'GAME OVER';
      this.count.style.fontSize = 24;
      this.sub.text = '';
      this.game.sfx.play('menuBack');
    }
  }
}

/** Le ganó a todos: ¡CAMPEÓN! con su pose de victoria. */
class ArcadeEndScene extends ArcadeScreen {
  private fighter: BigFighter;
  private sparks = new Graphics();
  private stars: Array<{ x: number; y: number; v: number; c: number; s: number }> = [];

  constructor(game: Game, run: ArcadeRun) {
    super(game);
    const a = game.assets.roster[run.player];
    this.ui.addChild(this.sparks);
    this.fighter = new BigFighter(game, run.player, 'win', 170, 1, costumeFilter(run.color));
    this.fighter.sprite.position.set(VIEW_W / 2, 238);
    this.ui.addChild(this.fighter.sprite);
    this.text('¡CAMPEÓN!', 30, VIEW_W / 2, 34, 0xffd040, 0x5a0a10);
    this.text(arcade(`${a.def.name.toUpperCase()} GANÓ EL GRAN TORNEO DE CELL`), 8, VIEW_W / 2, 60, 0xfff4e0);
    this.text(arcade(`${run.opponents.length} PELEAS GANADAS`), 7, VIEW_W / 2, 74, 0xd8d0e8);
    const own = `${a.def.id}/voz/victoria`;
    if (game.sfx.has(own)) game.sfx.play(own);
    for (let i = 0; i < 70; i++) this.stars.push(this.newStar(true));
  }

  private newStar(anywhere: boolean): { x: number; y: number; v: number; c: number; s: number } {
    const colors = [0xffd040, NEON_PINK, NEON_CYAN, 0xffffff];
    return { x: Math.random() * VIEW_W, y: anywhere ? Math.random() * VIEW_H : -4, v: 0.6 + Math.random() * 1.4, c: colors[Math.floor(Math.random() * 4)], s: 1 + Math.random() * 1.5 };
  }

  step(): void {
    this.t++;
    this.fighter.step(false);
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.y += s.v;
      s.x += Math.sin((this.t + i * 13) / 20) * 0.4;
      if (s.y > VIEW_H + 4) this.stars[i] = this.newStar(false);
    }
    const m = this.game.menu;
    if (this.t > 90 && (m.confirm || m.back)) {
      this.game.sfx.play('menuConfirm');
      this.game.setScene(new MainMenuScene(this.game));
    }
  }

  override render(): void {
    super.render();
    this.sparks.clear();
    for (const s of this.stars) this.sparks.rect(s.x, s.y, s.s, s.s * 2.2).fill({ color: s.c, alpha: 0.85 });
  }
}
