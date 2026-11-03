"""Achica los escenarios para que el juego descargue menos.

Uso:
  python herramientas/escenario_liviano.py public/escenarios/pablito-calle public/titulo ...

Por cada carpeta con escenario.json:
  - El video de fondo HD queda en 2208 px de ancho (antes 2944): casi no se nota y pesa
    unas 5 veces menos. La escala de la capa se ajusta para que ocupe lo mismo.
  - Crea liviano/ con todas las imágenes y el video a la mitad (para celulares), y en
    cada capa del JSON agrega "liviano": {"src"|"video"|"frames": ..., "scale": ...}.
Se puede volver a correr: lo que ya está achicado no se vuelve a comprimir.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ANCHO_HD = 2208
CRF_HD = 27
CRF_LIVIANO = 28


def video(origen: Path, destino: Path, ancho: int, crf: int) -> None:
    tmp = destino.with_suffix(".tmp.mp4")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(origen), "-an", "-vf", f"scale={ancho}:-2:flags=lanczos",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(tmp)],
        check=True,
    )
    # Se copia encima en vez de renombrar: en Windows, un video abierto (servidor, navegador) no se deja reemplazar.
    shutil.copyfile(tmp, destino)
    tmp.unlink()


def ancho_video(ruta: Path) -> int:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", str(ruta)],
                         check=True, capture_output=True, text=True).stdout
    return int(out.strip())


def imagen_mitad(origen: Path, destino: Path) -> float:
    img = Image.open(origen)
    w, h = max(1, round(img.width / 2)), max(1, round(img.height / 2))
    if img.mode == "RGBA":
        chica = img.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    else:
        chica = img.convert("RGB").resize((w, h), Image.LANCZOS)
    chica.save(destino, quality=82, method=6)
    return img.width / w


def achicar(carpeta: Path) -> None:
    ruta_json = carpeta / "escenario.json"
    defin = json.loads(ruta_json.read_text(encoding="utf-8"))
    liviano = carpeta / "liviano"
    liviano.mkdir(exist_ok=True)
    for capa in defin["layers"]:
        if "video" in capa:
            ruta = carpeta / capa["video"]
            ancho = ancho_video(ruta)
            ancho_original = ancho
            # El liviano sale del original grande (antes de achicar el HD), a la mitad.
            destino = liviano / Path(capa["video"]).name
            if not destino.exists():
                video(ruta, destino, round(ancho / 2 / 2) * 2, CRF_LIVIANO)
                capa["liviano"] = {"video": f"liviano/{destino.name}", "scale": round(capa["scale"] * ancho / ancho_video(destino), 6)}
            if ancho > ANCHO_HD:
                video(ruta, ruta, ANCHO_HD, CRF_HD)
                capa["scale"] = round(capa["scale"] * ancho_original / ancho_video(ruta), 6)
                print(f"  {capa['video']}: {ancho_original} -> {ANCHO_HD} px, {ruta.stat().st_size // 1024} KB")
            print(f"  liviano/{destino.name}: {destino.stat().st_size // 1024} KB")
        else:
            nombres = capa.get("frames") or ([capa["src"]] if "src" in capa else [])
            nuevos = []
            factor = 2.0
            for n in nombres:
                destino = liviano / Path(n).name
                if not destino.exists():
                    factor = imagen_mitad(carpeta / n, destino)
                    print(f"  liviano/{destino.name}: {destino.stat().st_size // 1024} KB")
                nuevos.append(f"liviano/{destino.name}")
            if not nombres or "liviano" in capa:
                continue
            capa["liviano"] = {("frames" if "frames" in capa else "src"): (nuevos if "frames" in capa else nuevos[0]), "scale": round(capa["scale"] * factor, 6)}
    ruta_json.write_text(json.dumps(defin, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        print(arg)
        achicar(Path(arg))
