"""Compone los temas del juego con Suno (V6) a través de la API de kie.ai.

La clave NO se guarda en el proyecto: va en la variable de entorno KIE_API_KEY.

  KIE_API_KEY=... python -P -E herramientas/musica_suno.py [tema ...]

Sin argumentos pide todos los temas. Cada pedido cuesta 12 créditos de kie.ai y
devuelve 2 versiones, que quedan en arte/musica/suno/<tema>/<tema>-1.mp3 y -2.mp3
(con info.json). Después herramientas/musica_loop.py elige el loop y escribe
public/musica/<tema>.mp3 y musica.json.
"""
import json
import os
import pathlib
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'arte' / 'musica' / 'suno'
API = 'https://api.kie.ai/api/v1'
SIN_VOZ = 'vocals, singing, voice, choir, lyrics, spoken word, rap vocals'

# Mismos temas que herramientas/musica_ia.py (ACE-Step), para poder comparar.
TEMAS = {
    'titulo': {
        'title': 'El Torneo de Cell - Titulo',
        'style': ('90s arcade fighting game title theme, Neo Geo and Capcom CPS2 style, energetic hard rock, '
                  'FM synth brass stabs, distorted electric guitar lead with a heroic catchy melody, slap bass, '
                  'driving rock drums, orchestra hits, epic, hype, 140 bpm, E minor, instrumental, seamless loop'),
    },
    'rene-cabana': {
        'title': 'La Cabana del Lago',
        'style': ('fighting game stage theme, sunny lakeside log cabin in southern Chile, upbeat Andean fusion, '
                  'charango, nylon guitar, quena flute, marimba, funky slap bass, breezy drums with shaker and claps, '
                  'joyful, adventurous, 90s arcade video game music, 116 bpm, G major, instrumental, seamless loop'),
    },
    'rene-plaza': {
        'title': 'La Plaza de la Pobla',
        'style': ('fighting game stage theme, night freestyle rap battle in a Chilean neighborhood plaza, hard hip hop '
                  'boom bap beat with reggaeton dembow touches, heavy 808 bass, dark synth pads, catchy synth lead hook, '
                  'vinyl scratches, crowd hype, gritty urban, 90s arcade video game music, 100 bpm, A minor, '
                  'instrumental, seamless loop'),
    },
    # Segunda vuelta (30 oct 2026): el usuario pidió más estilo arcade de los 80 y 90, como
    # el título y la pobla. Se guardan aparte para no pisar las versiones anteriores.
    'rene-cabana-v2': {
        'title': 'La Cabana del Lago (Arcade)',
        'style': ('90s arcade fighting game stage theme, Capcom CPS2 and Neo Geo style, sunny lakeside cabin party '
                  'in southern Chile, upbeat 80s synth funk, bright FM synth lead with a catchy heroic hook, '
                  'slap bass, gated reverb drums, synth brass stabs, a touch of charango, energetic, joyful, '
                  '128 bpm, D major, instrumental, seamless loop'),
    },
    'pablito-calle-v2': {
        'title': 'La Calle del Pablito (Arcade)',
        'style': ('90s arcade fighting game stage theme, Neo Geo style, rainy night street in a southern Chilean '
                  'neighborhood, dark electro cumbia fused with 80s synthwave, accordion-like FM synth lead with a '
                  'catchy hook, cumbia guiro groove on a punchy drum machine, deep synth bass, moody, energetic, '
                  '104 bpm, D minor, instrumental, seamless loop'),
    },
    # Tercera vuelta del Pablito (30 oct 2026): el usuario no quiere cumbia.
    'pablito-calle-v3': {
        'title': 'La Calle del Pablito (Noche de Lluvia)',
        'style': ('90s arcade fighting game stage theme, Neo Geo style, rainy night street in southern Chile, '
                  'moody 80s synthwave with dark synth rock, driving drum machine, pulsing bass arpeggio, '
                  'catchy melancholic FM synth lead hook, electric guitar riffs, energetic, '
                  '112 bpm, E minor, instrumental, seamless loop'),
        'negativo': 'cumbia, accordion, guiro, latin percussion, tropical',
    },
    'lena-valparaiso-v2': {
        'title': 'Los Cerros de Valparaiso (Arcade)',
        'style': ('90s arcade fighting game stage theme, Capcom CPS2 style, sunset over the hills and harbor of '
                  'Valparaiso, energetic synth rock, catchy FM synth lead and electric guitar melody, '
                  'accordion touches, driving rock drums, slap bass, orchestra hits, adventurous, '
                  '136 bpm, A minor, instrumental, seamless loop'),
    },
}


def llamar(metodo: str, ruta: str, cuerpo: dict | None = None) -> dict:
    clave = os.environ['KIE_API_KEY']
    req = urllib.request.Request(f'{API}{ruta}', method=metodo, headers={
        'Authorization': f'Bearer {clave}', 'Content-Type': 'application/json',
    }, data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def main(nombres: list[str]) -> None:
    tareas = {}
    for nombre in nombres:
        t = TEMAS[nombre]
        res = llamar('POST', '/jobs/createTask', {
            'model': 'ai-music-api/generate',
            'input': {
                'custom_mode': True, 'instrumental': True, 'model': 'V6',
                'title': t['title'], 'style': t['style'],
                'negative_tags': SIN_VOZ + (', ' + t['negativo'] if t.get('negativo') else ''), 'duration': 120,
            },
        })
        if res.get('code') != 200:
            print(f'{nombre}: no se pudo pedir ({res})')
            continue
        tareas[nombre] = res['data']['taskId']
        print(f'{nombre}: pedido {tareas[nombre]}')
    pendientes = dict(tareas)
    inicio = time.time()
    while pendientes and time.time() - inicio < 1200:
        time.sleep(15)
        for nombre, tid in list(pendientes.items()):
            d = llamar('GET', f'/jobs/recordInfo?taskId={tid}').get('data') or {}
            estado = d.get('state')
            if estado == 'fail':
                print(f'{nombre}: falló ({d.get("failCode")}: {d.get("failMsg")})')
                del pendientes[nombre]
            elif estado == 'success':
                resp = d.get('response') or json.loads(d.get('resultJson') or '{}')
                pistas = resp.get('data') or resp.get('sunoData') or []
                destino = SALIDA / nombre
                destino.mkdir(parents=True, exist_ok=True)
                info = []
                for i, p in enumerate(pistas):
                    url = p.get('audio_url') or p.get('audioUrl')
                    if not url:
                        continue
                    archivo = destino / f'{nombre}-{i + 1}.mp3'
                    urllib.request.urlretrieve(url, archivo)
                    info.append({'archivo': archivo.name, 'duracion': p.get('duration'), 'id': p.get('id')})
                (destino / 'info.json').write_text(json.dumps({**TEMAS[nombre], 'tarea': tid, 'versiones': info},
                                                              indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
                print(f'{nombre}: {len(info)} versiones -> {destino}')
                del pendientes[nombre]
    for nombre in pendientes:
        print(f'{nombre}: sigue en proceso (tarea {pendientes[nombre]}); vuelve a consultar más tarde')


if __name__ == '__main__':
    main(sys.argv[1:] or list(TEMAS))
