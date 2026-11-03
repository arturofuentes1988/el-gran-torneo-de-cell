"""Reparte los atlas de un luchador (o de los efectos) en dos calidades y en grupos de carga.

Uso:
  python herramientas/calidades.py public/luchadores/rene
  python herramientas/calidades.py public/efectos

Lee los atlas que dejó armar_luchador.py o efectos_vfx.py (atlas.json con la lista de
páginas) y escribe:
  hd/       páginas de 4096 px a tamaño completo (computadores)
  liviano/  páginas de 2048 px a la mitad de tamaño (celulares); el JSON lleva
            "scale": "0.5" y Pixi las dibuja del mismo tamaño que las HD
En cada calidad, los cuadros de un luchador van en dos grupos:
  menu   los que se ven en los menús (guardia, salto, victoria, derrota, poder): se
         bajan al abrir el juego
  pelea  todos los demás: se bajan recién antes de la primera pelea con ese luchador
Los cuadros que la definición no usa se descartan. atlas.json queda así:
  {"hd": {"menu": [...], "pelea": [...]}, "liviano": {...}}
Las páginas viejas se borran. Se puede volver a correr sobre una carpeta ya repartida.
"""

import json
import sys
from pathlib import Path

from PIL import Image

# Animaciones que salen en los menús (título, ELIGE LUCHADOR, equipos, arcade, movimientos).
MENU = ("idle", "win", "lose", "jumpUp", "jumpTop", "jumpFall", "land", "powerUp")
CALIDADES = {
    # nombre: (escala, lado de la página, calidad WebP)
    "hd": (1.0, 4096, 80),
    "liviano": (0.5, 2048, 82),
}
# Los efectos (brillos y fuego difusos, con mezcla aditiva) se ven igual más chicos.
CALIDADES_EFECTOS = {"hd": (0.75, 4096, 80), "liviano": (0.45, 2048, 82)}


def leer_cuadros(carpeta: Path) -> dict[str, dict]:
    """Recorta cada cuadro de las páginas actuales: {nombre: {img, ax, ay}} (anchor en pixeles)."""
    atlas = json.loads((carpeta / "atlas.json").read_text(encoding="utf-8"))
    if isinstance(atlas, dict):
        # Ya repartido: se lee de nuevo desde las páginas HD.
        atlas = [f"hd/{a}" for grupo in atlas["hd"].values() for a in grupo]
    cuadros = {}
    for nombre_json in atlas:
        ruta = carpeta / nombre_json
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        escala = float(datos["meta"].get("scale", 1))
        if escala != 1:
            raise SystemExit(f"{ruta}: tiene escala {escala}; vuelve a armar los atlas originales (armar_luchador.py o efectos_vfx.py)")
        hoja = Image.open(ruta.parent / datos["meta"]["image"]).convert("RGBA")
        for nombre, f in datos["frames"].items():
            r = f["frame"]
            img = hoja.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
            a = f.get("anchor", {"x": 0.5, "y": 1})
            cuadros[nombre] = {"img": img, "ax": a["x"] * r["w"], "ay": a["y"] * r["h"]}
    return cuadros


def nombres_usados(defin: object, existentes: set[str]) -> set[str]:
    """Todos los textos de la definición que son nombres de textura (cuadros, proyectiles, retratos)."""
    usados: set[str] = set()

    def recorrer(x: object) -> None:
        if isinstance(x, str):
            if x in existentes:
                usados.add(x)
        elif isinstance(x, dict):
            for v in x.values():
                recorrer(v)
        elif isinstance(x, list):
            for v in x:
                recorrer(v)

    recorrer(defin)
    return usados


def empaquetar(cuadros: dict[str, dict], salida: Path, prefijo: str, escala: float, lado: int, calidad: int) -> list[str]:
    """Estantes por alto en páginas de `lado` px. Devuelve los JSON escritos (relativos a la carpeta del luchador)."""
    salida.mkdir(parents=True, exist_ok=True)
    chicos = {}
    for nombre, c in cuadros.items():
        img = c["img"]
        if escala != 1:
            w = max(1, round(img.width * escala))
            h = max(1, round(img.height * escala))
            # Premultiplicado para que los bordes no se oscurezcan al achicar.
            img = img.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
        chicos[nombre] = {"img": img, "ax": c["ax"] * img.width / c["img"].width, "ay": c["ay"] * img.height / c["img"].height}
    orden = sorted(chicos.items(), key=lambda kv: (-kv[1]["img"].height, kv[0]))
    paginas: list[list[tuple[str, int, int]]] = [[]]
    x = y = alto_estante = 0
    for nombre, t in orden:
        w, h = t["img"].size
        if x + w > lado:
            x, y, alto_estante = 0, y + alto_estante + 1, 0
        if y + h > lado:
            paginas.append([])
            x = y = alto_estante = 0
        paginas[-1].append((nombre, x, y))
        x += w + 1
        alto_estante = max(alto_estante, h)
    escritos = []
    for n, pagina in enumerate(p for p in paginas if p):
        ancho = max(chicos[nm]["img"].width + px for nm, px, _ in pagina)
        alto = max(chicos[nm]["img"].height + py for nm, _, py in pagina)
        hoja = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
        frames = {}
        for nombre, px, py in pagina:
            t = chicos[nombre]
            hoja.paste(t["img"], (px, py))
            w, h = t["img"].size
            frames[nombre] = {
                "frame": {"x": px, "y": py, "w": w, "h": h},
                "sourceSize": {"w": w, "h": h},
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
                "anchor": {"x": round(t["ax"] / w, 5), "y": round(t["ay"] / h, 5)},
            }
        imagen = f"{prefijo}-{n}.webp"
        hoja.save(salida / imagen, quality=calidad, alpha_quality=90, method=6)
        meta = {"image": imagen, "size": {"w": ancho, "h": alto}, "scale": str(escala)}
        (salida / f"{prefijo}-{n}.json").write_text(json.dumps({"frames": frames, "meta": meta}), encoding="utf-8")
        escritos.append(f"{salida.name}/{prefijo}-{n}.json")
        kb = (salida / imagen).stat().st_size // 1024
        print(f"  {salida.name}/{imagen}: {ancho}x{alto}, {len(pagina)} cuadros, {kb} KB")
    return escritos


def repartir(carpeta: Path) -> None:
    carpeta = Path(carpeta)
    cuadros = leer_cuadros(carpeta)
    defs = [p for p in carpeta.glob("*.json") if p.name != "atlas.json" and not p.name[-6:-5].isdigit()]
    grupos: dict[str, dict[str, dict]]
    defin = None
    for p in defs:
        d = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(d, dict) and "anims" in d:
            defin = d
    if defin is not None:
        usados = nombres_usados(defin, set(cuadros))
        sobran = sorted(set(cuadros) - usados)
        if sobran:
            print(f"  se descartan {len(sobran)} cuadros sin usar: {', '.join(sobran[:6])}{'…' if len(sobran) > 6 else ''}")
        menu = {f["tex"] for a in MENU for f in defin["anims"].get(a, {}).get("frames", [])}
        grupos = {
            "menu": {n: cuadros[n] for n in sorted(usados) if n in menu},
            "pelea": {n: cuadros[n] for n in sorted(usados) if n not in menu},
        }
    else:
        grupos = {"todo": cuadros}
    viejos = [p for p in carpeta.iterdir() if p.is_file() and p.suffix in (".webp", ".png", ".json") and p.stem.rsplit("-", 1)[-1].isdigit()]
    atlas: dict[str, dict[str, list[str]]] = {}
    tabla = CALIDADES if defin is not None else CALIDADES_EFECTOS
    for calidad, (escala, lado, q) in tabla.items():
        destino = carpeta / calidad
        if destino.exists():
            for p in destino.iterdir():
                p.unlink()
        atlas[calidad] = {g: empaquetar(c, destino, g, escala, lado, q) for g, c in grupos.items() if c}
    for p in viejos:
        p.unlink()
    (carpeta / "atlas.json").write_text(json.dumps(atlas), encoding="utf-8")
    print(f"listo: {carpeta / 'atlas.json'}")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        print(arg)
        repartir(Path(arg))
