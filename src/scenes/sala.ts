// Pantallas de las salas en línea: PARTIDA RÁPIDA (busca rival en el lobby y arma la sala sola),
// SALAS ABIERTAS (la lista del lobby), CREAR SALA (abierta o privada: muestra el código), UNIRSE
// CON CÓDIGO (lo pide) y PREPARANDO LA PELEA (los dos bajan lo que falte y parten juntos). Entre
// medio, ELIGE LUCHADOR en modo 'online' (characterSelect.ts) y la pelea con rollback (fight.ts).
//
// Cómo parten juntos: quien creó la sala elige el escenario al azar y se lo manda al otro con los
// dos luchadores; cada uno baja lo suyo y avisa "listo"; con los dos listos, el que creó la sala
// manda la semilla y la espera de las frases de entrada, y los dos empiezan. El rollback absorbe
// la diferencia de tiempo (el que parte antes espera los primeros controles del otro).

import { Container, Graphics, Sprite } from 'pixi.js';
import type { Game, Scene } from '../app/game';
import { VIEW_H, VIEW_W } from '../config';
import { Progreso } from '../content/descargas';
import { tactil } from '../input/touch';
import { apodo, avatar } from '../online/cuenta';
import { abrirFormulario, type Formulario } from '../online/formulario';
import { reportarPelea, type Resultado } from '../online/liga';
import { lobby, pareja, type EnLobby } from '../online/lobby';
import { Sala, codigoDe, codigoValido, limpiarCodigo, versionJuego, type Jugador } from '../online/sala';
import { BarraCarga } from '../render/barraCarga';
import { arcade, outlinedText } from '../render/text';
import { backdrop } from './backdrop';
import { CharacterSelectScene } from './characterSelect';
import { menuEnLinea } from './cuenta';
import { FightScene, esperaDeEntrada } from './fight';
import { FormScene } from './formScene';

/** Apodo para las pruebas sin cuenta (?apodo=… con ?qa). */
let apodoDePrueba: string | null = null;
export function usarApodoDePrueba(a: string): void {
  apodoDePrueba = a.slice(0, 14);
}

function yo(): Jugador {
  return { apodo: apodoDePrueba ?? apodo() ?? 'JUGADOR', avatar: avatar() };
}

/** Entra al lobby de EN LÍNEA con el apodo y el avatar (para contar, salas abiertas y PARTIDA RÁPIDA). */
export function entrarAlLobby(game: Game): void {
  lobby.entrar({ ...yo(), version: versionJuego(game.assets.roster) });
}

/** "● N EN LÍNEA" arriba a la derecha: cuántos están en EN LÍNEA ahora. */
export class ContadorEnLinea {
  readonly container = new Container();
  private texto = outlinedText('', 7, 0xc8ffd8, 0x0a1a10, 2);
  private punto = new Graphics();

  constructor() {
    this.texto.anchor.set(1, 0.5);
    this.texto.position.set(VIEW_W - 8, 10);
    this.container.addChild(this.punto, this.texto);
  }

  actualizar(t: number): void {
    const n = lobby.cuantos;
    this.texto.text = lobby.listo ? `${n} ${n === 1 ? 'JUGADOR' : 'JUGADORES'} EN LÍNEA` : 'CONECTANDO…';
    const x = VIEW_W - 8 - this.texto.width - 6;
    const brillo = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.05));
    this.punto.clear().circle(x, 10, 2.5).fill({ color: lobby.listo ? 0x4dff88 : 0xffd040, alpha: brillo });
  }
}

/** Al cerrarse la sala: de vuelta a EN LÍNEA con el porqué. */
function alMenu(game: Game, error: string | null): Scene {
  return menuEnLinea(game, error);
}

/** ELIGE LUCHADOR en línea (también después de cada pelea, para la revancha). */
export function eligeEnLinea(game: Game, sala: Sala, resultado?: 'gane' | 'perdi' | 'empate'): Scene {
  // En el lobby: ya no busca ni tiene sala abierta.
  lobby.poner('jugando');
  return new CharacterSelectScene(game, 'online', { sala, resultado, salir: (e) => alMenu(game, e), preparar: (mio, suyo) => new PreparandoScene(game, sala, mio, suyo) });
}

/** Texto de estado de una sala mientras se conecta. */
function estadoTexto(sala: Sala): string {
  switch (sala.estado) {
    case 'conectando':
      return sala.rol === 'anfitrion' ? 'ABRIENDO LA SALA…' : 'BUSCANDO LA SALA…';
    case 'esperando':
      // En el celular, si se sale del navegador para mandar el código, la sala puede quedar congelada.
      return 'ESPERANDO A TU RIVAL… · NO SALGAS DE ESTA PANTALLA';
    case 'negociando':
      return sala.rival ? `CONECTANDO CON ${sala.rival.apodo.toUpperCase()}…` : 'CONECTANDO…';
    case 'lista':
      return '¡CONECTADOS!';
    default:
      return sala.error ?? 'SE CERRÓ LA SALA';
  }
}

/** Pantalla con el fondo de los menús y textos al centro. */
abstract class PantallaSala implements Scene {
  readonly music = 'titulo';
  protected ui = new Container();
  protected t = 0;

  constructor(protected game: Game) {}

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

  protected texto(s: string, size: number, y: number, fill = 0xfff4e0) {
    const t = outlinedText(s, size, fill, 0x5a0a10, size >= 14 ? 3 : 2, { align: 'center' });
    t.anchor.set(0.5);
    t.position.set(VIEW_W / 2, y);
    this.ui.addChild(t);
    return t;
  }

  protected ir(s: Scene, sonido: 'menuConfirm' | 'menuBack' = 'menuConfirm'): void {
    this.game.sfx.play(sonido);
    this.game.setScene(s);
  }
}

/**
 * CREAR SALA: muestra el código (tocarlo lo copia) y espera al rival. Abierta: además sale en
 * SALAS ABIERTAS para que entre cualquiera; privada: solo con el código.
 */
export class CrearSalaScene extends PantallaSala {
  private sala: Sala;
  private codigo;
  private estado;
  private copiado = 0;

  constructor(
    game: Game,
    codigoDePrueba?: string,
    private abierta = false,
  ) {
    super(game);
    entrarAlLobby(game);
    this.sala = Sala.crear(yo(), versionJuego(game.assets.roster), codigoDePrueba);
    const caja = new Graphics().roundRect(VIEW_W / 2 - 110, 54, 220, 120, 10).fill({ color: 0x14061f, alpha: 0.88 }).stroke({ color: 0xffd76a, width: 1.5 });
    this.ui.addChild(caja);
    this.texto(abierta ? 'SALA ABIERTA' : 'SALA PRIVADA', 14, 30);
    this.texto('TU CÓDIGO', 8, 72, 0xffd76a);
    this.codigo = this.texto('····', 34, 104, 0xffffff);
    this.texto(
      arcade(
        abierta
          ? 'SALE EN EN LÍNEA > SALAS ABIERTAS: CUALQUIERA PUEDE ENTRAR (TAMBIÉN CON EL CÓDIGO)'
          : 'DÍSELO A TU RIVAL: QUE ENTRE A EN LÍNEA > UNIRSE CON CÓDIGO',
      ),
      6,
      140,
      0xd8cfe8,
    );
    this.texto(arcade(tactil() ? 'TOCA EL CÓDIGO PARA COPIARLO' : 'HAZ CLIC EN EL CÓDIGO PARA COPIARLO'), 6, 156, 0xb8b0c8);
    this.estado = this.texto('', 9, 200, 0xffe6a0);
    this.texto(arcade(tactil() ? '☰ VUELVE' : 'ESC VUELVE'), 7, VIEW_H - 16, 0xb8b0c8);
  }

  step(): void {
    this.t++;
    const s = this.sala;
    const m = this.game.menu;
    this.codigo.text = s.estado === 'conectando' ? '····' : s.codigo;
    this.estado.text = this.copiado > 0 ? '¡CÓDIGO COPIADO!' : estadoTexto(s);
    // En el lobby: la abierta se anuncia con su código (sale en SALAS ABIERTAS); la privada, sin él.
    if (s.estado === 'esperando') lobby.poner('sala', this.abierta ? s.codigo : undefined);
    if (this.copiado > 0) this.copiado--;
    if (s.estado === 'lista') return this.ir(eligeEnLinea(this.game, s));
    if (s.estado === 'cerrada') return this.ir(alMenu(this.game, s.error), 'menuBack');
    if (m.back) {
      s.cerrar();
      return this.ir(alMenu(this.game, null), 'menuBack');
    }
    if ((m.tap && m.tapIn(VIEW_W / 2 - 110, 54, 220, 120)) || m.confirm) {
      if (s.estado !== 'conectando') {
        void navigator.clipboard?.writeText(s.codigo).then(() => (this.copiado = 120), () => undefined);
        this.game.sfx.play('menuMove');
      }
    }
  }
}

/** Segundos que quien crea la sala de una PARTIDA RÁPIDA espera a su pareja antes de volver a buscar. */
const ESPERA_PAREJA = 12;
/** La pareja de PARTIDA RÁPIDA tiene que verse igual este tiempo (ms) antes de armar la sala. */
const PAREJA_ESTABLE = 700;

/**
 * PARTIDA RÁPIDA: se anuncia en el lobby como "buscando" y, apenas hay otro buscando, se juntan
 * (`pareja`): el primero de la fila crea la sala y el otro entra con el mismo código. Si no
 * resulta (el otro se fue, la red no los deja), los dos vuelven al final de la fila y siguen.
 */
export class PartidaRapidaScene extends PantallaSala {
  private sala: Sala | null = null;
  private intento: { rival: EnLobby; anfitrion: boolean; t0: number } | null = null;
  /** La pareja que se vio la última vez y desde cuándo (para no armar salas con una lista que todavía cambia). */
  private visto: { id: string; anfitrion: boolean; desde: number } | null = null;
  private readonly inicio = performance.now();
  private estado;
  private rival;
  private tiempo;
  private cuenta;
  private contador = new ContadorEnLinea();

  constructor(game: Game) {
    super(game);
    entrarAlLobby(game);
    lobby.alFinalDeLaFila();
    this.texto('PARTIDA RÁPIDA', 14, 30);
    const caja = new Graphics().roundRect(VIEW_W / 2 - 130, 66, 260, 96, 10).fill({ color: 0x14061f, alpha: 0.88 }).stroke({ color: 0xffd76a, width: 1.5 });
    this.ui.addChild(caja, this.contador.container);
    this.estado = this.texto('BUSCANDO RIVAL', 12, 96, 0xffffff);
    this.rival = this.texto('', 9, 120, 0xffd76a);
    this.tiempo = this.texto('', 7, 142, 0xb8b0c8);
    this.cuenta = this.texto('', 7, 182, 0xd8cfe8);
    this.texto(arcade('CUANDO APAREZCA ALGUIEN, LA PELEA SE ARMA SOLA'), 6, 200, 0xb8b0c8);
    this.texto(arcade(tactil() ? '☰ CANCELA' : 'ESC CANCELA'), 7, VIEW_H - 16, 0xb8b0c8);
  }

  step(): void {
    this.t++;
    const g = this.game;
    this.contador.actualizar(this.t);
    if (g.menu.back) {
      this.sala?.cerrar();
      return this.ir(alMenu(g, null), 'menuBack');
    }
    const s = this.sala;
    const ahora = performance.now();
    if (s) {
      if (s.estado === 'lista') return this.ir(eligeEnLinea(g, s));
      const sinPareja = this.intento?.anfitrion && s.estado === 'esperando' && ahora - this.intento.t0 > ESPERA_PAREJA * 1000;
      if (s.estado === 'cerrada' || sinPareja) {
        // No resultó: los dos vuelven al final de la fila (así la siguiente vez se arman otras parejas).
        if (sinPareja) s.cerrar();
        this.sala = null;
        this.intento = null;
        this.visto = null;
        lobby.alFinalDeLaFila();
      }
    } else if (this.t % 12 === 0 && lobby.listo) {
      const p = pareja(codigoDe);
      if (!p) this.visto = null;
      else if (!this.visto || this.visto.id !== p.rival.id || this.visto.anfitrion !== p.anfitrion) {
        this.visto = { id: p.rival.id, anfitrion: p.anfitrion, desde: ahora };
      } else if (ahora - this.visto.desde >= PAREJA_ESTABLE) {
        const version = versionJuego(g.assets.roster);
        this.intento = { rival: p.rival, anfitrion: p.anfitrion, t0: ahora };
        this.sala = p.anfitrion ? Sala.crear(yo(), version, p.codigo) : Sala.unirse(p.codigo, yo(), version);
        g.sfx.play('menuConfirm');
      }
    }
    // Textos.
    const puntos = '.'.repeat(1 + (Math.floor(this.t / 20) % 3));
    const seg = Math.floor((ahora - this.inicio) / 1000);
    const it = this.intento;
    this.estado.text = it ? '¡RIVAL ENCONTRADO!' : `BUSCANDO RIVAL${puntos}`;
    this.rival.text = it ? arcade(`CONTRA ${it.rival.apodo.toUpperCase()} · ${this.sala ? estadoTexto(this.sala).split(' · ')[0] : ''}`) : '';
    this.tiempo.text = `BUSCANDO HACE ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
    const otros = Math.max(0, lobby.buscando - 1);
    this.cuenta.text = arcade(
      !lobby.listo ? 'CONECTANDO…' : otros === 0 ? 'NADIE MÁS ESTÁ BUSCANDO AHORA' : `${otros} ${otros === 1 ? 'JUGADOR MÁS BUSCA' : 'JUGADORES MÁS BUSCAN'} PARTIDA`,
    );
  }
}

/** Filas de SALAS ABIERTAS. */
const FILA_Y0 = 62;
const FILA_H = 26;
const FILA_W = 300;
const MAX_FILAS = 6;

/** SALAS ABIERTAS: las salas del lobby que esperan rival (entrar es un toque) y CREAR SALA ABIERTA. */
export class SalasAbiertasScene extends PantallaSala {
  private sel = 0;
  private filas: Array<{ tipo: 'crear' } | { tipo: 'sala'; sala: EnLobby }> = [{ tipo: 'crear' }];
  /** Qué salas se están mostrando (para rehacer la lista solo cuando cambia). */
  private firma = '-';
  private lista = new Container();
  private barras = new Graphics();
  private vacio;
  private contador = new ContadorEnLinea();

  constructor(game: Game) {
    super(game);
    entrarAlLobby(game);
    lobby.poner('menu');
    this.texto('SALAS ABIERTAS', 14, 30);
    this.texto(arcade('ENTRA A UNA SALA, O CREA LA TUYA Y ESPERA A QUE ALGUIEN ENTRE'), 6, 47, 0xd8cfe8);
    this.ui.addChild(this.barras, this.lista, this.contador.container);
    this.vacio = this.texto('', 7, FILA_Y0 + FILA_H + 14, 0xb8b0c8);
    this.texto(arcade(tactil() ? 'TOCA UNA SALA PARA ENTRAR · ☰ VUELVE' : '↑ ↓ ELIGE · ENTER ENTRA · ESC VUELVE'), 7, VIEW_H - 16, 0xb8b0c8);
    this.armar();
  }

  /** Rehace la lista si cambiaron las salas (mantiene marcada la misma sala si sigue). */
  private armar(): void {
    const salas = lobby.salasAbiertas().slice(0, MAX_FILAS - 1);
    const firma = `${lobby.listo}|` + salas.map((x) => `${x.id}:${x.sala}`).join('|');
    if (firma === this.firma) return;
    this.firma = firma;
    const antes = this.filas[this.sel];
    const idAntes = antes?.tipo === 'sala' ? antes.sala.id : null;
    this.filas = [{ tipo: 'crear' }, ...salas.map((sala) => ({ tipo: 'sala' as const, sala }))];
    const k = idAntes ? this.filas.findIndex((f) => f.tipo === 'sala' && f.sala.id === idAntes) : -1;
    this.sel = k >= 0 ? k : Math.min(this.sel, this.filas.length - 1);
    for (const c of this.lista.removeChildren()) c.destroy();
    const x0 = VIEW_W / 2 - FILA_W / 2 + 12;
    this.filas.forEach((f, i) => {
      const y = FILA_Y0 + i * FILA_H + FILA_H / 2;
      if (f.tipo === 'crear') {
        const t = outlinedText('+ CREAR SALA ABIERTA', 9, 0xffe6a0, 0x1a0a24, 2);
        t.anchor.set(0.5);
        t.position.set(VIEW_W / 2, y);
        this.lista.addChild(t);
        return;
      }
      const cara = this.game.assets.roster.find((r) => r.def.id === f.sala.avatar)?.face;
      if (cara) {
        const sp = new Sprite(cara);
        sp.anchor.set(0.5);
        sp.width = 16;
        sp.height = 16;
        sp.position.set(x0 + 8, y);
        this.lista.addChild(sp);
      }
      const nombre = outlinedText(arcade(f.sala.apodo.toUpperCase()), 9, 0xffffff, 0x1a0a24, 2);
      nombre.anchor.set(0, 0.5);
      nombre.position.set(x0 + 22, y);
      const espera = outlinedText('ESPERA RIVAL · ENTRAR', 6, 0x8affb0, 0x0a1a10, 1);
      espera.anchor.set(1, 0.5);
      espera.position.set(VIEW_W / 2 + FILA_W / 2 - 12, y);
      this.lista.addChild(nombre, espera);
    });
    this.vacio.text = salas.length ? '' : arcade(lobby.listo ? 'NO HAY SALAS ABIERTAS AHORA · ¡CREA UNA!' : 'BUSCANDO SALAS…');
  }

  step(): void {
    this.t++;
    const g = this.game;
    const m = g.menu;
    if (this.t % 10 === 0) this.armar();
    this.contador.actualizar(this.t);
    if (m.back) return this.ir(alMenu(g, null), 'menuBack');
    const n = this.filas.length;
    if (m.up || m.down) {
      this.sel = (this.sel + (m.up ? n - 1 : 1)) % n;
      g.sfx.play('menuMove');
    }
    let elegir = m.confirm;
    if (m.tap) {
      const i = this.filas.findIndex((_, k) => m.tapIn(VIEW_W / 2 - FILA_W / 2, FILA_Y0 + k * FILA_H, FILA_W, FILA_H));
      if (i >= 0) {
        this.sel = i;
        elegir = true;
      }
    }
    const b = this.barras.clear();
    this.filas.forEach((_, i) => {
      const on = i === this.sel;
      b.roundRect(VIEW_W / 2 - FILA_W / 2, FILA_Y0 + i * FILA_H + 2, FILA_W, FILA_H - 4, 4)
        .fill({ color: on ? 0xb02a90 : 0x1a0c2e, alpha: on ? 0.92 : 0.8 })
        .stroke({ color: on ? 0xffd76a : 0xb98cff, width: on ? 1.2 : 0.6, alpha: on ? 1 : 0.4 });
    });
    if (!elegir) return;
    const f = this.filas[this.sel];
    if (f.tipo === 'crear') return this.ir(new CrearSalaScene(g, undefined, true));
    this.ir(new UnirseScene(g, f.sala.sala!));
  }
}

/** UNIRSE CON CÓDIGO: un formulario con el código; después, conectando. */
export class UnirseScene extends FormScene {
  private sala: Sala | null = null;

  constructor(
    game: Game,
    private codigoInicial = '',
  ) {
    super(game);
  }

  override enter(): void {
    super.enter();
    if (this.codigoInicial) void this.apretar('entrar');
  }

  protected abrir(): Formulario {
    return abrirFormulario({
      titulo: 'UNIRSE CON CÓDIGO',
      nota: 'ESCRIBE LAS 4 LETRAS QUE LE SALEN A TU RIVAL EN CREAR SALA.',
      campos: [{ id: 'codigo', etiqueta: 'CÓDIGO DE LA SALA', valor: this.codigoInicial, max: 4, codigo: true }],
      botones: [
        { id: 'entrar', texto: 'ENTRAR', tipo: 'principal' },
        { id: 'volver', texto: 'VOLVER', tipo: 'volver' },
      ],
      alApretar: (id) => void this.apretar(id),
    });
  }

  private async apretar(id: string): Promise<void> {
    const f = this.form;
    if (!f || this.ocupado) return;
    if (id === 'volver') return this.volver();
    const codigo = limpiarCodigo(f.valor('codigo'));
    if (!codigoValido(codigo)) return this.fallo('EL CÓDIGO SON 4 LETRAS (SIN LA I NI LA O)', 'codigo');
    this.game.sfx.play('menuConfirm');
    this.esperar(true);
    this.sala = Sala.unirse(codigo, yo(), versionJuego(this.game.assets.roster));
  }

  override step(): void {
    const s = this.sala;
    if (s) {
      if (s.estado === 'lista') return this.ir(eligeEnLinea(this.game, s));
      if (s.estado === 'cerrada') {
        this.sala = null;
        this.esperar(false);
        return this.fallo(s.error ?? 'NO SE PUDO ENTRAR A LA SALA', 'codigo');
      }
      this.form?.mensaje(estadoTexto(s));
      if (this.game.menu.back) {
        s.cerrar();
        this.sala = null;
        this.esperar(false);
        this.form?.mensaje('');
      }
      return;
    }
    super.step();
  }

  protected volver(): void {
    this.sala?.cerrar();
    this.ir(alMenu(this.game, null), 'menuBack');
  }
}

/**
 * PREPARANDO LA PELEA: los dos bajan lo que falte (escenario, luchadores, voces) y parten juntos.
 * `mio` y `suyo`: luchadores (índices del plantel) de este jugador y del rival.
 */
class PreparandoScene extends PantallaSala {
  private bar = new BarraCarga(240, 8, 'CARGANDO PELEA');
  private prog: Progreso | null = null;
  private estado;
  private ronda: number;
  /** Luchadores de la pelea [izquierda, derecha] y escenario (los decide quien creó la sala). */
  private luchadores: [number, number] | null = null;
  private escenario: string | null = null;
  private cargado = false;
  private rivalListo = false;
  private fallo = false;

  constructor(
    game: Game,
    private sala: Sala,
    mio: number,
    suyo: number,
  ) {
    super(game);
    this.ronda = sala.ronda;
    this.texto('PREPARANDO LA PELEA', 14, 40);
    this.bar.container.position.set(VIEW_W / 2, VIEW_H / 2);
    this.ui.addChild(this.bar.container);
    this.estado = this.texto('', 8, VIEW_H / 2 + 26, 0xffe6a0);
    if (sala.rol === 'anfitrion') {
      // El escenario, al azar entre los de la lista (no los que son solo para un ultra).
      const lista = game.assets.stages.entries;
      const id = lista[Math.floor(Math.random() * lista.length)].id;
      this.luchadores = [mio, suyo];
      this.escenario = id;
      sala.enviar({ t: 'escenario', ronda: this.ronda, id, luchadores: this.luchadores });
      this.cargar();
    }
  }

  private cargar(): void {
    const g = this.game;
    this.fallo = false;
    this.prog = new Progreso();
    g.assets.content.prepare({ fighters: this.luchadores!, stage: this.escenario }, this.prog).then(
      (stage) => {
        if (this.game.scene !== this || !stage) return;
        g.assets.stage = stage;
        g.assets.stageId = this.escenario!;
        this.cargado = true;
        this.sala.enviar({ t: 'listo', ronda: this.ronda });
      },
      (err: unknown) => {
        console.warn('en línea: no se pudo cargar la pelea', err);
        this.fallo = true;
      },
    );
  }

  step(): void {
    this.t++;
    const s = this.sala;
    if (s.estado === 'cerrada') return this.ir(alMenu(this.game, s.error), 'menuBack');
    if (this.game.menu.back) {
      s.cerrar();
      return this.ir(alMenu(this.game, null), 'menuBack');
    }
    if (this.fallo) {
      this.estado.text = arcade(tactil() ? 'NO SE PUDO CARGAR · TOCA PARA REINTENTAR' : 'NO SE PUDO CARGAR · ENTER PARA REINTENTAR');
      if (this.game.menu.confirm || this.game.menu.tap) this.cargar();
      return;
    }
    // El que se unió espera el escenario y los luchadores que decidió el otro.
    if (!this.luchadores) {
      const m = s.tomar('escenario', this.ronda);
      if (!m) {
        this.estado.text = `ESPERANDO A ${s.rival?.apodo.toUpperCase() ?? 'TU RIVAL'}…`;
        return;
      }
      this.luchadores = m.luchadores;
      this.escenario = m.id;
      this.cargar();
    }
    if (!this.rivalListo && s.tomar('listo', this.ronda)) this.rivalListo = true;
    if (!this.cargado) {
      this.estado.text = '';
      return;
    }
    this.estado.text = this.rivalListo ? '¡A PELEAR!' : `ESPERANDO A ${s.rival?.apodo.toUpperCase() ?? 'TU RIVAL'}…`;
    if (s.rol === 'anfitrion') {
      if (!this.rivalListo) return;
      const semilla = 1 + Math.floor(Math.random() * 0xfffff);
      const roster = this.game.assets.roster;
      const intro = esperaDeEntrada(this.game, this.luchadores.map((i) => roster[i].def));
      s.enviar({ t: 'empezar', ronda: this.ronda, semilla, intro });
      this.empezar(semilla, intro);
    } else {
      const m = s.tomar('empezar', this.ronda);
      if (m) this.empezar(m.semilla, m.intro);
    }
  }

  private empezar(semilla: number, intro: number): void {
    const g = this.game;
    const s = this.sala;
    const lado = s.lado;
    const res = (w: 0 | 1 | -1): Resultado => (w === -1 ? 'empate' : w === lado ? 'gane' : 'perdi');
    g.setScene(
      new FightScene(g, 'online', semilla, {
        fighters: this.luchadores!,
        online: { sala: s, intro, salir: (e) => alMenu(g, e) },
        next: (w) => {
          // A la liga: cada uno manda su resultado (la pelea se reconoce por el código y la semilla).
          void reportarPelea(`${s.codigo}-${semilla}`, s.rol === 'anfitrion', res(w));
          return eligeEnLinea(g, s, res(w));
        },
      }),
    );
  }

  override render(): void {
    super.render();
    this.bar.update(this.prog);
  }
}
