"""Convierte un video de animación (personaje sobre fondo plano) en cuadros PNG
transparentes para el juego, más una hoja de contacto y un GIF de vista previa.

Uso:
  python herramientas/video_a_cuadros.py VIDEO CARPETA_SALIDA [--fps 24] [--tolerancia 30]

Pasos:
  1. Extrae los cuadros con ffmpeg.
  2. Quita el fondo: parte de los bordes y "inunda" solo los pixeles parecidos al
     color de fondo, así no se borran grises que estén dentro del personaje
     (zapatillas, dientes).
  3. Recorta todos los cuadros con la misma caja (la unión de todos), para que el
     personaje no salte entre un cuadro y otro.
  4. Escribe cuadros/0000.png..., contacto.png y vista.gif.
"""

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def extraer(video: Path, fps: int, destino: Path) -> list[Path]:
    destino.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(video), "-vf", f"fps={fps}", str(destino / "%04d.png")],
        check=True,
    )
    return sorted(destino.glob("*.png"))


def color_fondo(rgb: np.ndarray) -> np.ndarray:
    borde = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    return np.median(borde, axis=0)


def quitar_fondo(rgb: np.ndarray, tolerancia: float, huecos_sd: float | None = None) -> np.ndarray:
    """Devuelve la máscara del personaje (True = personaje).

    huecos_sd: para ropa blanca o gris claro (ej. el Flaitiano), un hueco encerrado solo es
    fondo si además su luminancia es pareja (desviación menor que esto). El fondo, aun con
    su degradado, es parejo; una chaqueta blanca tiene luces y sombras.
    """
    fondo = color_fondo(rgb)
    f = rgb.astype(np.float32)
    dist = np.sqrt(((f - fondo) ** 2).sum(axis=2))
    # El fondo de los videos trae un degradado más claro cerca del personaje:
    # también cuenta como fondo cualquier gris claro o blanco. El contorno oscuro
    # del personaje impide que la inundación entre a sus zonas blancas.
    maximo = f.max(axis=2)
    saturacion = (maximo - f.min(axis=2)) / np.maximum(maximo, 1)
    parecido = (dist < tolerancia) | ((f.mean(axis=2) > 150) & (saturacion < 0.12))
    # Solo es fondo lo parecido que está conectado con el borde. El contorno se
    # engruesa 2 px para que la inundación no se cuele por los cortes del trazo
    # (entraba a las zapatillas); después recupera ese fondo pegado al contorno.
    cerrado = parecido & ~ndimage.binary_dilation(~parecido, iterations=2)
    etiquetas, _ = ndimage.label(cerrado)
    borde = np.unique(np.concatenate([etiquetas[0], etiquetas[-1], etiquetas[:, 0], etiquetas[:, -1]]))
    es_fondo = np.isin(etiquetas, borde[borde > 0])
    es_fondo = ndimage.binary_dilation(es_fondo, iterations=3, mask=parecido)
    personaje = ~es_fondo
    # Limpieza: se queda con las manchas grandes y rellena hoyos chicos.
    etiq, n = ndimage.label(personaje)
    if n > 1:
        tam = ndimage.sum(personaje, etiq, range(1, n + 1))
        grandes = np.isin(etiq, np.nonzero(tam >= max(200, tam.max() * 0.02))[0] + 1)
        personaje = grandes
    personaje = ndimage.binary_fill_holes(personaje) & ~(es_fondo & ~ndimage.binary_fill_holes(personaje))
    # Huecos de fondo encerrados (entre el brazo y el cuerpo, dentro del lazo de
    # una cadena): manchas grandes y lisas, del gris del fondo o algo más claras.
    # Las partes grises o blancas de la ropa (zapatillas, dientes) tienen dibujo
    # por dentro, o son más oscuras o más blancas que el fondo, así que se quedan.
    hueco = parecido & personaje
    etiq, n = ndimage.label(hueco)
    if n:
        idx = range(1, n + 1)
        lum = f.mean(axis=2)
        gy, gx = np.gradient(ndimage.gaussian_filter(lum, 1))
        interior = etiq * ndimage.binary_erosion(hueco, iterations=2)
        tam = ndimage.sum(hueco, etiq, idx)
        claro = ndimage.mean(lum, etiq, idx)
        dibujo = np.nan_to_num(ndimage.mean(np.hypot(gx, gy), interior, idx), nan=99)
        gris = float(fondo.mean())
        if huecos_sd is None:
            parejo = [True] * n
        else:
            desv = np.sqrt(np.maximum(0, np.asarray(ndimage.mean(lum ** 2, etiq, idx)) - np.asarray(claro) ** 2))
            parejo = desv < huecos_sd
        quitar = [i + 1 for i in range(n) if tam[i] > 300 and dibujo[i] < 3.6 and gris - 6 <= claro[i] <= 228 and parejo[i]]
        if quitar:
            personaje &= ~np.isin(etiq, quitar)
    # Un pixel menos de borde para sacar el halo del fondo.
    return ndimage.binary_erosion(personaje, iterations=1)


def hoja_contacto(cuadros: list[Image.Image], columnas: int, lado: int) -> Image.Image:
    filas = (len(cuadros) + columnas - 1) // columnas
    hoja = Image.new("RGBA", (columnas * lado, filas * lado), (52, 48, 60, 255))
    for i, c in enumerate(cuadros):
        m = c.copy()
        m.thumbnail((lado, lado), Image.LANCZOS)
        x = (i % columnas) * lado + (lado - m.width) // 2
        y = (i // columnas) * lado + (lado - m.height)
        hoja.alpha_composite(m, (x, y))
    return hoja


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("salida", type=Path)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--tolerancia", type=float, default=30)
    ap.add_argument("--huecos-sd", type=float, default=None, help="ropa blanca: solo quita huecos de luminancia pareja")
    args = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="cuadros_"))
    try:
        rutas = extraer(args.video, args.fps, tmp)
        rgbas, cajas = [], []
        for ruta in rutas:
            rgb = np.asarray(Image.open(ruta).convert("RGB"))
            masc = quitar_fondo(rgb, args.tolerancia, args.huecos_sd)
            rgba = np.dstack([rgb, (masc * 255).astype(np.uint8)])
            rgbas.append(rgba)
            ys, xs = np.nonzero(masc)
            if len(xs):
                cajas.append((xs.min(), ys.min(), xs.max(), ys.max()))
        x0 = max(0, min(c[0] for c in cajas) - 4)
        y0 = max(0, min(c[1] for c in cajas) - 4)
        x1 = max(c[2] for c in cajas) + 5
        y1 = max(c[3] for c in cajas) + 5

        dir_cuadros = args.salida / "cuadros"
        if dir_cuadros.exists():
            shutil.rmtree(dir_cuadros)
        dir_cuadros.mkdir(parents=True)
        imagenes = []
        for i, rgba in enumerate(rgbas):
            im = Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")
            im.save(dir_cuadros / f"{i:04d}.png")
            imagenes.append(im)

        hoja_contacto(imagenes, 12, 160).save(args.salida / "contacto.png")
        fondo = Image.new("RGBA", imagenes[0].size, (60, 56, 70, 255))
        gif = [Image.alpha_composite(fondo, im).convert("P", palette=Image.ADAPTIVE) for im in imagenes]
        escala = 360 / gif[0].height
        gif = [g.resize((round(g.width * escala), 360), Image.NEAREST) for g in gif]
        gif[0].save(args.salida / "vista.gif", save_all=True, append_images=gif[1:], duration=round(1000 / args.fps), loop=0)
        print(f"{len(imagenes)} cuadros de {x1 - x0}x{y1 - y0} en {dir_cuadros}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
