"""Prepara un tema (generado o grabado) para sonar en loop en el juego.

  python -P -E herramientas/musica_loop.py <clave> <archivo de audio> <bpm> [--minimo S] [--compases-intro N]

--minimo: largo mínimo del loop en segundos (por defecto 30). Más largo = se repite menos,
pero la costura puede parecerse menos.

Pasos:
  1. Afina el tempo (±3% del dado) y busca la grilla de compases: el pulso con más
     ataques, y como tiempo 1 el de golpes más fuertes.
  2. Busca el par de puntos (inicio temprano, final tardío antes del cierre) donde lo que
     viene después suena más igual, y afina el final con los golpes de batería: el
     salto cae en el mismo punto de la frase aunque el tempo no sea exacto.
  3. Funde los últimos 0,12 s del loop con lo que suena justo antes de su inicio: al
     saltar del final al inicio no hay corte.
  4. Iguala la sonoridad (-16 LUFS, pico -1 dB) y escribe public/musica/<clave>.mp3 y
     su entrada en public/musica/musica.json (loopStart / loopEnd en segundos).
"""
import json
import pathlib
import subprocess
import sys

import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DESTINO = RAIZ / 'public' / 'musica'
SR = 44100
LUFS = -16.0
FUNDIDO = 0.12


def leer(ruta: pathlib.Path) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(ruta), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def envolvente_ataques(mono: np.ndarray, hop: int) -> np.ndarray:
    """Flujo espectral (cuánto "sube" el espectro en cada ventana): marca golpes de batería."""
    n = 2048
    ventanas = (len(mono) - n) // hop
    win = np.hanning(n).astype(np.float32)
    prev = None
    out = np.zeros(ventanas, np.float32)
    for i in range(ventanas):
        mag = np.abs(np.fft.rfft(mono[i * hop:i * hop + n] * win))
        mag = np.log1p(mag)
        if prev is not None:
            out[i] = np.maximum(0, mag - prev).sum()
        prev = mag
    return out






def sonoridad(wav: pathlib.Path) -> float:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(wav), '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True)
    for line in reversed(r.stderr.splitlines()):
        if line.strip().startswith('I:'):
            return float(line.split()[1])
    return LUFS


def main(clave: str, ruta: str, bpm: float, compases_intro: int | None, minimo: float = 30) -> None:
    a = leer(pathlib.Path(ruta))
    mono = a.mean(1)
    dur = len(a) / SR
    # 1) Grilla de pulsos: afina el tempo (±3% del dado) y la fase con más ataques en cada pulso;
    #    después elige cuál de los 4 pulsos es el tiempo 1 (el que tiene los golpes más fuertes).
    hop = 256
    env = envolvente_ataques(mono, hop)
    fps = SR / hop
    env = env / (env.max() + 1e-9)
    ext = np.concatenate([env, np.zeros(8)])
    mejor = (-1.0, bpm, 0.0)
    for b in np.arange(bpm * 0.97, bpm * 1.03, 0.02):
        p = 60.0 / b
        fases = np.arange(0, p, 0.005)
        k = np.arange(0, int((dur - 1) / p))
        idx = np.rint((fases[:, None] + k[None, :] * p) * fps).astype(int)
        idx = np.clip(idx, 0, len(env) - 1)
        puntaje = np.maximum(np.maximum(ext[idx], ext[idx + 1]), ext[np.maximum(idx - 1, 0)]).sum(1)
        i = int(np.argmax(puntaje))
        if puntaje[i] > mejor[0]:
            mejor = (float(puntaje[i]), float(b), float(fases[i]))
    _, bpm, fase_pulso = mejor
    beat = 60.0 / bpm
    compas = beat * 4
    def fuerza(t0: float) -> float:
        idx = np.rint(np.arange(t0, dur - 1, compas) * fps).astype(int)
        return float(env[np.clip(idx, 0, len(env) - 1)].sum())
    fase = max((fase_pulso + j * beat for j in range(4)), key=fuerza)

    # 2) Puntos del loop por parecido: entre un inicio temprano (tras la entrada) y un final
    #    tardío (antes del cierre), el par cuyo "lo que viene después" suena más igual
    #    (timbre y ritmo en ventanas de 50 ms durante 6 s). Así el salto cae en el mismo
    #    punto de la frase musical aunque el tempo no sea exacto.
    hop_f = int(0.05 * SR)
    nfft = 4096
    nf_ = (len(mono) - nfft) // hop_f
    win = np.hanning(nfft).astype(np.float32)
    bordes = np.unique(np.geomspace(3, nfft // 2 - 1, 33).astype(int))
    F = np.zeros((nf_, len(bordes) - 1), np.float32)
    for i in range(nf_):
        mag = np.abs(np.fft.rfft(mono[i * hop_f:i * hop_f + nfft] * win))
        F[i] = np.log1p([mag[x:y].mean() for x, y in zip(bordes[:-1], bordes[1:])])
    F = (F - F.mean(0)) / (F.std(0) + 1e-6)
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-6
    fps_f = SR / hop_f
    W = int(6 * fps_f)
    energia = np.sqrt(np.convolve(mono ** 2, np.ones(hop_f) / hop_f, 'same')[::hop_f][:nf_])
    pleno = np.median(energia) * 0.55
    if compases_intro is not None:
        s_ini = int((fase + compases_intro * compas) * fps_f)
        s_cands = np.arange(s_ini, s_ini + 1)
    else:
        primero = next(i for i in range(nf_) if energia[i] >= pleno and i >= 2 * fps_f)
        s_cands = np.arange(primero, min(primero + int(40 * fps_f), nf_ // 2))
    ultimo = max(i for i in range(nf_ - W) if energia[i] >= pleno)
    e_cands = np.arange(int(s_cands[0] + minimo * fps_f), ultimo)
    S = F[s_cands[0]:s_cands[-1] + W] @ F[e_cands[0]:e_cands[-1] + W].T
    puntaje = np.zeros((len(s_cands), len(e_cands)), np.float32)
    for k in range(W):
        puntaje += S[k:k + len(s_cands), k:k + len(e_cands)]
    puntaje /= W
    largo = (e_cands[None, :] - s_cands[:, None]) / fps_f
    i_s, i_e = np.unravel_index(np.argmax(np.where(largo >= minimo, puntaje + 0.0015 * largo, -9)), puntaje.shape)
    inicio, fin = s_cands[i_s] / fps_f, e_cands[i_e] / fps_f
    parecido = float(puntaje[i_s, i_e])
    # Ajuste fino del final (±60 ms) con los ataques, para que el golpe caiga justo.
    W2 = int(6 * fps)
    A = env[int(inicio * fps):int(inicio * fps) + W2]
    mejor_lag, mejor_c = 0, -2.0
    for lag in range(-int(0.06 * fps), int(0.06 * fps) + 1):
        st = int(fin * fps) + lag
        B = env[st:st + W2]
        if len(B) == len(A) and len(A):
            c = float(np.corrcoef(A, B)[0, 1])
            if c > mejor_c:
                mejor_lag, mejor_c = lag, c
    fin += mejor_lag / fps

    # 3) Fundido de la costura: lo último del loop se transforma en lo que suena antes del inicio.
    out = a[:int(fin * SR)].copy()
    nf = int(FUNDIDO * SR)
    w = np.linspace(0, 1, nf, dtype=np.float32)[:, None]
    i0, i1 = int(fin * SR) - nf, int(inicio * SR) - nf
    out[i0:i0 + nf] = a[i0:i0 + nf] * (1 - w) + a[i1:i1 + nf] * w

    # 4) Sonoridad pareja y MP3.
    DESTINO.mkdir(parents=True, exist_ok=True)
    tmp = DESTINO / f'_{clave}.wav'
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', str(tmp)],
                   input=out.astype(np.float32).tobytes(), check=True)
    ganancia = LUFS - sonoridad(tmp)
    mp3 = DESTINO / f'{clave}.mp3'
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', str(tmp), '-af',
                    f'volume={ganancia:.2f}dB,alimiter=limit=0.89:level=false', '-codec:a', 'libmp3lame', '-b:a', '160k', str(mp3)],
                   check=True)
    tmp.unlink()
    lista_path = DESTINO / 'musica.json'
    lista = json.loads(lista_path.read_text(encoding='utf-8')) if lista_path.exists() else {}
    lista[clave] = {'archivo': mp3.name, 'bpm': round(bpm, 2), 'loopStart': round(inicio, 4), 'loopEnd': round(fin, 4)}
    lista_path.write_text(json.dumps(lista, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{clave}: {mp3.name} {fin:.1f} s, ~{bpm:.1f} bpm, loop {inicio:.2f}-{fin:.2f} s ({fin - inicio:.1f} s), '
          f'parecido {parecido:.2f}, ataques {mejor_c:.2f}, ganancia {ganancia:+.1f} dB')


if __name__ == '__main__':
    args = sys.argv[1:]
    intro = None
    minimo = 30.0
    if '--compases-intro' in args:
        i = args.index('--compases-intro')
        intro = int(args[i + 1])
        del args[i:i + 2]
    if '--minimo' in args:
        i = args.index('--minimo')
        minimo = float(args[i + 1])
        del args[i:i + 2]
    main(args[0], args[1], float(args[2]), intro, minimo)
