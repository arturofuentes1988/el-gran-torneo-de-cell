// Efectos de sonido generados por código (sin archivos), estilo arcade.
// Cada sonido se sintetiza una vez a un AudioBuffer cuando se desbloquea el audio.

import type { SoundSpec } from '../sim/types';

type Gen = (sr: number) => Float32Array<ArrayBuffer>;

const TAU = Math.PI * 2;

function render(sr: number, dur: number, fn: (t: number) => number): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sr);
  return out;
}

/** Ruido blanco determinista. */
function noiseGen(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

/** Filtro paso bajo de un polo (cutoff en Hz, variable por muestra). */
function lowpass(sr: number): (x: number, cutoff: number) => number {
  let y = 0;
  return (x, cutoff) => {
    const k = 1 - Math.exp((-TAU * cutoff) / sr);
    y += k * (x - y);
    return y;
  };
}

function highpass(sr: number): (x: number, cutoff: number) => number {
  const lp = lowpass(sr);
  return (x, cutoff) => x - lp(x, cutoff);
}

/** Oscilador con fase acumulada (para barridos de frecuencia). */
function osc(sr: number): (freq: number, shape?: 'sin' | 'sq' | 'saw' | 'tri') => number {
  let ph = 0;
  return (freq, shape = 'sin') => {
    ph = (ph + freq / sr) % 1;
    switch (shape) {
      case 'sq':
        return ph < 0.5 ? 1 : -1;
      case 'saw':
        return ph * 2 - 1;
      case 'tri':
        return 1 - Math.abs(ph * 4 - 2);
      default:
        return Math.sin(ph * TAU);
    }
  };
}

const sat = (x: number, k = 1.5) => Math.tanh(x * k) / Math.tanh(k);
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) * d));

function echo(buf: Float32Array, sr: number, delay: number, fb: number, mix: number): Float32Array<ArrayBuffer> {
  const d = Math.floor(delay * sr);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] + (i >= d ? out[i - d] * fb : 0);
  }
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * (1 - mix) + out[i] * mix;
  return out;
}

function chord(sr: number, dur: number, freqs: number[], shape: 'sq' | 'saw', attack: number, decay: number, cutoffFn: (t: number) => number): Float32Array<ArrayBuffer> {
  const oscs = freqs.map(() => osc(sr));
  const lp = lowpass(sr);
  return render(sr, dur, (t) => {
    let v = 0;
    for (let i = 0; i < freqs.length; i++) v += oscs[i](freqs[i] * (1 + Math.sin(t * 30 + i) * 0.003), shape);
    return lp((v / freqs.length) * env(t, attack, decay), cutoffFn(t)) * 0.8;
  });
}

const SOUNDS: Record<string, Gen> = {
  hitLight: (sr) => {
    const n = noiseGen(3);
    const hp = highpass(sr);
    const o = osc(sr);
    return render(sr, 0.14, (t) => {
      const thump = o(90 + 170 * Math.exp(-t * 40)) * Math.exp(-t * 26);
      const crack = hp(n(), 1800) * Math.exp(-t * 55);
      return sat(thump * 0.9 + crack * 0.7, 1.4) * 0.75;
    });
  },
  hitHeavy: (sr) => {
    const n = noiseGen(5);
    const lp = lowpass(sr);
    const o = osc(sr);
    const o2 = osc(sr);
    return render(sr, 0.3, (t) => {
      const body = lp(n(), 2600 * Math.exp(-t * 9) + 200) * Math.exp(-t * 13);
      const thump = o(45 + 120 * Math.exp(-t * 18)) * Math.exp(-t * 11);
      const crunch = o2(70, 'sq') * Math.exp(-t * 30) * 0.3;
      return sat(body * 1.3 + thump + crunch, 2.2) * 0.8;
    });
  },
  hitSuper: (sr) => {
    const n = noiseGen(7);
    const lp = lowpass(sr);
    const o = osc(sr);
    const r1 = osc(sr);
    const r2 = osc(sr);
    return render(sr, 0.4, (t) => {
      const body = lp(n(), 3200 * Math.exp(-t * 7) + 300) * Math.exp(-t * 10);
      const thump = o(40 + 140 * Math.exp(-t * 14)) * Math.exp(-t * 9);
      const ring = (r1(880) + r2(1320)) * 0.25 * Math.exp(-t * 8);
      return sat(body * 1.2 + thump + ring, 2) * 0.8;
    });
  },
  block: (sr) => {
    const n = noiseGen(9);
    const hp = highpass(sr);
    const a = osc(sr);
    const b = osc(sr);
    return render(sr, 0.12, (t) => {
      const metal = (a(1400, 'sq') + b(2130, 'sq')) * 0.25 * Math.exp(-t * 48);
      const click = hp(n(), 3000) * Math.exp(-t * 90);
      return sat(metal + click * 0.8) * 0.55;
    });
  },
  whooshL: (sr) => {
    const n = noiseGen(11);
    const lp = lowpass(sr);
    const hp = highpass(sr);
    const d = 0.13;
    return render(sr, d, (t) => {
      const c = 900 + 2600 * (t / d);
      return hp(lp(n(), c), c * 0.4) * Math.sin((Math.PI * t) / d) * 0.45;
    });
  },
  whooshH: (sr) => {
    const n = noiseGen(13);
    const lp = lowpass(sr);
    const hp = highpass(sr);
    const d = 0.22;
    return render(sr, d, (t) => {
      const c = 400 + 1900 * Math.sin((Math.PI * t) / d);
      return hp(lp(n(), c), c * 0.3) * Math.sin((Math.PI * t) / d) * 0.6;
    });
  },
  fireball: (sr) => {
    const n = noiseGen(15);
    const lp = lowpass(sr);
    const a = osc(sr);
    const b = osc(sr);
    return render(sr, 0.5, (t) => {
      const f = 110 + 360 * (1 - Math.exp(-t * 6));
      const vib = 1 + Math.sin(t * 50) * 0.04;
      const tone = (a(f * vib, 'saw') * 0.5 + b(f * 1.5 * vib, 'sq') * 0.25) * env(t, 0.02, 4.5);
      const burst = lp(n(), 1500) * Math.exp(-t * 14);
      return sat(tone + burst * 0.9, 1.6) * 0.55;
    });
  },
  explosion: (sr) => {
    const n = noiseGen(17);
    const lp = lowpass(sr);
    const o = osc(sr);
    return render(sr, 0.4, (t) => {
      const body = lp(n(), 1600 * Math.exp(-t * 6) + 150) * Math.exp(-t * 8);
      const thump = o(40 + 60 * Math.exp(-t * 10)) * Math.exp(-t * 9);
      return sat(body * 1.4 + thump, 2) * 0.75;
    });
  },
  clash: (sr) => {
    const n = noiseGen(19);
    const hp = highpass(sr);
    const os = [osc(sr), osc(sr), osc(sr)];
    return render(sr, 0.3, (t) => {
      const ring = (os[0](620) + os[1](931) + os[2](1467)) * 0.3 * Math.exp(-t * 10);
      return sat(ring + hp(n(), 2500) * Math.exp(-t * 40) * 0.6) * 0.6;
    });
  },
  jump: (sr) => {
    const o = osc(sr);
    return render(sr, 0.09, (t) => o(240 + 2600 * t, 'sq') * Math.exp(-t * 30) * 0.18);
  },
  land: (sr) => {
    const n = noiseGen(21);
    const lp = lowpass(sr);
    const o = osc(sr);
    return render(sr, 0.1, (t) => sat(lp(n(), 600) * Math.exp(-t * 40) + o(60 + 60 * Math.exp(-t * 30)) * Math.exp(-t * 35)) * 0.5);
  },
  landHeavy: (sr) => {
    const n = noiseGen(23);
    const lp = lowpass(sr);
    const o = osc(sr);
    return render(sr, 0.28, (t) => sat(lp(n(), 900) * Math.exp(-t * 14) + o(38 + 70 * Math.exp(-t * 16)) * Math.exp(-t * 12), 2) * 0.75);
  },
  grab: (sr) => {
    const n = noiseGen(25);
    const lp = lowpass(sr);
    return render(sr, 0.1, (t) => lp(n(), 1200) * Math.exp(-t * 35) * 0.6);
  },
  throw: (sr) => SOUNDS.whooshH(sr),
  // Modo Poder: acorde que sube con un rugido de ruido (transformación).
  powerUp: (sr) => {
    const notes = [130.8, 196, 261.6, 392];
    const os = notes.map(() => osc(sr));
    const n = noiseGen(31);
    const lp = lowpass(sr);
    const raw = render(sr, 1.0, (t) => {
      let v = 0;
      notes.forEach((f, i) => {
        v += os[i](f * (1 + t * 0.5), 'saw') * 0.12;
      });
      const swell = lp(n(), 400 + 5000 * t) * Math.min(1, t * 1.5) * 0.35;
      return sat((v + swell) * env(t, 0.25, 2.2), 1.8) * 0.7;
    });
    return echo(raw, sr, 0.09, 0.35, 0.3);
  },
  powerEnd: (sr) => {
    const o = osc(sr);
    return render(sr, 0.35, (t) => o(520 * Math.exp(-t * 4), 'tri') * Math.exp(-t * 6) * 0.35);
  },
  roll: (sr) => {
    const n = noiseGen(33);
    const lp = lowpass(sr);
    const d = 0.25;
    return render(sr, d, (t) => lp(n(), 500 + 900 * Math.sin((Math.PI * t) / d)) * Math.sin((Math.PI * t) / d) * 0.5);
  },
  superJump: (sr) => {
    const o = osc(sr);
    const n = noiseGen(35);
    const lp = lowpass(sr);
    return render(sr, 0.22, (t) => (o(200 + 3800 * t, 'sq') * 0.16 + lp(n(), 2000) * 0.25) * Math.exp(-t * 12));
  },
  guardCancel: (sr) => {
    const n = noiseGen(37);
    const hp = highpass(sr);
    const os = [osc(sr), osc(sr)];
    return render(sr, 0.35, (t) => sat((os[0](880) + os[1](1320)) * 0.3 * Math.exp(-t * 9) + hp(n(), 3000) * Math.exp(-t * 30) * 0.7) * 0.6);
  },
  launch: (sr) => {
    const o = osc(sr);
    const n = noiseGen(39);
    const lp = lowpass(sr);
    return render(sr, 0.3, (t) => sat(o(90 + 500 * t) * Math.exp(-t * 8) * 0.6 + lp(n(), 1800) * Math.exp(-t * 14) * 0.6) * 0.7);
  },
  super: (sr) => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const os = notes.map(() => osc(sr));
    const sub = osc(sr);
    const n = noiseGen(27);
    const lp = lowpass(sr);
    const raw = render(sr, 0.9, (t) => {
      let v = 0;
      notes.forEach((f, i) => {
        const st = i * 0.055;
        if (t >= st) v += os[i](f, 'sq') * Math.exp(-(t - st) * 4) * 0.16;
      });
      const whoom = sub(60 + 80 * t) * Math.sin(Math.min(1, t * 3) * Math.PI) * 0.5;
      const swell = lp(n(), 600 + 3000 * t) * Math.min(1, t * 2) * Math.exp(-t * 2) * 0.4;
      return v + whoom + swell;
    });
    return echo(raw, sr, 0.07, 0.35, 0.35);
  },
  ko: (sr) => {
    const n = noiseGen(29);
    const lp = lowpass(sr);
    const o = osc(sr);
    const raw = render(sr, 1.4, (t) => {
      const boom = lp(n(), 1400 * Math.exp(-t * 2.5) + 80) * Math.exp(-t * 3);
      const low = o(28 + 50 * Math.exp(-t * 3)) * Math.exp(-t * 2.4);
      return sat(boom * 1.5 + low * 1.2, 2.2) * 0.85;
    });
    return echo(raw, sr, 0.12, 0.4, 0.3);
  },
  menuMove: (sr) => {
    const o = osc(sr);
    return render(sr, 0.05, (t) => o(990, 'sq') * Math.exp(-t * 40) * 0.2);
  },
  menuConfirm: (sr) => {
    const o = osc(sr);
    return render(sr, 0.22, (t) => o(t < 0.07 ? 660 : t < 0.14 ? 990 : 1320, 'sq') * Math.exp(-t * 9) * 0.22);
  },
  menuBack: (sr) => {
    const o = osc(sr);
    return render(sr, 0.14, (t) => o(t < 0.07 ? 660 : 440, 'sq') * Math.exp(-t * 14) * 0.2);
  },
  pause: (sr) => {
    const o = osc(sr);
    return render(sr, 0.2, (t) => o(t < 0.1 ? 880 : 660, 'tri') * Math.exp(-t * 8) * 0.3);
  },
  perfect: (sr) => {
    const notes = [784, 988, 1175, 1568];
    const os = notes.map(() => osc(sr));
    return render(sr, 0.7, (t) => {
      let v = 0;
      notes.forEach((f, i) => {
        const st = i * 0.09;
        if (t >= st) v += os[i](f, 'sq') * Math.exp(-(t - st) * 5) * 0.16;
      });
      return v;
    });
  },
  timeover: (sr) => {
    const o = osc(sr);
    return render(sr, 0.7, (t) => o(880 - t * 700, 'sq') * (Math.floor(t * 12) % 2 === 0 ? 1 : 0.3) * Math.exp(-t * 2.5) * 0.2);
  },
  winner: (sr) => echo(chord(sr, 1.2, [261.6, 329.6, 392, 523.3], 'sq', 0.03, 2, () => 3000), sr, 0.12, 0.3, 0.3),
};

/** Sintetiza un sonido descrito como datos (capas de osciladores/ruido). */
export function synthesize(spec: SoundSpec, sr: number): Float32Array<ArrayBuffer> {
  const tail = spec.echo ? spec.echo.delay * 5 : 0;
  const end = Math.max(0.01, ...spec.layers.map((l) => (l.start ?? 0) + l.dur)) + tail;
  const out = new Float32Array(Math.ceil(end * sr));
  for (const L of spec.layers) {
    const s0 = Math.floor((L.start ?? 0) * sr);
    const len = Math.floor(L.dur * sr);
    const lp = lowpass(sr);
    const nz = noiseGen(L.seed ?? 97);
    const [f0, f1] = L.freq;
    const a = L.attack ?? 0.005;
    const decay = L.decay ?? 3;
    const vol = L.vol ?? 0.5;
    let ph = 0;
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / sr;
      const u = t / L.dur;
      const f = f0 * Math.pow(Math.max(1, f1) / Math.max(1, f0), u);
      const vib = L.vibrato ? 1 + Math.sin(TAU * L.vibrato[0] * t) * L.vibrato[1] : 1;
      ph = (ph + (f * vib) / sr) % 1;
      let v: number;
      switch (L.wave) {
        case 'square':
          v = ph < 0.5 ? 1 : -1;
          break;
        case 'saw':
          v = ph * 2 - 1;
          break;
        case 'triangle':
          v = 1 - Math.abs(ph * 4 - 2);
          break;
        case 'noise':
          v = nz();
          break;
        default:
          v = Math.sin(ph * TAU);
      }
      if (L.lowpass) v = lp(v, L.lowpass[0] * Math.pow(L.lowpass[1] / L.lowpass[0], u));
      else if (L.wave === 'noise') v = lp(v, f);
      let e = t < a ? t / a : Math.exp(-(t - a) * decay);
      e *= Math.min(1, (L.dur - t) / 0.012);
      out[s0 + i] += v * e * vol;
    }
  }
  const drive = spec.drive ?? 0;
  if (drive > 0) for (let i = 0; i < out.length; i++) out[i] = sat(out[i], drive);
  const res = spec.echo ? echo(out, sr, spec.echo.delay, spec.echo.feedback, spec.echo.mix) : out;
  const vol = spec.volume ?? 0.8;
  for (let i = 0; i < res.length; i++) res[i] = Math.max(-1, Math.min(1, res[i] * vol));
  return res;
}

/**
 * Las muestras de voz van más fuerte y bajan un poco el resto: las del
 * anunciador ("voz/round1") y las de los luchadores ("rene/voz/queriToo").
 */
function isVoice(name: string): boolean {
  return name.startsWith('voz/') || name.includes('/voz/');
}
const VOICE_GAIN = 1.35;
/** Separación entre dos voces seguidas del mismo canal (s) y fundido al cortar una voz por otra. */
const VOICE_GAP = 0.06;
const CUT_FADE = 0.04;
/** Volumen de la música y cuánto baja mientras alguien habla. */
const MUSIC_GAIN = 0.5;
const MUSIC_DUCK = 0.5;
/** Volumen de los demás sonidos mientras habla alguien. */
const DUCK = 0.55;
/** Un sonido pedido mientras su muestra todavía se descarga o decodifica suena si llega antes de esto (ms). */
const LATE_LIMIT = 1500;

/** Manifiesto de muestras: nombre → archivo, o lista de archivos (variantes: suena una al azar). */
export type SampleManifest = Record<string, string | string[]>;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Efectos sintetizados y muestras que no son voz. */
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private specs = new Map<string, SoundSpec>();
  /** Muestras descargadas que esperan el desbloqueo del audio para decodificarse. */
  private pending = new Map<string, ArrayBuffer>();
  /** Muestras que todavía se descargan o decodifican (para tocarlas apenas lleguen). */
  private inflight = new Map<string, Promise<void>>();
  /** Nombre con variantes → nombres de cada variante ("rene/voz/queriToo" → "rene/voz/queriToo#0", …). */
  private variants = new Map<string, string[]>();
  /** Música de fondo: bus propio (baja mientras alguien habla) y la pista que suena. */
  private musicBus: GainNode | null = null;
  private music: { name: string; src: AudioBufferSourceNode | null; gain: GainNode | null; loopStart: number; loopEnd: number } | null = null;
  /**
   * Canales de voz (ej. un luchador): hasta cuándo está ocupado cada uno (segundos del
   * AudioContext) y lo que suena o espera en él (para cortarlo si llega una voz nueva).
   */
  private channels = new Map<string, { until: number; playing: Array<{ src: AudioBufferSourceNode; gain: GainNode; end: number }> }>();
  muted = false;

  /** Registra un sonido definido como datos (ej. el sonido propio de un súper). */
  register(name: string, spec: SoundSpec): void {
    this.specs.set(name, spec);
    if (this.ctx) this.store(name, synthesize(spec, this.ctx.sampleRate));
  }

  has(name: string): boolean {
    return (
      this.buffers.has(name) || this.specs.has(name) || this.pending.has(name) || this.inflight.has(name) ||
      this.variants.has(name) || name in SOUNDS
    );
  }

  /**
   * Carga una muestra de audio (mp3, ogg, wav), por ejemplo una voz. Si el
   * audio aún no está desbloqueado se decodifica al desbloquearlo.
   */
  loadSample(name: string, url: string): Promise<void> {
    const job = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
      const data = await res.arrayBuffer();
      if (this.ctx) await this.decode(name, data);
      else this.pending.set(name, data);
    })();
    this.track(name, job);
    return job;
  }

  /**
   * Carga las muestras de un manifiesto JSON { "voz/round1": "round1.mp3", "voz/hola": ["a.mp3", "b.mp3"] }
   * (rutas relativas al manifiesto). `prefix` va delante de cada nombre (ej. "rene/" para las voces
   * de un luchador: "rene/voz/hola"). Una lista son variantes: al tocar el nombre suena una al azar.
   * Si el manifiesto no existe, no hace nada. Devuelve cuántos archivos cargó.
   */
  async loadManifest(url: string, prefix = ''): Promise<number> {
    let manifest: SampleManifest;
    try {
      const res = await fetch(url);
      if (!res.ok) return 0;
      manifest = (await res.json()) as SampleManifest;
    } catch {
      return 0;
    }
    const base = new URL(url, location.href);
    const jobs: Promise<void>[] = [];
    for (const [key, value] of Object.entries(manifest ?? {})) {
      const name = prefix + key;
      const files = (Array.isArray(value) ? value : [value]).filter((f): f is string => typeof f === 'string' && f !== '');
      if (!files.length) continue;
      if (!Array.isArray(value)) {
        jobs.push(this.loadSample(name, new URL(files[0], base).href));
        continue;
      }
      const names = files.map((_, i) => `${name}#${i}`);
      this.variants.set(name, names);
      files.forEach((f, i) => jobs.push(this.loadSample(names[i], new URL(f, base).href)));
    }
    const results = await Promise.allSettled(jobs);
    for (const r of results) if (r.status === 'rejected') console.warn('Muestra de audio no cargada:', r.reason);
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  /** Recuerda una carga en curso hasta que termine (bien o mal). */
  private track(name: string, job: Promise<void>): void {
    this.inflight.set(name, job);
    const done = (): void => {
      if (this.inflight.get(name) === job) this.inflight.delete(name);
    };
    job.then(done, done);
  }

  private async decode(name: string, data: ArrayBuffer): Promise<void> {
    if (!this.ctx) return;
    try {
      this.buffers.set(name, await this.ctx.decodeAudioData(data));
    } catch (err) {
      console.warn(`No se pudo decodificar la muestra "${name}".`, err);
    }
  }

  private store(name: string, data: Float32Array<ArrayBuffer>): void {
    if (!this.ctx) return;
    const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.copyToChannel(data, 0);
    this.buffers.set(name, b);
  }

  /** Debe llamarse desde un gesto del usuario (tecla, clic, toque). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      // Limitador suave al final: la voz encima de un golpe fuerte no satura.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.voiceBus = this.ctx.createGain();
      this.voiceBus.gain.value = VOICE_GAIN;
      this.voiceBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = MUSIC_GAIN;
      this.musicBus.connect(this.master);
      const sr = this.ctx.sampleRate;
      for (const [name, gen] of Object.entries(SOUNDS)) this.store(name, gen(sr));
      for (const [name, spec] of this.specs) this.store(name, synthesize(spec, sr));
      for (const [name, data] of this.pending) this.track(name, this.decode(name, data));
      this.pending.clear();
      // Música pedida antes del desbloqueo: suena apenas se decodifique.
      const m = this.music;
      if (m && !m.src) {
        if (this.buffers.has(m.name)) this.startMusic(m);
        else this.inflight.get(m.name)?.then(() => { if (this.music === m) this.startMusic(m); }, () => undefined);
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Nombre concreto a tocar: una variante al azar (de las ya listas, si hay) o el mismo nombre. */
  /** Duración en segundos de una muestra (la más larga de sus variantes); 0 si no está cargada. */
  duration(name: string): number {
    const names = this.variants.get(name) ?? [name];
    let d = 0;
    for (const n of names) d = Math.max(d, this.buffers.get(n)?.duration ?? 0);
    return d;
  }

  private pick(name: string): string {
    const vs = this.variants.get(name);
    if (!vs) return name;
    const ready = vs.filter((v) => this.buffers.has(v));
    const pool = ready.length ? ready : vs;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Corta lo que suena en un canal (y lo que esperaba turno) con un fundido muy corto. */
  private cut(ch: { until: number; playing: Array<{ src: AudioBufferSourceNode; gain: GainNode; end: number }> }, at: number): void {
    for (const p of ch.playing) {
      p.gain.gain.cancelScheduledValues(at);
      p.gain.gain.setValueAtTime(p.gain.gain.value, at);
      p.gain.gain.linearRampToValueAtTime(0, at + CUT_FADE);
      try {
        p.src.stop(at + CUT_FADE + 0.01);
      } catch {
        // Ya estaba detenida.
      }
    }
    ch.playing = [];
    ch.until = 0;
  }

  /** Calla un canal de voces (ej. al cambiar de luchador en PERSONAJES). */
  silence(channel: string): void {
    const ch = this.channels.get(channel);
    if (this.ctx && ch) this.cut(ch, this.ctx.currentTime);
  }

  /**
   * Toca un sonido. Con `channel` (ej. el id de un luchador) dos voces de ese canal no suenan a la vez.
   * `mode` dice qué pasa si el canal está ocupado:
   * - 'cut' (por defecto): la nueva corta a la anterior (el último poder es el que se oye).
   * - 'queue': la nueva espera su turno hasta `maxWait` segundos; si no alcanza, no suena (frases del ultra).
   * - 'ifFree': solo suena si el canal está libre (frases automáticas, como la del final de un combo).
   */
  play(
    name: string,
    opts: { vol?: number; pan?: number; rate?: number; channel?: string; mode?: 'cut' | 'queue' | 'ifFree'; maxWait?: number } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.voiceBus || this.muted) return;
    const concrete = this.pick(name);
    const buf = this.buffers.get(concrete);
    if (!buf) {
      // Recién desbloqueado o todavía descargando: suena apenas esté lista (si no se atrasa demasiado).
      const job = this.inflight.get(concrete);
      if (job) {
        const asked = performance.now();
        const later = (): void => {
          if (performance.now() - asked <= LATE_LIMIT && this.buffers.has(concrete)) this.play(concrete, opts);
        };
        job.then(later, () => undefined);
      }
      return;
    }
    const voice = isVoice(concrete);
    const dur = buf.duration / (opts.rate ?? 1);
    let at = ctx.currentTime;
    const ch = opts.channel ? this.channels.get(opts.channel) ?? { until: 0, playing: [] } : null;
    if (ch && opts.channel) {
      ch.playing = ch.playing.filter((p) => at < p.end);
      const busy = ch.until > at;
      const mode = opts.mode ?? 'cut';
      if (busy && mode === 'ifFree') return;
      if (busy && mode === 'queue') {
        if (ch.until - at > (opts.maxWait ?? 0.3)) return;
        at = ch.until + VOICE_GAP;
      } else if (busy) {
        this.cut(ch, at);
      }
      ch.until = at + dur;
      this.channels.set(opts.channel, ch);
    }
    if (voice) {
      // Mientras habla alguien, el resto (y la música) baja un poco y después vuelve.
      this.duck(this.sfxBus.gain, DUCK, at, dur);
      if (this.musicBus) this.duck(this.musicBus.gain, MUSIC_GAIN * MUSIC_DUCK, at, dur, MUSIC_GAIN);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.vol ?? 1;
    src.connect(gain);
    let out: AudioNode = gain;
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(p);
      out = p;
    }
    out.connect(voice ? this.voiceBus : this.sfxBus);
    src.start(at);
    if (ch) ch.playing.push({ src, gain, end: at + dur });
  }

  private duck(g: AudioParam, low: number, at: number, dur: number, high = 1): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(low, at, 0.02);
    g.setTargetAtTime(high, at + dur, 0.15);
  }

  // ---------------------------------------------------------------- música

  /**
   * Música de fondo en loop: [loopStart, loopEnd) se repite sin cortes (lo de antes es la
   * entrada). Si ya suena esa pista no hace nada; si suena otra, se cruzan con un fundido.
   * Si la muestra todavía se descarga, empieza apenas llegue.
   */
  playMusic(name: string, loopStart = 0, loopEnd = 0): void {
    if (this.music?.name === name) return;
    this.stopMusic(0.8);
    const m = { name, src: null, gain: null, loopStart, loopEnd };
    this.music = m;
    if (this.buffers.has(name)) this.startMusic(m);
    else this.inflight.get(name)?.then(() => { if (this.music === m) this.startMusic(m); }, () => undefined);
  }

  private startMusic(m: NonNullable<Sfx['music']>): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(m.name);
    if (!ctx || !this.musicBus || !buf || m.src) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (m.loopEnd > m.loopStart) {
      src.loopStart = m.loopStart;
      src.loopEnd = Math.min(m.loopEnd, buf.duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
    src.connect(gain).connect(this.musicBus);
    src.start();
    m.src = src;
    m.gain = gain;
  }

  /** Apaga la música con un fundido de `fade` segundos. */
  stopMusic(fade = 1): void {
    const m = this.music;
    this.music = null;
    const ctx = this.ctx;
    if (!m?.src || !m.gain || !ctx) return;
    const now = ctx.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(0, now + fade);
    m.src.stop(now + fade + 0.05);
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Activa o desactiva todo el sonido (efectos, voces y música). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
  }
}
