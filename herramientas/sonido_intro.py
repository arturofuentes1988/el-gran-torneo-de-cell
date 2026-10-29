"""Sonido de encendido del juego, estilo consola de los 90.

Sintetiza (sin muestras ajenas) un jingle original de ~3 s: un "bum" grave que
se hincha, un arpegio de campanas FM que sube, un acorde grande con cola de
reverberación y destellos agudos. Al final le da un toque retro (12 bits a
22 kHz), normaliza el pico a -1 dBFS y escribe public/sonidos/intro.mp3.

Uso: python -P -E herramientas/sonido_intro.py
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'public' / 'sonidos' / 'intro.mp3'

SR = 44100
DUR = 3.3
TAU = 2 * np.pi
rng = np.random.default_rng(1987)


def nota(n: str) -> float:
    """'D5' → Hz (La4 = 440)."""
    nombres = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    tono, octava = n[:-1], int(n[-1])
    return 440.0 * 2 ** ((nombres[tono] + 12 * (octava - 4)) / 12)


def tiempo(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def pegar(dst: np.ndarray, src: np.ndarray, t0: float, pan: float = 0.0, vol: float = 1.0) -> None:
    """Suma un sonido mono en la mezcla estéreo desde t0 (pan -1 izquierda … 1 derecha)."""
    i0 = int(t0 * SR)
    n = min(len(src), dst.shape[0] - i0)
    if n <= 0:
        return
    izq = np.cos((pan + 1) * np.pi / 4)
    der = np.sin((pan + 1) * np.pi / 4)
    dst[i0:i0 + n, 0] += src[:n] * izq * vol
    dst[i0:i0 + n, 1] += src[:n] * der * vol


def campana(f: float, dur: float, indice: float = 3.2, razon: float = 3.5, caida: float = 4.0) -> np.ndarray:
    """Campana FM: portadora senoidal modulada; el índice baja con el tiempo (brillo que se apaga)."""
    t = tiempo(dur)
    env = (1 - np.exp(-t / 0.003)) * np.exp(-t * caida)
    idx = indice * np.exp(-t * caida * 1.6)
    return np.sin(TAU * f * t + idx * np.sin(TAU * f * razon * t)) * env


def pasabajos(x: np.ndarray, corte: np.ndarray | float) -> np.ndarray:
    """Filtro de un polo con corte variable (Hz)."""
    corte = np.broadcast_to(corte, x.shape)
    k = 1 - np.exp(-TAU * corte / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += k[i] * (x[i] - acc)
        y[i] = acc
    return y


def sierra(f: float, t: np.ndarray, desafine: float = 0.0) -> np.ndarray:
    fase = (f * (1 + desafine) * t) % 1.0
    return 2 * fase - 1


def reverb(x: np.ndarray, largo: float = 1.9, mezcla: float = 0.32) -> np.ndarray:
    """Reverberación por convolución con ruido que decae (estéreo decorrelacionado)."""
    t = tiempo(largo)
    salida = np.zeros((x.shape[0] + len(t) - 1, 2))
    # A la sala no le llegan los graves (si no, se embarra el bajo).
    envio = np.stack([x[:, c] - pasabajos(x[:, c], 180.0) for c in range(2)], axis=1)
    for c in range(2):
        ir = rng.standard_normal(len(t)) * np.exp(-t * 3.4)
        ir = pasabajos(ir, 5200.0 * np.exp(-t * 1.2) + 900.0)
        ir /= np.sqrt(np.sum(ir ** 2))
        n = 1 << int(np.ceil(np.log2(salida.shape[0])))
        salida[:, c] = np.fft.irfft(np.fft.rfft(envio[:, c], n) * np.fft.rfft(ir, n), n)[: salida.shape[0]]
    seco = np.zeros_like(salida)
    seco[: x.shape[0]] = x
    return seco * (1 - mezcla) + salida * mezcla * 1.6


def decodificar(mp3: pathlib.Path) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(mp3), '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main() -> None:
    mezcla = np.zeros((int(DUR * SR), 2))

    # 1. Encendido: un "bum" grave que se hincha y un soplido que sube.
    t = tiempo(0.9)
    barrido = 38 + 52 * (1 - np.exp(-t * 5))
    bum = np.sin(TAU * np.cumsum(barrido) / SR) * (1 - np.exp(-t / 0.08)) * np.exp(-t * 3.2)
    pegar(mezcla, bum, 0.0, vol=0.5)
    ruido = rng.standard_normal(len(t))
    soplido = pasabajos(ruido, 300 + 5000 * (t / t[-1]) ** 2) * np.sin(np.pi * np.clip(t / 0.62, 0, 1)) ** 2
    pegar(mezcla, soplido, 0.0, vol=0.22)
    clic = campana(nota('D7'), 0.05, indice=1.2, razon=1.41, caida=60)
    pegar(mezcla, clic, 0.02, vol=0.25)

    # 2. Arpegio de campanas que sube (Re mayor con novena), alternando lados.
    arpegio = ['D5', 'A5', 'F#5', 'D6', 'E6', 'A6']
    for i, n in enumerate(arpegio):
        pegar(mezcla, campana(nota(n), 1.1, indice=2.6, razon=3.5, caida=3.2), 0.40 + i * 0.105,
              pan=-0.45 if i % 2 == 0 else 0.45, vol=0.46)
        # Un eco más suave una octava arriba le da el brillo de chip.
        pegar(mezcla, campana(nota(n) * 2, 0.4, indice=1.0, razon=2.0, caida=7.0), 0.40 + i * 0.105 + 0.02,
              pan=0.45 if i % 2 == 0 else -0.45, vol=0.16)

    # 3. El acorde grande (Re mayor 9): sierras desafinadas con filtro que se abre y se cierra, bajo y campanas.
    t0 = 1.08
    t = tiempo(DUR - t0)
    acorde = ['D3', 'A3', 'D4', 'F#4', 'A4', 'E5']
    pad = np.zeros(len(t))
    for n in acorde:
        f = nota(n)
        pad += sierra(f, t, -0.004) + sierra(f, t, 0.005)
    env_pad = (1 - np.exp(-t / 0.012)) * (0.55 + 0.45 * np.exp(-t * 2.4)) * np.exp(-t * 0.9)
    corte = 600 + 5200 * np.exp(-t * 2.8) + 400 * np.exp(-t * 0.6)
    pad = pasabajos(pad / len(acorde), corte) * env_pad
    pegar(mezcla, pad, t0, vol=0.55)
    bajo = np.sin(TAU * nota('D2') * t) * (1 - np.exp(-t / 0.01)) * np.exp(-t * 1.4)
    pegar(mezcla, bajo, t0, vol=0.38)
    golpe = rng.standard_normal(int(0.25 * SR)) * np.exp(-tiempo(0.25) * 22)
    pegar(mezcla, pasabajos(golpe, 2500.0), t0, vol=0.35)
    for i, n in enumerate(['D5', 'F#5', 'A5', 'E6']):
        pegar(mezcla, campana(nota(n), 2.0, indice=2.0, razon=3.5, caida=1.6), t0 + 0.01 * i,
              pan=(-0.6, 0.6, -0.25, 0.25)[i], vol=0.24)

    # 4. Destellos: campanitas agudas al azar de la escala, cada vez más espaciadas.
    escala = ['D7', 'E7', 'F#7', 'A7', 'B7', 'D8']
    tt = t0 + 0.05
    while tt < DUR - 0.5:
        n = escala[rng.integers(len(escala))]
        pegar(mezcla, campana(nota(n), 0.35, indice=1.4, razon=1.41, caida=10), tt,
              pan=float(rng.uniform(-0.9, 0.9)), vol=0.09 * np.exp(-(tt - t0) * 0.8))
        tt += 0.045 + (tt - t0) * 0.09

    # 5. Sala, toque retro (22 kHz y 12 bits), normalización y desvanecido final.
    salida = reverb(mezcla)[: int(DUR * SR)]
    retro = salida[::2]
    retro = np.round(retro / np.abs(retro).max() * 2047) / 2047
    desv = int(0.35 * 22050)
    retro[-desv:] *= np.linspace(1, 0, desv)[:, None] ** 1.5
    retro *= 0.891 / np.abs(retro).max()

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / 'intro.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(22050)
            w.writeframes((retro * 32767).astype('<i2').tobytes())
        # El mp3 se pasa un poco del pico del wav: se codifica, se mide y se corrige una vez (pico final -1 dBFS).
        ganancia = 0.0
        for _ in range(3):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-af', f'volume={ganancia:.2f}dB', '-ar', '44100',
                            '-codec:a', 'libmp3lame', '-b:a', '160k', str(SALIDA)], check=True)
            x = decodificar(SALIDA)
            ganancia += -1.0 - 20 * np.log10(float(np.abs(x).max()))

    # Revisión numérica (nadie puede escucharlo aquí).
    x = decodificar(SALIDA)
    dur = len(x) / 44100
    pico = float(np.abs(x).max())
    tramos = [float(np.sqrt(np.mean(x[int(a * 44100):int(b * 44100)] ** 2))) for a, b in ((0, 0.4), (0.4, 1.08), (1.08, 2.0), (2.0, 3.0))]
    espectro = np.abs(np.fft.rfft(x))
    freqs = np.fft.rfftfreq(len(x), 1 / 44100)
    centroide = float(np.sum(freqs * espectro) / np.sum(espectro))
    print(f'{SALIDA.relative_to(RAIZ)}: {dur:.2f} s, pico {20 * np.log10(pico):.2f} dBFS, centroide {centroide:.0f} Hz')
    print('RMS por tramo (encendido, arpegio, acorde, cola):', ' '.join(f'{20 * np.log10(max(r, 1e-9)):.1f} dB' for r in tramos))
    if pico >= 0.999:
        raise SystemExit('¡Satura!')


if __name__ == '__main__':
    main()
