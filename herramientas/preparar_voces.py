"""Prepara las voces del anunciador para el juego.

Lee arte/voces/originales/*.mp3, recorta el silencio de los bordes, comprime,
agrega un eco corto de estadio, normaliza el pico a -1 dBFS y escribe
public/voces/<nombre>.mp3 y public/voces/voces.json (nombre de muestra → archivo).

Uso: python herramientas/preparar_voces.py
"""
import json
import pathlib
import subprocess
import tempfile

import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'arte' / 'voces' / 'originales'
DESTINO = RAIZ / 'public' / 'voces'

# Archivo original → nombre de la muestra en el juego (ver src/audio/announcer.ts).
VOCES = {
    'round1.mp3': 'voz/round1', 'round2.mp3': 'voz/round2', 'round3.mp3': 'voz/round3',
    'round4.mp3': 'voz/round4', 'final.mp3': 'voz/final', 'fight-a.mp3': 'voz/fight',
    'ko.mp3': 'voz/ko', 'doubleKo.mp3': 'voz/doubleKo', 'perfect.mp3': 'voz/perfect',
    'time.mp3': 'voz/time', 'draw.mp3': 'voz/draw',
}

CADENA = ','.join([
    'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.01',
    'areverse', 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03', 'areverse',
    'acompressor=threshold=-20dB:ratio=4:attack=4:release=140:makeup=3',
    'aecho=0.85:0.55:65|130:0.20|0.10',
    'apad=pad_dur=0.35',
])


def pico(wav: pathlib.Path) -> float:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(wav), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    return float(np.abs(x).max()) if len(x) else 1.0


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    manifiesto = {}
    with tempfile.TemporaryDirectory() as tmp:
        for archivo, nombre in VOCES.items():
            src = ORIGEN / archivo
            if not src.exists():
                print('falta', src)
                continue
            wav = pathlib.Path(tmp) / (src.stem + '.wav')
            subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', str(src), '-af', CADENA, '-ac', '1', '-ar', '44100', str(wav)], check=True)
            ganancia = 20 * np.log10(0.89 / max(1e-4, pico(wav)))
            salida = DESTINO / (nombre.split('/')[-1] + '.mp3')
            subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', str(wav), '-af', f'volume={ganancia:.2f}dB',
                            '-codec:a', 'libmp3lame', '-b:a', '128k', str(salida)], check=True)
            dur = float(subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(salida)],
                                       capture_output=True, text=True).stdout.strip() or 0)
            manifiesto[nombre] = salida.name
            print(f'{nombre:14s} -> {salida.name:14s} {dur:4.2f} s  ganancia {ganancia:+.1f} dB')
    (DESTINO / 'voces.json').write_text(json.dumps(manifiesto, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('escrito', DESTINO / 'voces.json')


if __name__ == '__main__':
    main()
