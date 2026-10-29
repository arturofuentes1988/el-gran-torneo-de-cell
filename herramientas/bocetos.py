"""Bocetos gratis de los movimientos de un luchador, con FLUX.1 Kontext
(espacio público de Hugging Face, sin costo) y el diseño aprobado como referencia.

Uso:
  python herramientas/bocetos.py DISEÑO.png MOVIMIENTOS.json CARPETA_SALIDA

MOVIMIENTOS.json es una lista de { "id", "nombre", "detalle", "prompt" }.
Si un movimiento trae "imagen" en vez de "prompt", se usa esa imagen tal cual.
Las imágenes que ya existen en la carpeta no se vuelven a generar (se puede
reanudar si el espacio gratuito se queda sin cuota). Al final arma hoja.png.
"""

import json
import shutil
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE = (
    "Keep this exact character: same face, blue hair, outfit, accessories and pixel art style. "
    "Full body, side view facing right, plain light grey background, no text. "
)


def generar(diseno: Path, movimientos: list[dict], salida: Path) -> None:
    from gradio_client import Client, handle_file

    salida.mkdir(parents=True, exist_ok=True)
    ref = salida / "_ref.png"
    if not ref.exists():
        im = Image.open(diseno).convert("RGB")
        im.thumbnail((768, 1024), Image.LANCZOS)
        im.save(ref)
    cliente = None
    for i, mov in enumerate(movimientos):
        destino = salida / f"{mov['id']}.png"
        if destino.exists() or "imagen" in mov:
            continue
        if cliente is None:
            cliente = Client("black-forest-labs/FLUX.1-Kontext-Dev", verbose=False)
        t = time.time()
        try:
            res, _ = cliente.predict(
                input_image=handle_file(str(ref)), prompt=BASE + mov["prompt"],
                seed=100 + i, randomize_seed=False, guidance_scale=2.5, steps=20, api_name="/infer",
            )
            shutil.copy(res["path"] if isinstance(res, dict) else res, destino)
            print(f"ok   {mov['id']} ({time.time() - t:.0f} s)", flush=True)
        except Exception as e:  # cuota agotada u otro error del espacio gratuito
            print(f"FALLO {mov['id']}: {str(e)[:200]}", flush=True)


def hoja(diseno_dir: Path, movimientos: list[dict], salida: Path, columnas: int = 4) -> None:
    lado, alto_texto = 420, 92
    filas = (len(movimientos) + columnas - 1) // columnas
    hoja = Image.new("RGB", (columnas * lado, filas * (lado + alto_texto)), (34, 30, 42))
    dib = ImageDraw.Draw(hoja)
    fuentes = Path("C:/Windows/Fonts")
    titulo = ImageFont.truetype(str(fuentes / "arialbd.ttf"), 26)
    texto = ImageFont.truetype(str(fuentes / "arial.ttf"), 17)
    for i, mov in enumerate(movimientos):
        x = (i % columnas) * lado
        y = (i // columnas) * (lado + alto_texto)
        ruta = Path(mov["imagen"]) if "imagen" in mov else salida / f"{mov['id']}.png"
        if not ruta.is_absolute() and "imagen" in mov:
            ruta = diseno_dir / ruta
        if ruta.exists():
            im = Image.open(ruta).convert("RGB")
            im.thumbnail((lado - 16, lado - 16), Image.LANCZOS)
            hoja.paste(im, (x + (lado - im.width) // 2, y + 8))
        else:
            dib.text((x + 20, y + lado // 2), "(pendiente)", fill=(150, 150, 160), font=titulo)
        dib.text((x + 14, y + lado + 4), mov["nombre"], fill=(255, 214, 64), font=titulo)
        dib.text((x + 14, y + lado + 40), mov["detalle"], fill=(225, 225, 235), font=texto)
    hoja.save(salida / "hoja.png")
    print("hoja:", salida / "hoja.png")


if __name__ == "__main__":
    # Opcional, 4º argumento: ids separados por coma para generar y mostrar solo esos.
    diseno, movs_json, salida = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    movimientos = json.loads(movs_json.read_text(encoding="utf-8"))
    if len(sys.argv) > 4:
        solo = sys.argv[4].split(",")
        movimientos = [m for m in movimientos if m["id"] in solo]
    generar(diseno, movimientos, salida)
    hoja(diseno.parent, movimientos, salida)
