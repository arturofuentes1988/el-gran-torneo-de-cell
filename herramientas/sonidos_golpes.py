"""Arma los sonidos de golpe y de bloqueo del juego desde grabaciones reales de impactos.

Uso:
  python -P -E herramientas/sonidos_golpes.py

Fuente: el paquete "Impact Sounds" de Kenney (CC0, https://kenney.nl/assets/impact-sounds), en
arte/sonidos/kenney-impact/ (impactPunch_heavy, impactPunch_medium, impactSoft_heavy, impactSoft_medium;
5 tomas de cada uno). Cada sonido del juego mezcla varias tomas y les suma capas sintetizadas para que suene
exagerado, como en un juego de pelea:

  golpe débil   puñetazo mediano un poco más agudo, chasquido de contacto y un golpe grave corto
  golpe fuerte  puñetazo fuerte más grave, golpe sordo de cuerpo y retumbe grave
  golpe súper   dos puñetazos encima, golpe sordo, retumbe grande, crujido y una cola de eco corta
  bloqueo       golpe sordo contra los antebrazos, el contacto del puño apagado (sin agudos), un "fum"
                grave exagerado y el roce de la ropa; nada que resuene (no suena a metal hueco)

Escribe 5 variantes de cada uno en public/sonidos/golpes/ (MP3 mono) y public/sonidos/sonidos.json, que el
juego carga al empezar: las variantes reemplazan a los sonidos sintetizados "hitLight", "hitHeavy",
"hitSuper" y "block" (en cada golpe suena una al azar).
"""
import json
import pathlib
import subprocess

import numpy as np
from scipy import signal

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FUENTE = RAIZ / 'arte' / 'sonidos' / 'kenney-impact'
SALIDA = RAIZ / 'public' / 'sonidos'
SR = 44100
rng = np.random.default_rng(7)


def leer(nombre: str) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(FUENTE / f'{nombre}.ogg'), '-ac', '1', '-ar', str(SR),
                          '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    # Desde el ataque (el golpe suena justo cuando conecta).
    i = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05))
    x = x[max(0, i - int(0.001 * SR)):]
    return x / (np.abs(x).max() + 1e-9)


def tono(x: np.ndarray, factor: float) -> np.ndarray:
    """Más agudo (>1) o más grave (<1), cambiando el largo como una cinta."""
    return signal.resample(x, int(len(x) / factor))


def filtro(x: np.ndarray, tipo: str, corte) -> np.ndarray:
    sos = signal.butter(2, corte, btype=tipo, fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def t(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def retumbe(f0: float, f1: float, tau: float, dur: float) -> np.ndarray:
    """Golpe grave: un seno que cae de f0 a f1 y se apaga (el "bum" de los juegos de pelea)."""
    tt = t(dur)
    f = f1 + (f0 - f1) * np.exp(-tt / (tau * 0.5))
    fase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(fase) * np.exp(-tt / tau) * (1 - np.exp(-tt / 0.0015))


def rafaga(dur: float, tau: float, banda, ataque: float = 0.0005) -> np.ndarray:
    """Ruido filtrado muy corto: chasquido de contacto o roce de ropa."""
    tt = t(dur)
    n = rng.standard_normal(len(tt))
    return filtro(n, 'bandpass', banda) * np.exp(-tt / tau) * (1 - np.exp(-tt / ataque))


def eco(x: np.ndarray, largo: float, mezcla: float) -> np.ndarray:
    """Cola de sala corta: ruido que se apaga, oscuro (convolución)."""
    tt = t(largo)
    ir = filtro(rng.standard_normal(len(tt)), 'lowpass', 3500) * np.exp(-tt / (largo / 5))
    ir /= np.sqrt((ir ** 2).sum())
    mojado = signal.fftconvolve(x, ir)
    seco = np.concatenate([x, np.zeros(len(mojado) - len(x))])
    return seco + mojado * mezcla


def mezclar(*capas) -> np.ndarray:
    """capas: (señal, ganancia, retraso en s)."""
    largo = max(len(s) + int(d * SR) for s, _, d in capas)
    out = np.zeros(largo)
    for s, g, d in capas:
        i = int(d * SR)
        out[i:i + len(s)] += s * g
    return out


def terminar(x: np.ndarray, dur: float, empuje: float, pico: float) -> np.ndarray:
    """Recorta, satura suave (más cuerpo y golpe), funde el final y deja el pico pedido."""
    x = x[:int(dur * SR)]
    x = np.tanh(x * empuje) / np.tanh(empuje)
    x = filtro(x, 'highpass', 28)
    f = int(0.04 * SR)
    x[-f:] *= np.linspace(1, 0, f) ** 2
    return x / (np.abs(x).max() + 1e-9) * pico


def golpe_debil(i: int) -> np.ndarray:
    p = tono(leer(f'impactPunch_medium_00{i}'), 1.08 + 0.03 * (i % 3))
    return terminar(mezclar(
        (p, 1.0, 0),
        (rafaga(0.04, 0.006, (1800, 6000)), 0.35, 0),
        (retumbe(150, 70, 0.035, 0.15), 0.45, 0),
    ), 0.3, 1.5, 0.72)


def golpe_fuerte(i: int) -> np.ndarray:
    p = tono(leer(f'impactPunch_heavy_00{i}'), 0.93 + 0.02 * (i % 3))
    cuerpo = leer(f'impactSoft_heavy_00{(i + 2) % 5}')
    return terminar(mezclar(
        (p, 1.0, 0),
        (filtro(cuerpo, 'lowpass', 900), 0.55, 0.004),
        (retumbe(95, 42, 0.09, 0.4), 0.7, 0),
        (rafaga(0.03, 0.005, (2000, 7000)), 0.25, 0),
    ), 0.48, 1.9, 0.86)


def golpe_super(i: int) -> np.ndarray:
    p1 = tono(leer(f'impactPunch_heavy_00{i}'), 0.88)
    p2 = tono(leer(f'impactPunch_medium_00{(i + 1) % 5}'), 0.95)
    cuerpo = leer(f'impactSoft_heavy_00{(i + 3) % 5}')
    seco = mezclar(
        (p1, 1.0, 0),
        (p2, 0.6, 0.012),
        (filtro(cuerpo, 'lowpass', 1000), 0.6, 0.003),
        (retumbe(80, 32, 0.16, 0.7), 0.85, 0),
        (rafaga(0.025, 0.004, (2500, 9000)), 0.45, 0),
    )
    return terminar(eco(seco, 0.35, 0.22), 0.8, 2.3, 0.9)


def bloqueo(i: int) -> np.ndarray:
    sordo = tono(leer(f'impactSoft_heavy_00{i}'), 0.97 + 0.03 * (i % 3))
    contacto = filtro(leer(f'impactPunch_medium_00{(i + 2) % 5}'), 'lowpass', 1400)
    tum = leer(f'impactSoft_medium_00{(i + 1) % 5}')
    return terminar(mezclar(
        # el roce de las mangas y el aire justo antes del contacto
        (rafaga(0.06, 0.018, (700, 2600), ataque=0.004), 0.22, 0),
        (sordo, 1.0, 0.006),
        (contacto, 0.5, 0.006),
        (tum, 0.6, 0.008),
        (retumbe(115, 55, 0.055, 0.25), 0.6, 0.006),
    ), 0.38, 1.7, 0.8)


def mp3(x: np.ndarray, destino: pathlib.Path) -> None:
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '128k', str(destino)], input=x.astype(np.float64).tobytes(), check=True)


def main() -> None:
    carpeta = SALIDA / 'golpes'
    carpeta.mkdir(parents=True, exist_ok=True)
    tipos = {'hitLight': ('debil', golpe_debil), 'hitHeavy': ('fuerte', golpe_fuerte),
             'hitSuper': ('super', golpe_super), 'block': ('bloqueo', bloqueo)}
    manifiesto = {}
    for clave, (nombre, fn) in tipos.items():
        archivos = []
        for i in range(5):
            arch = carpeta / f'{nombre}-{i + 1}.mp3'
            mp3(fn(i), arch)
            archivos.append(f'golpes/{arch.name}')
        manifiesto[clave] = archivos
        print(f'{clave}: {len(archivos)} variantes ({nombre}-1..5.mp3)')
    (SALIDA / 'sonidos.json').write_text(json.dumps(manifiesto, indent=2) + '\n', encoding='utf-8')
    print('listo:', SALIDA / 'sonidos.json')


if __name__ == '__main__':
    main()
