// Pantallas de la cuenta y de EN LÍNEA:
// - TU CUENTA (la primera vez, después del título): ENTRAR CON GOOGLE, ENTRAR CON CORREO o
//   JUGAR SIN CUENTA (queda recordado). EN LÍNEA la vuelve a mostrar, con VOLVER, a quien no ha entrado.
// - ENTRAR CON CORREO y ELIGE TU APODO: formularios HTML encima del fondo de los menús.
// - EN LÍNEA: las salas (llegan en la fase 2), cambiar apodo, cambiar avatar y cerrar sesión.
// - ELIGE TU AVATAR: la cara de un luchador (selector HTML, el mismo de la web).
// - CONECTANDO…: espera a la cuenta (sesión guardada, vuelta de Google o lectura del apodo).

import { Container, Graphics, Sprite } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';
import type { Game, Scene } from '../app/game';
import { tactil } from '../input/touch';
import {
  apodo, avatar, cargarPerfil, cerrarSesion, conectado, crearCuenta, cuentaPendiente, entrarConCorreo, entrarConGoogle, esInvitado,
  guardarApodo, guardarAvatar, marcarInvitado, quedoSinConexion, sugerirApodo, tomarErrorDeVuelta, tomarVolverA, validarApodo, type Motivo,
} from '../online/cuenta';
import { abrirSelectorDeAvatar } from '../online/avatares';
import { abrirFormulario, type Formulario } from '../online/formulario';
import { outlinedText } from '../render/text';
import { backdrop } from './backdrop';
import { FormScene } from './formScene';
import { CrearSalaScene, UnirseScene } from './sala';
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
class CuentaScene extends MenuScene {
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

/** ENTRAR CON CORREO: correo y contraseña; ENTRAR o CREAR CUENTA. */
class CorreoScene extends FormScene {
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
class ApodoScene extends FormScene {
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

/** ELIGE TU AVATAR: la cara de un luchador (el selector HTML de la web); vuelve a EN LÍNEA. */
class AvatarScene implements Scene {
  readonly music = 'titulo';
  private selector: { cerrar(): void } | null = null;
  private saliendo = false;

  constructor(
    private game: Game,
    private luego: () => Scene,
  ) {}

  enter(): void {
    backdrop.attach(this.game);
    this.selector = abrirSelectorDeAvatar({
      actual: avatar(),
      alElegir: async (id) => {
        const err = await guardarAvatar(id);
        if (!err) this.game.sfx.play('menuConfirm');
        else this.game.sfx.play('menuBack');
        return err;
      },
      alCerrar: () => {
        this.selector = null;
        if (!this.saliendo && this.game.scene === this) this.game.setScene(this.luego());
      },
    });
  }

  exit(): void {
    backdrop.detach(this.game);
    this.saliendo = true;
    this.selector?.cerrar();
  }

  step(): void {
    if (this.game.menu.back) {
      this.game.sfx.play('menuBack');
      this.selector?.cerrar();
    }
  }

  render(): void {
    backdrop.render();
  }
}

/** EN LÍNEA (con cuenta) con un aviso (por qué se cerró la sala de la que viene). */
export function menuEnLinea(game: Game, aviso: string | null = null): Scene {
  return new OnlineScene(game, aviso);
}

/** EN LÍNEA (con cuenta): salas con código, el apodo, el avatar y cerrar sesión. PARTIDA RÁPIDA llega en el Paso C. */
class OnlineScene extends MenuScene {
  constructor(game: Game, avisoInicial: string | null = null) {
    super(game, 'online', 'EN LÍNEA', [
      { id: 'crear', label: 'CREAR SALA' },
      { id: 'unirse', label: 'UNIRSE CON CÓDIGO' },
      { id: 'rapida', label: 'PARTIDA RÁPIDA', dim: true },
      { id: 'apodo', label: 'CAMBIAR APODO' },
      { id: 'avatar', label: 'CAMBIAR AVATAR' },
      { id: 'salir', label: 'CERRAR SESIÓN' },
      { id: 'volver', label: 'VOLVER' },
    ]);
    this.note(`JUGANDO COMO ${apodo() ?? '…'}`);
    // Su avatar (la cara de un luchador) a la izquierda de su apodo.
    const id = avatar();
    const face = game.assets.roster.find((f) => f.def.id === id)?.face;
    const t = this.noteView;
    if (face && t) {
      const s = new Sprite(face);
      s.anchor.set(0.5);
      s.width = 16;
      s.height = 16;
      s.position.set(t.x - t.width / 2 - 11, t.y + t.height / 2);
      const marco = new Graphics().roundRect(s.x - 9, s.y - 9, 18, 18, 3).stroke({ color: 0xffd76a, width: 1 });
      this.ui.addChild(s, marco);
    }
    if (avisoInicial) this.aviso(avisoInicial, 'error', 300);
  }

  protected choose(id: string): void {
    const g = this.game;
    if (id === 'crear') {
      this.go(new CrearSalaScene(g));
    } else if (id === 'unirse') {
      this.go(new UnirseScene(g));
    } else if (id === 'rapida') {
      g.sfx.play('menuMove');
      this.aviso('PARTIDA RÁPIDA LLEGA PRONTO · POR AHORA, USA CREAR SALA', 'info', 240);
    } else if (id === 'apodo') {
      this.go(new ApodoScene(g, false, () => new OnlineScene(g), () => new OnlineScene(g)));
    } else if (id === 'avatar') {
      this.go(new AvatarScene(g, () => new OnlineScene(g)));
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
