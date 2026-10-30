"""Mezcla una cama de lluvia suave bajo un tema (siseo filtrado que respira y gotas sueltas).

  python -P -E herramientas/musica_lluvia.py <tema.wav> <salida.wav> <nivel en dB bajo la música>

Ej.: -17 deja la lluvia de fondo, sin tapar la música. La lluvia es pareja de principio a fin,
así que no se nota el salto del loop (herramientas/musica_loop.py se corre después).
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

src, dst, nivel_db = sys.argv[1], sys.argv[2], float(sys.argv[3])
sr, x = wavfile.read(src)
x = x.astype(np.float64) / 32768.0 if x.dtype == np.int16 else x.astype(np.float64)
n = len(x)
rng = np.random.default_rng(7)

def banda(sig, lo, hi, orden=4):
    return sosfilt(butter(orden, [lo, hi], btype='band', fs=sr, output='sos'), sig, axis=0)

# Siseo de la lluvia: ruido en banda 500-9000 Hz, estéreo descorrelacionado, que sube y baja lento.
ruido = banda(rng.standard_normal((n, 2)), 500, 9000)
lento = banda(rng.standard_normal(n), 0.05, 0.4, 2)
lento = 1 + 0.25 * lento / (np.abs(lento).max() + 1e-9)
siseo = ruido * lento[:, None]
siseo /= np.sqrt(np.mean(siseo ** 2))

# Gotas: ráfagas cortas (3-12 ms) filtradas, al azar, unas 40 por segundo, más fuertes de vez en cuando.
gotas = np.zeros((n, 2))
for _ in range(int(n / sr * 40)):
    t = rng.integers(0, n - 800)
    largo = int(sr * rng.uniform(0.003, 0.012))
    env = np.exp(-np.linspace(0, 6, largo))
    g = rng.standard_normal(largo) * env * rng.uniform(0.2, 1.0) ** 2
    pan = rng.uniform(0.2, 0.8)
    gotas[t:t + largo, 0] += g * (1 - pan)
    gotas[t:t + largo, 1] += g * pan
gotas = banda(gotas, 1500, 7000)
gotas /= np.sqrt(np.mean(gotas ** 2)) + 1e-9

lluvia = siseo + 0.35 * gotas
musica_rms = np.sqrt(np.mean(x ** 2))
lluvia *= musica_rms * 10 ** (nivel_db / 20) / np.sqrt(np.mean(lluvia ** 2))
y = x + lluvia
y *= min(1.0, 0.95 / np.abs(y).max())
wavfile.write(dst, sr, (y * 32767).astype(np.int16))
print(f'{dst}: lluvia a {nivel_db} dB bajo la música')
