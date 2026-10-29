"""Música de fondo del juego: tres temas originales, sintetizados desde cero.

Nada de muestras ni modelos de IA: osciladores sin aliasing (PolyBLEP y
aditivos), FM de 2 a 4 operadores (bajo slap, bronces, campanas, piano
eléctrico), cuerdas pulsadas Karplus-Strong (guitarra de nylon y charango),
ruido filtrado para la batería y efectos hechos a mano: reverberación Freeverb
y eco estéreo a tempo por envíos, compresión lateral desde el bombo,
ecualización por pista, compresor de bus y limitador con pico real.

Las canciones están al final del archivo como diccionarios legibles (tempo,
tono, acordes por tiempo, melodías y patrones de batería de 16 pasos por
compás): se puede cambiar la música sin tocar los instrumentos. La notación
está explicada en NOTACIÓN, más abajo.

Bucle sin costura: se renderiza intro + cuerpo + cuerpo + 1 compás y se guarda
intro + segundo cuerpo + ese compás. Así el comienzo del bucle ya trae las
colas de reverberación y eco del final del cuerpo, y el salto
loopEnd → loopStart no tiene clic ni cortes. La intro termina con la misma
sección que el cuerpo, para que la entrada al bucle también sea limpia, y el
compás que sobra después de loopEnd es la continuación real: da margen a
reproductores que saltan un poco tarde o que no descuentan el retardo del MP3.

Salidas: public/musica/<id>.mp3 (44,1 kHz estéreo, 160 kbps),
public/musica/musica.json (bpm y puntos de bucle en segundos) y, para revisar
sin escuchar, arte/musica/<id>.png (espectrograma con las secciones) y
arte/musica/<id>.txt (sonoridad, picos, costura del bucle y balance por banda).

Uso: python -P -E herramientas/musica.py [titulo rene-cabana rene-plaza] [--pistas CARPETA]
     (--pistas guarda cada pista ya mezclada como wav, para revisarlas por separado)

NOTACIÓN (la unidad es la semicorchea: 16 pasos por compás de 4/4)
  Acordes  'Em . . . | C . D . |'  un símbolo por tiempo; '.' mantiene el anterior.
           Calidades: m 5 7 maj7 m7 sus2 sus4 7sus4 add9 m9 6 dim; bajo con '/': 'D/F#'.
  Notas    'E5:4 r:2 G5:2!'  nota:duración en pasos; r = silencio; '|' separa compases.
           Sufijos: ! acento, ? suave (en la guitarra rítmica: apagada con la palma),
           > liga o desliza desde la nota anterior, ^ bend (sube un tono hasta la nota).
  Bajo     como las notas, pero acepta además grados del acorde que suena:
           R (fundamental, o el bajo del acorde con '/'), 3 (tercera del acorde), 5, 8,
           b7, 7, 6, 9, 4 y A (aproximación cromática a la fundamental del acorde
           siguiente); con '-' delante, una octava abajo.
  Pasos    'X..xo.g.' un carácter por paso: X fuerte, x normal, o suave, g fantasma,
           . nada, - sostiene el golpe anterior (acordes, arpegios), 2/3/4 = redoble de
           2, 3 o 4 golpes dentro del paso (hi-hats de trap).
  Arpegio  '0.12.3..' cada dígito es la nota n del acorde (de grave a agudo) dentro del
           rango de la pista.
  Rasgueo  'D.du' d/u = rasgueo hacia abajo o hacia arriba (mayúscula: acentuado).
  Scratch  'b-b-c.t---' b = baby scratch, c = chirp, t = transformer; '-' alarga.
  Capas    en una sección, una pista es un texto, un dict
           {'p': patrón, 'en': [compases], 'excepto': [...], 'transp': semitonos,
            'vel': factor, 'cresc': (desde, hasta), 'corte': (Hz inicio, Hz fin), 'tipo': ...}
           o una lista de capas. Los patrones más cortos que la sección se repiten;
           los compases se cuentan desde 0 y -1 es el último.
"""
import json
import pathlib
import re
import subprocess
import sys
import time
import wave
import zlib

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CARPETA = RAIZ / 'public' / 'musica'
ARTE = RAIZ / 'arte' / 'musica'

SR = 44100
TAU = 2 * np.pi
COMPASES_EXTRA = 1       # continuación real que queda después de loopEnd
OBJETIVO_LUFS = -16.0    # sonoridad integrada de los tres temas
TECHO_DBTP = -1.0        # pico real máximo del mp3 ya decodificado
KBPS = 160


# ═══════════════════════════════ utilidades ═══════════════════════════════

def azar(*partes) -> np.random.Generator:
    """Generador con semilla sacada de 'partes': un evento suena igual en todas las vueltas."""
    return np.random.default_rng(zlib.crc32('|'.join(map(str, partes)).encode()))


def a_db(x) -> float:
    return float(20 * np.log10(max(float(x), 1e-12)))


def de_db(d) -> float:
    return float(10 ** (d / 20))


NOTAS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
ES_NOTA = re.compile(r'([A-G])([#b]?)(-?\d)')


def midi(nombre: str) -> int:
    """'E4' → 64, 'C#5' → 73, 'Bb3' → 58 (La4 = 69 = 440 Hz)."""
    m = ES_NOTA.fullmatch(nombre)
    if not m:
        raise ValueError(f'nota inválida: {nombre!r}')
    return 12 * (int(m[3]) + 1) + NOTAS[m[1]] + {'#': 1, 'b': -1, '': 0}[m[2]]


def hz(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


def tiempo(n: int) -> np.ndarray:
    return np.arange(n) / SR


def entrada(t: np.ndarray, ms: float = 2.0) -> np.ndarray:
    """Rampa seno² de 'ms' milisegundos: todo ataque empieza sin clic."""
    return np.sin(0.5 * np.pi * np.minimum(t / (ms / 1000), 1.0)) ** 2


def suave(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def cerrar(x: np.ndarray, ms: float = 3.0) -> np.ndarray:
    """Lleva a cero los últimos milisegundos: nada termina con un salto."""
    k = min(len(x), max(2, int(ms * SR / 1000)))
    v = np.cos(0.5 * np.pi * np.linspace(0, 1, k)) ** 2
    x[-k:] *= v if x.ndim == 1 else v[:, None]
    return x


def adsr(n, a=0.005, d=0.2, s=0.7, r=0.08, gate=None):
    """Envolvente de n muestras: ataque seno² (mínimo 2 ms), caída exponencial al
    sostenido y, desde 'gate' (muestras con la tecla apretada), relajo que llega a
    -60 dB en r segundos. Siempre termina en cero."""
    t = tiempo(n)
    a = max(a, 0.002)
    r = max(r, 0.003)
    e = np.where(t < a, np.sin(0.5 * np.pi * np.minimum(t / a, 1.0)) ** 2,
                 s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    if gate is not None and 0 <= gate < n:
        e[gate:] = e[gate] * np.exp(-6.9 * (t[gate:] - t[gate]) / r)
    return cerrar(e)


def sumar(dst: np.ndarray, src: np.ndarray, i0: int) -> None:
    """Suma src en dst desde la muestra i0 (recorta lo que queda fuera)."""
    if len(src) == 0 or i0 >= len(dst):
        return
    if i0 < 0:
        src, i0 = src[-i0:], 0
    n = min(len(src), len(dst) - i0)
    if n > 0:
        dst[i0:i0 + n] += src[:n]


def panear(x: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Mono → estéreo con potencia constante (pan -1 izquierda … 1 derecha)."""
    ang = (float(pan) + 1) * np.pi / 4
    return np.stack([x * np.cos(ang), x * np.sin(ang)], axis=1)


def equilibrar(x: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Balance de una pista que ya es estéreo."""
    if pan:
        x = x * np.array([min(1.0, 1 - pan), min(1.0, 1 + pan)])
    return x


def regiones(tramos, n_total, margen):
    """Une intervalos [a, b) cercanos (las voces monofónicas se procesan por frases)."""
    out = []
    for a, b in sorted((max(0, a - margen), min(n_total, b + margen)) for a, b in tramos):
        if b <= a:
            continue
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


# ═════════════════════════ osciladores y filtros ═════════════════════════

def _blep(t, dt):
    """Corrección PolyBLEP alrededor de cada salto (t = fase 0..1, dt = f/SR)."""
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    y[m] = x * x + x + x + 1
    return y


def sierra(fase, dt):
    """Diente de sierra sin aliasing (PolyBLEP); fase en ciclos, dt = f/SR."""
    t = np.mod(fase, 1.0)
    dt = np.broadcast_to(np.asarray(dt, dtype=float), t.shape)
    return 2 * t - 1 - _blep(t, dt)


def cuadrada(fase, dt, ancho=0.5):
    """Onda cuadrada sin aliasing (dos saltos corregidos con PolyBLEP)."""
    t = np.mod(fase, 1.0)
    dt = np.broadcast_to(np.asarray(dt, dtype=float), t.shape)
    return np.where(t < ancho, 1.0, -1.0) + _blep(t, dt) - _blep(np.mod(t - ancho, 1.0), dt)


def biquad(tipo, f, q=0.7071, g_db=0.0):
    """Filtro de 2º orden (recetario de R. Bristow-Johnson) como una fila 'sos'.
    Tipos: lp, hp, bp, pico, graves (estante bajo), agudos (estante alto)."""
    f = float(np.clip(f, 10.0, 0.45 * SR))
    w = TAU * f / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    A = 10 ** (g_db / 40)
    sA = 2 * np.sqrt(A) * al
    if tipo == 'lp':
        b, a = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2], [1 + al, -2 * cw, 1 - al]
    elif tipo == 'hp':
        b, a = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2], [1 + al, -2 * cw, 1 - al]
    elif tipo == 'bp':
        b, a = [al, 0.0, -al], [1 + al, -2 * cw, 1 - al]
    elif tipo == 'pico':
        b, a = [1 + al * A, -2 * cw, 1 - al * A], [1 + al / A, -2 * cw, 1 - al / A]
    elif tipo == 'graves':
        b = [A * ((A + 1) - (A - 1) * cw + sA), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sA)]
        a = [(A + 1) + (A - 1) * cw + sA, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sA]
    elif tipo == 'agudos':
        b = [A * ((A + 1) + (A - 1) * cw + sA), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sA)]
        a = [(A + 1) - (A - 1) * cw + sA, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sA]
    else:
        raise ValueError(f'filtro desconocido: {tipo}')
    return np.concatenate([np.array(b) / a[0], np.array(a) / a[0]])


def sos_de(filtros) -> np.ndarray:
    """[('hp', 120), ('lp4', 5000), ('pico', 2000, 3.0, 1.0), ('agudos', 8000, -2)] → sos."""
    filas = []
    for tipo, f, *resto in filtros:
        if tipo in ('lp4', 'hp4'):        # Butterworth de 4º orden
            filas += [biquad(tipo[:2], f, 0.5412), biquad(tipo[:2], f, 1.3066)]
        elif tipo in ('pico', 'graves', 'agudos'):
            filas.append(biquad(tipo, f, resto[1] if len(resto) > 1 else 0.7071, resto[0]))
        else:
            filas.append(biquad(tipo, f, resto[0] if resto else 0.7071))
    return np.array(filas)


def filtrar(x, filtros):
    if not filtros:
        return x
    return signal.sosfilt(sos_de(filtros), x, axis=0)


def ruido(rng, n, filtros=()):
    return filtrar(rng.standard_normal(n), list(filtros))


def filtro_variable(x, tipo, cortes, q=0.7071, bloque=128):
    """Filtro de 2º orden cuya frecuencia cambia por bloques (barridos y LFO)."""
    y = np.empty_like(x)
    zi = np.zeros((1, 2))
    cortes = np.broadcast_to(np.asarray(cortes, dtype=float), (len(x),))
    for i in range(0, len(x), bloque):
        y[i:i + bloque], zi = signal.sosfilt(biquad(tipo, cortes[i], q)[None, :], x[i:i + bloque], zi=zi)
    return y


def limitar_indice(f, razon, indice, techo=16000.0):
    """Baja el índice FM si las bandas laterales pasarían de 'techo' Hz (regla de Carson):
    así la FM tampoco genera aliasing en las notas agudas."""
    return np.minimum(indice, max((techo - f) / (f * razon) - 1.0, 0.0))


# ═══════════════════════════════ batería ═══════════════════════════════

def bombo(vel, rng, tono=1.0, decaimiento=0.28, clic=1.0, saturacion=2.0):
    """Bombo: seno que barre de ~380 a 150 y luego a 45 Hz, saturado, más un golpe de parche."""
    n = int((decaimiento * 5 + 0.05) * SR)
    t = tiempo(n)
    f = tono * (45 + 105 * np.exp(-t / 0.04) + 230 * np.exp(-t / 0.006))
    cuerpo = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / decaimiento)
    x = np.tanh(saturacion * cuerpo) / np.tanh(saturacion)
    golpe = ruido(rng, n, [('bp', 3200, 0.8)]) * np.exp(-t / 0.004)
    x = (x + 0.5 * clic * golpe) * entrada(t, 2)
    return cerrar(x * vel ** 1.3, 20)


def caja(vel, rng, tono=185.0, ruido_dec=0.15, cuerpo=1.0):
    """Caja: tono de ~180 Hz (con un modo inarmónico) más ruido pasabanda del bordonero."""
    n = int(0.55 * SR)
    t = tiempo(n)
    ph = np.cumsum(tono * (1 + 0.35 * np.exp(-t / 0.012))) / SR
    tonal = (np.sin(TAU * ph) + 0.45 * np.sin(TAU * 1.83 * ph)) * np.exp(-t / 0.055)
    chas = ruido(rng, n, [('hp', 1000), ('lp4', 8000), ('pico', 2600, 4.0, 1.0)]) * np.exp(-t / ruido_dec)
    x = (0.6 * cuerpo * tonal + chas) * entrada(t, 2)
    x = np.tanh(1.5 * x) / np.tanh(1.5)
    return cerrar(x * vel ** 1.2, 15)


def palmas(vel, rng):
    """Aplauso: cuatro ráfagas cortas de ruido (manos que no caen juntas) y una cola."""
    n = int(0.5 * SR)
    t = tiempo(n)
    env = np.zeros(n)
    for k, d in enumerate((0.0, 0.0105, 0.0215, 0.032)):
        tt = np.maximum(t - d, 0.0)
        env += (t >= d) * (1 - np.exp(-tt / 0.0006)) * np.exp(-tt / 0.0045) * (0.8 if k < 3 else 1.0)
    tt = np.maximum(t - 0.032, 0.0)
    env += (t >= 0.032) * (1 - np.exp(-tt / 0.002)) * 0.5 * np.exp(-tt / 0.11)
    x = ruido(rng, n, [('bp', 1250, 1.3), ('agudos', 3500, 4.0)]) * env
    return cerrar(x * vel, 10)


FRECS_METAL = (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)   # seis cuadradas del hi-hat analógico


def hat(vel, rng, abierto=False):
    """Hi-hat: ruido y cuadradas inarmónicas pasados por un pasaaltos empinado."""
    dec = 0.3 if abierto else 0.042
    n = int((dec * 6 + 0.02) * SR)
    t = tiempo(n)
    metal = sum(cuadrada(rng.random() + f * t, f / SR) for f in FRECS_METAL) / len(FRECS_METAL)
    x = filtrar(0.7 * metal + 0.5 * rng.standard_normal(n), [('hp4', 7200), ('pico', 10000, 3.0, 1.2), ('lp', 14000)])
    x *= entrada(t, 2) * np.exp(-t / dec)
    return cerrar(x * vel, 5)


def platillo(vel, rng, largo=3.2):
    """Crash estéreo: ruido largo y parciales metálicos que se apagan a distinto ritmo."""
    n = int(largo * SR)
    t = tiempo(n)
    parciales = rng.uniform(3200, 12500, 16)
    decs = rng.uniform(0.8, 2.0, 16)
    out = np.zeros((n, 2))
    for c in range(2):
        chas = ruido(rng, n, [('hp', 3500), ('lp', 13500)]) * (0.3 * np.exp(-t / 0.12) + 0.7 * np.exp(-t / 1.0))
        metal = np.zeros(n)
        for f, d in zip(parciales, decs):
            metal += np.sin(TAU * f * t + TAU * rng.random()) * np.exp(-t / d)
        out[:, c] = chas + 0.09 * metal
    out *= entrada(t, 3)[:, None]
    return cerrar(out * vel, 60)


def tom(vel, rng, f=110.0, decaimiento=0.22):
    """Tom (y bombo legüero): seno con caída de afinación y golpe de parche."""
    n = int((decaimiento * 5 + 0.05) * SR)
    t = tiempo(n)
    ph = np.cumsum(f * (1 + 0.45 * np.exp(-t / 0.035))) / SR
    x = (np.sin(TAU * ph) + 0.25 * np.sin(TAU * 1.59 * ph)) * np.exp(-t / decaimiento)
    x += ruido(rng, n, [('lp', 1800)]) * np.exp(-t / 0.015) * 0.6
    x = np.tanh(1.3 * x * entrada(t, 2)) / np.tanh(1.3)
    return cerrar(x * vel, 15)


def shaker(vel, rng):
    """Shaker: ruido agudo con un ataque blando (las semillas tardan en chocar)."""
    n = int(0.13 * SR)
    t = tiempo(n)
    x = ruido(rng, n, [('hp4', 4500), ('lp', 12000)])
    x *= entrada(t, 10) * np.exp(-np.maximum(t - 0.010, 0) / 0.03)
    return cerrar(x * vel, 5)


def aro(vel, rng, tono=1.0):
    """Golpe de aro / palo de madera: dos tonos muy cortos y un clic de ruido."""
    n = int(0.12 * SR)
    t = tiempo(n)
    x = (0.6 * np.sin(TAU * 1650 * tono * t) + 0.5 * np.sin(TAU * 520 * tono * t)) * np.exp(-t / 0.012)
    x += ruido(rng, n, [('bp', 2800 * tono, 1.2)]) * np.exp(-t / 0.006) * 0.8
    return cerrar(x * entrada(t, 2) * vel, 5)


def timbal(vel, rng, f=82.41):
    """Timbal de orquesta: modos inarmónicos del parche con una leve caída de afinación."""
    n = int(1.8 * SR)
    t = tiempo(n)
    curva = 1 + 0.03 * np.exp(-t / 0.04)
    x = np.zeros(n)
    for r, a, tau in ((1.0, 1.0, 0.9), (1.504, 0.55, 0.65), (1.742, 0.35, 0.5),
                      (2.0, 0.28, 0.45), (2.245, 0.16, 0.35), (2.494, 0.1, 0.3)):
        x += a * np.sin(TAU * np.cumsum(f * r * curva) / SR + TAU * rng.random()) * np.exp(-t / tau)
    x += ruido(rng, n, [('lp', 700)]) * np.exp(-t / 0.03) * 0.8
    return cerrar(x * entrada(t, 3) * vel, 30)


GOLPES = {'bombo': bombo, 'caja': caja, 'palmas': palmas, 'hat': hat, 'platillo': platillo,
          'tom': tom, 'shaker': shaker, 'aro': aro, 'timbal': timbal}


# ═══════════════════════ voces de instrumentos (una nota) ═══════════════════════

def voz_slap(m, gate, vel, ev):
    """Bajo slap FM 2 operadores: índice alto en el ataque (el golpe) que baja rápido."""
    f = float(hz(m))
    n = gate + int(0.06 * SR)
    t = tiempo(n)
    pop = '!' in ev.marcas
    idx = limitar_indice(f, 1.0, 0.6 + (2.5 + 4.0 * vel + 2.0 * pop) * np.exp(-t / 0.03) + 0.8 * np.exp(-t / 0.25))
    x = 0.6 * np.sin(TAU * f * t + idx * np.sin(TAU * f * t)) + 0.55 * np.sin(TAU * f * t)
    x += ruido(ev.rng, n, [('bp', 2600, 1.0)]) * np.exp(-t / 0.006) * (0.25 + 0.3 * pop)
    x *= adsr(n, 0.002, 0.28, 0.5, 0.05, gate)
    return np.tanh(1.4 * x) / np.tanh(1.4) * vel


def voz_bajo_dedo(m, gate, vel, ev):
    """Bajo eléctrico tocado con los dedos: FM suave, algo de segundo armónico y el roce."""
    f = float(hz(m))
    n = gate + int(0.08 * SR)
    t = tiempo(n)
    idx = limitar_indice(f, 1.0, 0.35 + 1.4 * vel * np.exp(-t / 0.07) + 0.35 * np.exp(-t / 0.6))
    x = 0.65 * np.sin(TAU * f * t + idx * np.sin(TAU * f * t)) + 0.5 * np.sin(TAU * f * t)
    x += 0.12 * np.sin(TAU * 2 * f * t) * np.exp(-t / 0.3)
    x += ruido(ev.rng, n, [('lp', 900)]) * np.exp(-t / 0.01) * 0.15
    x *= adsr(n, 0.003, 0.5, 0.65, 0.07, gate)
    return np.tanh(1.2 * x) / np.tanh(1.2) * vel


def voz_bronce(m, gate, vel, ev, brillo=1.0):
    """Sección de bronces FM (1:1): tres voces desafinadas, el brillo crece con el ataque."""
    f = float(hz(m))
    n = gate + int(0.16 * SR)
    t = tiempo(n)
    env = adsr(n, 0.014, 0.35, 0.72, 0.14, gate)
    out = np.zeros((n, 2))
    for c, pan in ((-6.0, -0.45), (0.0, 0.0), (7.0, 0.45)):
        fk = f * 2 ** (c / 1200) * (1 - 0.012 * np.exp(-t / 0.035))
        ph = np.cumsum(fk) / SR + ev.rng.random()
        idx = 0.3 + brillo * (1.0 + 2.2 * vel) * (1 - np.exp(-t / 0.02)) * (0.75 + 0.25 * np.exp(-t / 0.3))
        out += panear(np.sin(TAU * ph + limitar_indice(f, 1.0, idx) * np.sin(TAU * ph)), pan)
    return out * (env * vel / 3)[:, None]


def voz_campana(m, gate, vel, ev, razon=3.5, indice=2.4, caida=3.0):
    """Campana FM (como las del jingle de encendido): razón inarmónica, brillo que se apaga."""
    f = float(hz(m))
    n = int(min(2.6, 7.0 / caida) * SR)
    t = tiempo(n)
    idx = limitar_indice(f, razon, indice * vel * np.exp(-t * caida * 1.6))
    x = np.sin(TAU * f * t + idx * np.sin(TAU * f * razon * t))
    x += 0.35 * np.sin(TAU * f * t + 0.6 * np.exp(-t * caida) * np.sin(TAU * f * t))
    return cerrar(x * entrada(t, 2) * np.exp(-t * caida) * vel, 5)


def voz_epiano(m, gate, vel, ev):
    """Piano eléctrico FM: cuerpo 1:1 más el 'tine' agudo y muy corto."""
    f = float(hz(m))
    n = gate + int(0.35 * SR)
    t = tiempo(n)
    i1 = limitar_indice(f, 1.0, (0.4 + 1.5 * vel) * np.exp(-t / 0.45) + 0.25)
    r2 = min(14.0, 9000.0 / f)
    i2 = limitar_indice(f, r2, 0.9 * vel * np.exp(-t / 0.012))
    x = 0.75 * np.sin(TAU * f * t + i1 * np.sin(TAU * f * t))
    x += 0.3 * np.sin(TAU * f * t + i2 * np.sin(TAU * f * r2 * t)) * np.exp(-t / 0.25)
    return x * adsr(n, 0.003, 1.4, 0.0, 0.3, gate) * vel


def voz_marimba(m, gate, vel, ev):
    """Marimba aditiva: parciales 1 : 3,93 : 9,66 de una barra afinada y el golpe del mazo."""
    f = float(hz(m))
    tau = float(np.clip(0.55 * (261.6 / f) ** 0.6, 0.12, 1.0))
    n = int(tau * 6 * SR)
    t = tiempo(n)
    x = np.zeros(n)
    for r, a, tr in ((1.0, 1.0, 1.0), (3.93, 0.3 * vel, 0.22), (9.66, 0.1 * vel, 0.07)):
        if f * r < 16000:
            x += a * np.sin(TAU * f * r * t) * np.exp(-t / (tau * tr))
    x += ruido(ev.rng, n, [('lp', 2200)]) * np.exp(-t / 0.0025) * 0.3 * vel
    return cerrar(x * entrada(t, 2) * vel, 5)


def cuerda(f, n, rng, brillo=0.5, t60=2.5, posicion=0.15, amortiguacion=0.45):
    """Cuerda pulsada Karplus-Strong afinada con retardo fraccionario.
    y[n] = x[n] + g·(h0·y[n-L] + h1·y[n-L-1] + h2·y[n-L-2]); h = promedio que amortigua
    los agudos convolucionado con la interpolación lineal del retardo fraccionario."""
    P = SR / f
    s = amortiguacion
    L = int(np.floor(P - s))
    fr = P - s - L
    h = np.convolve([1 - s, s], [1 - fr, fr])
    g = 10 ** (-3 / (t60 * f))
    # Excitación: un período de ruido, más opaco u oscuro según 'brillo', con el
    # filtro peine de la posición donde se pulsa la cuerda.
    k = np.exp(-TAU * (1000 + 7000 * brillo) / SR)
    exc = rng.uniform(-1, 1, L)
    for _ in range(2):
        exc = signal.lfilter([1 - k], [1, -k], exc)
    d = max(1, int(round(posicion * L)))
    exc = exc - np.concatenate([np.zeros(d), exc[:-d]])
    exc -= exc.mean()
    x = np.zeros(n)
    x[:min(L, n)] = exc[:n]
    if L < 100:          # retardo corto: el filtro recursivo directo es lo más rápido
        a = np.zeros(L + 3)
        a[0] = 1.0
        a[L:L + 3] -= g * h
        return signal.lfilter([1.0], a, x)
    o = L + 2            # retardo largo: de a un período, vectorizado
    y = np.zeros(n + o)
    xp = np.concatenate([np.zeros(o), x])
    for c in range(o, o + n, L):
        e = min(c + L, o + n)
        y[c:e] = xp[c:e] + g * (h[0] * y[c - L:e - L] + h[1] * y[c - L - 1:e - L - 1] + h[2] * y[c - L - 2:e - L - 2])
    return y[o:]


def voz_nylon(m, gate, vel, ev):
    """Guitarra de nylon: cuerda Karplus-Strong cálida que sigue sonando un rato."""
    f = float(hz(m))
    t60 = float(np.clip(3.0 * (196 / f) ** 0.5, 0.9, 4.0))
    sonar = max(gate, int(0.8 * SR))
    n = sonar + int(0.12 * SR)
    x = cuerda(f, n, ev.rng, brillo=0.15 + 0.3 * vel, t60=t60, posicion=0.17, amortiguacion=0.45)
    env = entrada(tiempo(n), 2)
    env[sonar:] *= np.exp(-6.9 * tiempo(n - sonar) / 0.12)
    return cerrar(x * env * vel, 3)


def voz_charango(m, gate, vel, ev):
    """Charango: un orden de dos cuerdas apenas desafinadas, brillante y de caída corta."""
    f = float(hz(m))
    t60 = float(np.clip(1.5 * (440 / f) ** 0.4, 0.6, 2.0))
    sonar = max(gate, int(0.3 * SR))
    n = sonar + int(0.05 * SR)
    x = np.zeros(n)
    for c in (-4.0, 4.0):
        x += cuerda(f * 2 ** (c / 1200), n, ev.rng, brillo=0.6 + 0.35 * vel, t60=t60, posicion=0.11, amortiguacion=0.3)
    env = entrada(tiempo(n), 2)
    env[sonar:] *= np.exp(-6.9 * tiempo(n - sonar) / 0.05)
    return cerrar(x * env * vel * 0.5, 3)


def voz_pluck(m, gate, vel, ev, corte0=7000.0, corte1=700.0, t_corte=0.11, decaimiento=0.45):
    """Pluck de sintetizador aditivo: sierra limitada en banda cuyo 'filtro' se cierra
    rápido (cada armónico pesa según un pasabajos de 2º orden que baja de 7 kHz a 700 Hz).
    Dos voces desafinadas a los lados."""
    f = float(hz(m))
    n = int(0.95 * SR)
    t = tiempo(n)
    K = int(max(1, min(32, 15000 // f)))
    k = np.arange(1, K + 1)[:, None]
    fc = corte1 + corte0 * vel * np.exp(-t / t_corte)
    g = 1.0 / np.sqrt(1.0 + (k * f / fc[None, :]) ** 4) / k
    env = entrada(t, 2) * np.exp(-t / decaimiento)
    fin = min(n, gate + int(0.15 * SR))
    env[fin:] *= np.exp(-6.9 * tiempo(n - fin) / 0.08)
    out = np.zeros((n, 2))
    for c, pan in ((-7.0, -0.35), (7.0, 0.35)):
        fk = f * 2 ** (c / 1200)
        x = np.sum(g * np.sin(TAU * (k * fk * t[None, :] + ev.rng.random((K, 1)))), axis=0)
        out += panear(x * env, pan)
    return cerrar(out * vel * 0.7, 3)


def inst_poli(voz, estereo=False):
    """Instrumento polifónico: cada nota de cada evento se sintetiza por separado."""
    def render(ctx, eventos, n_total, **op):
        out = np.zeros((n_total, 2) if estereo else n_total)
        for ev in eventos:
            for m in ev.notas:
                sumar(out, voz(m, ev.n, ev.vel, ev, **op), ev.i0)
        return out
    return render


def inst_golpe(pieza, estereo=False):
    def render(ctx, eventos, n_total, **op):
        fn = GOLPES[pieza]
        out = np.zeros((n_total, 2) if estereo else n_total)
        for ev in eventos:
            sumar(out, fn(ev.vel, ev.rng, **op), ev.i0)
        return out
    return render


# ═══════════════════════ instrumentos de pista completa ═══════════════════════

def inst_supersaw(ctx, eventos, n_total, voces=7, desafine=22.0, ataque=0.02, decaimiento=0.6,
                  sostenido=0.85, liberacion=0.35):
    """Supersaw: varias sierras desafinadas por nota, repartidas en el estéreo."""
    out = np.zeros((n_total, 2))
    for ev in eventos:
        n = ev.n + int(liberacion * SR)
        t = tiempo(n)
        acc = np.zeros((n, 2))
        rng = ev.rng
        for m in ev.notas:
            f = float(hz(m))
            for k in range(voces):
                x = 2 * k / (voces - 1) - 1 if voces > 1 else 0.0
                fk = f * 2 ** ((desafine * x + rng.normal(0, 1.5)) / 1200)
                s = sierra(rng.random() + fk * t, fk / SR)
                acc += panear(s * (1.3 if k == voces // 2 else 1.0), 0.85 * x * (1 if k % 2 else -1))
        env = adsr(n, ataque, decaimiento, sostenido, liberacion, ev.n) * ev.vel
        sumar(out, acc * (env / (voces * np.sqrt(len(ev.notas))))[:, None], ev.i0)
    return out


def inst_orquesta(ctx, eventos, n_total):
    """Golpe de orquesta: bronces FM + cuerdas en sierra + un 'bum' grave y el chasquido."""
    out = np.zeros((n_total, 2))
    for ev in eventos:
        rng = ev.rng
        n = int(1.9 * SR)
        t = tiempo(n)
        acc = np.zeros((n, 2))
        env_c = entrada(t, 4) * (0.75 * np.exp(-t / 0.22) + 0.25 * np.exp(-t / 0.9))
        for m in ev.notas:
            sumar(acc, 0.8 * voz_bronce(m, int(0.2 * SR), 1.0, ev, brillo=1.4), 0)
            f = float(hz(m))
            for c, pan in ((-10.0, -0.7), (0.0, 0.0), (10.0, 0.7)):
                fk = f * 2 ** (c / 1200)
                acc += panear(0.45 * sierra(rng.random() + fk * t, fk / SR) * env_c, pan)
        fr = hz(min(ev.notas) - 12) * (1 + 0.6 * np.exp(-t / 0.04))
        bum = np.sin(TAU * np.cumsum(fr) / SR) * np.exp(-t / 0.5)
        chas = ruido(rng, n, [('bp', 1800, 0.7)]) * np.exp(-t / 0.05)
        acc += panear((1.6 * bum + 0.9 * chas) * entrada(t, 2), 0.0)
        acc = filtrar(acc, [('lp', 9000)])
        sumar(out, cerrar(acc * ev.vel / np.sqrt(len(ev.notas)), 30), ev.i0)
    return out


def inst_charango(ctx, eventos, n_total):
    """Charango: notas sueltas o rasgueos ('d' baja de grave a agudo, 'u' sube, más suave)."""
    out = np.zeros(n_total)
    for ev in eventos:
        notas = sorted(ev.notas)
        sentido = ev.info.get('dir')
        vel = ev.vel
        paso = 0.0
        if sentido == 'u':
            notas, paso, vel = notas[::-1][:4], 0.007, vel * 0.8
        elif sentido == 'd':
            paso = 0.010
        for k, m in enumerate(notas):
            x = voz_charango(m, ev.n, vel * (0.9 + 0.15 * ev.rng.random()), ev)
            sumar(out, x, ev.i0 + int(k * paso * SR))
    return out


def curvas_mono(eventos, n_total, *, glide=0.04, auto_legato=True, ataque=0.005, decaimiento=0.6,
                sostenido=0.85, liberacion=0.08, scoop=0.0, t_scoop=0.05, caida_tono=0.0, t_caida=0.01,
                vib=0.0, vib_retardo=0.2, bend_t=0.09):
    """Curvas de una voz monofónica: altura (semitonos MIDI), amplitud, profundidad de
    vibrato y ataques [(i0, vel, ligada, evento)]. Las notas pegadas (si auto_legato) o
    marcadas con '>' se ligan con portamento y '^' hace un bend de un tono. Cada nota
    arranca desde la amplitud que ya había, así que nunca hay saltos."""
    altura = np.full(n_total, np.nan)
    amp = np.zeros(n_total)
    prof = np.zeros(n_total)
    ataques = []
    prev = None
    for ev in sorted(eventos, key=lambda e: e.i0):
        i0 = ev.i0
        if i0 >= n_total:
            break
        i1 = min(i0 + ev.n, n_total)
        m = float(ev.notas[0])
        t = tiempo(i1 - i0)
        ligada = prev is not None and (
            '>' in ev.marcas or (auto_legato and i0 - prev[1] <= int(0.012 * SR) and m != prev[0]))
        if ligada:
            altura[i0:i1] = m + (prev[0] - m) * np.exp(-t / glide)
        elif '^' in ev.marcas:
            altura[i0:i1] = m - 2.0 * (1 - suave(t / bend_t))
        else:
            altura[i0:i1] = m - scoop * np.exp(-t / t_scoop) + caida_tono * np.exp(-t / t_caida)
        prof[i0:i1] = vib * np.clip((t - vib_retardo) / 0.3, 0.0, 1.0)
        j1 = min(i1 + int(liberacion * SR), n_total)
        tt = tiempo(j1 - i0)
        a0 = amp[i0]
        sost = sostenido * ev.vel
        if ligada:
            env = sost + (a0 - sost) * np.exp(-tt / decaimiento)
        else:
            env = np.where(tt < ataque, a0 + (ev.vel - a0) * entrada(tt, ataque * 1000),
                           sost + (ev.vel - sost) * np.exp(-np.maximum(tt - ataque, 0) / decaimiento))
        k = i1 - i0
        if k < len(env):
            nivel = env[k - 1] if k > 0 else a0
            env[k:] = nivel * np.exp(-6.9 * (tt[k:] - tt[k]) / liberacion)
        amp[i0:j1] = env
        ataques.append((i0, ev.vel, ligada, ev))
        prev = (m, i1)
    validos = ~np.isnan(altura)
    if not validos.any():
        return None
    idx = np.where(validos, np.arange(n_total), 0)
    np.maximum.accumulate(idx, out=idx)
    altura = altura[idx]
    altura[:np.argmax(validos)] = altura[np.argmax(validos)]
    return altura, amp, prof, ataques


def amplificador(x, ganancia=8.0):
    """Distorsión de guitarra: ecualización previa, tanh sobremuestreada ×4 (sin aliasing)
    y caja de parlante (graves firmes, medios ahuecados, presencia y corte a 5 kHz)."""
    x = filtrar(x, [('hp', 110), ('pico', 800, 5.0, 0.7), ('lp', 6000)])
    up = signal.resample_poly(x, 4, 1)
    y = np.tanh(ganancia * up + 0.2) - np.tanh(0.2)
    y = signal.resample_poly(y, 1, 4)[:len(x)]
    return filtrar(y, [('hp', 85), ('pico', 110, 2.5, 1.0), ('pico', 450, -3.5, 0.9),
                       ('pico', 1800, 3.0, 1.1), ('lp4', 5000), ('lp', 7500)])


def inst_guitarra_lider(ctx, eventos, n_total, ganancia=7.0):
    """Guitarra solista: dos sierras, vibrato tardío, bends, púa en cada ataque y amplificador."""
    out = np.zeros(n_total)
    c = curvas_mono(eventos, n_total, glide=0.03, auto_legato=False, ataque=0.004, decaimiento=1.5,
                    sostenido=0.8, liberacion=0.12, vib=0.3, vib_retardo=0.2, bend_t=0.1)
    if c is None:
        return out
    altura, amp, prof, ataques = c
    k = int(0.012 * SR)
    for a, b in regiones([(e.i0, e.i0 + e.n + int(0.15 * SR)) for e in eventos], n_total, int(0.05 * SR)):
        t = tiempo(b - a)                      # el vibrato se mide desde el comienzo de la frase
        f = hz(altura[a:b] + prof[a:b] * np.sin(TAU * 5.6 * t))
        ph = np.cumsum(f) / SR
        x = (sierra(ph, f / SR) + 0.8 * sierra(1.004 * ph + 0.37, 1.004 * f / SR)) * amp[a:b]
        for i0, vel, ligada, ev in ataques:
            if a <= i0 < b and not ligada:
                pua = ruido(ev.rng, k, [('hp', 2500)]) * np.exp(-tiempo(k) / 0.003) * entrada(tiempo(k), 2)
                sumar(x, 0.3 * vel * pua, i0 - a)
        out[a:b] += amplificador(x, ganancia)
    return out


def inst_guitarra_power(ctx, eventos, n_total, ganancia=11.0):
    """Guitarra rítmica: quintas (fundamental, quinta, octava) en sierras, grabada dos veces
    (izquierda y derecha, con otra afinación y 11 ms de diferencia). '?' = apagada con la palma."""
    out = np.zeros((n_total, 2))
    for lado, pan, det, retardo in ((0, -0.85, -4.0, 0), (1, 0.85, 5.0, int(0.011 * SR))):
        limpio = np.zeros(n_total)
        tramos = []
        for ev in eventos:
            rng = azar(ev.semilla, lado)
            palma = '?' in ev.marcas
            rel = 0.04 if palma else 0.12
            n = ev.n + int(rel * SR)
            t = tiempo(n)
            x = np.zeros(n)
            for iv in (0, 7, 12):
                f = float(hz(ev.notas[0] + iv)) * 2 ** (det / 1200)
                for d2 in (-4.0, 4.0):
                    fk = f * 2 ** (d2 / 1200)
                    x += sierra(rng.random() + fk * t, fk / SR)
            x *= adsr(n, 0.003, 0.09 if palma else 0.8, 0.0 if palma else 0.7, rel, ev.n) * ev.vel
            if palma:
                x = filtrar(x, [('lp', 900)])
            sumar(limpio, x, ev.i0 + retardo)
            tramos.append((ev.i0 + retardo, ev.i0 + retardo + n))
        for a, b in regiones(tramos, n_total, int(0.05 * SR)):
            out[a:b] += panear(amplificador(limpio[a:b], ganancia), pan)
    return out


def inst_quena(ctx, eventos, n_total):
    """Quena: tono casi senoidal con soplo, 'chiff' al atacar, notas ligadas, vibrato tardío
    (con su leve trémolo) y una entrada desde abajo en cada nota atacada."""
    out = np.zeros(n_total)
    c = curvas_mono(eventos, n_total, glide=0.045, auto_legato=True, ataque=0.035, decaimiento=0.5,
                    sostenido=0.85, liberacion=0.15, scoop=0.4, t_scoop=0.05, vib=0.22, vib_retardo=0.25)
    if c is None:
        return out
    altura, amp, prof, ataques = c
    k = int(0.04 * SR)
    for a, b in regiones([(e.i0, e.i0 + e.n + int(0.2 * SR)) for e in eventos], n_total, int(0.05 * SR)):
        t = tiempo(b - a)
        lfo = np.sin(TAU * 5.1 * t)
        f = hz(altura[a:b] + prof[a:b] * lfo)
        ph = np.cumsum(f) / SR
        tono = (np.sin(TAU * ph) + 0.30 * np.sin(2 * TAU * ph + 0.5) + 0.12 * np.sin(3 * TAU * ph + 1.3)
                + 0.05 * np.sin(4 * TAU * ph + 2.1))
        primero = min((e for e in eventos if a <= e.i0 < b), key=lambda e: e.i0)
        soplo = ruido(azar(primero.semilla, 'soplo'), b - a, [('hp', 1400), ('lp', 6500)])
        x = (0.8 * tono + 0.18 * soplo) * amp[a:b] * (1 + 0.25 * prof[a:b] * lfo)
        for i0, vel, ligada, ev in ataques:
            if a <= i0 < b and not ligada:
                chiff = ruido(ev.rng, k, [('bp', 2800, 1.2)]) * np.exp(-tiempo(k) / 0.012) * entrada(tiempo(k), 3)
                sumar(x, 0.3 * vel * chiff, i0 - a)
        out[a:b] += x
    return out


def inst_808(ctx, eventos, n_total, saturacion=2.2):
    """Bajo 808: seno largo con golpe de afinación al atacar, deslizamientos ('>') y saturación."""
    out = np.zeros(n_total)
    c = curvas_mono(eventos, n_total, glide=0.05, auto_legato=False, ataque=0.002, decaimiento=1.0,
                    sostenido=0.0, liberacion=0.06, caida_tono=5.0, t_caida=0.014)
    if c is None:
        return out
    altura, amp, _, _ = c
    for a, b in regiones([(e.i0, e.i0 + e.n + int(0.1 * SR)) for e in eventos], n_total, int(0.05 * SR)):
        f = hz(altura[a:b])
        x = np.sin(TAU * np.cumsum(f) / SR) * amp[a:b]
        out[a:b] += np.tanh(saturacion * (x + 0.18 * x * x)) / np.tanh(saturacion)
    return filtrar(out, [('hp', 25)])


_FUENTE_SCRATCH = None


def fuente_scratch():
    """El 'disco' que se rasca: un acorde de La menor de sierras con formantes de 'aah'."""
    global _FUENTE_SCRATCH
    if _FUENTE_SCRATCH is None:
        rng = azar('fuente del scratch')
        n = int(0.9 * SR)
        t = tiempo(n)
        x = np.zeros(n)
        for m in (57, 60, 64, 69):
            f = float(hz(m))
            x += sierra(rng.random() + f * t + 0.004 * np.sin(TAU * 5 * t), f / SR)
        x = sum(g * filtrar(x, [('bp', fc, q)]) for fc, q, g in ((800, 5, 1.0), (1200, 6, 0.6), (2600, 8, 0.3)))
        x = filtrar(x, [('lp', 5000)]) * entrada(t, 5)
        _FUENTE_SCRATCH = cerrar(x / np.abs(x).max(), 50)
    return _FUENTE_SCRATCH


def inst_scratch(ctx, eventos, n_total):
    """Scratch de vinilo: se lee la fuente con una posición que va y vuelve (la mano en el
    disco), con roce de aguja y el crossfader: 'b' abierto, 'c' cierra a la vuelta,
    't' corta en tresillos."""
    fuente = fuente_scratch()
    idx = np.arange(len(fuente))
    out = np.zeros(n_total)
    for ev in eventos:
        n = ev.n
        t = tiempo(n)
        T = n / SR
        A = min(0.22, 0.6 * T)
        pos = 0.03 + A * np.sin(np.pi * t / T)
        tipo = ev.info.get('tipo', 'b')
        if tipo == 'c':
            gate = 1 - suave((t - 0.45 * T) / (0.1 * T))
        elif tipo == 't':
            gate = uniform_filter1d(((t // (T / 6)) % 2 == 0).astype(float), int(0.002 * SR) + 1)
        else:
            gate = np.ones(n)
        y = np.interp(pos * SR, idx, fuente)
        velocidad = np.abs(np.gradient(pos)) * SR
        roce = ruido(ev.rng, n, [('bp', 1500, 0.8)]) * 0.08 * velocidad
        x = (y + roce) * gate * entrada(t, 2)
        sumar(out, cerrar(x, 2) * ev.vel, ev.i0)
    out = filtrar(out, [('hp', 250), ('lp', 7000)])
    return np.tanh(1.5 * out) / np.tanh(1.5)


def inst_hey(ctx, eventos, n_total, voces=7):
    """'¡Hey!' de público hecho con síntesis de formantes: varias voces desafinadas que
    pasan de /e/ a /i/ con la altura cayendo. Es un golpe de sintetizador, no una voz."""
    out = np.zeros((n_total, 2))
    sos_e = [sos_de([('bp', f, q)]) for f, q in ((530, 7), (1850, 9), (2500, 10))]
    sos_i = [sos_de([('bp', f, q)]) for f, q in ((380, 7), (2150, 9), (2750, 10))]
    pesos = (1.0, 0.55, 0.35)
    n = int(0.42 * SR)
    t = tiempo(n)
    w = np.clip((t - 0.12) / 0.15, 0, 1)
    env = entrada(t, 12) * np.where(t < 0.18, 1.0, np.exp(-(t - 0.18) / 0.07))
    h = np.exp(-t / 0.03)
    for ev in eventos:
        rng = ev.rng
        grupo = np.zeros((n + int(0.03 * SR), 2))
        for _ in range(voces):
            f0 = rng.uniform(165, 290) * 2 ** ((np.minimum(t / 0.06, 1) - 4 * np.clip((t - 0.08) / 0.25, 0, 1)) / 12)
            exc = sierra(rng.random() + np.cumsum(f0) / SR, f0 / SR) * (1 - 0.7 * h)
            exc += rng.standard_normal(n) * (0.25 + 0.8 * h) * 0.3
            e = sum(p * signal.sosfilt(s, exc) for p, s in zip(pesos, sos_e))
            i = sum(p * signal.sosfilt(s, exc) for p, s in zip(pesos, sos_i))
            sumar(grupo, panear((e * (1 - w) + i * w) * env, rng.uniform(-0.7, 0.7)), int(rng.uniform(0, 0.025) * SR))
        grupo = filtrar(grupo, [('hp', 150), ('pico', 3000, 3.0)])
        sumar(out, cerrar(grupo, 5) * ev.vel / np.sqrt(voces), ev.i0)
    return out


def inst_riser(ctx, eventos, n_total):
    """Subida: ruido estéreo por un pasabanda que sube de 250 Hz a 9 kHz y crece.
    Cada evento cubre un tramo ('desde'..'hasta'); los tramos se funden entre secciones."""
    out = np.zeros((n_total, 2))
    for ev in eventos:
        n = ev.n + int(0.01 * SR)
        prog = np.clip(np.linspace(ev.info['desde'], ev.info['hasta'], ev.n, endpoint=False), 0, 1)
        prog = np.concatenate([prog, np.full(n - ev.n, prog[-1])])
        fc = 250 * (9000 / 250) ** prog
        acc = np.zeros((n, 2))
        for c in range(2):
            acc[:, c] = filtro_variable(ev.rng.standard_normal(n), 'bp', fc, 1.2) * prog ** 2.5
        acc += (0.2 * np.sin(TAU * np.cumsum(120 * (1000 / 120) ** prog) / SR) * prog ** 3)[:, None]
        acc[:int(0.01 * SR)] *= entrada(tiempo(int(0.01 * SR)), 10)[:, None]
        sumar(out, cerrar(acc, 10) * ev.vel, ev.i0)
    return out


def inst_reverso(ctx, eventos, n_total):
    """Platillo al revés que crece hasta el tiempo fuerte siguiente."""
    out = np.zeros((n_total, 2))
    for ev in eventos:
        c = platillo(1.0, ev.rng, largo=ev.n / SR + 0.3)[:ev.n][::-1].copy()
        k = int(0.03 * SR)
        c[:k] *= entrada(tiempo(k), 30)[:, None]
        sumar(out, cerrar(c, 4) * ev.vel, ev.i0)
    return out


def inst_vinilo(ctx, eventos, n_total):
    """Ambiente de disco: siseo suave y crujidos al azar (cada sección se funde con la siguiente)."""
    out = np.zeros((n_total, 2))
    for ev in eventos:
        n = ev.n + int(0.02 * SR)
        rng = ev.rng
        siseo = filtrar(rng.standard_normal((n, 2)), [('hp', 800), ('lp', 6000)]) * 0.25
        k = rng.poisson(7 * n / SR)
        imp = np.zeros((n, 2))
        imp[rng.integers(0, n, k), rng.integers(0, 2, k)] = rng.exponential(1.0, k) * rng.choice([-1.0, 1.0], k)
        x = siseo + 1.5 * filtrar(imp, [('hp', 1500), ('lp', 9000)])
        x[:int(0.02 * SR)] *= entrada(tiempo(int(0.02 * SR)), 20)[:, None]
        sumar(out, cerrar(x, 20) * ev.vel, ev.i0)
    return out


INSTRUMENTOS = {
    'bombo': inst_golpe('bombo'), 'caja': inst_golpe('caja'), 'palmas': inst_golpe('palmas'),
    'hat': inst_golpe('hat'), 'platillo': inst_golpe('platillo', True), 'tom': inst_golpe('tom'),
    'shaker': inst_golpe('shaker'), 'aro': inst_golpe('aro'), 'timbal': inst_golpe('timbal'),
    'bajo_slap': inst_poli(voz_slap), 'bajo_dedo': inst_poli(voz_bajo_dedo),
    'bronce': inst_poli(voz_bronce, True), 'campana': inst_poli(voz_campana),
    'epiano': inst_poli(voz_epiano), 'marimba': inst_poli(voz_marimba), 'nylon': inst_poli(voz_nylon),
    'pluck': inst_poli(voz_pluck, True), 'supersaw': inst_supersaw, 'orquesta': inst_orquesta,
    'charango': inst_charango, 'guitarra_lider': inst_guitarra_lider,
    'guitarra_power': inst_guitarra_power, 'quena': inst_quena, '808': inst_808,
    'scratch': inst_scratch, 'hey': inst_hey, 'riser': inst_riser, 'reverso': inst_reverso,
    'vinilo': inst_vinilo,
}


# ═══════════════════════════════ secuenciador ═══════════════════════════════

CALIDADES = {'': (0, 4, 7), 'm': (0, 3, 7), '5': (0, 7), '7': (0, 4, 7, 10), 'maj7': (0, 4, 7, 11),
             'm7': (0, 3, 7, 10), 'sus2': (0, 2, 7), 'sus4': (0, 5, 7), '7sus4': (0, 5, 7, 10),
             'add9': (0, 4, 7, 14), 'madd9': (0, 3, 7, 14), 'm9': (0, 3, 7, 10, 14), '9': (0, 4, 7, 10, 14),
             '6': (0, 4, 7, 9), 'm6': (0, 3, 7, 9), 'dim': (0, 3, 6), 'aug': (0, 4, 8), 'maj9': (0, 4, 7, 11, 14)}
GRADOS = {'R': 0, '1': 0, '2': 2, 'b3': 3, '4': 5, 'b5': 6, '#5': 8, '6': 9, 'b7': 10, '7': 11, '8': 12, '9': 14}
VEL_PASO = {'X': 1.0, 'x': 0.8, 'o': 0.55, 'g': 0.3}
TOKEN = re.compile(r'(?P<alt>[^:\s]+):(?P<dur>\d+(?:\.\d+)?)(?P<marcas>[!?>^]*)')


def acorde(simbolo):
    m = re.fullmatch(r'([A-G][#b]?)([^/]*)(?:/([A-G][#b]?))?', simbolo)
    if not m or m[2] not in CALIDADES:
        raise ValueError(f'acorde inválido: {simbolo!r}')
    ints = CALIDADES[m[2]]
    raiz = midi(m[1] + '4') % 12
    tercera = next((i for i in (3, 4, 5, 2) if i in ints), 4)
    quinta = 7 if 7 in ints else 6 if 6 in ints else 8 if 8 in ints else 7
    return {'simbolo': simbolo, 'raiz': raiz, 'intervalos': ints, 'tercera': tercera, 'quinta': quinta,
            'bajo': midi(m[3] + '4') % 12 if m[3] else raiz}


def parsear_acordes(texto, compases, previo=None):
    """'Em . . . | C . D .' → una entrada por tiempo, repetida hasta cubrir la sección."""
    tokens = texto.replace('|', ' ').split()
    if not tokens:
        return [previo] * (4 * compases)
    if len(tokens) % 4:
        raise ValueError(f'los acordes van por tiempos (4 por compás): {texto!r}')
    tiempos, actual = [], previo
    for tok in tokens:
        if tok != '.':
            actual = acorde(tok)
        tiempos.append(actual)
    return [tiempos[i % len(tiempos)] for i in range(4 * compases)]


def voicing(ac, rango, voces=None, modo=None, con_bajo=None):
    """Notas del acorde dentro del rango (las 'voces' más agudas: así la voz de arriba se
    mueve poco). modo 'raiz' = solo la fundamental; con_bajo = agrega el bajo abajo."""
    lo, hi = midi(rango[0]), midi(rango[1])
    if modo == 'raiz':
        return [lo + (ac['bajo'] - lo) % 12]
    pcs = {(ac['raiz'] + i) % 12 for i in ac['intervalos']}
    notas = [m for m in range(lo, hi + 1) if m % 12 in pcs]
    if voces:
        notas = notas[-voces:]
    if con_bajo:
        g = midi(con_bajo)
        b = g + (ac['bajo'] - g) % 12
        notas = [b] + [m for m in notas if m > b]
    return notas


def grado(tok, ac, siguiente, grave):
    """Grado del bajo ('R', '5', 'b7', 'A'…) → nota MIDI, a partir de la nota 'grave'."""
    abajo = tok.startswith('-')
    t = tok[1:] if abajo else tok
    if ac is None:
        raise ValueError(f'el grado {tok!r} necesita acordes en la sección')
    R = grave + (ac['bajo'] - grave) % 12
    if t in ('A', 'A+'):
        s = siguiente or ac
        Rs = grave + (s['bajo'] - grave) % 12
        p = Rs - 1 if t == 'A' else Rs + 1
        if p < grave - 2:
            p += 12
    elif t in ('R', '1'):
        p = R
    elif t == '8':
        p = R + 12
    else:
        if t == '3':
            iv = ac['tercera']
        elif t == '5':
            iv = ac['quinta']
        elif t in GRADOS:
            iv = GRADOS[t]
        else:
            raise ValueError(f'grado desconocido: {tok!r}')
        p = R + (ac['raiz'] - ac['bajo']) % 12 + iv
        if ac['raiz'] != ac['bajo'] and iv < 12:
            p = R + (p - R) % 12             # acorde con bajo: dentro de la octava sobre el bajo
    return p - 12 if abajo else p


def parsear_notas(texto):
    """'E5:4 r:2 G5:2!' → [(paso, duración, altura, vel, marcas)], largo total en pasos."""
    out, paso = [], 0.0
    for tok in texto.split():
        if tok == '|':
            if abs(paso / 16 - round(paso / 16)) > 1e-9:
                raise ValueError(f'"|" a mitad de compás (paso {paso:g}) en {texto[:70]!r}…')
            continue
        m = TOKEN.fullmatch(tok)
        if not m:
            raise ValueError(f'token inválido {tok!r} en {texto[:70]!r}…')
        dur = float(m['dur'])
        if m['alt'] != 'r':
            marcas = m['marcas']
            out.append((paso, dur, m['alt'], 1.0 if '!' in marcas else 0.55 if '?' in marcas else 0.8, marcas))
        paso += dur
    return out, paso


def parsear_pasos(texto):
    partes = [p.replace(' ', '') for p in texto.split('|')]
    partes = [p for p in partes if p]
    for p in partes[:-1]:             # solo el último compás puede quedar corto (se completa)
        if len(p) != 16:
            raise ValueError(f'compás de {len(p)} pasos (deben ser 16) en {texto!r}')
    s = ''.join(partes)
    return s + '.' * (-len(s) % 16)


def capas_de(sec, pista):
    v = sec.get(pista, sec.get('bateria', {}).get(pista))
    if v is None:
        return []
    return [c if isinstance(c, dict) else {'p': c} for c in (v if isinstance(v, list) else [v])]


def compas_ok(capa, k, total):
    if 'en' in capa and k not in {i % total for i in capa['en']}:
        return False
    return not ('excepto' in capa and k in {i % total for i in capa['excepto']})


def pasos_seccion(capa, total):
    """Patrón de pasos repetido hasta cubrir la sección, con los compases filtrados."""
    s = parsear_pasos(capa['p'])
    pasos = 16 * total
    s = (s * (pasos // len(s) + 1))[:pasos]
    if 'en' in capa or 'excepto' in capa:
        s = ''.join(s[16 * k:16 * k + 16] if compas_ok(capa, k, total) else '.' * 16 for k in range(total))
    return s


class Contexto:
    """Tempo y grilla: un compás debe medir un número entero de muestras (bucle exacto)."""

    def __init__(self, cancion):
        self.bpm = float(cancion['bpm'])
        self.paso_m = SR * 60.0 / self.bpm / 4
        self.compas = int(round(16 * self.paso_m))
        if abs(16 * self.paso_m - self.compas) > 1e-6:
            raise ValueError(f'a {self.bpm:g} bpm el compás no mide un número entero de muestras')
        self.negra = 60.0 / self.bpm
        self.bloque = next(b for b in range(128, 15, -1) if self.compas % b == 0)

    def muestra(self, paso, swing=0.0):
        base = paso * self.paso_m
        e = int(np.floor(paso + 1e-9))
        if swing and e % 2 == 1 and abs(paso - e) < 1e-9:
            base += swing * self.paso_m        # swing: las semicorcheas impares se atrasan
        return int(round(base))


class Evento:
    __slots__ = ('i0', 'n', 'notas', 'vel', 'marcas', 'semilla', 'info', '_rng')

    def __init__(self, i0, n, notas, vel, marcas, semilla, info):
        self.i0, self.n, self.notas, self.vel = i0, n, notas, vel
        self.marcas, self.semilla, self.info, self._rng = marcas, semilla, info, None

    @property
    def rng(self):
        if self._rng is None:
            self._rng = azar(self.semilla)
        return self._rng


def linea_de_tiempo(cancion):
    """Secciones en el orden del render: intro, cuerpo, cuerpo y el comienzo de un tercero."""
    secs = cancion['secciones']
    linea, c = [], 0
    for nombre in cancion['intro']:
        linea.append((nombre, c))
        c += secs[nombre]['compases']
    c_intro = c
    for _ in range(2):
        for nombre in cancion['cuerpo']:
            linea.append((nombre, c))
            c += secs[nombre]['compases']
    c_cuerpo = (c - c_intro) // 2
    resto = COMPASES_EXTRA
    for nombre in cancion['cuerpo']:
        if resto <= 0:
            break
        linea.append((nombre, c))
        c += secs[nombre]['compases']
        resto -= secs[nombre]['compases']
    return linea, c_intro, c_cuerpo


def acordes_globales(cancion, linea):
    tiempos = []
    for nombre, _ in linea:
        sec = cancion['secciones'][nombre]
        tiempos += parsear_acordes(sec.get('acordes', ''), sec['compases'], tiempos[-1] if tiempos else None)
    return tiempos


def eventos_de_pista(cancion, nombre, cfg, linea, ctx, acordes, n_total):
    """Convierte los patrones de una pista en eventos con posición en muestras."""
    def acorde_en(paso_global):
        return acordes[min(max(int(paso_global // 4), 0), len(acordes) - 1)]

    tipo_pista = cfg.get('tipo', 'notas')
    eventos = []
    for sec_nombre, compas0 in linea:
        sec = cancion['secciones'][sec_nombre]
        total = sec['compases']
        pasos = 16 * total
        base = 16 * compas0
        swing = sec.get('swing', cancion.get('swing', 0.0))
        for ci, capa in enumerate(capas_de(sec, nombre)):
            op = {**cfg, **capa}
            tipo = capa.get('tipo', tipo_pista)
            transp = capa.get('transp', 0)
            crudos = []
            if tipo in ('notas', 'mono', 'bajo'):
                lista, largo = parsear_notas(capa['p'])
                grave = midi(op.get('grave', 'E1'))
                rep = 0
                while largo > 0 and rep * largo < pasos:
                    for p, d, alt, vel, marcas in lista:
                        p += rep * largo
                        if p >= pasos:
                            break
                        if not compas_ok(capa, int(p // 16), total):
                            continue
                        d = min(d, pasos - p)
                        if ES_NOTA.fullmatch(alt):
                            m = midi(alt)
                        elif tipo == 'bajo':
                            m = grado(alt, acorde_en(base + p), acorde_en(base + p + d), grave)
                        else:
                            raise ValueError(f'{nombre}/{sec_nombre}: {alt!r} no es una nota')
                        crudos.append((p, d, [m + transp], vel, marcas, {}))
                    rep += 1
            else:
                s = pasos_seccion(capa, total)
                if tipo == 'golpe':
                    for i, c in enumerate(s):
                        if c in VEL_PASO:
                            crudos.append((i, 1, [], VEL_PASO[c], '', {}))
                        elif c in '234':
                            k = int(c)
                            for j in range(k):
                                crudos.append((i + j / k, 1 / k, [], 0.6 + 0.15 * j / (k - 1), '', {}))
                elif tipo in ('acordes', 'arpegio', 'scratch'):
                    i = 0
                    while i < len(s):
                        c = s[i]
                        j = i + 1
                        while j < len(s) and s[j] == '-':
                            j += 1
                        if tipo == 'acordes' and c in VEL_PASO:
                            a = i
                            while a < j:            # un golpe sostenido se parte donde cambia el acorde
                                ac = acorde_en(base + a)
                                b = a + 1
                                while b < j and acorde_en(base + b) is ac:
                                    b += 1
                                notas = [x + transp for x in voicing(ac, op['rango'], op.get('voces'), op.get('modo'), op.get('con_bajo'))]
                                marcas = '!' if c == 'X' else '?' if c in 'og' else ''
                                crudos.append((a, b - a, notas, VEL_PASO[c] * (1.0 if a == i else 0.85), marcas, {}))
                                a = b
                        elif tipo == 'arpegio' and c.isdigit():
                            notas = voicing(acorde_en(base + i), op['rango'], None, None, op.get('con_bajo'))
                            k = int(c)
                            crudos.append((i, j - i, [notas[k % len(notas)] + 12 * (k // len(notas)) + transp], 0.8, '', {}))
                        elif tipo == 'scratch' and c.isalpha():
                            crudos.append((i, j - i, [], 1.0 if c.isupper() else 0.85, '', {'tipo': c.lower()}))
                        i = j
                elif tipo == 'rasgueo':
                    golpes = [i for i, c in enumerate(s) if c in 'dDuU']
                    for g_, i in enumerate(golpes):
                        j = min(golpes[g_ + 1] if g_ + 1 < len(golpes) else len(s), i + 8)
                        notas = [x + transp for x in voicing(acorde_en(base + i), op['rango'], op.get('voces'))]
                        crudos.append((i, j - i, notas, 1.0 if s[i].isupper() else 0.78, '', {'dir': s[i].lower()}))
                elif tipo == 'fx':
                    marcas_i = [i for i, c in enumerate(s) if c != '.']
                    d0, d1 = capa.get('desde', 0.0), capa.get('hasta', 1.0)
                    for g_, i in enumerate(marcas_i):
                        j = marcas_i[g_ + 1] if g_ + 1 < len(marcas_i) else len(s)
                        crudos.append((i, j - i, [], VEL_PASO.get(s[i], 0.8), '',
                                       {'desde': d0 + (d1 - d0) * i / len(s), 'hasta': d0 + (d1 - d0) * j / len(s)}))
                else:
                    raise ValueError(f'{nombre}: tipo de pista desconocido {tipo!r}')
            cresc = capa.get('cresc')
            hum = cfg.get('humano', 0)
            for p, d, notas, vel, marcas, info in crudos:
                pg = base + p
                i0 = ctx.muestra(pg, swing)
                if i0 >= n_total:
                    continue
                i1 = ctx.muestra(pg + d, swing)
                vel *= capa.get('vel', 1.0)
                if cresc:
                    vel *= cresc[0] + (cresc[1] - cresc[0]) * p / pasos
                # La semilla depende de la sección y la posición dentro de ella, no del tiempo
                # absoluto: las dos vueltas del cuerpo (y la intro) suenan idénticas.
                semilla = f'{nombre}|{sec_nombre}|{ci}|{p:.3f}|{notas}'
                if hum:
                    r = azar(semilla, 'humano')
                    i0 = max(0, i0 + int(r.normal(0, hum / 1000 * SR)))
                    vel *= 1 + 0.05 * r.standard_normal()
                eventos.append(Evento(i0, max(1, i1 - i0), notas, float(vel), marcas, semilla, info))
    return eventos


# ═══════════════════════════════ efectos ═══════════════════════════════

def _comb(x, d, fb, amort):
    """Peine con pasabajos en la realimentación (Freeverb), procesado de a d muestras."""
    n = len(x)
    b = np.zeros(n + d)
    out = np.zeros(n)
    zi = np.zeros(1)
    for c in range(0, n, d):
        e = min(c + d, n)
        leido = b[c:e]
        out[c:e] = leido
        filt, zi = signal.lfilter([1 - amort], [1, -amort], leido, zi=zi)
        b[c + d:e + d] = x[c:e] + fb * filt
    return out


def _allpass(x, d, g=0.5):
    n = len(x)
    b = np.zeros(n + d)
    out = np.zeros(n)
    for c in range(0, n, d):
        e = min(c + d, n)
        leido = b[c:e]
        out[c:e] = leido - x[c:e]
        b[c + d:e + d] = x[c:e] + g * leido
    return out


def ir_reverb(sala=0.84, amortiguacion=0.3, ancho=1.0, largo=3.2, predelay=0.012, graves=280.0, agudos=7500.0):
    """Respuesta al impulso estéreo de una Freeverb (8 peines + 4 pasatodos por canal).
    Se aplica por convolución: es lo mismo que pasar el envío por la Freeverb, pero rápido."""
    n = int(largo * SR)
    x = np.zeros(n)
    x[0] = 1.0
    fb = 0.7 + 0.28 * sala
    amort = 0.4 * amortiguacion
    canales = []
    for desp in (0, 23):
        acc = np.zeros(n)
        for d in (1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617):
            acc += _comb(x, d + desp, fb, amort)
        for d in (556, 441, 341, 225):
            acc = _allpass(acc, d + desp, 0.5)
        canales.append(acc)
    izq, der = canales
    w1, w2 = ancho / 2 + 0.5, (1 - ancho) / 2
    ir = np.stack([w1 * izq + w2 * der, w1 * der + w2 * izq], axis=1)
    ir = filtrar(ir, [('hp', graves), ('lp', agudos)])     # a la sala no le llegan los graves
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir = cerrar(ir, 400)
    return ir / np.sqrt(np.mean(np.sum(ir ** 2, axis=0)))


def ir_eco(segundos, feedback=0.33, lp=4500.0, hp=350.0):
    """Eco ping-pong a tempo: cada repetición cambia de lado y se oscurece un poco más."""
    d = int(round(segundos * SR))
    k_max = int(np.ceil(np.log(1e-3) / np.log(feedback)))
    largo_pulso = 4096
    ir = np.zeros((d * (k_max + 1) + largo_pulso, 2))
    pulso = np.zeros(largo_pulso)
    pulso[0] = 1.0
    sos = sos_de([('lp', lp), ('hp', hp)])
    amp = 1.0
    for k in range(1, k_max + 1):
        pulso = signal.sosfilt(sos, pulso)
        ir[k * d:k * d + largo_pulso, (k + 1) % 2] += amp * pulso
        amp *= feedback
    return ir


def convolucion(envio, ir, n_total):
    return np.stack([signal.oaconvolve(envio, ir[:, c])[:n_total] for c in range(2)], axis=1)


def curva_duck(n_total, golpes, liberacion=0.12, ataque=0.004):
    """Cuánto se agacha el resto ante cada bombo (0..1): sube en 4 ms y vuelve sola."""
    imp = np.zeros(n_total)
    for i0, vel in golpes:
        if 0 <= i0 < n_total:
            imp[i0] = max(imp[i0], min(vel, 1.0))
    t = tiempo(int((ataque + 6 * liberacion) * SR))
    forma = np.where(t < ataque, np.sin(0.5 * np.pi * t / ataque) ** 2, np.exp(-(t - ataque) / liberacion))
    return np.minimum(signal.oaconvolve(imp, forma)[:n_total], 1.0)


def curva_corte(cancion, nombre, cfg, linea, ctx, n_total):
    """Frecuencia de corte (pasabajos) de la pista en cada muestra, o None si no tiene.
    'corte' de la pista = valor base; (inicio, fin) en una sección = barrido; 'lfo' =
    (octavas, período en tiempos), con fase atada al compás para que el bucle calce."""
    capas = [(compas0, cancion['secciones'][s], capa) for s, compas0 in linea
             for capa in capas_de(cancion['secciones'][s], nombre) if 'corte' in capa]
    if cfg.get('corte') is None and not capas:
        return None
    curva = np.full(n_total, float(cfg.get('corte') or 18000.0))
    for compas0, sec, capa in capas:
        a = compas0 * ctx.compas
        b = min(n_total, (compas0 + sec['compases']) * ctx.compas)
        if a < b:
            f0, f1 = capa['corte']
            curva[a:b] = f0 * (f1 / f0) ** np.linspace(0, 1, b - a, endpoint=False)
    if cfg.get('lfo'):
        prof, periodo = cfg['lfo']
        curva *= 2 ** (prof * np.sin(TAU * np.arange(n_total) / (SR * ctx.negra * periodo)))
    return np.clip(curva, 40.0, 18000.0)


def mezclar(cancion, ctx, linea, n_total, carpeta_pistas=None, cortar=None):
    """Sintetiza cada pista, la ecualiza, la comprime desde el bombo, la deja en su
    nivel (sonoridad objetivo de la pista) y la suma con sus envíos de reverb y eco."""
    acordes = acordes_globales(cancion, linea)
    pistas = cancion['pistas']
    eventos = {nombre: eventos_de_pista(cancion, nombre, cfg, linea, ctx, acordes, n_total)
               for nombre, cfg in pistas.items()}
    golpes = [(e.i0, e.vel) for nombre, cfg in pistas.items() if cfg['inst'] == 'bombo' for e in eventos[nombre]]
    duck = curva_duck(n_total, golpes, cancion.get('duck_liberacion', 0.12))
    mezcla = np.zeros((n_total, 2))
    envio_rev = np.zeros(n_total)
    envio_eco = np.zeros(n_total)
    resumen = []
    for nombre, cfg in pistas.items():
        if not eventos[nombre]:
            continue
        t0 = time.time()
        x = INSTRUMENTOS[cfg['inst']](ctx, eventos[nombre], n_total, **cfg.get('op', {}))
        if not np.all(np.isfinite(x)):
            raise RuntimeError(f'{nombre}: la síntesis dio valores no finitos')
        x = panear(x, cfg.get('pan', 0.0)) if x.ndim == 1 else equilibrar(x, cfg.get('pan', 0.0))
        x = filtrar(x, cfg.get('eq', []))
        cortes = curva_corte(cancion, nombre, cfg, linea, ctx, n_total)
        if cortes is not None:
            x = np.stack([filtro_variable(x[:, c], 'lp', cortes, 0.9, ctx.bloque) for c in range(2)], axis=1)
        if cfg.get('duck'):
            x *= (1 - cfg['duck'] * duck)[:, None]
        medido = sonoridad(x)
        ganancia = cfg['nivel'] - medido
        x *= de_db(ganancia)
        mezcla += x
        if cfg.get('reverb'):
            envio_rev += x.mean(axis=1) * cfg['reverb']
        if cfg.get('eco'):
            envio_eco += x.mean(axis=1) * cfg['eco']
        resumen.append((nombre, cfg['inst'], len(eventos[nombre]), medido, ganancia, time.time() - t0))
        if carpeta_pistas is not None:
            guardar_wav(carpeta_pistas / f"{cancion['id']}-{nombre}.wav", cortar(x))
        del x
    rev = dict(cancion.get('reverb', {}))
    retorno_rev = rev.pop('retorno', 0.0)
    mezcla += convolucion(envio_rev, ir_reverb(**rev), n_total) * de_db(retorno_rev)
    eco = cancion.get('eco', {})
    ir = ir_eco(eco.get('tiempo', 0.75) * ctx.negra, eco.get('feedback', 0.33), eco.get('lp', 4500.0))
    mezcla += convolucion(envio_eco, ir, n_total) * de_db(eco.get('retorno', 0.0))
    return mezcla, resumen


# ═══════════════════════════════ master ═══════════════════════════════

def sonoridad(x):
    """Sonoridad integrada en LUFS (UIT-R BS.1770: ponderación K, bloques de 400 ms,
    compuertas absoluta de -70 y relativa de -10)."""
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    sos = np.array([biquad('agudos', 1681.974450955533, 0.7071752369554196, 3.999843853973347),
                    biquad('hp', 38.13547087602444, 0.5003270373238773)])
    y = signal.sosfilt(sos, x, axis=0)
    paso, bloque = int(0.1 * SR), int(0.4 * SR)
    if len(y) < bloque:
        return -70.0
    cs = np.concatenate([[0.0], np.cumsum(np.sum(y ** 2, axis=1))])
    ini = np.arange((len(y) - bloque) // paso + 1) * paso
    z = (cs[ini + bloque] - cs[ini]) / bloque
    z = z[-0.691 + 10 * np.log10(z + 1e-20) > -70]
    if len(z) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z + 1e-20) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def pico_sobremuestreado(x, trozo=1 << 18):
    """Máximo |x| de cada muestra mirando también entre muestras (×4), por trozos."""
    out = np.empty(len(x))
    m = 64
    for i in range(0, len(x), trozo):
        a, b = max(0, i - m), min(len(x), i + trozo + m)
        up = np.abs(signal.resample_poly(x[a:b], 4, 1, axis=0)).max(axis=1)
        up = up[:4 * (b - a)].reshape(-1, 4).max(axis=1)
        out[i:min(len(x), i + trozo)] = up[i - a:i - a + min(trozo, len(x) - i)]
    return out


def compresor(x, umbral_db, razon=2.0, ataque=0.012, liberacion=0.18, rodilla=6.0):
    """Compresor de bus estéreo enlazado (detector RMS de 10 ms, rodilla suave).
    Sin bucles: un máximo móvil hace el ataque y el máximo con la curva filtrada, el relajo."""
    rms = np.sqrt(uniform_filter1d(np.mean(x ** 2, axis=1), int(0.01 * SR)) + 1e-12)
    sobre = 20 * np.log10(rms) - umbral_db
    k = 1 - 1 / razon
    gr = np.where(sobre <= -rodilla / 2, 0.0,
                  np.where(sobre >= rodilla / 2, k * sobre, k * (sobre + rodilla / 2) ** 2 / (2 * rodilla)))
    na = max(1, int(ataque * SR))
    gr = uniform_filter1d(maximum_filter1d(gr, na), na)
    a = np.exp(-1 / (liberacion * SR))
    gr = np.maximum(gr, signal.lfilter([1 - a], [1, -a], gr))
    return x * (10 ** (-gr / 20))[:, None], gr


def limitador(x, techo_db, ventana=0.0015, liberacion=0.08):
    """Limitador con anticipación y pico real: la ganancia baja antes de cada pico
    (mínimo móvil + promedio, sin saltos) y se recupera lento. Al final un recorte suave
    de seguridad que casi nunca trabaja."""
    techo = de_db(techo_db)
    req = np.minimum(1.0, techo / np.maximum(pico_sobremuestreado(x), 1e-9))
    w = max(1, int(ventana * SR))
    g = uniform_filter1d(minimum_filter1d(req, 2 * w + 1), w + 1)
    a = np.exp(-1 / (liberacion * SR))
    g = np.minimum(g, 1 + signal.lfilter([1 - a], [1, -a], g - 1))
    y = x * g[:, None]
    lim = 0.98 * techo
    mag = np.abs(y)
    sobre = mag > lim
    y[sobre] = np.sign(y[sobre]) * (lim + (techo - lim) * np.tanh((mag[sobre] - lim) / (techo - lim)))
    return y, -20 * np.log10(g)


# ═════════════════════════════ exportación ═════════════════════════════

def codificar_mp3(x, ruta, titulo):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', 'pipe:0',
                    '-codec:a', 'libmp3lame', '-b:a', f'{KBPS}k', '-ar', str(SR), '-ac', '2',
                    '-metadata', f'title={titulo}', '-metadata', 'album=El Torneo de Cell', str(ruta)],
                   input=np.ascontiguousarray(x, dtype='<f4').tobytes(), check=True)


def decodificar(ruta):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ruta), '-f', 'f32le', '-ac', '2', '-ar', str(SR), 'pipe:1'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(float)


def medir_ffmpeg(ruta):
    """Sonoridad integrada, rango y pico real según el medidor ebur128 de ffmpeg."""
    txt = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(ruta), '-af',
                          'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'],
                         capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
    def ultimo(patron):
        v = re.findall(patron, txt)
        return float(v[-1]) if v and v[-1] != '-inf' else float('-inf')
    return {'i': ultimo(r'I:\s+(-?[\d.]+) LUFS'), 'lra': ultimo(r'LRA:\s+(-?[\d.]+) LU'),
            'tp': ultimo(r'Peak:\s+(-?[\d.]+|-inf) dBFS')}


def guardar_wav(ruta, x):
    with wave.open(str(ruta), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


# ═══════════════════════════════ revisión ═══════════════════════════════

OCTAVAS = (31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)


def bandas(x):
    """Energía por octava (dB) de un tramo estéreo."""
    f, p = signal.welch(x.mean(axis=1), SR, nperseg=8192)
    return np.array([10 * np.log10(np.sum(p[(f >= c / np.sqrt(2)) & (f < c * np.sqrt(2))]) + 1e-20) for c in OCTAVAS])


def revisar_union(y, i_salto_desde, i_salto_hacia):
    """Compara lo que suena al saltar (…i_desde-1, i_hacia…) con la continuación real."""
    W = int(0.05 * SR)
    antes = y[i_salto_desde - W:i_salto_desde]
    despues = y[i_salto_hacia:i_salto_hacia + W]
    unido = np.concatenate([antes, despues])
    paso_union = float(np.abs(despues[0] - antes[-1]).max())
    vecindad = y[i_salto_desde - SR // 2:i_salto_desde + SR // 2]
    paso_tipico = float(np.percentile(np.abs(np.diff(vecindad, axis=0)).max(axis=1), 99.9))
    rms = lambda z: float(np.sqrt(np.mean(z ** 2)) + 1e-12)
    out = {'paso_union': paso_union, 'paso_p999': paso_tipico,
           'paso_max_unido': float(np.abs(np.diff(unido, axis=0)).max()),
           'rms_antes_db': a_db(rms(antes)), 'rms_despues_db': a_db(rms(despues))}
    if i_salto_desde + SR <= len(y):
        real = y[i_salto_desde:i_salto_desde + SR]
        salto = y[i_salto_hacia:i_salto_hacia + SR]
        out['dif_continuacion_db'] = a_db(rms(real - salto) / rms(real))
    return out


def colorear(v):
    """0..1 → colores de espectrograma (negro, violeta, rojo, naranjo, crema)."""
    anclas = np.array([[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
                       [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]], dtype=float)
    pos = np.linspace(0, 1, len(anclas))
    return np.stack([np.interp(v, pos, anclas[:, c]) for c in range(3)], axis=-1).astype(np.uint8)


def espectrograma_png(x, ruta, titulo, marcas, loop, duracion):
    """Espectrograma (frecuencia logarítmica, energía por banda: el ruido rosa se ve plano)
    con las secciones, el bucle y la sonoridad momentánea."""
    from PIL import Image, ImageDraw, ImageFont
    ancho, alto, izq, arriba, abajo_h = 1600, 520, 64, 46, 150
    mono = x.mean(axis=1).astype(np.float32)
    nfft, hop = 4096, 1024
    vista = np.lib.stride_tricks.sliding_window_view(mono, nfft)[::hop]
    ventana = np.hanning(nfft).astype(np.float32)
    potencia = np.empty((len(vista), nfft // 2 + 1), dtype=np.float32)
    for i in range(0, len(vista), 512):
        potencia[i:i + 512] = np.abs(np.fft.rfft(vista[i:i + 512] * ventana, axis=1)) ** 2
    cols = np.linspace(0, len(vista), ancho + 1).astype(int)
    P = np.add.reduceat(potencia, cols[:-1], axis=0) / np.maximum(np.diff(cols), 1)[:, None]
    df = SR / nfft
    bordes = np.geomspace(30, 18000, alto + 1)
    ini = np.floor(bordes[:-1] / df).astype(int)
    fin = np.maximum(ini + 1, np.ceil(bordes[1:] / df).astype(int))
    cs = np.concatenate([np.zeros((P.shape[0], 1)), np.cumsum(P.astype(float), axis=1)], axis=1)
    # energía de cada banda (densidad media × ancho de la banda): el ruido rosa se ve plano
    db = 10 * np.log10((cs[:, fin] - cs[:, ini]) / (fin - ini) * (np.diff(bordes) / df) + 1e-20)
    tope = np.percentile(db, 99.8)
    img = colorear(np.clip((db - (tope - 80)) / 80, 0, 1).T[::-1])
    lienzo = Image.new('RGB', (izq + ancho + 20, arriba + alto + abajo_h), (16, 16, 20))
    lienzo.paste(Image.fromarray(img), (izq, arriba))
    dib = ImageDraw.Draw(lienzo)
    try:
        fuente = ImageFont.truetype('arial.ttf', 13)
        grande = ImageFont.truetype('arialbd.ttf', 16)
    except OSError:
        fuente = grande = ImageFont.load_default()
    a_x = lambda s: izq + s / duracion * ancho
    dib.text((izq, 8), titulo, fill=(240, 240, 240), font=grande)
    for f in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        yy = arriba + alto - np.log(f / 30) / np.log(18000 / 30) * alto
        dib.line([(izq - 4, yy), (izq + ancho, yy)], fill=(70, 70, 80))
        dib.text((4, yy - 7), f'{f / 1000:g}k' if f >= 1000 else f'{f}', fill=(200, 200, 200), font=fuente)
    for nombre, s in marcas:
        xx = a_x(s)
        dib.line([(xx, arriba - 4), (xx, arriba + alto + abajo_h - 22)], fill=(235, 235, 235), width=1)
        dib.text((xx + 3, arriba - 18), nombre, fill=(235, 235, 235), font=fuente)
    for s, color, texto in ((loop[0], (60, 230, 120), 'loopStart'), (loop[1], (255, 80, 80), 'loopEnd')):
        xx = a_x(s)
        dib.line([(xx, arriba), (xx, arriba + alto + abajo_h - 22)], fill=color, width=3)
        dib.text((xx + 4, arriba + alto + abajo_h - 38), texto, fill=color, font=fuente)
    # Sonoridad momentánea (400 ms) debajo del espectrograma, de -40 a -5 LUFS.
    sos = np.array([biquad('agudos', 1681.97, 0.7072, 4.0), biquad('hp', 38.135, 0.5003)])
    y = signal.sosfilt(sos, x, axis=0)
    cs2 = np.concatenate([[0.0], np.cumsum(np.sum(y ** 2, axis=1))])
    blq = int(0.4 * SR)
    pos = np.arange(0, len(y) - blq, int(0.05 * SR))
    lufs = -0.691 + 10 * np.log10((cs2[pos + blq] - cs2[pos]) / blq + 1e-20)
    y0 = arriba + alto + 10
    alto_c = abajo_h - 40
    a_y = lambda l: y0 + alto_c * (1 - (np.clip(l, -40, -5) + 40) / 35)
    for l in (-30, -20, -16, -10):
        dib.line([(izq, a_y(l)), (izq + ancho, a_y(l))], fill=(90, 90, 60) if l == -16 else (55, 55, 60))
        dib.text((8, a_y(l) - 7), f'{l}', fill=(190, 190, 190), font=fuente)
    puntos = [(a_x((p + blq / 2) / SR), a_y(l)) for p, l in zip(pos, lufs)]
    dib.line(puntos, fill=(120, 200, 255), width=1)
    for s in range(0, int(duracion) + 1, 10):
        dib.text((a_x(s) - 6, arriba + alto + abajo_h - 18), f'{s}s', fill=(170, 170, 170), font=fuente)
    lienzo.save(ruta)


# ═══════════════════════════════ proceso ═══════════════════════════════

def procesar(cancion, carpeta_pistas=None):
    t_ini = time.time()
    ctx = Contexto(cancion)
    linea, c_intro, c_cuerpo = linea_de_tiempo(cancion)
    A, B, E = c_intro * ctx.compas, c_cuerpo * ctx.compas, COMPASES_EXTRA * ctx.compas
    n_total = A + 2 * B + E + int(0.25 * SR)

    def cortar(x):
        """El archivo: intro + segundo cuerpo (que ya trae las colas del primero) + extra."""
        return np.concatenate([x[:A], x[A + B:A + 2 * B + E]])

    print(f"\n♪ {cancion['id']} — {cancion['bpm']} bpm, {cancion['tono']}: "
          f"intro {c_intro} + cuerpo {c_cuerpo} compases ({B / SR:.2f} s de bucle)")
    mezcla, resumen = mezclar(cancion, ctx, linea, n_total, carpeta_pistas, cortar)
    for nombre, inst, nev, medido, gan, seg in resumen:
        print(f'  {nombre:<13} {inst:<15} {nev:5d} eventos  {medido:7.1f} LUFS → {gan:+6.1f} dB  ({seg:4.1f} s)')

    # Bus maestro: corte de subgraves, compresor de pegamento y limitador hasta -16 LUFS.
    mezcla = filtrar(mezcla, [('hp', 22)])
    mezcla, gr_comp = compresor(mezcla, sonoridad(cortar(mezcla)) + 2.0)
    ruta = CARPETA / f"{cancion['id']}.mp3"
    objetivo, techo = OBJETIVO_LUFS, TECHO_DBTP - 0.4
    ganancia = objetivo - sonoridad(cortar(mezcla))
    for intento in range(6):
        for _ in range(8):
            lim, gr_lim = limitador(mezcla * de_db(ganancia), techo)
            final = cortar(lim)
            dif = objetivo - sonoridad(final)
            if abs(dif) < 0.03:
                break
            ganancia += dif
        codificar_mp3(final, ruta, cancion['nombre'])
        med = medir_ffmpeg(ruta)
        ok_pico = med['tp'] <= TECHO_DBTP - 0.05
        ok_lufs = abs(med['i'] - OBJETIVO_LUFS) <= 0.2
        print(f"  master {intento + 1}: {med['i']:.1f} LUFS, pico real {med['tp']:.2f} dBTP "
              f"(techo del limitador {techo:.2f}, ganancia {ganancia:+.1f} dB)")
        if ok_pico and ok_lufs:
            break
        if not ok_pico:
            techo -= med['tp'] - (TECHO_DBTP - 0.15)
        if not ok_lufs:
            objetivo += OBJETIVO_LUFS - med['i']

    # Revisión objetiva del mp3 tal como lo va a decodificar el juego.
    y = decodificar(ruta)
    if len(y) != len(final):
        print(f'  ¡ojo! el mp3 decodificado mide {len(y)} muestras y el original {len(final)}')
    i_ini, i_fin = A, A + B
    costura = revisar_union(y, i_fin, i_ini)            # salto loopEnd → loopStart
    costura_pcm = revisar_union(final, i_fin, i_ini)    # lo mismo antes de codificar
    entrada_bucle = revisar_union(y, i_ini, i_ini)      # intro → bucle (continuo en el archivo)
    dc = y.mean(axis=0)
    compas_s = ctx.compas / SR
    marcas, c = [], 0
    for nombre in cancion['intro'] + cancion['cuerpo']:
        marcas.append((nombre, c * compas_s))
        c += cancion['secciones'][nombre]['compases']
    marcas.append(('(sigue)', c * compas_s))
    tramos_bandas = []
    for k, (nombre, s) in enumerate(marcas[:-1]):
        a, b = int(s * SR), int(marcas[k + 1][1] * SR)
        tramos_bandas.append((nombre, s, bandas(y[a:b]), sonoridad(y[a:b])))
    duracion = len(y) / SR
    titulo = (f"{cancion['id']}.mp3 · {cancion['nombre']} · {cancion['bpm']} bpm · {cancion['tono']} · "
              f"{med['i']:.1f} LUFS · pico real {med['tp']:.1f} dBTP")
    espectrograma_png(y, ARTE / f"{cancion['id']}.png", titulo, marcas, (i_ini / SR, i_fin / SR), duracion)

    lineas = [f"{cancion['id']}.mp3 — «{cancion['nombre']}» — generado por herramientas/musica.py",
              f"Tempo {cancion['bpm']} bpm, {cancion['tono']}; compás de {compas_s:.6f} s.",
              f"Duración {duracion:.3f} s; bucle [{i_ini / SR:.6f} s, {i_fin / SR:.6f} s) = {B / SR:.3f} s "
              f"({c_cuerpo} compases); intro {c_intro} compases; {COMPASES_EXTRA} compás de continuación al final.",
              f"Tamaño {ruta.stat().st_size / 1e6:.2f} MB ({KBPS} kbps).",
              '',
              f"Sonoridad integrada (ffmpeg ebur128): {med['i']:.1f} LUFS; rango de sonoridad {med['lra']:.1f} LU; "
              f"pico real {med['tp']:.2f} dBTP; pico de muestra {a_db(np.abs(y).max()):.2f} dBFS.",
              f"Componente continua: izq {dc[0]:+.1e}, der {dc[1]:+.1e}.",
              f"Compresor de bus: reducción media {gr_comp[A:A + 2 * B].mean():.1f} dB, máxima {gr_comp.max():.1f} dB. "
              f"Limitador: media {max(gr_lim[A + B:A + 2 * B].mean(), 0.0):.2f} dB, "
              f"máxima {max(gr_lim.max(), 0.0):.1f} dB.",
              '',
              'Costura del bucle (mp3 decodificado), salto loopEnd → loopStart:',
              f"  paso entre la última muestra y la primera: {costura['paso_union']:.4f} "
              f"(percentil 99,9 de los pasos normales alrededor: {costura['paso_p999']:.4f}; "
              f"paso máximo en ±50 ms del salto: {costura['paso_max_unido']:.4f})",
              f"  RMS 50 ms antes {costura['rms_antes_db']:.1f} dB / después {costura['rms_despues_db']:.1f} dB",
              f"  diferencia entre 1 s desde loopStart y la continuación real desde loopEnd: "
              f"{costura.get('dif_continuacion_db', float('nan')):.1f} dB en el mp3 (ruido de codificación); "
              f"antes de codificar {costura_pcm.get('dif_continuacion_db', float('nan')):.1f} dB",
              f"Entrada intro → bucle: paso {entrada_bucle['paso_union']:.4f} (p99,9 {entrada_bucle['paso_p999']:.4f}); "
              f"RMS {entrada_bucle['rms_antes_db']:.1f} → {entrada_bucle['rms_despues_db']:.1f} dB",
              '',
              'Balance por sección: sonoridad y energía por octava relativa a la de 1 kHz (dB):',
              '  sección        inicio   LUFS  ' + ' '.join(f'{f:>6g}' for f in OCTAVAS)]
    for nombre, s, niveles, lufs in tramos_bandas:
        rel = niveles - niveles[OCTAVAS.index(1000)]
        lineas.append(f'  {nombre:<13} {s:6.1f}s {lufs:6.1f}  ' + ' '.join(f'{v:6.1f}' for v in rel))
    lineas += ['', 'Pistas (sonoridad propia medida → ganancia aplicada para dejarla en su nivel):']
    lineas += [f'  {nombre:<13} {inst:<15} {nev:5d} eventos  {medido:7.1f} LUFS → {gan:+6.1f} dB'
               for nombre, inst, nev, medido, gan, _ in resumen]
    (ARTE / f"{cancion['id']}.txt").write_text('\n'.join(lineas) + '\n', encoding='utf-8')
    print('\n'.join('  ' + l for l in lineas[4:20]))
    print(f'  listo en {time.time() - t_ini:.0f} s')
    return {'archivo': ruta.name, 'bpm': cancion['bpm'],
            'loopStart': round(i_ini / SR, 6), 'loopEnd': round(i_fin / SR, 6)}


# ═══════════════════════════════ canciones ═══════════════════════════════
# Todo lo de aquí abajo es música original escrita para el juego.

# ── «¡Presiona Enter!» (título y menús) ────────────────────────────────
# Himno arcade en Mi menor a 140: riff de quintas con bajo slap, coro heroico en la
# guitarra solista (motivo que sube por terceras y se repite un tono más arriba),
# puente dórico (Mi menor → La mayor) con bronces y campanas FM, quiebre y subida.

CORO_A = ('B4:2 E5:2 G5:6 F#5:2 E5:4 | D5:2 E5:2 F#5:6 A5:2 F#5:4 | '
          'G5:4 A5:2 B5:6^ A5:2 G5:2 | E5:12 r:4 | ')
CORO_B = ('B4:2 E5:2 G5:6 F#5:2 E5:4 | D5:2 E5:2 F#5:6 A5:2 B5:4 | '
          'B5:6^ A5:2 G5:2 F#5:2 D#5:4 | F#5:12 r:4')
CORO_FINAL = ('B4:2 E5:2 G5:6 F#5:2 E5:4 | D5:2 E5:2 F#5:6 A5:2 B5:4 | '
              'G5:2 A5:2 B5:4 A5:2 B5:2 D6:4 | E6:12^ r:4')
RIFF = ('E2:2! E2:1? E2:1? G2:2! E2:2? A2:3! G2:1 E2:1? E2:1? D3:2! | '
        'E2:2! E2:1? E2:1? G2:2! E2:2? C3:4! D3:4! | '
        'E2:2! E2:1? E2:1? G2:2! E2:2? A2:3! G2:1 E2:1? E2:1? D3:2! | '
        'E2:2! E2:1? E2:1? G2:2! E2:2? C3:2! D3:2! B2:4!')
RIFF_BAJO = ('E1:2! E2:1? E1:1 G1:2! E1:1 E2:1? A1:3! G1:1 E1:1 E2:1? D2:2! | '
             'E1:2! E2:1? E1:1 G1:2! E1:1 E2:1? C2:4! D2:4! | '
             'E1:2! E2:1? E1:1 G1:2! E1:1 E2:1? A1:3! G1:1 E1:1 E2:1? D2:2! | '
             'E1:2! E2:1? E1:1 G1:2! E1:1 E2:1? C2:2! D2:2! B1:4!')
SLAP_CORO = 'R:2! R:1 8:1? R:2 8:2? R:2 R:1 8:1? 5:2 8:2?'
POWER_CORO = {'tipo': 'acordes', 'modo': 'raiz', 'rango': ('E2', 'D#3'), 'p': 'X---x-x-X---x-x-'}

TITULO = {
    'id': 'titulo',
    'nombre': '¡Presiona Enter!',
    'bpm': 140,
    'tono': 'Mi menor (puente dórico)',
    'intro': ['golpes', 'subida2'],
    'cuerpo': ['riff', 'coro', 'puente', 'coro2', 'quiebre', 'subida1', 'subida2'],
    'reverb': {'sala': 0.84, 'amortiguacion': 0.35},
    'eco': {'tiempo': 0.75, 'feedback': 0.32, 'lp': 4500},
    'duck_liberacion': 0.11,
    'pistas': {
        'bombo':       {'inst': 'bombo', 'tipo': 'golpe', 'nivel': -20.0, 'op': {'decaimiento': 0.21, 'clic': 1.3}, 'eq': [('hp', 38)]},
        'caja':        {'inst': 'caja', 'tipo': 'golpe', 'nivel': -22.5, 'reverb': 0.16, 'eq': [('hp', 110)]},
        'hat':         {'inst': 'hat', 'tipo': 'golpe', 'nivel': -32.0, 'pan': 0.3},
        'hat_ab':      {'inst': 'hat', 'tipo': 'golpe', 'nivel': -32.5, 'pan': 0.3, 'op': {'abierto': True}},
        'crash':       {'inst': 'platillo', 'tipo': 'golpe', 'nivel': -29.0, 'reverb': 0.08, 'pan': -0.2},
        'timbal':      {'inst': 'timbal', 'tipo': 'golpe', 'nivel': -23.0, 'reverb': 0.3, 'op': {'f': 82.41}, 'eq': [('hp', 45)]},
        'bajo':        {'inst': 'bajo_slap', 'tipo': 'bajo', 'grave': 'E1', 'nivel': -21.0, 'duck': 0.45,
                        'eq': [('hp', 38), ('lp', 4500)]},
        'power':       {'inst': 'guitarra_power', 'tipo': 'notas', 'nivel': -21.5, 'duck': 0.2, 'eq': [('hp', 120)]},
        'pad':         {'inst': 'supersaw', 'tipo': 'acordes', 'rango': ('E3', 'B4'), 'voces': 4, 'nivel': -28.0,
                        'duck': 0.4, 'reverb': 0.2, 'eq': [('hp', 160)], 'corte': 6000},
        'bronces':     {'inst': 'bronce', 'tipo': 'acordes', 'rango': ('B3', 'G5'), 'voces': 4, 'nivel': -24.0,
                        'reverb': 0.18, 'eq': [('hp', 150)]},
        'orquesta':    {'inst': 'orquesta', 'tipo': 'acordes', 'rango': ('E3', 'E5'), 'voces': 6, 'nivel': -21.0,
                        'reverb': 0.3, 'eq': [('hp', 45)]},
        'lider':       {'inst': 'guitarra_lider', 'tipo': 'mono', 'nivel': -19.0, 'eco': 0.16, 'reverb': 0.14,
                        'eq': [('hp', 180)]},
        'bronces_mel': {'inst': 'bronce', 'tipo': 'notas', 'nivel': -25.0, 'reverb': 0.2, 'pan': -0.15, 'eq': [('hp', 150)]},
        'campanas':    {'inst': 'campana', 'tipo': 'arpegio', 'rango': ('E5', 'E6'), 'nivel': -28.0, 'eco': 0.25,
                        'reverb': 0.25, 'pan': 0.2, 'eq': [('hp', 400)]},
        'riser':       {'inst': 'riser', 'tipo': 'fx', 'nivel': -28.0},
    },
    'secciones': {
        # Intro: golpes de orquesta con redoble de timbales y la misma subida que cierra el bucle.
        'golpes': {
            'compases': 2,
            'acordes': 'Em . . . | C . D .',
            'orquesta': 'X............... | X.......X.......',
            'bateria': {
                'bombo': 'X............... | X.......X.......',
                'crash': 'X............... | X.......X.......',
                'timbal': {'p': '........oooxxxXX | ..........ooxxXX', 'cresc': (0.6, 1.0)},
            },
            'bajo': 'R:16 | R:8 R:8',
            'power': 'E2:16! | C3:8! D3:8!',
            'pad': {'p': 'X--------------- | X-------X-------', 'corte': (700, 2500)},
        },
        # Riff: quintas palm-mute con acentos, bajo slap que lo dobla, bronces desde el compás 5.
        'riff': {
            'compases': 8,
            'acordes': 'Em . . . | Em . C D | Em . . . | Em . C B',
            'power': RIFF,
            'bajo': RIFF_BAJO,
            'bateria': {
                'bombo': 'X.......X.....x. | X.......X...X... | X.......X.....x. | X.......X.X.X...',
                'caja': '....X.......X... | ....X.......X... | ....X.......X... | ....X.......X.xx',
                'hat': 'X.x.x.x.X.x.x.x.',
                'crash': {'p': 'X', 'en': [0, 4]},
            },
            'orquesta': {'p': 'X', 'en': [0]},
            'bronces': {'p': 'X.......X.....x. | X.......X...X...', 'en': [4, 5, 6, 7]},
            'lider': 'r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:4 E5:2 F#5:2 G5:2 F#5:2 E5:2 D#5:2',
        },
        # Coro: la melodía principal en la guitarra solista, bombo a negras y hi-hat abierto.
        'coro': {
            'compases': 8,
            'acordes': 'C . . . | D . . . | Em . . . | Em . . . | C . . . | D . . . | B . . . | B . . .',
            'lider': CORO_A + CORO_B,
            'bajo': SLAP_CORO,
            'power': POWER_CORO,
            'pad': 'X---------------',
            'bateria': {
                'bombo': 'X...X...X...X...',
                'caja': [{'p': '....X.......X...', 'excepto': [7]}, {'p': '....X.......XxXX', 'en': [7]}],
                'hat_ab': '..x...x...x...x.',
                'hat': 'x...x...x...x...',
                'crash': {'p': 'X', 'en': [0, 4]},
            },
            'orquesta': {'p': 'X', 'en': [0]},
            'bronces': {'p': '............X.X.', 'en': [3, 7]},
        },
        # Puente dórico: medio tiempo, bronces con la contramelodía (Do# del modo dórico)
        # y campanas FM en arpegio, como las del jingle de encendido.
        'puente': {
            'compases': 8,
            'acordes': 'Em . . . | A . . . | Em . . . | A . . . | C . . . | D . . . | B7sus4 . . . | B7 . . .',
            'bronces_mel': ('B4:6 A4:2 G4:4 F#4:4 | E4:4 C#4:4 E4:4 A4:4 | G4:6 F#4:2 E4:4 B3:4 | C#4:8 E4:4 A4:4 | '
                            'G4:6 E4:2 C4:4 E4:4 | F#4:6 D4:2 A3:4 D4:4 | E4:8 E4:4 F#4:4 | D#4:4 F#4:4 A4:4 B4:4'),
            'campanas': '0.1.2.3.1.2.3.4.',
            'bajo': 'R:3! R:1? r:2 8:2? R:2 r:2 5:2 8:2?',
            'pad': {'p': 'X---------------', 'corte': (2500, 2500)},
            'bateria': {
                'bombo': 'X.........X.....',
                'caja': '........X.......',
                'hat': 'xoxoxoxoxoxoxoxo',
                'crash': {'p': 'X', 'en': [0]},
            },
            'lider': 'r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:8 B4:2 D#5:2 F#5:2 A5:2',
        },
        # Segundo coro: igual pero con bronces doblando la melodía, campanas arriba y final en Mi agudo.
        'coro2': {
            'compases': 8,
            'acordes': 'C . . . | D . . . | Em . . . | Em . . . | C . . . | D . . . | C . D . | Em . . .',
            'lider': CORO_A + CORO_FINAL,
            'bronces_mel': {'p': CORO_A + CORO_FINAL, 'transp': -12},
            'campanas': {'p': '0.2.1.3.0.2.1.3.', 'vel': 0.7},
            'bajo': SLAP_CORO,
            'power': POWER_CORO,
            'pad': 'X---------------',
            'bateria': {
                'bombo': 'X...X...X...X...',
                'caja': [{'p': '....X.......X...', 'excepto': [7]}, {'p': '....X...X.X.XXXX', 'en': [7]}],
                'hat_ab': '..x...x...x...x.',
                'hat': 'x...x...x...x...',
                'crash': {'p': 'X', 'en': [0, 4]},
            },
            'orquesta': {'p': 'X', 'en': [0]},
            'bronces': {'p': 'X', 'en': [0, 4]},
        },
        # Quiebre: el motivo del coro en campanas, el pad se cierra y entran los timbales.
        'quiebre': {
            'compases': 4,
            'acordes': 'C . . . | D . . . | Em . . . | Em . . .',
            'campanas': {'tipo': 'notas', 'p': CORO_A, 'transp': 12, 'vel': 0.8},
            'pad': {'p': 'X---------------', 'corte': (3500, 700)},
            'bajo': 'R:16',
            'power': 'C3:16! | r:16 | r:16 | r:16',
            'bateria': {
                'bombo': {'p': 'X...............', 'vel': 0.8},
                'hat': '..o...o...o...o.',
                'crash': {'p': 'X', 'en': [0]},
                'timbal': {'p': '........oooxxxXX', 'en': [3]},
            },
            'orquesta': {'p': 'X', 'en': [0]},
        },
        # Subida (4 compases en dos mitades): redoble que se acelera, ruido que sube y golpes finales.
        'subida1': {
            'compases': 2,
            'acordes': 'C . . . | C . . .',
            'bateria': {
                'bombo': 'X...X...X...X...',
                'caja': {'p': 'x.x.x.x.x.x.x.x.', 'cresc': (0.35, 0.65)},
                'crash': {'p': 'X', 'en': [0]},
            },
            'bajo': 'R:2 R:2 R:2 R:2 R:2 R:2 R:2 R:2',
            'power': 'C3:2? C3:2? C3:2? C3:2? C3:2? C3:2? C3:2? C3:2?',
            'pad': {'p': 'X---------------', 'corte': (600, 1800)},
            'riser': {'p': 'X', 'en': [0], 'desde': 0.0, 'hasta': 0.5},
        },
        'subida2': {
            'compases': 2,
            'acordes': 'D . . . | B . . .',
            'bateria': {
                'bombo': 'X...X...X...X... | X.....X.....X...',
                'caja': {'p': 'xxxxxxxxxxxxxxxx | ..xxx...xxx...xx', 'cresc': (0.55, 1.0)},
                'crash': '................ | X.....X.....X...',
            },
            'orquesta': '................ | X.....X.....X...',
            'bajo': 'R:2 R:2 R:2 R:2 R:2 R:2 R:2 R:2 | R:6! R:6! R:4!',
            'power': 'D3:2? D3:2? D3:2? D3:2? D3:2 D3:2 D3:2 D3:2 | B2:6! B2:6! B2:4!',
            'pad': {'p': 'X--------------- | X-----X-----X---', 'corte': (1800, 6000)},
            'riser': {'p': 'X', 'en': [0], 'desde': 0.5, 'hasta': 1.0},
        },
    },
}

# ── «La cabaña del lago» (escenario de Loco René, de día) ───────────────
# Sol mayor a 112, groove liviano de pelea: guitarra de nylon en arpegios, marimba con
# figura de tresillo, bajo funky, palmas y shaker. La quena canta la melodía con la célula
# del huayno (corchea y dos semicorcheas) y en la sección andina el charango rasguea en
# Mi menor con una melodía pentatónica sobre el bombo legüero.

QUENA_A = ('G5:2 E5:1 G5:1 B5:6 A5:2 G5:4 | F#5:2 D5:1 F#5:1 A5:6 G5:2 F#5:4 | '
           'D5:2 B4:1 D5:1 F#5:6 E5:2 D5:4 | E5:12 r:2 D5:1 E5:1 | ')
QUENA_B = ('G5:2 E5:1 G5:1 B5:6 A5:2 G5:4 | A5:2 F#5:1 A5:1 D6:6 C6:2 A5:4 | '
           'B5:4 A5:2 G5:2 D5:4 E5:2 F#5:2 | G5:12 r:4')
QUENA_B2 = ('G5:2 E5:1 G5:1 B5:6 A5:2 G5:4 | A5:2 F#5:1 A5:1 D6:6 E6:2 D6:4 | '
            'D6:4 B5:2 G5:2 A5:2 G5:2 E5:2 F#5:2 | G5:12 r:4')
CHARANGO_HUAYNO = ('B5:2 A5:1 B5:1 D6:2 B5:2 A5:2 G5:1 A5:1 B5:4 | A5:2 G5:1 A5:1 B5:2 A5:2 G5:2 E5:1 G5:1 A5:4 | '
                   'G5:2 E5:1 G5:1 A5:2 G5:2 E5:2 D5:1 E5:1 G5:4 | F#5:2 E5:1 F#5:1 A5:2 F#5:2 D#5:2 B4:1 D#5:1 F#5:4 | '
                   'B5:2 A5:1 B5:1 D6:2 B5:2 A5:2 G5:1 A5:1 B5:4 | D6:2 B5:1 D6:1 E6:2 D6:2 B5:2 A5:1 B5:1 D6:4 | '
                   'E6:2 D6:1 B5:1 A5:2 G5:2 F#5:2 E5:1 F#5:1 D#5:2 F#5:2 | B4:2 D5:1 E5:1 E5:4 r:2 E5:1 E5:1 E5:4')
ROYAL = 'Cmaj7 . . . | D . . . | Bm7 . . . | Em7 . . . | Cmaj7 . . . | D . . . | G . . . | G . . .'
BAJO_FUNK = 'R:3! R:1? r:2 5:2 8:2 r:2 5:2 A:2'
NYLON = '0.21.2.30.21.2.3'
MARIMBA = '0..2..1.3..2..1.'

CABANA = {
    'id': 'rene-cabana',
    'nombre': 'La cabaña del lago',
    'bpm': 112,
    'tono': 'Sol mayor (sección andina en Mi menor)',
    'swing': 0.08,
    'intro': ['vuelta'],
    'cuerpo': ['groove', 'melodia', 'andino', 'melodia2', 'quiebre', 'vuelta'],
    'reverb': {'sala': 0.74, 'amortiguacion': 0.45},
    'eco': {'tiempo': 0.75, 'feedback': 0.28, 'lp': 4000},
    'pistas': {
        'bombo':        {'inst': 'bombo', 'tipo': 'golpe', 'nivel': -21.0, 'op': {'decaimiento': 0.2, 'clic': 0.5, 'tono': 1.05},
                         'eq': [('hp', 30)]},
        'aro':          {'inst': 'aro', 'tipo': 'golpe', 'nivel': -27.0, 'pan': 0.1, 'reverb': 0.12, 'eq': [('hp', 300)]},
        'caja':         {'inst': 'caja', 'tipo': 'golpe', 'nivel': -25.0, 'reverb': 0.15, 'op': {'tono': 210, 'ruido_dec': 0.11},
                         'eq': [('hp', 130)]},
        'palmas':       {'inst': 'palmas', 'tipo': 'golpe', 'nivel': -25.0, 'pan': -0.1, 'reverb': 0.2, 'eq': [('hp', 300)]},
        'shaker':       {'inst': 'shaker', 'tipo': 'golpe', 'nivel': -30.0, 'pan': 0.35, 'humano': 4},
        'hat':          {'inst': 'hat', 'tipo': 'golpe', 'nivel': -33.0, 'pan': -0.3},
        'crash':        {'inst': 'platillo', 'tipo': 'golpe', 'nivel': -31.0, 'reverb': 0.1, 'pan': 0.2},
        'leguero':      {'inst': 'tom', 'tipo': 'golpe', 'nivel': -22.5, 'reverb': 0.15, 'op': {'f': 72, 'decaimiento': 0.35},
                         'eq': [('hp', 45)]},
        'leguero_aro':  {'inst': 'aro', 'tipo': 'golpe', 'nivel': -28.0, 'pan': -0.1, 'op': {'tono': 0.6}, 'eq': [('hp', 250)]},
        'tom1':         {'inst': 'tom', 'tipo': 'golpe', 'nivel': -25.0, 'pan': -0.25, 'op': {'f': 160}, 'eq': [('hp', 70)]},
        'tom2':         {'inst': 'tom', 'tipo': 'golpe', 'nivel': -25.0, 'pan': 0.25, 'op': {'f': 110}, 'eq': [('hp', 60)]},
        'bajo':         {'inst': 'bajo_dedo', 'tipo': 'bajo', 'grave': 'E1', 'nivel': -20.5, 'duck': 0.3,
                         'eq': [('hp', 32), ('lp', 2600)]},
        'nylon':        {'inst': 'nylon', 'tipo': 'arpegio', 'rango': ('G3', 'E5'), 'con_bajo': 'E2', 'nivel': -24.0,
                         'pan': -0.4, 'reverb': 0.18, 'eq': [('hp', 120), ('pico', 220, 2.0), ('pico', 2500, 1.5)]},
        'charango':     {'inst': 'charango', 'tipo': 'rasgueo', 'rango': ('E4', 'B5'), 'voces': 5, 'nivel': -24.5,
                         'pan': 0.4, 'reverb': 0.16, 'eq': [('hp', 220), ('pico', 3000, 2.0)]},
        'charango_mel': {'inst': 'charango', 'tipo': 'notas', 'nivel': -21.0, 'pan': 0.12, 'reverb': 0.15, 'eco': 0.12,
                         'eq': [('hp', 220)]},
        'marimba':      {'inst': 'marimba', 'tipo': 'arpegio', 'rango': ('G4', 'D6'), 'nivel': -24.5, 'pan': 0.35,
                         'reverb': 0.16, 'eq': [('hp', 150)]},
        'quena':        {'inst': 'quena', 'tipo': 'mono', 'nivel': -20.5, 'pan': -0.05, 'reverb': 0.24, 'eco': 0.12,
                         'eq': [('hp', 250)]},
        'epiano':       {'inst': 'epiano', 'tipo': 'acordes', 'rango': ('A3', 'D5'), 'voces': 4, 'nivel': -28.0,
                         'pan': -0.2, 'reverb': 0.15, 'eq': [('hp', 160)]},
        'pad':          {'inst': 'supersaw', 'tipo': 'acordes', 'rango': ('D3', 'A4'), 'voces': 4, 'nivel': -32.0,
                         'duck': 0.25, 'reverb': 0.2, 'eq': [('hp', 160), ('lp', 1500)],
                         'op': {'voces': 3, 'desafine': 9.0, 'ataque': 0.35, 'liberacion': 0.8}},
    },
    'secciones': {
        # Vuelta (también es la intro): ii–V con el charango en ritmo de huayno.
        'vuelta': {
            'compases': 2,
            'acordes': 'Am7 . . . | D7 . . .',
            'charango': 'D.du D.du D.du D.du',
            'bajo': 'A1:4 C2:4 E2:4 A1:2 B1:2 | D2:4 C2:4 B1:2 A1:2 F#1:4',
            'bateria': {
                'bombo': 'X.......X....... | X.......X...X.X.',
                'palmas': '....X.......X... | ....X.......X.X.',
                'shaker': 'x.oox.oox.oox.oo',
                'tom1': '................ | ............xX..',
                'tom2': '................ | ..............xX',
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        'groove': {
            'compases': 8,
            'acordes': 'G . . . | D/F# . . . | Em7 . . . | Cmaj7 . . . | G . . . | D/F# . . . | Em7 . . . | Am7 . D7 .',
            'nylon': NYLON,
            'marimba': MARIMBA,
            'bajo': BAJO_FUNK,
            'epiano': '..x...x...x...x.',
            'pad': 'X---------------',
            'bateria': {
                'bombo': 'X.....x.X.......',
                'aro': '....x.......x...',
                'shaker': 'xoxoXoxoxoxoXoxo',
                'hat': '..o...o...o...o.',
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        'melodia': {
            'compases': 8,
            'acordes': ROYAL,
            'quena': QUENA_A + QUENA_B,
            'nylon': NYLON,
            'marimba': {'p': MARIMBA, 'vel': 0.75},
            'bajo': BAJO_FUNK,
            'epiano': '..x...x...x...x.',
            'pad': 'X---------------',
            'bateria': {
                'bombo': 'X.....x.X.....x.',
                'aro': '....x.......x...',
                'caja': {'p': '....x.......x...', 'vel': 0.7},
                'shaker': 'xoxoXoxoxoxoXoxo',
                'hat': '..o...o...o...o.',
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        # Sección andina: huayno en Mi menor, sin swing.
        'andino': {
            'compases': 8,
            'swing': 0.0,
            'acordes': 'Em . . . | D . . . | G . . . | B7 . . . | Em . . . | D . . . | C . B7 . | Em . . .',
            'charango': 'D.du D.du D.du D.du',
            'charango_mel': CHARANGO_HUAYNO,
            'quena': 'r:16 | r:16 | r:16 | r:16 | E5:16 | F#5:16 | G5:8 F#5:8 | E5:12 r:4',
            'bajo': 'R:2! 5:1? 5:1 R:2 5:1? 5:1 R:2! 5:1? 5:1 R:2 5:2',
            'pad': 'X---------------',
            'bateria': {
                'leguero': 'X...X...X...X...',
                'leguero_aro': '..xx..xx..xx..xx',
                'bombo': 'X.......X.......',
                'shaker': 'x.oox.oox.oox.oo',
                'palmas': {'p': '....x.......x...', 'vel': 0.7},
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        'melodia2': {
            'compases': 8,
            'acordes': ROYAL,
            'quena': QUENA_A + QUENA_B2,
            'marimba': {'tipo': 'notas', 'p': QUENA_A + QUENA_B2, 'transp': -12, 'vel': 0.85},
            'charango': '..u...u...u...u.',
            'nylon': NYLON,
            'bajo': BAJO_FUNK,
            'epiano': '..x...x...x...x.',
            'pad': 'X---------------',
            'bateria': {
                'bombo': 'X.....x.X.....x.',
                'caja': '....x.......x...',
                'palmas': '....X.......X...',
                'shaker': 'xoxoXoxoxoxoXoxo',
                'hat': '..x...x...x...x.',
                'crash': {'p': 'X', 'en': [0, 4]},
            },
        },
        # Quiebre: golpes a contratiempo (3 + 3 + 2) con un llamado de la quena.
        'quiebre': {
            'compases': 2,
            'acordes': 'Em7 . . . | Cmaj7 . . .',
            'bajo': 'R:6! R:6! R:4! | R:6! R:4! R:2! R:4!',
            'charango': 'D.....D.....D... | D.....D...D.D...',
            'epiano': 'X.....X.....X... | X.....X...X.X...',
            'quena': 'r:8 B5:2 A5:2 G5:2 E5:2 | G5:4 A5:4 B5:8',
            'bateria': {
                'bombo': 'X.....X.....X... | X.....X...X.X...',
                'palmas': '......X.....X... | ......X...X.X...',
                'shaker': 'x.oox.oox.oox.oo',
                'crash': {'p': 'X', 'en': [0]},
            },
        },
    },
}

# ── «La plaza de la pobla» (escenario de Loco René, de noche) ───────────
# La menor a 100: batalla de freestyle. 808 con deslizamientos, boom bap con swing, una
# sección con dembow y otra en medio tiempo de trap con hi-hats en redoble. El gancho es un
# pluck con ritmo 3+3+2; scratch de vinilo y '¡hey!' de público hechos con síntesis.

HOOK_A = ('E5:3 E5:3 C5:2 D5:3 E5:3 A4:2 | C5:3 B4:3 A4:2 G4:4 A4:4 | '
          'F5:3 F5:3 E5:2 D5:3 C5:3 A4:2 | B4:3 G#4:3 E4:2 G#4:4 B4:4 | ')
HOOK_B = 'E5:3 E5:3 C5:2 D5:3 E5:3 G5:2 | A5:3 G5:3 E5:2 D5:4 C5:4 | '
HOOK_C = 'F5:3 E5:3 D5:2 C5:3 B4:3 A4:2 | G#4:3 B4:3 E5:2 D5:3 B4:3 G#4:2'
BAJO_BOOMBAP = ('A1:6 r:1 A1:3 r:2 A1:2 G1:2> | A1:6 r:1 A1:3 r:2 C2:2 A1:2> | '
                'F1:6 r:1 F1:3 r:2 F1:2 A1:2> | E1:6 r:1 E1:3 r:2 E2:2> E1:2>')
BOMBO_BOOMBAP = 'X......X..X..... | X......X..X..... | X......X..X..... | X......X..X...x.'
MENOR = 'Am . . . | Am . . . | F . . . | E . . .'

PLAZA = {
    'id': 'rene-plaza',
    'nombre': 'La plaza de la pobla',
    'bpm': 100,
    'tono': 'La menor (Mi mayor de la menor armónica)',
    'intro': ['cierre'],
    'cuerpo': ['beat', 'dembow', 'trap', 'beat2', 'cierre'],
    'reverb': {'sala': 0.82, 'amortiguacion': 0.45},
    'eco': {'tiempo': 0.75, 'feedback': 0.38, 'lp': 3500},
    'duck_liberacion': 0.1,
    'pistas': {
        'bombo':   {'inst': 'bombo', 'tipo': 'golpe', 'nivel': -19.5, 'eq': [('hp', 38)],
                    'op': {'decaimiento': 0.24, 'clic': 1.0, 'tono': 1.0, 'saturacion': 2.6}},
        'caja':    {'inst': 'caja', 'tipo': 'golpe', 'nivel': -22.0, 'reverb': 0.14, 'eq': [('hp', 120)],
                    'op': {'tono': 190, 'ruido_dec': 0.13, 'cuerpo': 1.3}},
        'palmas':  {'inst': 'palmas', 'tipo': 'golpe', 'nivel': -23.0, 'reverb': 0.16, 'pan': 0.05, 'eq': [('hp', 300)]},
        'hat':     {'inst': 'hat', 'tipo': 'golpe', 'nivel': -31.0, 'pan': 0.3, 'humano': 3},
        'hat_ab':  {'inst': 'hat', 'tipo': 'golpe', 'nivel': -31.0, 'pan': 0.22, 'op': {'abierto': True}},
        'perc':    {'inst': 'aro', 'tipo': 'golpe', 'nivel': -29.0, 'pan': -0.4, 'eq': [('hp', 300)]},
        'crash':   {'inst': 'platillo', 'tipo': 'golpe', 'nivel': -30.0, 'reverb': 0.1},
        'vinilo':  {'inst': 'vinilo', 'tipo': 'fx', 'nivel': -40.0},
        's808':    {'inst': '808', 'tipo': 'mono', 'nivel': -20.5, 'duck': 0.35, 'eq': [('hp', 28), ('lp', 5000)]},
        'pad':     {'inst': 'supersaw', 'tipo': 'acordes', 'rango': ('E3', 'C5'), 'voces': 4, 'nivel': -27.5,
                    'duck': 0.3, 'reverb': 0.25, 'eq': [('hp', 180)], 'corte': 1600, 'lfo': (0.6, 8),
                    'op': {'voces': 5, 'desafine': 14.0, 'ataque': 0.25, 'liberacion': 0.6}},
        'hook':    {'inst': 'pluck', 'tipo': 'notas', 'nivel': -21.0, 'eco': 0.22, 'reverb': 0.12, 'eq': [('hp', 200)]},
        'campana': {'inst': 'campana', 'tipo': 'notas', 'nivel': -27.5, 'eco': 0.3, 'reverb': 0.3, 'pan': 0.35,
                    'eq': [('hp', 400)], 'op': {'indice': 1.6, 'caida': 2.2}},
        'scratch': {'inst': 'scratch', 'tipo': 'scratch', 'nivel': -25.0, 'pan': -0.15},
        'hey':     {'inst': 'hey', 'tipo': 'golpe', 'nivel': -25.0, 'reverb': 0.25},
        'reverso': {'inst': 'reverso', 'tipo': 'fx', 'nivel': -30.0},
    },
    'secciones': {
        # Cierre (también es la intro): corte con scratch, '¡hey!' y redoble.
        'cierre': {
            'compases': 2,
            'acordes': 'F . . . | E . . .',
            'pad': {'p': 'X---------------', 'corte': (900, 2400)},
            'hook': 'F5:3 F5:3 E5:2 D5:3 C5:3 A4:2 | B4:3 G#4:3 E4:2 G#4:4 B4:4',
            'scratch': 'b-b-c.c.b---t--- | b-b-b-c.t-------',
            's808': 'F1:16 | E1:8 E2:4> E1:4>',
            'hey': '................ | ........X...X...',
            'reverso': '................ | ........X',
            'vinilo': {'p': 'X', 'en': [0]},
            'bateria': {
                'bombo': 'X............... | X...............',
                'caja': {'p': '................ | ........x.x.xxXX', 'cresc': (0.5, 1.0)},
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        # Boom bap con swing: el gancho completo.
        'beat': {
            'compases': 8,
            'swing': 0.1,
            'acordes': MENOR,
            'hook': HOOK_A + HOOK_B + HOOK_C,
            's808': BAJO_BOOMBAP,
            'pad': 'X---------------',
            'vinilo': {'p': 'X', 'en': [0]},
            'scratch': {'p': '........b-b-c.c.', 'en': [7]},
            'bateria': {
                'bombo': BOMBO_BOOMBAP,
                'caja': '....X.......X... | ....X.......X... | ....X.......X... | ....X.......X.g.',
                'hat': 'x.o.x.o.x.o.x.o.',
                'hat_ab': {'p': '..............x.', 'en': [3, 7]},
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        # Dembow: bombo a negras, caja en 3-6-11-14, 808 en tresillo y el gancho arpegiado.
        'dembow': {
            'compases': 8,
            'acordes': MENOR,
            'hook': ('A4:3 C5:3 E5:2 A4:3 C5:3 E5:2 | G5:3 E5:3 D5:2 C5:4 r:4 | '
                     'F4:3 A4:3 C5:2 F4:3 A4:3 C5:2 | E5:3 D5:3 B4:2 G#4:4 r:4'),
            'campana': 'r:16 | r:16 | r:16 | r:16 | E6:8 D6:4 C6:4 | B5:8 A5:8 | A5:8 C6:4 F6:4 | E6:12 r:4',
            's808': ('A1:3 A1:3 A1:2 A1:3 A1:3 A1:2 | A1:3 A1:3 A1:2 C2:3 C2:3 D2:2> | '
                     'F1:3 F1:3 F1:2 F1:3 F1:3 G1:2> | E1:3 E1:3 E1:2 E1:3 G#1:3 B1:2>'),
            'pad': 'X---------------',
            'hey': {'p': '............X...', 'en': [1, 3, 5, 7]},
            'vinilo': {'p': 'X', 'en': [0]},
            'scratch': {'p': '............b-b-', 'en': [7]},
            'bateria': {
                'bombo': 'X...X...X...X...',
                'caja': '...x..x....x..x.',
                'palmas': '...x..x....x..x.',
                'hat': 'x.x.x.x.x.x.x.x.',
                'perc': '..o...o...o...o.',
                'crash': {'p': 'X', 'en': [0, 4]},
            },
        },
        # Trap en medio tiempo: caja en el 3, hi-hats en redoble, 808 largo y campana oscura.
        'trap': {
            'compases': 8,
            'acordes': 'Am . . . | F . . . | Dm . . . | E . . .',
            's808': 'A1:10 C2:3> A1:3> | F1:10 A1:3> F1:3> | D2:10 F2:3> D2:3> | E1:8 E2:4> B1:4>',
            'campana': ('A5:4 C6:4 E6:4 D6:4 | C6:8 A5:8 | F5:4 A5:4 D6:4 C6:4 | B5:8 G#5:8 | '
                        'A5:4 C6:4 E6:4 D6:4 | C6:8 A5:8 | F5:4 A5:4 D6:4 F6:4 | E6:8 B5:4 G#5:4'),
            'pad': {'p': 'X---------------', 'corte': (1200, 2600)},
            'vinilo': {'p': 'X', 'en': [0]},
            'scratch': {'p': '........b-b-c.c.', 'en': [3]},
            'hey': {'p': '........X...X...', 'en': [7]},
            'reverso': {'p': '........X', 'en': [7]},
            'bateria': {
                'bombo': 'X.........X..... | X......X..X..X.. | X.........X..... | X......X...X.X..',
                'caja': '........X.......',
                'palmas': '........X.......',
                'hat': 'x.x.x.x.x.x.3.x. | x.x.x.2.x.x.x.4. | x.x.x.x.x.3.x.x. | x.x.2.x.x.x.4444',
                'crash': {'p': 'X', 'en': [0]},
            },
        },
        'beat2': {
            'compases': 6,
            'swing': 0.1,
            'acordes': 'Am . . . | Am . . . | F . . . | E . . . | Am . . . | Am . . .',
            'hook': HOOK_A + HOOK_B,
            'campana': 'A5:8 E6:8 | D6:4 C6:4 B5:8 | C6:8 A5:8 | B5:4 G#5:4 E5:8 | A5:8 E6:8 | D6:4 C6:4 E6:8',
            's808': BAJO_BOOMBAP,
            'pad': 'X---------------',
            'hey': {'p': '............X...', 'en': [1, 3, 5]},
            'vinilo': {'p': 'X', 'en': [0]},
            'bateria': {
                'bombo': BOMBO_BOOMBAP,
                'caja': '....X.......X...',
                'palmas': '....X.......X...',
                'hat': 'x.o.x.o.x.o.x.o.',
                'hat_ab': {'p': '..............x.', 'en': [3]},
                'crash': {'p': 'X', 'en': [0]},
            },
        },
    },
}

CANCIONES = {c['id']: c for c in (TITULO, CABANA, PLAZA)}


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass
    args = sys.argv[1:]
    carpeta_pistas = None
    if '--pistas' in args:
        i = args.index('--pistas')
        carpeta_pistas = pathlib.Path(args[i + 1]).resolve()
        carpeta_pistas.mkdir(parents=True, exist_ok=True)
        del args[i:i + 2]
    desconocidas = [a for a in args if a not in CANCIONES]
    if desconocidas:
        raise SystemExit(f'canciones desconocidas: {desconocidas}; hay {list(CANCIONES)}')
    CARPETA.mkdir(parents=True, exist_ok=True)
    ARTE.mkdir(parents=True, exist_ok=True)
    ruta_json = CARPETA / 'musica.json'
    datos = json.loads(ruta_json.read_text(encoding='utf-8')) if ruta_json.exists() else {}
    for id_ in args or list(CANCIONES):
        datos[id_] = procesar(CANCIONES[id_], carpeta_pistas)
    datos = {k: datos[k] for k in CANCIONES if k in datos}
    ruta_json.write_text(json.dumps(datos, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'\n{ruta_json.relative_to(RAIZ)} actualizado')


if __name__ == '__main__':
    main()
