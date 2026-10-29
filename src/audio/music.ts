import type { Sfx } from './sfx';

// Música de fondo: el tema de la pantalla de título (también en los menús) y
// uno por escenario. La lista viene de public/musica/musica.json:
//   { "titulo": { "archivo": "titulo.mp3", "bpm": 140, "loopStart": 3.4, "loopEnd": 82.3 }, … }
// Cada pista se descarga recién la primera vez que se pide y queda en memoria.

interface Track {
  url: string;
  loopStart: number;
  loopEnd: number;
}

export class MusicLibrary {
  private tracks = new Map<string, Track>();
  private requested = new Set<string>();
  /** Lo último que se pidió antes de que llegara la lista (se toca apenas llega). */
  private wanted: string | null | undefined;

  constructor(private sfx: Sfx) {}

  /** Lee la lista de pistas. Si falta, el juego sigue sin música. */
  async load(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const list = (await res.json()) as Record<string, { archivo?: string; loopStart?: number; loopEnd?: number }>;
      const base = new URL(url, location.href);
      for (const [key, t] of Object.entries(list ?? {})) {
        if (!t?.archivo) continue;
        this.tracks.set(key, { url: new URL(t.archivo, base).href, loopStart: t.loopStart ?? 0, loopEnd: t.loopEnd ?? 0 });
      }
    } catch {
      return;
    }
    if (this.wanted !== undefined) this.play(this.wanted);
  }

  /** Toca una pista en loop (null: silencio). Si ya suena, sigue sin cortarse. */
  play(key: string | null): void {
    this.wanted = key;
    if (key === null) {
      this.sfx.stopMusic(1);
      return;
    }
    const t = this.tracks.get(key);
    if (!t) return;
    const name = `musica/${key}`;
    if (!this.requested.has(key)) {
      this.requested.add(key);
      this.sfx.loadSample(name, t.url).catch((err: unknown) => {
        this.requested.delete(key);
        console.warn(`Sin música "${key}".`, err);
      });
    }
    this.sfx.playMusic(name, t.loopStart, t.loopEnd);
  }
}
