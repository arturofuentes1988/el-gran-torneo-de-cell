"""Voltea solo las piernas de unos cuadros de un clip (fondo verde): la patada que Kling tiró hacia atrás sale
hacia adelante, sin tocar la cabeza, los brazos ni la guardia.

Uso:
  python herramientas/voltear_piernas.py <origen.mp4> <salida.mp4> --desde 28 --hasta 53 [--eje 26] [--corte 950]

Kling a veces estira la pierna de atrás (la del lado izquierdo de la imagen) aunque se le pida la de adelante: le
pasó tres veces a la patada baja del Dr. Maki Gero. Si la patada está limpia, se arregla sin gastar: los cuadros
de `--desde` a `--hasta` se voltean en espejo sobre el eje del cuerpo agachado (el centro de los pies en el
cuadro `--eje`, que tiene que ser una postura pareja) y se pega el original arriba y el volteado abajo.

La costura no es una línea recta: en cada columna va a la altura (entre `--corte` - 50 y `--corte` + 55) donde el
original y el volteado más se parecen, así pasa por la polera negra o por el fondo y no corta la bata ni los
brazos. Después se borran los pedacitos sueltos que quedan cortados (menos de 4000 pixeles). `--corte` va un poco
bajo los antebrazos de la guardia. Revisar el resultado con una hoja de cuadros antes de armar.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

BANDA = 3  # mezcla suave de la costura, en pixeles


def leer(video: Path) -> list[np.ndarray]:
    tmp = Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), str(tmp / "%03d.png")], check=True)
    return [np.asarray(Image.open(f).convert("RGB")).astype(np.float32) for f in sorted(tmp.glob("*.png"))]


def figura(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ~((g > r + 35) & (g > b + 35))


def eje(a: np.ndarray) -> float:
    """Centro de los pies (las últimas 60 filas de la figura)."""
    m = figura(a)
    filas = np.where(m.any(axis=1))[0]
    xs = np.where(m[filas.max() - 60:filas.max() + 1].any(axis=0))[0]
    return (xs.min() + xs.max()) / 2


def voltear(a: np.ndarray, ax: float, fondo: np.ndarray) -> np.ndarray:
    w = a.shape[1]
    v = a[:, ::-1]
    d = int(round(2 * ax - (w - 1)))
    out = np.empty_like(a)
    out[:] = fondo
    if d >= 0:
        out[:, d:] = v[:, :w - d]
    else:
        out[:, :w + d] = v[:, -d:]
    return out


def costura(a: np.ndarray, v: np.ndarray, desde: int, hasta: int) -> np.ndarray:
    """Camino de menor diferencia entre el original y el volteado: una altura por columna."""
    d = ndimage.uniform_filter(np.abs(a[desde:hasta] - v[desde:hasta]).sum(axis=2), 5)
    h, w = d.shape
    acum = d.copy()
    paso = np.zeros((h, w), np.int8)
    for x in range(1, w):
        mejor = np.full(h, np.inf)
        for dy in (-2, -1, 0, 1, 2):
            prev = np.roll(acum[:, x - 1], dy)
            if dy > 0:
                prev[:dy] = np.inf
            if dy < 0:
                prev[dy:] = np.inf
            c = prev + abs(dy) * 6
            m = c < mejor
            mejor[m] = c[m]
            paso[m, x] = dy
        acum[:, x] = mejor + d[:, x]
    y = np.zeros(w, int)
    y[-1] = int(np.argmin(acum[:, -1]))
    for x in range(w - 1, 0, -1):
        y[x - 1] = y[x] - paso[y[x], x]
    return y + desde


def hibrido(a: np.ndarray, ax: float, corte: int, fondo: np.ndarray) -> np.ndarray:
    v = voltear(a, ax, fondo)
    yc = costura(a, v, corte - 50, corte + 55)
    y = np.arange(a.shape[0], dtype=np.float32)[:, None]
    p = np.clip((y - (yc[None, :] - BANDA)) / (2 * BANDA), 0, 1)[:, :, None]
    b = a * (1 - p) + v * p
    etiquetas, n = ndimage.label(figura(b))
    if n > 1:
        areas = ndimage.sum(np.ones_like(etiquetas), etiquetas, index=range(1, n + 1))
        b[np.isin(etiquetas, [k + 1 for k, ar in enumerate(areas) if ar < 4000])] = fondo
    return b


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("origen", type=Path)
    ap.add_argument("salida", type=Path)
    ap.add_argument("--desde", type=int, required=True)
    ap.add_argument("--hasta", type=int, required=True)
    ap.add_argument("--eje", type=int, help="cuadro con la postura pareja (por omisión, --desde - 2)")
    ap.add_argument("--corte", type=int, default=950, help="altura aproximada de la costura, en pixeles del video")
    ap.add_argument("--fps", type=int, default=24)
    args = ap.parse_args()

    fr = leer(args.origen)
    ref = fr[args.eje if args.eje is not None else args.desde - 2]
    ax = eje(ref)
    fondo = np.median(ref[:40, :40].reshape(-1, 3), axis=0)
    print(f"{len(fr)} cuadros, eje x={ax:.1f}")
    tmp = Path(tempfile.mkdtemp())
    for i, a in enumerate(fr):
        b = hibrido(a, ax, args.corte, fondo) if args.desde <= i <= args.hasta else a
        Image.fromarray(b.astype(np.uint8)).save(tmp / f"{i:03d}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(args.fps), "-i", str(tmp / "%03d.png"),
                    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", str(args.salida)], check=True)
    print("listo:", args.salida)


if __name__ == "__main__":
    main()
