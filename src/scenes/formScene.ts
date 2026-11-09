// Base de las pantallas con un formulario HTML encima del fondo de los menús (entrar con correo,
// apodo, unirse a una sala en línea).

import type { Game, Scene } from '../app/game';
import type { Formulario } from '../online/formulario';
import { backdrop } from './backdrop';

/** Pantalla con un formulario HTML encima del fondo de los menús (ESC o ☰ vuelve). */
export abstract class FormScene implements Scene {
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
