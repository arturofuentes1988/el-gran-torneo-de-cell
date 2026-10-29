"""Arma un luchador para el juego a partir de los videos de sus movimientos.

Uso:
  python herramientas/armar_luchador.py arte/loco-rene/armado.json

Lee la configuración (qué cuadros de qué video forman cada animación, cuánto
dura cada uno y cuáles golpean), quita el fondo, escala, empaqueta los cuadros
en atlas (PNG + JSON de Pixi, con el anchor en los pies) y escribe la
definición del luchador (FighterDef) con las cajas de daño y de golpe
calculadas desde la silueta. Formato en docs/FORMATO_SPRITES.md.

Todos los videos parten de la misma imagen de guardia con la cámara fija, así
que comparten coordenadas: la guardia del primer cuadro de `referencia` define
el alto del personaje y la posición de los pies para todas las animaciones.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).parent))
from video_a_cuadros import quitar_fondo  # noqa: E402

PAGINA = 4096
MARGEN = 2


# ---------------------------------------------------------------- videos

class Clip:
    """Cuadros de un video (a 24 por segundo) con su máscara, cargados a pedido."""

    def __init__(self, ruta: Path, tolerancia: float):
        self.tmp = Path(tempfile.mkdtemp(prefix="clip_"))
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(ruta), "-vf", "fps=24", str(self.tmp / "%04d.png")],
            check=True,
        )
        self.rutas = sorted(self.tmp.glob("*.png"))
        self.tolerancia = tolerancia
        self.cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}

    def cuadro(self, i: int) -> tuple[np.ndarray, np.ndarray]:
        i = max(0, min(len(self.rutas) - 1, i))
        if i not in self.cache:
            rgb = np.asarray(Image.open(self.rutas[i]).convert("RGB"))
            self.cache[i] = (rgb, quitar_fondo(rgb, self.tolerancia))
        return self.cache[i]

    def cerrar(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)


def caja(m: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def centro_torso(m: np.ndarray) -> float:
    """x promedio de la mitad superior de la silueta (cabeza y tronco)."""
    b = caja(m)
    if b is None:
        return 0.0
    x0, y0, x1, y1 = b
    alto = y1 - y0
    ys, xs = np.nonzero(m[y0:y0 + int(alto * 0.45)])
    return float(xs.mean()) if len(xs) else (x0 + x1) / 2


# ---------------------------------------------------------------- cajas

def a_mundo(b: tuple[float, float, float, float], ax: float, ay: float, k: float) -> dict:
    x0, y0, x1, y1 = b
    return {"x": round((x0 - ax) * k), "y": round((y0 - ay) * k), "w": max(2, round((x1 - x0) * k)), "h": max(2, round((y1 - y0) * k))}


def cajas_dano(m: np.ndarray, ax: float, ay: float, k: float) -> list[dict]:
    """Tres cajas (cabeza, tronco, piernas) desde la silueta, un poco más angostas."""
    b = caja(m)
    if b is None:
        return []
    _, y0, _, y1 = b
    alto = y1 - y0
    cajas = []
    for f0, f1 in ((0.0, 0.24), (0.24, 0.6), (0.6, 1.0)):
        r0, r1 = y0 + int(alto * f0), y0 + int(alto * f1)
        ys, xs = np.nonzero(m[r0:r1])
        if len(xs) < 20:
            continue
        xa, xb = np.percentile(xs, 4), np.percentile(xs, 96)
        recorte = (xb - xa) * 0.08
        cajas.append(a_mundo((xa + recorte, r0, xb - recorte, r1), ax, ay, k))
    return cajas


def caja_golpe(m: np.ndarray, guardia: np.ndarray, dx: float, dy: float, direccion: str, ax: float, ay: float, alto: float, k: float) -> dict:
    """La parte de la silueta que sale de la guardia hacia donde apunta el golpe."""
    ref = guardia
    if dx:
        ref = np.roll(ref, int(round(dx)), axis=1)
    if dy:
        ref = np.roll(ref, int(round(dy)), axis=0)
    fuera = m & ~ndimage.binary_dilation(ref, iterations=6)
    gb = caja(ref)
    if gb is None:
        gb = caja(m)
    gx0, gy0, gx1, gy1 = gb
    ys, xs = np.nonzero(fuera)
    sel = np.zeros(len(xs), bool)
    if direccion == "frente":
        sel = xs > gx1 - 12
    elif direccion == "bajo":
        sel = (xs > gx1 - 12) & (ys > ay - alto * 0.4)
    elif direccion == "arriba":
        sel = ys < gy0 + 12
    elif direccion == "cuerpo":
        sel = xs > (gx0 + gx1) / 2
    if sel.sum() >= 40:
        x0, x1 = np.percentile(xs[sel], 2), np.percentile(xs[sel], 99.5)
        y0, y1 = np.percentile(ys[sel], 1), np.percentile(ys[sel], 99)
        return a_mundo((x0, y0, x1 + 4, y1 + 4), ax, ay, k)
    # Sin extensión clara: una caja delante del pecho.
    return a_mundo((gx1 - 10, ay - alto * 0.78, gx1 + alto * 0.18, ay - alto * 0.55), ax, ay, k)


# ---------------------------------------------------------------- imágenes

def recorte(rgb: np.ndarray, m: np.ndarray, escala: float) -> tuple[Image.Image, int, int]:
    b = caja(m)
    x0, y0, x1, y1 = b
    x0, y0 = max(0, x0 - MARGEN), max(0, y0 - MARGEN)
    x1, y1 = min(m.shape[1], x1 + MARGEN), min(m.shape[0], y1 + MARGEN)
    rgba = np.dstack([rgb[y0:y1, x0:x1], (m[y0:y1, x0:x1] * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, "RGBA").convert("RGBa")
    w = max(1, round((x1 - x0) * escala))
    h = max(1, round((y1 - y0) * escala))
    im = im.resize((w, h), Image.LANCZOS).convert("RGBA")
    return im, x0, y0


def empaquetar(texturas: dict[str, dict], salida: Path, id_: str, png8: bool) -> list[str]:
    """Empaqueta en páginas de 4096 px (estantes por alto). Devuelve los JSON escritos."""
    orden = sorted(texturas.items(), key=lambda kv: -kv[1]["img"].height)
    paginas: list[list[tuple[str, int, int]]] = [[]]
    x = y = alto_estante = 0
    for nombre, t in orden:
        w, h = t["img"].size
        if x + w > PAGINA:
            x, y, alto_estante = 0, y + alto_estante + 1, 0
        if y + h > PAGINA:
            paginas.append([])
            x = y = alto_estante = 0
        paginas[-1].append((nombre, x, y))
        x += w + 1
        alto_estante = max(alto_estante, h)
    escritos = []
    for n, pagina in enumerate(paginas):
        ancho = max(texturas[nm]["img"].width + px for nm, px, _ in pagina)
        alto = max(texturas[nm]["img"].height + py for nm, _, py in pagina)
        hoja = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
        frames = {}
        for nombre, px, py in pagina:
            t = texturas[nombre]
            hoja.paste(t["img"], (px, py))
            w, h = t["img"].size
            frames[nombre] = {
                "frame": {"x": px, "y": py, "w": w, "h": h},
                "sourceSize": {"w": w, "h": h},
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
                "anchor": {"x": round(t["ax"] / w, 5), "y": round(t["ay"] / h, 5)},
            }
        if png8:
            imagen = f"{id_}-{n}.png"
            hoja = hoja.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            hoja.save(salida / imagen, optimize=True)
        else:
            # WebP con transparencia: pesa varias veces menos que PNG y todos los navegadores actuales lo leen.
            imagen = f"{id_}-{n}.webp"
            hoja.save(salida / imagen, quality=92, method=6)
        meta = {"image": imagen, "size": {"w": ancho, "h": alto}, "scale": "1"}
        ruta_json = salida / f"{id_}-{n}.json"
        ruta_json.write_text(json.dumps({"frames": frames, "meta": meta}), encoding="utf-8")
        escritos.append(ruta_json.name)
        print(f"atlas {imagen}: {ancho}x{alto}, {len(pagina)} cuadros")
    return escritos


# ---------------------------------------------------------------- principal

def lista_cuadros(spec) -> list[int]:
    c = spec["cuadros"]
    if isinstance(c, dict):
        return list(range(c["desde"], c["hasta"] + 1, c.get("paso", 1)))
    return list(c)


def main() -> None:
    cfg_path = Path(sys.argv[1])
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    base = cfg_path.parent
    id_ = cfg["id"]
    videos = base / cfg["videos"]
    salida = Path(cfg["salida"])
    salida.mkdir(parents=True, exist_ok=True)
    tol = cfg.get("tolerancia", 30)

    clips: dict[str, Clip] = {}

    def clip(nombre: str) -> Clip:
        if nombre not in clips:
            clips[nombre] = Clip(videos / f"{nombre}.mp4", tol)
        return clips[nombre]

    # Referencia: alto de la guardia y pies.
    _, guardia = clip(cfg["referencia"]).cuadro(0)
    gx0, gy0, gx1, gy1 = caja(guardia)
    alto = gy1 - gy0
    ys, xs = np.nonzero(guardia[gy1 - max(4, int(alto * 0.08)):gy1])
    ax0, ay0 = float(xs.mean()), float(gy1)
    torso0 = centro_torso(guardia)
    escala = cfg["alto_px"] / alto
    tex_scale = cfg["alto_mundo"] / cfg["alto_px"]
    k = cfg["alto_mundo"] / alto  # unidades de mundo por pixel de video
    print(f"guardia: {alto}px de alto, escala {escala:.3f}, texScale {tex_scale:.4f}")

    texturas: dict[str, dict] = {}
    anims: dict[str, dict] = {}
    for nombre, spec in cfg["anims"].items():
        if "copia" in spec:
            continue
        c = clip(spec["clip"])
        indices = lista_cuadros(spec)
        durs = spec["dur"] if isinstance(spec["dur"], list) else [spec["dur"]] * len(indices)
        if len(durs) != len(indices):
            raise SystemExit(f"{nombre}: {len(indices)} cuadros pero {len(durs)} duraciones")
        activos = set(spec.get("activos", []))
        extras = spec.get("extra", {})
        frames = []
        for j, (i, dur) in enumerate(zip(indices, durs)):
            rgb, m = c.cuadro(i)
            # "centrar": alinea el tronco (caminar, rodar); "pies": el apoyo va en los
            # pies del propio cuadro (cuadros en el aire: el motor ya pone la altura).
            dx = centro_torso(m) - torso0 if spec.get("centrar") or spec.get("pies") else 0.0
            dy = caja(m)[3] - ay0 if spec.get("pies") else 0.0
            ax, ay = ax0 + dx, ay0 + dy
            tex = f"{id_}/{spec['clip']}/{i}" + ("c" if dx or dy else "")
            if tex not in texturas:
                img, cx0, cy0 = recorte(rgb, m, escala)
                texturas[tex] = {"img": img, "ax": (ax - cx0) * escala, "ay": (ay - cy0) * escala}
            fr = {"tex": tex, "dur": dur, "hurt": cajas_dano(m, ax, ay, k)}
            if j in activos:
                hb = caja_golpe(m, guardia, dx, dy, spec.get("golpe", "frente"), ax, ay, alto, k)
                grupos = spec.get("grupos", {})
                hb["group"] = grupos.get(str(j), 0)
                fr["hit"] = [hb]
            fr.update(extras.get(str(j), {}))
            frames.append(fr)
        anims[nombre] = {"frames": frames, **({"loop": True} if spec.get("loop") else {})}
        print(f"{nombre}: {len(frames)} cuadros")

    for nombre, spec in cfg["anims"].items():
        if "copia" in spec:
            fuente = anims[spec["copia"]]["frames"]
            frames = list(reversed(fuente)) if spec.get("reversa") else list(fuente)
            anims[nombre] = {"frames": [dict(f) for f in frames], **({"loop": True} if spec.get("loop") else {})}

    # Imágenes sueltas (efectos, retrato): PNG con fondo transparente.
    for nombre, img_spec in cfg.get("imagenes", {}).items():
        img = Image.open(base / img_spec["archivo"]).convert("RGBA")
        if "alto" in img_spec:
            f = img_spec["alto"] / img.height
            img = img.convert("RGBa").resize((max(1, round(img.width * f)), img_spec["alto"]), Image.LANCZOS).convert("RGBA")
        texturas[f"{id_}/{nombre}"] = {"img": img, "ax": img.width * img_spec.get("ax", 0.5), "ay": img.height * img_spec.get("ay", 0.5)}

    atlas = empaquetar(texturas, salida, id_, cfg.get("png8", True))
    definicion = json.loads((base / cfg["definicion"]).read_text(encoding="utf-8"))
    definicion.update({"id": id_, "texScale": round(tex_scale, 5), "texFilter": "linear", "anims": anims})
    (salida / f"{id_}.json").write_text(json.dumps(definicion, ensure_ascii=False), encoding="utf-8")
    (salida / "atlas.json").write_text(json.dumps(atlas), encoding="utf-8")
    print(f"listo: {salida / (id_ + '.json')} con {len(anims)} animaciones y {len(texturas)} texturas")
    for c in clips.values():
        c.cerrar()


if __name__ == "__main__":
    main()
