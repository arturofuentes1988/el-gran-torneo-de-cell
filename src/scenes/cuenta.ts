// Pantallas de la cuenta y de EN LÍNEA:
// - TU CUENTA (la primera vez, después del título): ENTRAR CON GOOGLE, ENTRAR CON CORREO o
//   JUGAR SIN CUENTA (queda recordado). EN LÍNEA la vuelve a mostrar, con VOLVER, a quien no ha entrado.
// - ENTRAR CON CORREO y ELIGE TU APODO: formularios HTML encima del fondo de los menús.
// - EN LÍNEA: las salas (llegan en la fase 2), cambiar apodo y cerrar sesión.
// - CONECTANDO…: espera a la cuenta (sesión guardada, vuelta de Google o lectura del apodo).

import { Container } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { tactil } from '../input/touch';
import {
  apodo, cargarPerfil, cerrarSesion, conectado, crearCuenta, cuentaPendiente, entrarConCorreo, entrarConGoogle, esInvitado,
  guardarApodo, marcarInvitado, quedoSinConexion, sugerirApodo, tomarErrorDeVuelta, tomarVolverA, validarApodo, type Motivo,
} from '../online/cuenta';
import { abrirFormulario, type Formulario } from '../online/formulario';
import { outlinedText } from '../render/text';
import { backdrop } from './backdrop';
import { MenuScene } from './menu';
import { MainMenuScene } from './modeSelect';
import { TitleScene } from './title';

/** Al apretar ENTER (o tocar) en el título: TU CUENTA la primera vez; si no, el menú (o a donde iba antes de Google). */
export function despuesDelTitulo(game: Game): Scene {
  const p = cuentaPendiente();
  if (p) return new EsperaScene(game, p, () => despuesDelTitulo(game));
  const volver = tomarVolverA();
  const error = tomarErrorDeVuelta();
  if (conectado()) return volver ? trasEntrar(game, volver) : new MainMenuScene(game);
  if (error) return new CuentaScene(game, volver ?? 'inicio', error);
  if (quedoSinConexion() || esInvitado()) return new MainMenuScene(game);
  return new CuentaScene(game, 'inicio');
}

/** EN LÍNEA del menú principal: pide cuenta y apodo si faltan. */
export function irAEnLinea(game: Game): Scene {
  const p = cuentaPendiente();
  if (p) return new EsperaScene(game, p, () => irAEnLinea(game));
  if (!conectado()) return new CuentaScene(game, 'online');
  return trasEntrar(game, 'online');
}

/** Recién conectado: si no tiene apodo lo elige, y sigue al menú o a EN LÍNEA. */
function trasEntrar(game: Game, motivo: Motivo): Scene {
  const destino = (): Scene => (motivo === 'online' ? new OnlineScene(game) : new MainMenuScene(game));
  const a = apodo();
  // No se pudo leer el apodo (se cortó internet): se vuelve a intentar.
  if (a === undefined) return new EsperaScene(game, cargarPerfil(), () => trasEntrar(game, motivo));
  return a ? destino() : new ApodoScene(game, true, destino, () => new MainMenuScene(game));
}

/** "CONECTANDO…" hasta que termine `trabajo`; si devuelve un error, lo muestra y vuelve al menú. */
class EsperaScene implements Scene {
  readonly music = 'titulo';
  private ui = new Container();
  private texto = outlinedText('CONECTANDO', 10, 0xfff4e0, 0x3a0a40, 2);
  private sub = outlinedText('', 7, 0xd8cfe8, 0x1a0a24, 2, { align: 'center' });
  private t = 0;
  private listo = false;
  private error: string | null = null;

  constructor(
    private game: Game,
    trabajo: Promise<string | null | void>,
    private luego: () => Scene,
  ) {
    this.texto.anchor.set(0.5);
    this.texto.position.set(VIEW_W / 2, VIEW_H / 2 - 6);
    this.sub.anchor.set(0.5, 0);
    this.sub.position.set(VIEW_W / 2, VIEW_H / 2 + 10);
    this.ui.addChild(this.texto, this.sub);
    trabajo.then(
      (r) => {
        if (typeof r === 'string') this.error = r;
        else this.listo = true;
      },
      () => (this.error = 'ALGO FALLÓ · VUELVE A INTENTARLO'),
    );
  }

  enter(): void {
    backdrop.attach(this.game);
    this.game.display.hud.addChild(this.ui);
  }

  exit(): void {
    backdrop.detach(this.game);
    this.game.display.hud.removeChild(this.ui);
  }

  step(): void {
    this.t++;
    const m = this.game.menu;
    if (this.listo) {
      this.game.setScene(this.luego());
    } else if (this.error) {
      this.texto.text = this.error;
      this.texto.style.fill = 0xff8a8a;
      this.sub.text = tactil() ? 'TOCA PARA VOLVER' : 'PRESIONA ENTER PARA VOLVER';
      if (m.confirm || m.back || m.tap) {
        this.game.sfx.play('menuBack');
        this.game.setScene(new MainMenuScene(this.game));
      }
    }
  }

  render(): void {
    backdrop.render();
    if (!this.error) this.texto.text = 'CONECTANDO' + '.'.repeat(1 + (Math.floor(this.t / 20) % 3));
  }
}

/** TU CUENTA (primera vez) o EN LÍNEA sin haber entrado: Google, correo, o seguir sin cuenta. */
export class CuentaScene extends MenuScene {
  constructor(
    game: Game,
    private motivo: Motivo,
    error?: string,
  ) {
    super(game, `cuenta-${motivo}`, motivo === 'online' ? 'EN LÍNEA' : 'TU CUENTA', [
      { id: 'google', label: 'ENTRAR CON GOOGLE' },
      { id: 'correo', label: 'ENTRAR CON CORREO' },
      motivo === 'online' ? { id: 'volver', label: 'VOLVER' } : { id: 'invitado', label: 'JUGAR SIN CUENTA' },
    ], 9);
    this.note(
      motivo === 'online'
        ? 'PARA PELEAR EN LÍNEA NECESITAS UNA CUENTA (ES GRATIS)'
        : 'CON UNA CUENTA PUEDES PELEAR EN LÍNEA CONTRA OTROS JUGADORES\nARCADE Y CASUAL SE JUEGAN SIN CUENTA',
    );
    if (error) this.aviso(error, 'error');
  }

  protected choose(id: string): void {
    const g = this.game;
    if (id === 'google') {
      g.sfx.play('menuConfirm');
      this.busy = true;
      this.aviso('CONECTANDO CON GOOGLE…');
      void entrarConGoogle(this.motivo).then((err) => {
        // Sin error, la página se va a Google (y vuelve al juego ya conectado).
        if (!err) return;
        this.busy = false;
        this.aviso(err, 'error');
      });
    } else if (id === 'correo') {
      this.go(new CorreoScene(g, this.motivo));
    } else if (id === 'invitado') {
      marcarInvitado();
      this.go(new MainMenuScene(g));
    } else {
      this.back();
    }
  }

  protected back(): void {
    this.go(this.motivo === 'online' ? new MainMenuScene(this.game) : new TitleScene(this.game), 'menuBack');
  }
}

/** Pantalla con un formulario HTML encima del fondo de los menús (ESC o ☰ vuelve). */
abstract class FormScene implements Scene {
  readonly music = 'titulo';
  protected form: Formulario | null = null;
  protected ocupado = false;

  constructor(protected game: Game) {}

  protected abstract abrir(): Formulario;
  protected abstract volver(): void;

  enter(): void {
    backdrop.attach(this.game);
    this.form = this.abrir();
  }

  exit(): void {
    backdrop.detach(this.game);
    this.form?.cerrar();
    this.form = null;
  }

  step(): void {
    if (this.game.menu.back && !this.ocupado) this.volver();
  }

  render(): void {
    backdrop.render();
  }

  protected esperar(on: boolean): void {
    this.ocupado = on;
    this.form?.ocupado(on);
  }

  /** Error en el formulario (con el sonido de volver). */
  protected fallo(texto: string, campo?: string): void {
    this.form?.mensaje(texto, 'error');
    if (campo) this.form?.enfocar(campo);
    this.game.sfx.play('menuBack');
  }

  protected ir(s: Scene, sound: 'menuConfirm' | 'menuBack' = 'menuConfirm'): void {
    this.game.sfx.play(sound);
    this.game.setScene(s);
  }

  /** ¿Sigue en esta pantalla? (al volver una respuesta de internet). */
  protected get vigente(): boolean {
    return this.game.scene === this;
  }
}

/** ENTRAR CON CORREO: correo y contraseña; ENTRAR o CREAR CUENTA. */
export class CorreoScene extends FormScene {
  constructor(
    game: Game,
    private motivo: Motivo,
  ) {
    super(game);
  }

  protected abrir(): Formulario {
    return abrirFormulario({
      titulo: 'ENTRAR CON CORREO',
      nota: '¿PRIMERA VEZ? ESCRIBE TU CORREO, INVENTA UNA CONTRASEÑA Y TOCA CREAR CUENTA.',
      campos: [
        { id: 'correo', etiqueta: 'CORREO', tipo: 'email', autocompletar: 'email' },
        { id: 'clave', etiqueta: 'CONTRASEÑA (AL MENOS 6 LETRAS O NÚMEROS)', tipo: 'password', autocompletar: 'current-password' },
      ],
      botones: [
        { id: 'entrar', texto: 'ENTRAR', tipo: 'principal' },
        { id: 'crear', texto: 'CREAR CUENTA' },
        { id: 'volver', texto: 'VOLVER', tipo: 'volver' },
      ],
      alApretar: (id) => void this.apretar(id),
    });
  }

  private async apretar(id: string): Promise<void> {
    const f = this.form;
    if (!f || this.ocupado) return;
    if (id === 'volver') return this.volver();
    const correo = f.valor('correo').trim();
    const clave = f.valor('clave');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return this.fallo('ESCRIBE TU CORREO', 'correo');
    if (clave.length < 6) return this.fallo('LA CONTRASEÑA DEBE TENER AL MENOS 6 LETRAS O NÚMEROS', 'clave');
    this.game.sfx.play('menuConfirm');
    this.esperar(true);
    f.mensaje(id === 'crear' ? 'CREANDO TU CUENTA…' : 'ENTRANDO…');
    const r = id === 'crear' ? await crearCuenta(correo, clave) : { error: (await entrarConCorreo(correo, clave)) ?? undefined, confirmar: false };
    if (!this.vigente) return;
    this.esperar(false);
    if (r.error) return this.fallo(r.error);
    if (r.confirmar) {
      f.mensaje('TE MANDAMOS UN CORREO PARA CONFIRMAR LA CUENTA. CONFÍRMALA Y DESPUÉS TOCA ENTRAR.', 'ok');
      return;
    }
    this.game.setScene(trasEntrar(this.game, this.motivo));
  }

  protected volver(): void {
    this.ir(new CuentaScene(this.game, this.motivo), 'menuBack');
  }
}

/** ELIGE TU APODO (recién creada la cuenta) o CAMBIAR APODO (desde EN LÍNEA). */
export class ApodoScene extends FormScene {
  constructor(
    game: Game,
    private nuevo: boolean,
    private luego: () => Scene,
    private atras: () => Scene,
  ) {
    super(game);
  }

  protected abrir(): Formulario {
    return abrirFormulario({
      titulo: this.nuevo ? 'ELIGE TU APODO' : 'CAMBIAR APODO',
      nota: 'ASÍ TE VAN A VER TUS RIVALES. DE 3 A 14 LETRAS O NÚMEROS (TAMBIÉN SIRVEN ESPACIOS, - Y _).',
      campos: [{ id: 'apodo', etiqueta: 'APODO', valor: this.nuevo ? sugerirApodo() : (apodo() ?? ''), max: 14, autocompletar: 'nickname' }],
      botones: [
        { id: 'listo', texto: 'LISTO', tipo: 'principal' },
        { id: 'volver', texto: 'VOLVER', tipo: 'volver' },
      ],
      alApretar: (id) => void this.apretar(id),
    });
  }

  private async apretar(id: string): Promise<void> {
    const f = this.form;
    if (!f || this.ocupado) return;
    if (id === 'volver') return this.volver();
    const a = f.valor('apodo');
    const malo = validarApodo(a);
    if (malo) return this.fallo(malo, 'apodo');
    this.game.sfx.play('menuConfirm');
    this.esperar(true);
    f.mensaje('GUARDANDO…');
    const err = await guardarApodo(a);
    if (!this.vigente) return;
    this.esperar(false);
    if (err) return this.fallo(err, 'apodo');
    this.ir(this.luego());
  }

  protected volver(): void {
    this.ir(this.atras(), 'menuBack');
  }
}

/** EN LÍNEA (con cuenta): las salas llegan en la fase 2; por ahora, el apodo y cerrar sesión. */
export class OnlineScene extends MenuScene {
  constructor(game: Game) {
    super(game, 'online', 'EN LÍNEA', [
      { id: 'crear', label: 'CREAR SALA', dim: true },
      { id: 'unirse', label: 'UNIRSE CON CÓDIGO', dim: true },
      { id: 'rapida', label: 'PARTIDA RÁPIDA', dim: true },
      { id: 'apodo', label: 'CAMBIAR APODO' },
      { id: 'salir', label: 'CERRAR SESIÓN' },
      { id: 'volver', label: 'VOLVER' },
    ]);
    this.note(`JUGANDO COMO ${apodo() ?? '…'}`);
  }

  protected choose(id: string): void {
    const g = this.game;
    if (id === 'crear' || id === 'unirse' || id === 'rapida') {
      g.sfx.play('menuMove');
      this.aviso('LAS PELEAS EN LÍNEA LLEGAN EN LA PRÓXIMA ACTUALIZACIÓN', 'info', 180);
    } else if (id === 'apodo') {
      this.go(new ApodoScene(g, false, () => new OnlineScene(g), () => new OnlineScene(g)));
    } else if (id === 'salir') {
      g.sfx.play('menuConfirm');
      this.busy = true;
      this.aviso('CERRANDO SESIÓN…');
      void cerrarSesion().then(() => {
        if (g.scene === this) this.go(new MainMenuScene(g), 'menuBack');
      });
    } else {
      this.back();
    }
  }

  protected back(): void {
    this.go(new MainMenuScene(this.game), 'menuBack');
  }
}
