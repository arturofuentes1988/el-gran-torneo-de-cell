import { Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import { GROUND_SCREEN_Y, MAX_METER, METER_BAR, VIEW_H, VIEW_W } from '../config';
import type { SimEvent } from '../sim/events';
import type { Fighter } from '../sim/fighter';
import { DANGER, FIGHT_AT, type Match } from '../sim/match';
import type { FighterDef } from '../sim/types';
import { arcade, outlinedText, pixelText } from './text';

type AnnounceKind = Extract<SimEvent, { type: 'announce' }>['kind'];

/** Lo que muestra el HUD en el modo práctica. */
export interface PracticeHudInfo {
  infiniteMeter: boolean;
  /** Nombre visible de la opción del muñeco. */
  dummy: string;
  health: 'recupera' | 'normal';
  /** Combo actual o el último (queda hasta que empieza otro). */
  combo: { hits: number; damage: number };
  best: { hits: number; damage: number };
}

interface PracticeHud {
  infinity: Graphics;
  label: Text;
  combo: Text;
  best: Text;
  panel: Graphics;
  /** Dos filas de la barra de opciones: textos de etiqueta y valor alternados. */
  rows: Array<{ c: Container; parts: Text[] }>;
  key: string;
}

const golpes = (n: number) => `${n} ${n === 1 ? 'GOLPE' : 'GOLPES'}`;

const SIDES = [0, 1] as const;

/** Banda del cartel de súper. */
const CUT_Y = 78;
const CUT_H = 64;

/** Vida roja (recuperable) del 2 VS 2. */
const RED_LIFE = 0x9a1840;
const RED_LIFE_TOP = 0xd0406a;
/** Cuadros que se ve la barra de opciones de la práctica al empezar y después de cambiar una opción. */
const PRACTICE_PANEL_START = 240;
const PRACTICE_PANEL_CHANGE = 180;

/** Elementos del 2 VS 2 de un lado: nombre del compañero y estado de AYUDA y CAMBIO. */
interface TeamRow {
  name: Text;
  assist: Text;
  tag: Text;
  key: string;
}

const ANNOUNCE_STYLE: Record<AnnounceKind, { size: number; fill: number; stroke: number; dur: number }> = {
  // "ROUND N" queda hasta que aparece "FIGHT!".
  round: { size: 32, fill: 0xfff4d0, stroke: 0xa01828, dur: FIGHT_AT },
  final: { size: 32, fill: 0xffd040, stroke: 0xa01828, dur: FIGHT_AT },
  fight: { size: 32, fill: 0xffd040, stroke: 0x6a1010, dur: 44 },
  ko: { size: 40, fill: 0xff3a30, stroke: 0xfff4e0, dur: 100 },
  time: { size: 16, fill: 0xffffff, stroke: 0x6a1010, dur: 100 },
  perfect: { size: 24, fill: 0x8ae8ff, stroke: 0x0a2a6a, dur: 80 },
  winner: { size: 16, fill: 0xffd040, stroke: 0x5a1010, dur: 400 },
  draw: { size: 24, fill: 0xffffff, stroke: 0x303030, dur: 400 },
};

/** Interfaz de pelea en unidades de mundo (480x270), dibujada a resolución de pantalla. */
export class Hud {
  readonly container = new Container();
  private bars = new Graphics();
  private flashRect = new Graphics();
  private names: [Text, Text];
  private timer: Text;
  private stocks: [Text, Text];
  private superLabels: [Text, Text];
  /** "ULTRA" junto a la barra de quien puede hacer su ultra ahora. */
  private ultraTags: [Text, Text];
  /** "BLOQUEO" bajo la vida de quien falló un COMBO BREAKER. */
  private lockTags: [Text, Text];
  private flashMax = 0.8;
  private flashDur = 14;
  private announce: Text;
  private announceT = 0;
  private announceDur = 0;
  // Cartel de la cinemática del súper.
  private cutin = new Container();
  private cutinBg = new Graphics();
  private cutinLines = new Graphics();
  private cutinMask = new Graphics();
  private cutinPortrait = new Container();
  private cutinRim = new Sprite();
  private cutinSil = new Sprite();
  private cutinFighter: Text;
  private cutinName: Text;
  private cutinT = 0;
  private cutinDur = 0;
  private cutinDir = -1;
  private cutinColor = 0xffffff;
  private bubbles: Array<{ c: Container; g: Graphics; t: Text; time: number }> = [];
  private toast: Text;
  private toastT = 0;
  readonly debug: Text;
  /** Elementos del modo práctica (null en las demás peleas). */
  private practiceHud: PracticeHud | null = null;
  /** La barra de opciones de la práctica se ve un rato y se desvanece (pantalla limpia). */
  private practicePanelT = PRACTICE_PANEL_START;
  /** 2 VS 2: compañero y AYUDA / CAMBIO de cada lado (null en 1 vs 1). */
  private teamRows: [TeamRow, TeamRow] | null = null;
  /** Luchadores por id (en 2 VS 2 el lado no basta para saber quién lanza el súper). */
  private byId = new Map<string, FighterDef>();
  /** Punto que se muestra en cada lado: al cambiar se reinician el nombre y la estela. */
  private shown: [Fighter | null, Fighter | null] = [null, null];
  /** ¿La etiqueta de la barra dice MODO PODER? (se cambia solo cuando cambia el estado). */
  private powerShown: [boolean, boolean] = [false, false];
  private trail: [number, number] = [1, 1];
  private trailDelay: [number, number] = [0, 0];
  private lastHealth: [number, number] = [1, 1];
  private flashT = 0;
  private frame = 0;

  constructor(private defs: [FighterDef, FighterDef], private textures: Record<string, Texture>) {
    this.names = [
      outlinedText(defs[0].name.toUpperCase(), 8, 0xffffff),
      outlinedText(defs[1].name.toUpperCase(), 8, 0xffffff),
    ];
    this.names[0].position.set(14, 26);
    this.names[1].anchor.set(1, 0);
    this.names[1].position.set(VIEW_W - 14, 26);
    this.timer = outlinedText('99', 16, 0xffffff, 0x0a0610, 3);
    this.timer.anchor.set(0.5, 0);
    this.timer.position.set(VIEW_W / 2, 9);
    this.stocks = [outlinedText('0', 16, 0x8ae8ff), outlinedText('0', 16, 0x8ae8ff)];
    this.stocks[0].position.set(142, 247);
    this.stocks[1].anchor.set(1, 0);
    this.stocks[1].position.set(VIEW_W - 142, 247);
    this.superLabels = [outlinedText('SÚPER', 8, 0xffe08a), outlinedText('SÚPER', 8, 0xffe08a)];
    this.superLabels[0].position.set(14, 244);
    this.superLabels[1].anchor.set(1, 0);
    this.superLabels[1].position.set(VIEW_W - 14, 244);
    this.ultraTags = [outlinedText('ULTRA', 8, 0xffd040, 0x5a0a10, 2), outlinedText('ULTRA', 8, 0xffd040, 0x5a0a10, 2)];
    this.ultraTags[0].position.set(162, 251);
    this.ultraTags[1].anchor.set(1, 0);
    this.ultraTags[1].position.set(VIEW_W - 162, 251);
    this.lockTags = [outlinedText('BLOQUEO', 8, 0xff5a5a, 0x1a0408, 2), outlinedText('BLOQUEO', 8, 0xff5a5a, 0x1a0408, 2)];
    this.lockTags[0].anchor.set(1, 0);
    this.lockTags[0].position.set(200, 37);
    this.lockTags[1].position.set(VIEW_W - 200, 37);
    for (const t of [...this.ultraTags, ...this.lockTags]) t.visible = false;
    this.announce = outlinedText('', 32, 0xffffff, 0x000000, 3, { align: 'center' });
    this.announce.anchor.set(0.5);
    this.announce.position.set(VIEW_W / 2, 112);
    this.cutinFighter = outlinedText('', 8, 0xffffff, 0x000000, 2);
    this.cutinName = outlinedText('', 16, 0xffd040, 0x3a0a10, 3);
    this.cutinMask.rect(0, CUT_Y, VIEW_W, CUT_H).fill(0xffffff);
    this.cutinPortrait.addChild(this.cutinRim, this.cutinSil);
    this.cutinPortrait.mask = this.cutinMask;
    this.cutin.addChild(this.cutinBg, this.cutinLines, this.cutinPortrait, this.cutinMask, this.cutinFighter, this.cutinName);
    this.cutin.visible = false;
    this.toast = outlinedText('', 16, 0x8ae8ff, 0x0a1a3a, 3);
    this.toast.anchor.set(0.5);
    this.toast.position.set(VIEW_W / 2, 70);
    this.debug = pixelText('', 8, 0xffffff, { stroke: { color: 0x000000, width: 2, join: 'miter' } });
    this.debug.position.set(6, 40);
    this.debug.visible = false;
    this.flashRect.rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
    this.flashRect.alpha = 0;
    for (const d of defs) this.byId.set(d.id, d);
    this.container.addChild(
      this.bars, ...this.names, this.timer, ...this.stocks, ...this.superLabels, ...this.ultraTags, ...this.lockTags,
      this.cutin, this.announce, this.toast, this.debug, this.flashRect,
    );
    for (let i = 0; i < 2; i++) {
      const c = new Container();
      const g = new Graphics();
      const t = pixelText('', 8, 0x1a0a10, { wordWrap: true, wordWrapWidth: 150, align: 'center' });
      t.anchor.set(0.5);
      c.addChild(g, t);
      c.visible = false;
      this.container.addChild(c);
      this.bubbles.push({ c, g, t, time: 0 });
    }
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'announce': {
        const st = ANNOUNCE_STYLE[e.kind];
        this.announce.text = arcade(e.text);
        this.announce.style.fontSize = st.size;
        this.announce.style.fill = st.fill;
        this.announce.style.stroke = { color: st.stroke, width: st.size >= 32 ? 4 : 3, join: 'miter' };
        this.announceT = 0;
        this.announceDur = st.dur;
        break;
      }
      case 'superFlash':
        this.startCutin(e);
        break;
      case 'taunt': {
        const b = this.bubbles[e.side];
        b.t.text = arcade(e.line);
        b.time = 110;
        b.c.visible = true;
        const w = Math.min(160, b.t.width + 12);
        const h = b.t.height + 10;
        b.g.clear();
        b.g.roundRect(-w / 2, -h / 2, w, h, 4).fill(0xffffff).stroke({ color: 0x1a0a10, width: 1 });
        b.g.poly([-4, h / 2 - 1, 4, h / 2 - 1, 0, h / 2 + 6]).fill(0xffffff);
        b.g.moveTo(-4, h / 2).lineTo(0, h / 2 + 6).lineTo(4, h / 2).stroke({ color: 0x1a0a10, width: 1 });
        break;
      }
      case 'tech':
        this.showToast('¡ESCAPE!');
        break;
      case 'tag':
        if (e.kind === 'cambio') this.showToast('¡CAMBIO!');
        else if (e.kind === 'entra') this.showToast(`¡ENTRA ${e.name.toUpperCase()}!`);
        else if (e.kind === 'superEquipo') this.showToast('¡SÚPER EN EQUIPO!');
        break;
      case 'guardCancel':
        this.showToast('¡CONTRA!');
        break;
      case 'powerMode':
        if (e.on) this.showToast('¡MODO PODER!');
        break;
      case 'ko':
        this.flash(14, 0.8);
        break;
      case 'ultraHit':
        this.flash(e.final ? 16 : 4, e.final ? 0.9 : 0.35);
        break;
      case 'comboBreaker':
        this.flash(12, 0.75);
        break;
      default:
        break;
    }
  }

  private startCutin(e: Extract<SimEvent, { type: 'superFlash' }>): void {
    const left = e.side === 0;
    this.cutinDir = left ? -1 : 1;
    this.cutinColor = e.color;
    this.cutinT = 0;
    this.cutinDur = e.freeze;
    const bg = this.cutinBg;
    bg.clear();
    bg.rect(0, CUT_Y, VIEW_W, CUT_H).fill({ color: 0x08040e, alpha: 0.88 });
    bg.rect(0, CUT_Y, VIEW_W, 3).fill(e.color);
    bg.rect(0, CUT_Y + CUT_H - 3, VIEW_W, 3).fill(e.color);
    // Franja de color detrás del retrato.
    const px = left ? 0 : VIEW_W - 140;
    bg.rect(px, CUT_Y + 3, 140, CUT_H - 6).fill({ color: e.color, alpha: 0.35 });
    // Retrato: la textura indicada o, si no hay, la silueta negra del luchador con borde de color.
    const tex = this.textures[e.portrait] ?? Texture.EMPTY;
    const def = (e.id && this.byId.get(e.id)) || this.defs[e.side];
    let k: number;
    let sy: number;
    if (e.silhouette) {
      // Cuadro del luchador al doble de su tamaño: se ve cabeza y pecho, como un retrato.
      k = 2 * (def.texScale ?? 1);
      sy = CUT_Y + 300;
    } else {
      // Retrato propio: apoyado en el borde de abajo del cartel; por defecto un poco más alto que la banda.
      const cin = Object.values(def.moves).find((mv) => (mv.kind === 'super' || mv.kind === 'ultra') && mv.name === e.name)?.cinematic;
      k = cin?.portraitScale ?? (CUT_H * 1.2) / Math.max(1, tex.height);
      sy = CUT_Y + CUT_H + 4;
    }
    for (const s of [this.cutinRim, this.cutinSil]) {
      s.texture = tex;
      s.anchor.set(tex.defaultAnchor?.x ?? 0.5, e.silhouette ? (tex.defaultAnchor?.y ?? 1) : 1);
      s.scale.set(left ? k : -k, k);
    }
    const sx = left ? 66 : VIEW_W - 66;
    this.cutinSil.position.set(sx, sy);
    this.cutinRim.position.set(sx + (left ? 2 : -2), sy - 2);
    this.cutinRim.tint = e.color;
    this.cutinSil.tint = e.silhouette ? 0x000000 : 0xffffff;
    this.cutinRim.visible = e.silhouette;
    this.cutinFighter.text = arcade(e.ultra ? `ULTRA · ${e.fighter.toUpperCase()}` : e.fighter.toUpperCase());
    this.cutinName.text = arcade(e.name);
    this.cutinName.style.fill = e.ultra ? 0xff6a3a : 0xffd040;
    this.cutinFighter.style.fill = e.ultra ? 0xffd040 : 0xffffff;
    this.cutinFighter.anchor.set(left ? 0 : 1, 0);
    this.cutinName.anchor.set(left ? 0 : 1, 0);
    const tx = left ? 150 : VIEW_W - 150;
    this.cutinFighter.position.set(tx, CUT_Y + 14);
    this.cutinName.position.set(tx, CUT_Y + 30);
    this.cutin.visible = true;
  }

  /** Modo práctica: sin reloj (∞), lectura del combo y barra de opciones abajo. */
  setPractice(info: PracticeHudInfo): void {
    if (!this.practiceHud) this.practiceHud = this.buildPractice();
    const p = this.practiceHud;
    const key = JSON.stringify(info);
    if (key === p.key) return;
    p.key = key;
    p.combo.text = arcade(`DAÑO DEL COMBO: ${info.combo.damage} (${golpes(info.combo.hits)})`);
    p.best.text = arcade(`MEJOR COMBO: ${info.best.damage} (${golpes(info.best.hits)})`);
    p.combo.visible = info.combo.hits > 0;
    p.best.visible = info.best.hits > 0;
    const rows = [
      ['1 SÚPER INFINITO: ', info.infiniteMeter ? 'SÍ' : 'NO', '   3 VIDA: ', info.health === 'recupera' ? 'SE RECUPERA' : 'NORMAL'],
      ['2 MUÑECO: ', info.dummy, '   4 REINICIAR POSICIÓN', ''],
    ];
    let maxW = 0;
    rows.forEach((texts, r) => {
      const row = p.rows[r];
      let x = 0;
      row.parts.forEach((t, i) => {
        t.text = arcade(texts[i]);
        t.x = x;
        x += texts[i] ? t.width : 0;
      });
      row.c.x = Math.round((VIEW_W - x) / 2);
      maxW = Math.max(maxW, x);
    });
    p.panel.clear();
    p.panel.roundRect(Math.round((VIEW_W - maxW) / 2) - 6, 212, maxW + 12, 25, 3).fill({ color: 0x08040e, alpha: 0.62 });
  }

  private buildPractice(): PracticeHud {
    this.timer.visible = false;
    // Los datos de depuración (F2) bajan para no tapar la lectura del combo.
    this.debug.position.y = 64;
    // Símbolo de infinito dibujado (la fuente pixel no lo trae).
    const inf = new Graphics();
    for (const [w, c] of [[4, 0x0a0610], [2, 0xffffff]] as const) {
      inf.ellipse(VIEW_W / 2 - 6, 17, 6, 4.5).stroke({ color: c, width: w });
      inf.ellipse(VIEW_W / 2 + 6, 17, 6, 4.5).stroke({ color: c, width: w });
    }
    const label = outlinedText('PRÁCTICA', 8, 0x8ae8ff);
    label.anchor.set(0.5, 0);
    label.position.set(VIEW_W / 2, 25);
    // Letra chica: al centro, bajo el reloj, van el "EN VIVO" y las vistas.
    const combo = outlinedText('', 6, 0xffd040, 0x0a0610, 2);
    combo.position.set(14, 40);
    const best = outlinedText('', 6, 0x8ae8ff, 0x0a0610, 2);
    best.position.set(14, 49);
    const panel = new Graphics();
    const rows = [0, 1].map((r) => {
      const c = new Container();
      c.y = 215 + r * 11;
      // Etiqueta, valor, etiqueta, valor (los valores en amarillo).
      const parts = [0, 1, 2, 3].map((i) => outlinedText('', 8, i % 2 ? 0xffd040 : 0xd8cce0));
      c.addChild(...parts);
      return { c, parts };
    });
    const idx = this.container.getChildIndex(this.cutin);
    this.container.addChildAt(panel, idx);
    for (const r of rows) this.container.addChildAt(r.c, idx + 1);
    this.container.addChildAt(inf, idx);
    this.container.addChildAt(label, idx);
    this.container.addChildAt(combo, idx);
    this.container.addChildAt(best, idx);
    return { infinity: inf, label, combo, best, panel, rows, key: '' };
  }

  /** Muestra la barra de opciones de la práctica un rato (al cambiar una opción). */
  showPracticePanel(frames = PRACTICE_PANEL_CHANGE): void {
    this.practicePanelT = Math.max(this.practicePanelT, frames);
  }

  /**
   * 2 VS 2: sin marcadores de rounds; bajo cada nombre, la mini barra y el
   * nombre del compañero, y AYUDA / CAMBIO (amarillo = listo; la rayita de
   * abajo muestra cuánto falta). defs: todos los luchadores de la pelea.
   */
  setTeamMode(defs: FighterDef[]): void {
    for (const d of defs) this.byId.set(d.id, d);
    const row = (side: 0 | 1): TeamRow => {
      const name = outlinedText('', 6, 0xd8cce0, 0x0a0610, 1);
      const assist = outlinedText('AYUDA', 6, 0xffd040, 0x0a0610, 1);
      const tag = outlinedText('CAMBIO', 6, 0xffd040, 0x0a0610, 1);
      if (side === 0) {
        name.position.set(74, 37);
        assist.position.set(14, 46);
        tag.position.set(50, 46);
      } else {
        for (const t of [name, assist, tag]) t.anchor.set(1, 0);
        name.position.set(VIEW_W - 74, 37);
        assist.position.set(VIEW_W - 14, 46);
        tag.position.set(VIEW_W - 50, 46);
      }
      this.container.addChildAt(name, this.container.getChildIndex(this.cutin));
      this.container.addChildAt(assist, this.container.getChildIndex(this.cutin));
      this.container.addChildAt(tag, this.container.getChildIndex(this.cutin));
      return { name, assist, tag, key: '' };
    };
    this.teamRows = [row(0), row(1)];
  }

  /** Capa extra (la transmisión en vivo) debajo del cartel del súper y los anuncios. */
  addLayer(c: Container): void {
    this.container.addChildAt(c, this.container.getChildIndex(this.cutin));
  }

  /** Destello blanco de toda la pantalla (K.O., golpes del ultra, COMBO BREAKER). */
  flash(frames: number, max: number): void {
    if (this.flashT > 0 && this.flashMax * (this.flashT / this.flashDur) > max) return;
    this.flashT = frames;
    this.flashDur = frames;
    this.flashMax = max;
  }

  showToast(text: string): void {
    this.toast.text = arcade(text);
    this.toastT = 60;
  }

  /** Avanza temporizadores (por cuadro de simulación). */
  step(m: Match): void {
    this.frame++;
    if (this.practicePanelT > 0) this.practicePanelT--;
    for (const i of SIDES) {
      const f = m.fighters[i];
      // En 2 VS 2 la estela baja hasta la vida roja (la parte que se puede recuperar).
      const ratio = (f.health + f.red) / f.def.health;
      if (f !== this.shown[i]) {
        // Cambió el punto: nombre nuevo y la estela parte de su vida (sin animar la del anterior).
        if (this.shown[i]) {
          this.trail[i] = ratio;
          this.lastHealth[i] = ratio;
          this.trailDelay[i] = 0;
          this.names[i].text = arcade(f.def.name.toUpperCase());
        }
        this.shown[i] = f;
      }
      if (ratio < this.lastHealth[i]) this.trailDelay[i] = 32;
      this.lastHealth[i] = ratio;
      if (this.trailDelay[i] > 0) this.trailDelay[i]--;
      else if (this.trail[i] > ratio) this.trail[i] = Math.max(ratio, this.trail[i] - 0.008);
      if (this.trail[i] < ratio) this.trail[i] = ratio;
      const b = this.bubbles[i];
      if (b.time > 0 && --b.time === 0) b.c.visible = false;
    }
    if (this.announceT < this.announceDur) this.announceT++;
    if (this.cutinT < this.cutinDur) this.cutinT++;
    if (this.toastT > 0) this.toastT--;
    if (this.flashT > 0) this.flashT--;
  }

  update(m: Match, camLeft: number, camOffY: number): void {
    const g = this.bars;
    g.clear();
    for (const i of SIDES) {
      const f = m.fighters[i];
      const ratio = f.health / f.def.health;
      const x0 = i === 0 ? 14 : VIEW_W - 214;
      const W = 200;
      // Marco
      g.rect(x0 - 2, 10, W + 4, 14).fill(0x0a0610);
      g.rect(x0 - 1, 11, W + 2, 12).fill(0xc89a3a);
      g.rect(x0, 12, W, 10).fill(0x2a0810);
      // Estela roja y vida (se vacían hacia el borde de la pantalla). En 2 VS 2, entre las
      // dos va la vida roja: lo que vuelve si el luchador descansa afuera.
      const tw = Math.round(W * this.trail[i]);
      const hw = Math.round(W * ratio);
      const rw = Math.round(W * Math.min(1, (f.health + f.red) / f.def.health));
      // EN PELIGRO (se le puede hacer el ultra): la barra parpadea en rojo.
      const low = ratio > 0 && ratio <= DANGER && Math.floor(this.frame / 7) % 2 === 0;
      const main = low ? 0xff2a2a : 0xffd23a;
      if (i === 0) {
        g.rect(x0, 12, tw, 10).fill(0xe0302a);
        if (rw > hw) {
          g.rect(x0, 12, rw, 10).fill(RED_LIFE);
          g.rect(x0, 12, rw, 2).fill(RED_LIFE_TOP);
        }
        g.rect(x0, 12, hw, 10).fill(main);
        g.rect(x0, 12, hw, 2).fill(0xfff6b0);
        g.rect(x0, 20, hw, 2).fill(0xc08a18);
      } else {
        g.rect(x0 + W - tw, 12, tw, 10).fill(0xe0302a);
        if (rw > hw) {
          g.rect(x0 + W - rw, 12, rw, 10).fill(RED_LIFE);
          g.rect(x0 + W - rw, 12, rw, 2).fill(RED_LIFE_TOP);
        }
        g.rect(x0 + W - hw, 12, hw, 10).fill(main);
        g.rect(x0 + W - hw, 12, hw, 2).fill(0xfff6b0);
        g.rect(x0 + W - hw, 20, hw, 2).fill(0xc08a18);
      }
      // Rounds ganados (en práctica y en 2 VS 2 no hay rounds).
      if (this.teamRows) this.drawTeamRow(g, m, i);
      for (let k = 0; k < (this.practiceHud || this.teamRows ? 0 : 2); k++) {
        const rx = i === 0 ? 206 - k * 9 : VIEW_W - 212 + k * 9;
        g.rect(rx, 27, 7, 7).fill(0x0a0610);
        g.rect(rx + 1, 28, 5, 5).fill(f.wins > k ? 0xffd040 : 0x3a2a30);
      }
      // Barra de súper (3 niveles).
      const mx0 = i === 0 ? 14 : VIEW_W - 14 - 124;
      g.rect(mx0 - 1, 254, 126, 8).fill(0x0a0610);
      for (let s = 0; s < 3; s++) {
        const sx = i === 0 ? mx0 + s * 42 : mx0 + (2 - s) * 42;
        const fill = Math.max(0, Math.min(1, (f.meter - s * METER_BAR) / METER_BAR));
        g.rect(sx, 255, 40, 6).fill(0x101a30);
        if (fill > 0) {
          const w = Math.round(40 * fill);
          const full = fill >= 1;
          const pulse = full && Math.floor(this.frame / 6) % 2 === 0;
          const col = full ? (pulse ? 0x9af0ff : 0x40c8ff) : 0x2a6ab0;
          if (i === 0) g.rect(sx, 255, w, 6).fill(col);
          else g.rect(sx + 40 - w, 255, w, 6).fill(col);
        }
      }
      this.stocks[i].text = String(Math.floor(Math.min(MAX_METER, f.meter) / METER_BAR));

      // Modo Poder: la etiqueta cambia y una barra muestra el tiempo que queda.
      const power = f.powerTimer > 0;
      if (power !== this.powerShown[i]) {
        this.powerShown[i] = power;
        this.superLabels[i].text = power ? 'MODO PODER' : 'SUPER';
      }
      if (power) {
        const pulse = Math.floor(this.frame / 5) % 2 === 0;
        this.superLabels[i].style.fill = pulse ? 0xffffff : f.def.ui.fx;
        const ratio = f.powerTimer / f.powerMax;
        const w = Math.max(1, Math.round(124 * ratio));
        g.rect(mx0 - 1, 239, 126, 5).fill(0x0a0610);
        const col = f.powerTimer < 90 && pulse ? 0xffffff : f.def.ui.fx;
        if (i === 0) g.rect(mx0, 240, w, 3).fill(col);
        else g.rect(mx0 + 124 - w, 240, w, 3).fill(col);
      } else {
        this.superLabels[i].style.fill = 0xffe08a;
      }

      // ULTRA listo (barra y rival en peligro) y BLOQUEO tras un breaker fallido.
      const ut = this.ultraTags[i];
      ut.visible = m.ultraReady(f);
      if (ut.visible) {
        const pulse = Math.floor(this.frame / 6) % 2 === 0;
        ut.style.fill = pulse ? 0xffffff : 0xffd040;
        ut.scale.set(1 + (pulse ? 0.06 : 0));
      }
      const lt = this.lockTags[i];
      lt.visible = f.lockout > 0 && Math.floor(this.frame / 10) % 4 !== 3;

      // Globo de la pelá sobre la cabeza.
      const b = this.bubbles[i];
      if (b.c.visible) {
        const sx = f.x - camLeft;
        const sy = GROUND_SCREEN_Y + f.y + camOffY - 182;
        b.c.position.set(Math.round(Math.max(80, Math.min(VIEW_W - 80, sx))), Math.round(Math.max(52, sy)));
      }
    }
    this.timer.text = String(Math.max(0, m.timer)).padStart(2, '0');
    this.timer.style.fill = m.timer <= 10 && Math.floor(this.frame / 15) % 2 === 0 ? 0xff5040 : 0xffffff;

    // Anuncio central con efecto de "golpe" al aparecer.
    const a = this.announce;
    a.visible = this.announceT < this.announceDur && a.text !== '';
    if (a.visible) {
      const t = this.announceT;
      const pop = t < 8 ? 1 + (8 - t) * 0.12 : 1;
      a.scale.set(pop);
      a.alpha = t > this.announceDur - 10 ? (this.announceDur - t) / 10 : 1;
    }
    // Cartel: entra deslizándose desde el lado de quien lanza el súper y sale por el otro.
    this.cutin.visible = this.cutinT < this.cutinDur;
    if (this.cutin.visible) {
      const t = this.cutinT;
      const inT = 8;
      const outStart = this.cutinDur - 8;
      let x = 0;
      if (t < inT) x = this.cutinDir * VIEW_W * (1 - t / inT);
      else if (t > outStart) x = -this.cutinDir * VIEW_W * ((t - outStart) / 8);
      this.cutin.x = Math.round(x);
      const lines = this.cutinLines;
      lines.clear();
      for (let i = 0; i < 9; i++) {
        const ly = CUT_Y + 6 + ((i * 37 + t * 3) % (CUT_H - 12));
        const lx = ((i * 97 - t * 22 * this.cutinDir) % (VIEW_W + 120) + VIEW_W + 120) % (VIEW_W + 120) - 60;
        lines.rect(Math.round(lx), Math.round(ly), 40 + (i % 3) * 18, 1).fill({ color: this.cutinColor, alpha: 0.5 });
      }
    }
    this.toast.visible = this.toastT > 0;
    this.flashRect.alpha = this.flashT > 0 ? (this.flashT / this.flashDur) * this.flashMax : 0;
    // Barra de opciones de la práctica: se desvanece cuando nadie la toca.
    const p = this.practiceHud;
    if (p) {
      const a = Math.min(1, this.practicePanelT / 20);
      p.panel.alpha = a;
      for (const r of p.rows) {
        r.c.alpha = a;
        r.c.visible = a > 0;
      }
      p.panel.visible = a > 0;
    }
  }

  /** 2 VS 2: mini barra y nombre del compañero, y si la AYUDA y el CAMBIO están listos. */
  private drawTeamRow(g: Graphics, m: Match, i: 0 | 1): void {
    const row = this.teamRows![i];
    const t = m.teams?.[i];
    const st = m.teamStatus(i);
    if (!t || !st) return;
    const k = t.members.findIndex((_, j) => j !== t.point);
    const mate = k >= 0 ? t.members[k] : null;
    const out = k >= 0 && t.out[k];
    const bw = 56;
    const bx = i === 0 ? 14 : VIEW_W - 14 - bw;
    g.rect(bx - 1, 37, bw + 2, 6).fill(0x0a0610);
    g.rect(bx, 38, bw, 4).fill(0x2a0810);
    if (mate && !out) {
      const hw = Math.round(bw * Math.max(0, mate.health / mate.def.health));
      const rw = Math.round(bw * Math.min(1, (mate.health + mate.red) / mate.def.health));
      const x = (w: number) => (i === 0 ? bx : bx + bw - w);
      g.rect(x(rw), 38, rw, 4).fill(RED_LIFE);
      g.rect(x(hw), 38, hw, 4).fill(0xffd23a);
    }
    const ready = (v: number) => v >= 1;
    const key = `${mate?.def.id ?? ''}|${out}|${ready(st.assist)}|${ready(st.tag)}`;
    if (key !== row.key) {
      row.key = key;
      row.name.text = mate ? arcade(mate.def.name.toUpperCase() + (out ? ' K.O.' : '')) : '';
      row.name.style.fill = out ? 0x6a6078 : 0xd8cce0;
      row.assist.style.fill = ready(st.assist) ? 0xffd040 : 0x6a6078;
      row.tag.style.fill = ready(st.tag) ? 0xffd040 : 0x6a6078;
    }
    row.assist.visible = row.tag.visible = !!st.partner;
    if (!st.partner) return;
    // Rayita bajo cada botón: cuánto falta para que esté listo.
    const chip = (txt: Text, v: number) => {
      const w = txt.width;
      const x = i === 0 ? txt.x : txt.x - w;
      g.rect(x, 53, w, 1.5).fill({ color: 0x0a0610, alpha: 0.7 });
      g.rect(x, 53, Math.round(w * Math.max(0, Math.min(1, v))), 1.5).fill(ready(v) ? 0xffd040 : 0x2be4f0);
    };
    chip(row.assist, st.assist);
    chip(row.tag, st.tag);
  }
}
