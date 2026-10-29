"""Arma un escenario HD del juego a partir de una imagen panorámica (21:9).

Lee arte/escenarios/<carpeta>/<armado>.json y escribe en public/escenarios/<id>/:
  - fondo.webp   todo lo que está detrás del piso (paralaje más lento)
  - suelo.webp   el piso, que el juego dibuja en franjas con perspectiva
  - brillo-*.webp luces de la imagen (neones, ampolletas) para hacerlas latir
  - niebla.webp  bruma que se desplaza (opcional)
  - miniatura.webp vista de la cámara en reposo (pantalla ELIGE ESCENARIO)
  - escenario.json  la definición (StageDef, ver src/render/stage.ts)
y agrega o reemplaza la entrada en public/escenarios/escenarios.json.

Uso: python herramientas/armar_escenario.py arte/escenarios/rene/puente.json

Claves del armado:
  id, nombre, luchador, imagen (relativa al armado), salida (relativa a la raíz)
  en_lista      false = no se agrega a escenarios.json (fondo del título)
  musica        tema del escenario: clave de public/musica/musica.json
  ancho_px      ancho de las texturas (por defecto 4096)
  paralaje      paralaje horizontal del fondo (0.7: se mueve al 70% del piso)
  corte_suelo   fracción del alto donde empieza el piso (bajo la base de los objetos de atrás)
  pies          fracción del alto donde pisan los luchadores
  brillos       [{nombre, sat_min, sat_max, val_min, desenfoque, alpha, pulso}]
  niebla        {color [r,g,b], alpha, y, alto, velocidad}
  particulas    lista tal cual para StageDef.particles
  video         MP4 en loop de la misma imagen (opcional): se recorta a la zona del fondo
                y se codifica para la web como fondo.mp4, encima de la imagen fija.
  solape        fracción del alto que el fondo baja bajo el corte (el piso se funde ahí)
"""
import subprocess
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VIEW_W, VIEW_H, STAGE_W, SUELO_Y = 480, 270, 960, 248
# Margen (unidades) más allá del recorrido de la cámara, por el temblor de pantalla.
MARGEN = 8


def guardar_webp(im: Image.Image, ruta: pathlib.Path, calidad: int = 90) -> None:
    im.save(ruta, 'WEBP', quality=calidad, method=6)
    print(f'  {ruta.name:22s} {im.size[0]}x{im.size[1]}  {ruta.stat().st_size / 1e6:.2f} MB')


def mascara_brillo(rgb: np.ndarray, b: dict) -> np.ndarray:
    """Máscara suave (0..1) de los pixeles brillantes según saturación y valor (HSV)."""
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    val = mx / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    def rampa(x, a, ancho=0.08):
        return np.clip((x - a) / ancho, 0, 1)
    m = rampa(val, b.get('val_min', 0.8))
    if 'sat_min' in b:
        m *= rampa(sat, b['sat_min'])
    if 'sat_max' in b:
        m *= 1 - rampa(sat, b['sat_max'])
    return m


def niebla_periodica(w: int, h: int, semilla: int) -> np.ndarray:
    """Ruido suave que se repite en x (filtrado en frecuencia), con caída arriba y abajo."""
    rng = np.random.default_rng(semilla)
    ruido = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt((fx * 3) ** 2 + fy ** 2)
    espectro = np.fft.fft2(ruido) / (1 + (f / 0.012) ** 2.2)
    n = np.real(np.fft.ifft2(espectro))
    n = (n - n.min()) / (n.max() - n.min())
    n = np.clip((n - 0.35) / 0.65, 0, 1) ** 1.6
    y = np.linspace(0, 1, h)[:, None]
    return n * np.sin(np.pi * y) ** 1.5


def video_fondo(src: pathlib.Path, salida: pathlib.Path, W: int, H: int, fila_fondo: int, escala: float,
                p: float, top: float, izquierda: float, cfg: dict) -> dict:
    """Recorta el video a la zona del fondo (alineado con la imagen fija) y lo codifica para la web."""
    sonda = subprocess.run(['ffprobe', '-v', 'quiet', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                            '-of', 'csv=p=0', str(src)], capture_output=True, text=True, check=True).stdout.strip()
    vw, vh = (int(x) for x in sonda.split(',')[:2])
    # Si el video no tiene exactamente la proporción de la imagen, se ajusta su ancho a la imagen.
    alto_v = round(vw * H / W)
    filas = round(fila_fondo * alto_v / H)
    ancho = min(vw, int(cfg.get('video_ancho', vw))) // 2 * 2
    alto = round(filas * ancho / vw) // 2 * 2
    filtro = f'scale={vw}:{alto_v},crop={vw}:{filas}:0:0,scale={ancho}:{alto}:flags=lanczos'
    if cfg.get('video_color'):
        filtro += ',' + cfg['video_color']
    out = salida / 'fondo.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-an', '-vf', filtro, '-c:v', 'libx264', '-preset', 'slow',
                    '-crf', str(cfg.get('video_crf', 20)), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out)], check=True)
    print(f'  {out.name:22s} {ancho}x{alto}  {out.stat().st_size / 1e6:.2f} MB  (video {vw}x{vh})')
    return {'video': out.name, 'scale': round(escala * W / ancho, 6), 'parallax': [p, 1], 'top': round(top, 3), 'left': round(izquierda, 3)}


def main(ruta_armado: str) -> None:
    armado_path = pathlib.Path(ruta_armado).resolve()
    cfg = json.loads(armado_path.read_text(encoding='utf-8'))
    salida = RAIZ / cfg['salida']
    salida.mkdir(parents=True, exist_ok=True)
    print(f"Escenario {cfg['id']} -> {salida}")

    im = Image.open(armado_path.parent / cfg['imagen']).convert('RGB')
    W = int(cfg.get('ancho_px', 4096))
    H = round(im.height * W / im.width)
    im = im.resize((W, H), Image.LANCZOS)
    p = float(cfg.get('paralaje', 0.7))
    # El fondo cubre justo el recorrido de la cámara con su paralaje.
    escala = (VIEW_W + (STAGE_W - VIEW_W + 2 * MARGEN) * p) / W
    fila_pies = cfg.get('pies', 0.935) * H
    fila_corte = round(cfg.get('corte_suelo', 0.8) * H)
    top_fondo = -fila_pies * escala
    izquierda = -MARGEN * p
    if (H - fila_pies) * escala < VIEW_H - SUELO_Y + 2:
        print('  OJO: queda poco piso bajo los pies; baja "pies".')

    capas = []
    # Fondo: baja un poco bajo el corte; el borde de arriba del piso se funde sobre esa franja.
    solape = max(2, round(cfg.get('solape', 0.015) * H))
    fila_fondo = min(H, fila_corte + solape)
    guardar_webp(im.crop((0, 0, W, fila_fondo)), salida / 'fondo.webp')
    capas.append({'src': 'fondo.webp', 'scale': round(escala, 6), 'parallax': [p, 1], 'top': round(top_fondo, 3), 'left': round(izquierda, 3)})

    # Fondo animado: el video de la misma imagen, recortado a la zona del fondo.
    if cfg.get('video'):
        capas.append(video_fondo(armado_path.parent / cfg['video'], salida, W, H, fila_fondo, escala, p, top_fondo, izquierda, cfg))

    # Luces que laten (a media resolución: son un brillo aditivo).
    rgb = np.asarray(im.crop((0, 0, W, fila_corte)), dtype=np.float32)
    for b in ([] if cfg.get('video') and not cfg.get('brillos_con_video') else cfg.get('brillos', [])):
        m = mascara_brillo(rgb, b)
        glow = (rgb * m[..., None]).clip(0, 255).astype(np.uint8)
        g = Image.fromarray(glow).resize((W // 2, fila_corte // 2), Image.LANCZOS)
        if b.get('desenfoque'):
            g = Image.blend(g, g.filter(ImageFilter.GaussianBlur(b['desenfoque'])), 0.6)
        nombre = f"brillo-{b['nombre']}.webp"
        guardar_webp(g, salida / nombre, 85)
        capa = {'src': nombre, 'scale': round(escala * W / g.width, 6), 'parallax': [p, 1], 'top': round(top_fondo, 3),
                'left': round(izquierda, 3), 'additive': True, 'alpha': b.get('alpha', 0.6)}
        if b.get('pulso'):
            capa['pulse'] = b['pulso']
        capas.append(capa)

    # Bruma que se desplaza, a la altura de la gente del fondo.
    n = cfg.get('niebla')
    if n:
        nw, nh = 1024, 256
        dens = niebla_periodica(nw, nh, 7)
        col = np.array(n.get('color', [180, 120, 255]), dtype=np.float32)
        Image.fromarray((dens[..., None] * col).clip(0, 255).astype(np.uint8)).save(salida / 'niebla.webp', 'WEBP', quality=80)
        alto = n.get('alto', 90)
        y = n.get('y', -(fila_pies - fila_corte) * escala - alto * 0.6)
        capas.append({'src': 'niebla.webp', 'scale': round(alto / nh, 6), 'parallax': [p, 1], 'top': round(y, 3),
                      'repeatX': True, 'scrollX': n.get('velocidad', 0.05), 'additive': True, 'alpha': n.get('alpha', 0.2)})

    # Piso: el juego lo corta en franjas; cada una se desplaza un poco más rápido mientras más cerca está.
    suelo = im.crop((0, fila_corte, W, H)).convert('RGBA')
    alfa = np.full((H - fila_corte, W), 255, dtype=np.uint8)
    rampa = np.linspace(0, 1, solape) ** 1.5
    alfa[:solape] = (rampa[:, None] * 255).astype(np.uint8)
    suelo.putalpha(Image.fromarray(alfa))
    guardar_webp(suelo, salida / 'suelo.webp')
    capas.append({'src': 'suelo.webp', 'scale': round(escala, 6), 'parallax': [p, 1],
                  'top': round(-(fila_pies - fila_corte) * escala, 3), 'floor': {'strips': cfg.get('franjas', 64)}})

    # Miniatura: lo que se ve con la cámara en reposo (al centro).
    x0 = ((STAGE_W - VIEW_W) / 2 + MARGEN) * p / escala
    x1 = x0 + VIEW_W / escala
    y0 = fila_pies - SUELO_Y / escala
    y1 = fila_pies + (VIEW_H - SUELO_Y) / escala
    mini = im.crop((round(x0), round(max(0, y0)), round(x1), round(min(H, y1)))).resize((480, 270), Image.LANCZOS)
    guardar_webp(mini, salida / 'miniatura.webp', 88)

    definicion = {'id': cfg['id'], 'name': cfg['nombre'], 'layers': capas}
    if cfg.get('particulas'):
        definicion['particles'] = cfg['particulas']
    if cfg.get('musica'):
        definicion['music'] = cfg['musica']
    (salida / 'escenario.json').write_text(json.dumps(definicion, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    # Lista de escenarios del juego ("en_lista": false para fondos que no se eligen, como el del título).
    if cfg.get('en_lista') is False:
        print(f"  escala {escala:.4f} u/px (fuera de la lista de escenarios)")
        return
    lista_path = RAIZ / 'public' / 'escenarios' / 'escenarios.json'
    lista = json.loads(lista_path.read_text(encoding='utf-8')) if lista_path.exists() else []
    carpeta = salida.relative_to(lista_path.parent).as_posix()
    entrada = {'id': cfg['id'], 'nombre': cfg['nombre'], 'json': f'{carpeta}/escenario.json', 'miniatura': f'{carpeta}/miniatura.webp'}
    if cfg.get('luchador'):
        entrada['luchador'] = cfg['luchador']
    if 'orden' in cfg:
        entrada['orden'] = cfg['orden']
    lista = [e for e in lista if e.get('id') != cfg['id']]
    lista.append(entrada)
    lista.sort(key=lambda e: e.get('orden', 0))
    lista_path.write_text(json.dumps(lista, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"  escala {escala:.4f} u/px, fondo {W * escala:.0f}x{fila_corte * escala:.0f} u, piso desde y={-(fila_pies - fila_corte) * escala:.0f}")


if __name__ == '__main__':
    main(sys.argv[1])
