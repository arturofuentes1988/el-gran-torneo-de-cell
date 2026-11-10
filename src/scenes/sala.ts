// Pantallas de las salas en línea: CREAR SALA (muestra el código), UNIRSE CON CÓDIGO (lo pide) y
// PREPARANDO LA PELEA (los dos bajan lo que falte y parten juntos). Entre medio, ELIGE LUCHADOR
// en modo 'online' (characterSelect.ts) y la pelea con rollback (fight.ts).
//
// Cómo parten juntos: quien creó la sala elige el escenario al azar y se lo manda al otro con los
// dos luchadores; cada uno baja lo suyo y avisa "listo"; con los dos listos, el que creó la sala
// manda la semilla y la espera de las frases de entrada, y los dos empiezan. El rollback absorbe
// la diferencia de tiempo (el que parte antes espera los primeros controles del otro).

import { Container, Graphics } from 'pixi.js';
import type { Game, Scene } from '../app/game';
import { VIEW_H, VIEW_W } from '../config';
import { Progreso } from '../content/descargas';
import { tactil } from '../input/touch';
import { apodo, avatar } from '../online/cuenta';
import { abrirFormulario, type Formulario } from '../online/formulario';
import { reportarPelea, type Resultado } from '../online/liga';
import { Sala, codigoValido, limpiarCodigo, versionJuego, type Jugador } from '../online/sala';
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

/** Al cerrarse la sala: de vuelta a EN LÍNEA con el porqué. */
function alMenu(game: Game, error: string | null): Scene {
  return menuEnLinea(game, error);
}

/** ELIGE LUCHADOR en línea (también después de cada pelea, para la revancha). */
export function eligeEnLinea(game: Game, sala: Sala, resultado?: 'gane' | 'perdi' | 'empate'): Scene {
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

/** CREAR SALA: muestra el código (tocarlo lo copia) y espera al rival. */
export class CrearSalaScene extends PantallaSala {
  private sala: Sala;
  private codigo;
  private estado;
  private copiado = 0;

  constructor(game: Game, codigoDePrueba?: string) {
    super(game);
    this.sala = Sala.crear(yo(), versionJuego(game.assets.roster), codigoDePrueba);
    const caja = new Graphics().roundRect(VIEW_W / 2 - 110, 54, 220, 120, 10).fill({ color: 0x14061f, alpha: 0.88 }).stroke({ color: 0xffd76a, width: 1.5 });
    this.ui.addChild(caja);
    this.texto('SALA EN LÍNEA', 14, 30);
    this.texto('TU CÓDIGO', 8, 72, 0xffd76a);
    this.codigo = this.texto('····', 34, 104, 0xffffff);
    this.texto(arcade('DÍSELO A TU RIVAL: QUE ENTRE A EN LÍNEA > UNIRSE CON CÓDIGO'), 6, 140, 0xd8cfe8);
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
