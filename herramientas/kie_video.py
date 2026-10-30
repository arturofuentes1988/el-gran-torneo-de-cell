"""Anima un luchador con Kling 3.0 a través de la API de kie.ai.

La clave NO se guarda en el proyecto: va en la variable de entorno KIE_API_KEY.

  KIE_API_KEY=... python -P -E herramientas/kie_video.py arte/<luchador>/kie.json [clave ...]

kie.json:
  guardia   URL pública de la guardia (primer y último cuadro de cada clip, para que calcen)
  salida    carpeta de los videos, relativa a la raíz del proyecto
  modo      "std" (720x720) o "pro" (1440x1440)
  duracion  segundos de cada clip (texto, ej. "3")
  base      texto común del personaje (va antes de cada movimiento)
  final     texto común del final (cámara fija, fondo, sin efectos)
  clips     clave -> descripción del movimiento (o {"texto": ..., "duracion": "5", "sin_cierre": true,
            "guardia": URL de la guardia más chica, ver "reescalar" en armar_luchador.py})

Sin claves pide todos los clips que todavía no tienen video. Guarda las tareas en
<salida>/tareas.json (clave -> taskId) y los videos en <salida>/<clave>.mp4.
"""
import json
import os
import pathlib
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
API = 'https://api.kie.ai/api/v1'
CIERRE = ' He ends exactly in the same fighting stance as the first frame.'


def llamar(metodo: str, ruta: str, cuerpo: dict | None = None) -> dict:
    req = urllib.request.Request(f'{API}{ruta}', method=metodo, headers={
        'Authorization': f"Bearer {os.environ['KIE_API_KEY']}", 'Content-Type': 'application/json',
    }, data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def creditos() -> float:
    return float(llamar('GET', '/chat/credit').get('data') or 0)


def main(ruta: str, claves: list[str]) -> None:
    cfg_path = (RAIZ / ruta).resolve()
    cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
    salida = RAIZ / cfg['salida']
    salida.mkdir(parents=True, exist_ok=True)
    tareas_path = salida / 'tareas.json'
    tareas = json.loads(tareas_path.read_text(encoding='utf-8')) if tareas_path.exists() else {}
    pedir = claves or [k for k in cfg['clips'] if not (salida / f'{k}.mp4').exists()]
    antes = creditos()
    print(f'créditos de kie.ai: {antes}')
    pendientes = {}
    for clave in pedir:
        c = cfg['clips'][clave]
        texto, dur, cierre = (c, cfg['duracion'], True) if isinstance(c, str) else (c['texto'], c.get('duracion', cfg['duracion']), not c.get('sin_cierre'))
        # "guardia" propia del clip: la misma pose más chica, con aire para saltos y clavados.
        guardia = cfg['guardia'] if isinstance(c, str) else c.get('guardia', cfg['guardia'])
        prompt = f"{cfg['base']} {texto} {cfg['final']}{CIERRE if cierre else ''}"
        # kie.ai corta con 429 si se piden muchos seguidos: se espera y se reintenta.
        for intento in range(12):
            res = llamar('POST', '/jobs/createTask', {
                'model': 'kling-3.0/video',
                'input': {
                    'prompt': prompt[:2500], 'image_urls': [guardia, guardia], 'sound': False,
                    'duration': str(dur), 'aspect_ratio': '1:1', 'mode': cfg['modo'], 'multi_shots': False,
                },
            })
            if res.get('code') != 429:
                break
            time.sleep(20 + 10 * intento)
        time.sleep(3)
        if res.get('code') != 200:
            print(f'{clave}: no se pudo pedir ({res})')
            continue
        tid = res['data']['taskId']
        tareas[clave] = tid
        pendientes[clave] = tid
        print(f'{clave}: pedido {tid}')
    tareas_path.write_text(json.dumps(tareas, indent=2) + '\n', encoding='utf-8')
    inicio = time.time()
    while pendientes and time.time() - inicio < 2400:
        time.sleep(15)
        for clave, tid in list(pendientes.items()):
            try:
                d = llamar('GET', f'/jobs/recordInfo?taskId={tid}').get('data') or {}
            except Exception as e:  # noqa: BLE001 (un tropiezo de red no corta la espera)
                print(f'{clave}: error al consultar ({e})')
                continue
            estado = d.get('state')
            if estado == 'fail':
                print(f'{clave}: falló ({d.get("failCode")}: {d.get("failMsg")})')
                del pendientes[clave]
            elif estado == 'success':
                urls = json.loads(d.get('resultJson') or '{}').get('resultUrls') or []
                if urls:
                    urllib.request.urlretrieve(urls[0], salida / f'{clave}.mp4')
                    print(f'{clave}: listo -> {salida / (clave + ".mp4")} ({d.get("creditsConsumed")} créditos)')
                else:
                    print(f'{clave}: terminó sin video ({d})')
                del pendientes[clave]
    for clave in pendientes:
        print(f'{clave}: sigue en proceso (tarea {pendientes[clave]})')
    print(f'créditos gastados en esta corrida: {antes - creditos()}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
