"""Prepara las voces reales de un luchador (frases sacadas de videos) para el juego.

Lee arte/<luchador>/voces/voces.json:
  fuentes  pistas de audio de origen (ya con la voz separada de la música), relativas al json
  cortes   nombre → { fuente, desde, hasta (segundos), texto }
  claves   clave del motor ("voz/queriToo"…) → nombre de corte o lista de cortes (variantes al azar)
  salida   carpeta de destino, relativa a la raíz del proyecto

Cada corte se limpia (paso alto, paso bajo suave, compresión, fundidos cortos), se
normaliza el pico a -1 dBFS y se escribe como MP3 mono en la salida. Opciones por corte:
"limpiar": false (sin filtros ni compresión, para un pedazo de canción), "estereo": true y
"fundido" (segundos del fundido final). En la salida queda también voces.json
(clave → archivo o lista de archivos). El juego lo carga con el prefijo
"<id del luchador>/" (ver docs/FORMATO_SPRITES.md §12).

Uso: python -P -E herramientas/voces_luchador.py arte/loco-rene/voces/voces.json
"""
import json
import pathlib
import subprocess
import sys
import tempfile

import numpy as np

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def pico(wav: pathlib.Path) -> float:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(wav), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    return float(np.abs(x).max()) if len(x) else 1.0


def main(ruta: str) -> None:
    cfg_path = pathlib.Path(ruta).resolve()
    cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
    salida = RAIZ / cfg['salida']
    salida.mkdir(parents=True, exist_ok=True)
    archivos = {}
    with tempfile.TemporaryDirectory() as tmp:
        for nombre, c in cfg['cortes'].items():
            src = cfg_path.parent / cfg['fuentes'][c['fuente']]['archivo']
            dur = c['hasta'] - c['desde']
            fundido = c.get('fundido', 0.05)
            # "limpiar": false deja el audio tal cual (ej. un pedazo de canción con su beat): solo fundidos.
            limpieza = ['highpass=f=90', 'lowpass=f=9500', 'acompressor=threshold=-18dB:ratio=3:attack=5:release=120:makeup=2']
            cadena = ','.join([
                *(limpieza if c.get('limpiar', True) else []),
                'afade=t=in:d=0.012', f'afade=t=out:st={max(0.0, dur - fundido):.3f}:d={fundido:.3f}',
                'apad=pad_dur=0.06',
            ])
            canales = '2' if c.get('estereo') else '1'
            wav = pathlib.Path(tmp) / f'{nombre}.wav'
            subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-ss', f"{c['desde']:.3f}", '-t', f'{dur:.3f}', '-i', str(src),
                            '-af', cadena, '-ac', canales, '-ar', '44100', str(wav)], check=True)
            ganancia = 20 * np.log10(0.89 / max(1e-4, pico(wav)))
            mp3 = salida / f'{nombre}.mp3'
            subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', str(wav), '-af', f'volume={ganancia:.2f}dB',
                            '-codec:a', 'libmp3lame', '-b:a', '128k', str(mp3)], check=True)
            archivos[nombre] = mp3.name
            print(f'{nombre:20s} {dur:4.2f} s  ganancia {ganancia:+5.1f} dB  {c.get("texto", "")}')
    manifiesto = {}
    for clave, valor in cfg['claves'].items():
        lista = valor if isinstance(valor, list) else [valor]
        faltan = [v for v in lista if v not in archivos]
        if faltan:
            raise SystemExit(f'La clave {clave} usa cortes que no existen: {faltan}')
        files = [archivos[v] for v in lista]
        manifiesto[clave] = files if len(files) > 1 else files[0]
    (salida / 'voces.json').write_text(json.dumps(manifiesto, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('escrito', salida / 'voces.json', f'({len(manifiesto)} claves)')


if __name__ == '__main__':
    main(sys.argv[1])
