"""Hace la cara de cada luchador para ELIGE LUCHADOR (public/luchadores/<id>/cara.webp):
un cuadrado de la cabeza sacado de su diseño aprobado, con fondo transparente.

Uso: python -P -E herramientas/caras.py
Para un luchador nuevo, agrégalo a LUCHADORES (id del juego y archivo de su diseño).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from video_a_cuadros import quitar_fondo  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
LUCHADORES = {
    "rene": "arte/loco-rene/diseno-final.png",
    "pablito": "arte/pablito-neuquen/diseno-final.png",
    "flaitiano": "arte/flaitiano/diseno-final.png",
    "lena": "arte/vendedor-de-lena/diseno-final.png",
}
LADO = 160


def cara(ruta: Path) -> Image.Image:
    rgb = np.asarray(Image.open(ruta).convert("RGB"))
    m = quitar_fondo(rgb, 30, 22)
    ys, xs = np.nonzero(m)
    top, base = ys.min(), ys.max()
    alto = base - top
    # Piel en la franja de la cabeza: tonos cálidos medianamente saturados.
    f = rgb.astype(np.float32) / 255
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    piel = m & (r > g) & (g > b * 0.9) & (sat > 0.18) & (sat < 0.75) & (mx > 0.18)
    franja = slice(top, top + int(alto * 0.2))
    py, px = np.nonzero(piel[franja])
    if len(px) < 50:
        cx, cy = xs.mean(), top + alto * 0.1
    else:
        cx, cy = float(np.median(px)), top + float(np.median(py))
    lado = int(alto * 0.19)
    x0 = int(cx - lado / 2)
    y0 = int(cy - lado * 0.48)
    rgba = np.dstack([rgb, (ndimage.binary_erosion(m, iterations=1) * 255).astype(np.uint8)])
    lienzo = np.zeros((lado, lado, 4), np.uint8)
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(rgb.shape[1], x0 + lado), min(rgb.shape[0], y0 + lado)
    lienzo[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = rgba[sy0:sy1, sx0:sx1]
    return Image.fromarray(lienzo, "RGBA").resize((LADO, LADO), Image.LANCZOS)


def main() -> None:
    for id_, archivo in LUCHADORES.items():
        salida = RAIZ / "public" / "luchadores" / id_ / "cara.webp"
        cara(RAIZ / archivo).save(salida, quality=92)
        print("escrito", salida)


if __name__ == "__main__":
    main()
