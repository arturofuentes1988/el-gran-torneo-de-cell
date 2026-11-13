"""Hace los íconos de la app (public/iconos/): la cara de Tío René, sacada de su diseño aprobado,
sobre el morado del juego. Los usan la web (manifest.webmanifest, para instalarla en el celular)
y el APK de Android (herramientas/apk.mjs).

Uso: python -P -E herramientas/icono_app.py

- icono-512.png e icono-192.png: con esquinas redondeadas (el ícono normal).
- icono-mascara-512.png: a sangre, con la cara dentro del círculo del centro (Android lo recorta
  con la forma que use cada celular).
- icono-apple-180.png: cuadrado sin transparencia (el iPhone lo redondea solo).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from video_a_cuadros import quitar_fondo  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DISENO = RAIZ / "arte" / "loco-rene" / "diseno-final.png"
SALIDA = RAIZ / "public" / "iconos"
LADO = 1024  # se trabaja al doble y se achica al final


def busto() -> tuple[Image.Image, float, float, float]:
    """El luchador recortado (RGBA) y dónde está su cabeza: centro (x, y) y tamaño."""
    rgb = np.asarray(Image.open(DISENO).convert("RGB"))
    m = quitar_fondo(rgb, 30, 22)
    ys, _ = np.nonzero(m)
    top, base = ys.min(), ys.max()
    alto = base - top
    # Igual que herramientas/caras.py: la piel de la franja de la cabeza da el centro de la cara.
    f = rgb.astype(np.float32) / 255
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    piel = m & (r > g) & (g > b * 0.9) & (sat > 0.18) & (sat < 0.75) & (mx > 0.18)
    py, px = np.nonzero(piel[top:top + int(alto * 0.2)])
    cx, cy = float(np.median(px)), top + float(np.median(py))
    alfa = ndimage.binary_erosion(m, iterations=1).astype(np.float32)
    alfa = ndimage.gaussian_filter(alfa, 0.8)
    rgba = np.dstack([rgb, (alfa * 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA"), cx, cy, alto * 0.19


def fondo() -> Image.Image:
    """El morado del juego: más claro al centro, casi negro en las orillas, con un brillo rosado abajo."""
    y, x = np.mgrid[0:LADO, 0:LADO].astype(np.float32) / LADO
    d = np.clip(np.hypot(x - 0.5, y - 0.42) / 0.75, 0, 1)[..., None]
    centro = np.array([92, 30, 132], np.float32)
    orilla = np.array([14, 5, 24], np.float32)
    img = centro * (1 - d) ** 1.6 + orilla * (1 - (1 - d) ** 1.6)
    rosa = np.clip(1 - np.hypot(x - 0.5, y - 1.05) / 0.6, 0, 1)[..., None] ** 2
    img = img + np.array([255, 60, 190], np.float32) * rosa * 0.35
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def componer(cabeza: float, centro_y: float) -> Image.Image:
    """El busto sobre el fondo: la cabeza ocupa `cabeza` del lado y su centro queda a `centro_y` del alto."""
    arte, cx, cy, tam = busto()
    escala = LADO * cabeza / tam
    w, h = round(arte.width * escala), round(arte.height * escala)
    arte = arte.resize((w, h), Image.LANCZOS)
    x0, y0 = round(LADO / 2 - cx * escala), round(LADO * centro_y - cy * escala)
    lienzo = fondo()
    # Un resplandor dorado detrás de la silueta, para despegarla del fondo.
    silueta = Image.new("L", (LADO, LADO), 0)
    silueta.paste(arte.getchannel("A"), (x0, y0))
    brillo = silueta.filter(ImageFilter.GaussianBlur(LADO * 0.03))
    oro = Image.new("RGBA", (LADO, LADO), (255, 208, 64, 255))
    lienzo = Image.composite(oro, lienzo, brillo.point(lambda v: int(v * 0.45)))
    capa = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    capa.paste(arte, (x0, y0))
    return Image.alpha_composite(lienzo, capa)


def redondear(img: Image.Image, radio: float, borde: float) -> Image.Image:
    """Esquinas redondeadas con un borde dorado (como las cajas de la web)."""
    n = img.width
    mascara = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, n - 1, n - 1), radius=n * radio, fill=255)
    marco = ImageDraw.Draw(img)
    g = round(n * borde)
    marco.rounded_rectangle((g // 2, g // 2, n - 1 - g // 2, n - 1 - g // 2), radius=n * radio - g // 2, outline=(255, 215, 106, 255), width=g)
    img.putalpha(mascara)
    return img


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    normal = redondear(componer(0.66, 0.47), 0.2, 0.022)
    normal.resize((512, 512), Image.LANCZOS).save(SALIDA / "icono-512.png", optimize=True)
    normal.resize((192, 192), Image.LANCZOS).save(SALIDA / "icono-192.png", optimize=True)
    # A sangre: la cara más chica, dentro del círculo seguro (80 % del lado).
    mascara = componer(0.5, 0.47)
    mascara.convert("RGB").resize((512, 512), Image.LANCZOS).save(SALIDA / "icono-mascara-512.png", optimize=True)
    componer(0.66, 0.47).convert("RGB").resize((180, 180), Image.LANCZOS).save(SALIDA / "icono-apple-180.png", optimize=True)
    for p in sorted(SALIDA.glob("*.png")):
        print("escrito", p.relative_to(RAIZ), p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
