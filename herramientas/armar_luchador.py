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
from video_a_cuadros import alfa_ia, alfa_verde, color_fondo, quitar_fondo  # noqa: E402

PAGINA = 4096
MARGEN = 2


# ---------------------------------------------------------------- videos

class Clip:
    """Cuadros de un video (a 24 por segundo) con su máscara, cargados a pedido."""

    def __init__(self, ruta: Path, tolerancia: float, huecos_sd: float | None = None, estricto: bool = False,
                 ia: bool = False, ropa_blanca: bool = True, verde: bool = False):
        self.tmp = Path(tempfile.mkdtemp(prefix="clip_"))
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(ruta), "-vf", "fps=24", str(self.tmp / "%04d.png")],
            check=True,
        )
        self.rutas = sorted(self.tmp.glob("*.png"))
        self.tolerancia = tolerancia
        self.huecos_sd = huecos_sd
        self.estricto = estricto
        self.ia = ia
        self.ropa_blanca = ropa_blanca
        self.verde = verde
        self.cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        self.alfas: dict[int, np.ndarray] = {}
        self.factor = 1.0
        self.borde = 0

    def reescalar(self, factor: float, pies: tuple[float, float], borde: int) -> None:
        """El video se hizo con la guardia achicada a `factor` en torno a los pies (para que
        un salto o un clavado no se salga del cuadro): sus cuadros se agrandan de vuelta y
        se pegan en un lienzo con `borde` pixeles de aire por lado."""
        self.factor, self.pies, self.borde = factor, pies, borde

    def _agrandar(self, rgb: np.ndarray, alfa: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        s, b = 1 / self.factor, self.borde
        fx, fy = self.pies
        alto, ancho = alfa.shape
        tam = (round(ancho * s), round(alto * s))
        pos = (round(fx + b - fx * s), round(fy + b - fy * s))
        lienzo = Image.new("RGB", (ancho + 2 * b, alto + 2 * b), tuple(int(v) for v in color_fondo(rgb)))
        lienzo.paste(Image.fromarray(rgb).resize(tam, Image.LANCZOS), pos)
        capa = Image.new("L", lienzo.size, 0)
        capa.paste(Image.fromarray(alfa).resize(tam, Image.LANCZOS), pos)
        return np.asarray(lienzo), np.asarray(capa)

    def cuadro(self, i: int) -> tuple[np.ndarray, np.ndarray]:
        i = max(0, min(len(self.rutas) - 1, i))
        if i not in self.cache:
            rgb = np.asarray(Image.open(self.rutas[i]).convert("RGB"))
            if self.verde:
                rgb, alfa = alfa_verde(rgb)
            elif self.ia:
                alfa = alfa_ia(rgb, self.ropa_blanca)
            else:
                m = quitar_fondo(rgb, self.tolerancia, self.huecos_sd, self.estricto)
                alfa = None
            if self.factor != 1.0:
                rgb, alfa = self._agrandar(rgb, alfa if alfa is not None else (m * 255).astype(np.uint8))
                m = alfa > 127
                if not (self.ia or self.verde):
                    alfa = None
            elif alfa is not None:
                m = alfa > 127
            if alfa is not None:
                self.alfas[i] = alfa
            self.cache[i] = (rgb, m)
        return self.cache[i]

    def alfa(self, i: int) -> np.ndarray | None:
        """Alfa suave del cuadro (solo con "ia"; si no, la máscara es dura)."""
        return self.alfas.get(max(0, min(len(self.rutas) - 1, i)))

    def cerrar(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)


def fijar_boca(rgb: np.ndarray, ref: np.ndarray, zona: list[int], radio: int = 10) -> np.ndarray:
    """Pega en `rgb` la boca del cuadro `ref` (zona x0,y0,x1,y1 en pixeles del video), así la
    guardia no abre y cierra la boca. Sigue a la cabeza: busca el corrimiento con que mejor
    calza la franja de la cara justo encima (nariz y ojos) y pega con el borde difuminado."""
    x0, y0, x1, y1 = zona
    h, w = y1 - y0, x1 - x0
    plantilla = ref[y0 - h:y0, x0:x1].astype(np.float32)
    mejor, dx, dy = np.inf, 0, 0
    for oy in range(-radio, radio + 1):
        for ox in range(-radio, radio + 1):
            e = np.abs(rgb[y0 - h + oy:y0 + oy, x0 + ox:x1 + ox].astype(np.float32) - plantilla).mean()
            if e < mejor:
                mejor, dx, dy = e, ox, oy
    bordes = np.minimum(np.minimum(np.arange(h), np.arange(h)[::-1])[:, None], np.minimum(np.arange(w), np.arange(w)[::-1])[None, :])
    a = np.clip(bordes / 5, 0, 1)[..., None]
    out = rgb.copy()
    destino = out[y0 + dy:y1 + dy, x0 + dx:x1 + dx].astype(np.float32)
    out[y0 + dy:y1 + dy, x0 + dx:x1 + dx] = (ref[y0:y1, x0:x1] * a + destino * (1 - a)).round().astype(np.uint8)
    return out


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


def con_cabeza(rgb: np.ndarray, m: np.ndarray, ref: np.ndarray, ref_m: np.ndarray, margen: int = 48) -> tuple[np.ndarray, np.ndarray, bool]:
    """Si el video cortó la punta de la cabeza (el cuerpo toca el borde de arriba), agranda el
    cuadro hacia arriba y completa la cabeza con la de `ref` (la guardia: misma cámara, mismo
    tamaño). Busca en la guardia la fila donde la cabeza tiene el mismo ancho que el corte, la
    alinea por el centro y pega lo que falta encima. Devuelve (rgb, máscara, si cambió)."""
    filas = np.nonzero(m.any(axis=1))[0]
    if not len(filas) or filas[0] > 2:
        return rgb, m, False
    corte = filas[0]
    xs = np.nonzero(m[corte])[0]
    ancho, centro = xs.max() - xs.min(), (xs.max() + xs.min()) / 2
    ry0 = np.nonzero(ref_m.any(axis=1))[0][0]
    # La primera fila de la guardia (desde la punta) tan ancha como el corte.
    dy = None
    for r in range(ry0, ry0 + margen):
        rx = np.nonzero(ref_m[r])[0]
        if len(rx) and rx.max() - rx.min() >= ancho:
            dy = r - ry0
            break
    if not dy:
        return rgb, m, False
    rx = np.nonzero(ref_m[ry0 + dy])[0]
    corr = int(round(centro - (rx.max() + rx.min()) / 2))
    h, w = m.shape
    nuevo = np.empty((h + margen, w, 3), dtype=rgb.dtype)
    nuevo[:] = np.median(rgb[h // 2:, :8].reshape(-1, 3), axis=0)  # el gris del fondo
    nm = np.zeros((h + margen, w), dtype=bool)
    nuevo[margen:] = rgb
    nm[margen:] = m
    # Lo que falta: las filas de la guardia desde la punta hasta la del corte, corridas al centro.
    for r in range(dy):
        fila = ry0 + r
        destino = margen + corte - dy + r
        src = np.nonzero(ref_m[fila])[0]
        for x in src:
            xd = x + corr
            if 0 <= xd < w:
                nuevo[destino, xd] = ref[fila, x]
                nm[destino, xd] = True
    return nuevo, nm, True


def sin_objeto(rgb: np.ndarray, m: np.ndarray, x_min: int) -> np.ndarray:
    """Quita de la máscara las manchas blancas lisas grandes a la derecha de x_min, con su contorno.
    La piel (colores saturados) se queda aunque esté encima."""
    f = rgb.astype(np.float32)
    lum = f.mean(axis=2)
    maximo = f.max(axis=2)
    sat = (maximo - f.min(axis=2)) / np.maximum(maximo, 1)
    blanco = (lum > 215) & (sat < 0.12) & m
    blanco[:, :x_min] = False
    etiq, n = ndimage.label(blanco)
    if not n:
        return m
    tam = ndimage.sum(blanco, etiq, range(1, n + 1))
    objeto = np.isin(etiq, np.nonzero(tam > 1500)[0] + 1)
    objeto = ndimage.binary_dilation(objeto, iterations=9)
    objeto[:, :x_min - 4] = False
    return m & ~(objeto & (sat < 0.25))


def sin_tono(rgb: np.ndarray, m: np.ndarray, tono: list[float], sat_min: float = 0.3) -> np.ndarray:
    """Quita de la máscara las manchas grandes de un tono (0..1, ej. [0.2, 0.45] = verde) que el
    video dibujó y que no son del personaje, con su contorno oscuro. La piel y la ropa quedan."""
    f = rgb.astype(np.float32) / 255
    mx, mn = f.max(axis=2), f.min(axis=2)
    d = mx - mn + 1e-6
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    sat = d / np.maximum(mx, 1e-6)
    mancha = (h >= tono[0]) & (h <= tono[1]) & (sat > sat_min) & m
    etiq, n = ndimage.label(mancha)
    if not n:
        return m
    tam = ndimage.sum(mancha, etiq, range(1, n + 1))
    objeto = np.isin(etiq, np.nonzero(tam > 200)[0] + 1)
    # El contorno y las sombras del objeto: pixeles oscuros o del mismo tono pegados a él.
    cerca = ndimage.binary_dilation(objeto, iterations=6)
    borde = cerca & ((mx < 0.32) | ((h >= tono[0] - 0.05) & (h <= tono[1] + 0.05) & (sat > 0.15)))
    m = m & ~(objeto | borde)
    # Los pedacitos sueltos que quedan flotando no son del personaje (él es una sola mancha).
    etiq, n = ndimage.label(m)
    if n > 1:
        tam = ndimage.sum(m, etiq, range(1, n + 1))
        m = np.isin(etiq, np.nonzero(tam >= tam.max() * 0.05)[0] + 1)
    return m


# ---------------------------------------------------------------- imágenes

def recorte(rgb: np.ndarray, m: np.ndarray, escala: float, alfa: np.ndarray | None = None) -> tuple[Image.Image, int, int]:
    b = caja(m)
    x0, y0, x1, y1 = b
    x0, y0 = max(0, x0 - MARGEN - 2), max(0, y0 - MARGEN - 2)
    x1, y1 = min(m.shape[1], x1 + MARGEN + 2), min(m.shape[0], y1 + MARGEN + 2)
    if alfa is not None and alfa.shape == m.shape:
        # Borde suave de la IA, pero solo junto a la máscara (lo borrado a mano no vuelve).
        a = np.where(ndimage.binary_dilation(m, iterations=2), alfa, 0).astype(np.uint8)
    else:
        a = (m * 255).astype(np.uint8)
    rgba = np.dstack([rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]])
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
    # Ropa blanca o gris claro: los huecos encerrados solo son fondo si son parejos (ver quitar_fondo).
    huecos_sd = cfg.get("huecos_sd")
    # "estricto": {clip: tolerancia} quita solo lo cercano al color del fondo en esos clips (ropa
    # blanca con el contorno cortado por el movimiento; ver quitar_fondo).
    estrictos = cfg.get("estricto", {})
    # "ia": true (o una lista de clips) recorta con IA (ver alfa_ia): ropa blanca sobre gris claro.
    ia = cfg.get("ia", False)
    # "ropa_blanca": false para luchadores de ropa oscura: el resplandor del video no queda (ver alfa_ia).
    ropa_blanca = cfg.get("ropa_blanca", True)
    # "fondo": "verde" recorta por chroma (videos animados sobre verde plano; ver alfa_verde).
    verde = cfg.get("fondo") == "verde"
    # "reescalar": {clip: factor} para clips hechos con la guardia achicada (ver Clip.reescalar).
    reescalar = cfg.get("reescalar", {})
    pies_ref: list[tuple[float, float]] = []

    clips: dict[str, Clip] = {}

    def clip(nombre: str) -> Clip:
        if nombre not in clips:
            if nombre in estrictos:
                clips[nombre] = Clip(videos / f"{nombre}.mp4", estrictos[nombre], huecos_sd, True)
            else:
                clips[nombre] = Clip(videos / f"{nombre}.mp4", tol, huecos_sd, ia=ia is True or nombre in (ia or []), ropa_blanca=ropa_blanca, verde=verde)
            if nombre in reescalar:
                if nombre == cfg["referencia"] or not pies_ref:
                    raise SystemExit(f"{nombre}: la referencia no se puede reescalar")
                f = reescalar[nombre]
                fx, fy = pies_ref[0]
                clips[nombre].reescalar(f, (fx, fy), int(np.ceil(max(fy, fx, 1440 - fx) * (1 / f - 1))) + 8)
        return clips[nombre]

    # Referencia: alto de la guardia y pies.
    guardia_rgb, guardia = clip(cfg["referencia"]).cuadro(0)
    gx0, gy0, gx1, gy1 = caja(guardia)
    alto = gy1 - gy0
    ys, xs = np.nonzero(guardia[gy1 - max(4, int(alto * 0.08)):gy1])
    ax0, ay0 = float(xs.mean()), float(gy1)
    torso0 = centro_torso(guardia)
    pies_ref.append((ax0, ay0))
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
        boca = spec.get("boca_fija")
        for j, (i, dur) in enumerate(zip(indices, durs)):
            rgb, m = c.cuadro(i)
            # "boca_fija": {"cuadro": n, "zona": [x0, y0, x1, y1]} deja la boca del cuadro n en todos.
            if boca and i != boca["cuadro"]:
                rgb = fijar_boca(rgb, c.cuadro(boca["cuadro"])[0], boca["zona"])
                if not c.ia:  # la boca no cambia la silueta: con IA se queda la del cuadro
                    m = quitar_fondo(rgb, tol, huecos_sd)
            # "borrar_objeto": {"desde": a, "hasta": b, "x_min": px} quita un objeto blanco liso que
            # el video dibujó en sus manos (la cabeza de un rival invisible), dejando la piel.
            borrar = spec.get("borrar_objeto")
            if borrar and borrar["desde"] <= i <= borrar["hasta"]:
                m = sin_objeto(rgb, m, borrar["x_min"])
            # "borrar_tono": {"desde": a, "hasta": b, "tono": [h0, h1]} quita una mancha de ese color
            # que el video dibujó (el rival invisible del agarre del Vendedor de Leña salió verde).
            borrar_t = spec.get("borrar_tono")
            if borrar_t and borrar_t["desde"] <= i <= borrar_t["hasta"]:
                m = sin_tono(rgb, m, borrar_t["tono"], borrar_t.get("sat", 0.3))
            # "cabeza": true completa la punta de la cabeza (el gorro) si el video la cortó
            # arriba, con la de la guardia. Solo en cuadros con "pies" (el apoyo sale del cuadro).
            arreglada = False
            if spec.get("cabeza"):
                if not spec.get("pies"):
                    raise SystemExit(f"{nombre}: \"cabeza\" necesita \"pies\"")
                rgb, m, arreglada = con_cabeza(rgb, m, guardia_rgb, guardia)
            # "centrar": alinea el tronco (caminar, rodar); "pies": el apoyo va en los
            # pies del propio cuadro (cuadros en el aire: el motor ya pone la altura).
            # Un clip reescalado vive en un lienzo con `borde` de aire: la guardia queda corrida.
            b = c.borde
            dx = centro_torso(m) - (torso0 + b) if spec.get("centrar") or spec.get("pies") else 0.0
            dy = caja(m)[3] - (ay0 + b) if spec.get("pies") else 0.0
            ax, ay = ax0 + b + dx, ay0 + b + dy
            tex = f"{id_}/{spec['clip']}/{i}" + ("c" if dx or dy else "") + ("h" if arreglada else "")
            if tex not in texturas:
                img, cx0, cy0 = recorte(rgb, m, escala, c.alfa(i))
                texturas[tex] = {"img": img, "ax": (ax - cx0) * escala, "ay": (ay - cy0) * escala}
            fr = {"tex": tex, "dur": dur, "hurt": cajas_dano(m, ax, ay, k)}
            if j in activos:
                hb = caja_golpe(m, np.pad(guardia, b) if b else guardia, dx, dy, spec.get("golpe", "frente"), ax, ay, alto, k)
                grupos = spec.get("grupos", {})
                hb["group"] = grupos.get(str(j), 0)
                # "props_grupo": {"4": {...}} cambia las propiedades de un golpe (ej. el último lanza).
                props = spec.get("props_grupo", {}).get(str(hb["group"]))
                if props:
                    hb["props"] = props
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
