"""Hoja de línea de tiempo para elegir cuadros: una fila por clip, cada N
cuadros, con el número de cada uno encima.

Uso:
  python herramientas/linea_de_tiempo.py CARPETA_CLIPS SALIDA.png clip1 clip2 ... [--paso 3]
(CARPETA_CLIPS/<clip>/cuadros/0000.png..., como los deja video_a_cuadros.py)
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    args = sys.argv[1:]
    paso = 3
    if "--paso" in args:
        i = args.index("--paso")
        paso = int(args[i + 1])
        del args[i:i + 2]
    carpeta, salida, clips = Path(args[0]), Path(args[1]), args[2:]
    alto, etiqueta = 120, 18
    fuente = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 14)
    titulo = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 16)
    filas = []
    for clip in clips:
        rutas = sorted((carpeta / clip / "cuadros").glob("*.png"))[::paso]
        thumbs = []
        for r in rutas:
            im = Image.open(r).convert("RGBA")
            f = alto / im.height
            thumbs.append((int(r.stem), im.resize((max(1, int(im.width * f)), alto), Image.LANCZOS)))
        ancho = sum(t.width for _, t in thumbs) + 4 * len(thumbs) + 150
        fila = Image.new("RGBA", (ancho, alto + etiqueta), (34, 30, 42, 255))
        d = ImageDraw.Draw(fila)
        d.text((6, alto // 2), clip, fill=(255, 214, 64), font=titulo)
        x = 150
        for n, t in thumbs:
            fila.alpha_composite(t, (x, etiqueta))
            d.text((x + 2, 1), str(n), fill=(160, 230, 255), font=fuente)
            x += t.width + 4
        filas.append(fila)
    hoja = Image.new("RGBA", (max(f.width for f in filas), sum(f.height + 6 for f in filas)), (20, 18, 26, 255))
    y = 0
    for f in filas:
        hoja.alpha_composite(f, (0, y))
        y += f.height + 6
    hoja.save(salida)
    print(salida, hoja.size)


if __name__ == "__main__":
    main()
