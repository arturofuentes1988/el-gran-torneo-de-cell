"""Arma los efectos especiales pintados del juego (public/efectos/) desde videos y objetos.

Uso:
  python herramientas/efectos_vfx.py arte/efectos/vfx.json

vfx.json:
  salida    carpeta de salida (public/efectos)
  videos    nombre -> {"video": ruta, "desde", "hasta", "paso", "alto": px, "ancla": [x, y],
                       "recorte": [x0, y0, x1, y1] (fracciones, opcional), "umbral": 22, "borde": 0.12}
            Videos de efectos sobre fondo negro (Kling por kie.ai, herramientas/kie_video.py).
            El negro pasa a transparente (alfa = canal más brillante, el color se divide por el
            alfa), así el efecto se ve igual con mezcla aditiva y no gasta espacio en el atlas.
            Los cuadros se recortan todos con la misma caja (la unión), así el ancla no salta.
            "ancla" es una fracción de esa caja (ej. [0.5, 1] = abajo al centro: el rayo en el suelo).
            Texturas: vfx/<nombre>/<i>.
  objetos   nombre -> {"archivo": ruta, "alto": px, "ancla": [x, y]}
            Objetos pintados sobre fondo gris liso (GPT Image). Texturas: obj/<nombre>.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from armar_luchador import caja, empaquetar  # noqa: E402
from video_a_cuadros import quitar_fondo  # noqa: E402


def cuadros(video: Path) -> np.ndarray:
    info = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(video)],
        capture_output=True, text=True, check=True,
    ).stdout.strip().split(",")
    w, h = int(info[0]), int(info[1])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def sin_negro(rgb: np.ndarray, umbral: float = 22) -> np.ndarray:
    """Negro a transparente: alfa = canal más brillante (sin el ruido de compresión del negro)."""
    f = rgb.astype(np.float32)
    m = f.max(axis=2)
    a = np.clip((m - umbral) / (255 - umbral), 0, 1)
    color = np.where(a[..., None] > 0, np.clip(f / np.maximum(m[..., None], 1) * 255, 0, 255), 0)
    return np.dstack([color, a * 255]).astype(np.uint8)


def main() -> None:
    cfg_path = Path(sys.argv[1])
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    base = cfg_path.parent
    salida = Path(cfg["salida"])
    salida.mkdir(parents=True, exist_ok=True)
    texturas: dict[str, dict] = {}

    for nombre, v in cfg.get("videos", {}).items():
        fr = cuadros(base / v["video"])
        idx = list(range(v.get("desde", 0), min(v.get("hasta", len(fr) - 1), len(fr) - 1) + 1, v.get("paso", 2)))
        # "recorte": [x0, y0, x1, y1] en fracciones del video (la zona útil); "umbral": negro de compresión.
        rx0, ry0, rx1, ry1 = v.get("recorte", [0, 0, 1, 1])
        H, W = fr.shape[1:3]
        zona = (slice(round(ry0 * H), round(ry1 * H)), slice(round(rx0 * W), round(rx1 * W)))
        capas = [sin_negro(fr[i][zona], v.get("umbral", 22)) for i in idx]
        # La misma caja para todos los cuadros (unión de lo que se ve).
        union = np.zeros(capas[0].shape[:2], bool)
        for c in capas:
            union |= c[..., 3] > 10
        x0, y0, x1, y1 = caja(union)
        escala = v["alto"] / (y1 - y0)
        ax, ay = v.get("ancla", [0.5, 0.5])
        # El resplandor del video llega hasta el borde del cuadro: se desvanece en los bordes
        # ("borde" = fracción del ancho/alto) para que en el juego no se vea un rectángulo.
        b = v.get("borde", 0.12)
        hh, ww = y1 - y0, x1 - x0
        fy = np.clip(np.minimum(np.arange(hh), np.arange(hh)[::-1]) / max(1, b * hh), 0, 1)
        fx = np.clip(np.minimum(np.arange(ww), np.arange(ww)[::-1]) / max(1, b * ww), 0, 1)
        borde = (np.minimum(fy[:, None], fx[None, :])) ** 1.5
        for n, c in enumerate(capas):
            c = c[y0:y1, x0:x1].copy()
            c[..., 3] = (c[..., 3] * borde).astype(np.uint8)
            img = Image.fromarray(c, "RGBA").convert("RGBa")
            img = img.resize((max(1, round((x1 - x0) * escala)), v["alto"]), Image.LANCZOS).convert("RGBA")
            texturas[f"vfx/{nombre}/{n}"] = {"img": img, "ax": img.width * ax, "ay": img.height * ay}
        print(f"{nombre}: {len(capas)} cuadros de {img.width}x{img.height}")

    for nombre, o in cfg.get("objetos", {}).items():
        rgb = np.asarray(Image.open(base / o["archivo"]).convert("RGB"))
        m = quitar_fondo(rgb, o.get("tolerancia", 30))
        x0, y0, x1, y1 = caja(m)
        img = Image.fromarray(np.dstack([rgb, (m * 255).astype(np.uint8)])[y0:y1, x0:x1], "RGBA").convert("RGBa")
        alto = o["alto"]
        img = img.resize((max(1, round((x1 - x0) * alto / (y1 - y0))), alto), Image.LANCZOS).convert("RGBA")
        ax, ay = o.get("ancla", [0.5, 0.5])
        texturas[f"obj/{nombre}"] = {"img": img, "ax": img.width * ax, "ay": img.height * ay}
        print(f"objeto {nombre}: {img.width}x{img.height}")

    for viejo in salida.glob("efectos-*.*"):
        viejo.unlink()
    atlas = empaquetar(texturas, salida, "efectos", False)
    # Efectos con brillo: una calidad algo menor no se nota y el archivo pesa bastante menos.
    for nombre in atlas:
        webp = salida / nombre.replace(".json", ".webp")
        Image.open(webp).save(webp, quality=80, method=6)
    (salida / "atlas.json").write_text(json.dumps(atlas), encoding="utf-8")
    print(f"listo: {len(texturas)} texturas en {salida}")


if __name__ == "__main__":
    main()
