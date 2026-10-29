"""Compone los temas del juego con ACE-Step 1.5 (IA de música de código abierto, local).

ACE-Step está instalado aparte, en C:\\Users\\fuent\\musica-ia\\ACE-Step-1.5 (con su
propio entorno). Este script se corre con ESE Python:

  C:\\Users\\fuent\\musica-ia\\ACE-Step-1.5\\.venv\\Scripts\\python herramientas/musica_ia.py [tema ...]

Sin argumentos genera todos los temas. Cada tema sale en 2 versiones en
arte/musica/ia/<tema>/ (WAV 48 kHz). Después herramientas/musica_loop.py elige el
loop y escribe public/musica/<tema>.mp3 y musica.json.
"""
import json
import pathlib
import sys
import time

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ACE = pathlib.Path(r'C:\Users\fuent\musica-ia\ACE-Step-1.5')
SALIDA = RAIZ / 'arte' / 'musica' / 'ia'

# Descripción (en inglés: el modelo la entiende mejor), tempo, tonalidad y duración de cada tema.
TEMAS = {
    'titulo': {
        'caption': (
            '90s arcade fighting game title theme, Neo Geo and Capcom CPS2 style, energetic hard rock '
            'with FM synth brass stabs, distorted electric guitar lead playing a heroic catchy melody, '
            'slap bass, driving rock drums, orchestra hits, epic hype, instrumental'
        ),
        'bpm': 140, 'keyscale': 'E minor', 'duration': 100,
    },
    'rene-cabana': {
        'caption': (
            'fighting game stage theme for a sunny lakeside log cabin in southern Chile, upbeat Andean '
            'fusion with charango, nylon guitar and quena flute, marimba, funky slap bass, breezy drums '
            'with shaker and claps, joyful and adventurous, 90s arcade video game music, instrumental'
        ),
        'bpm': 116, 'keyscale': 'G major', 'duration': 100,
    },
    'rene-plaza': {
        'caption': (
            'fighting game stage theme for a night freestyle rap battle in a Chilean neighborhood plaza, '
            'hard hip hop boom bap beat with reggaeton dembow touches, heavy 808 bass, dark synth pads, '
            'catchy synth lead hook, vinyl scratches, crowd shouts, gritty urban energy, '
            '90s arcade video game music, instrumental'
        ),
        'bpm': 100, 'keyscale': 'A minor', 'duration': 100,
    },
}


def main(nombres: list[str]) -> None:
    sys.path.insert(0, str(ACE))
    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler

    dit = AceStepHandler()
    dit.initialize_service(project_root=str(ACE), config_path='acestep-v15-turbo', device='cuda')
    llm = LLMHandler()
    llm.initialize(checkpoint_dir=str(ACE / 'checkpoints'), lm_model_path='acestep-5Hz-lm-1.7B', backend='pt', device='cuda')

    for nombre in nombres:
        t = TEMAS[nombre]
        destino = SALIDA / nombre
        destino.mkdir(parents=True, exist_ok=True)
        params = GenerationParams(
            task_type='text2music', caption=t['caption'], lyrics='[Instrumental]', instrumental=True,
            bpm=t['bpm'], keyscale=t['keyscale'], timesignature='4', duration=t['duration'],
            inference_steps=8, shift=3.0, thinking=True, use_cot_metas=False,
        )
        config = GenerationConfig(batch_size=2, audio_format='wav')
        t0 = time.time()
        res = generate_music(dit, llm, params, config, save_dir=str(destino))
        if not res.success:
            print(f'{nombre}: ERROR {res.error}')
            continue
        info = []
        for i, a in enumerate(res.audios):
            src = pathlib.Path(a['path'])
            dst = destino / f'{nombre}-{i + 1}{src.suffix}'
            src.replace(dst)
            info.append({'archivo': dst.name, 'semilla': a['params'].get('seed')})
        (destino / 'info.json').write_text(json.dumps({**t, 'versiones': info}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'{nombre}: {len(info)} versiones en {time.time() - t0:.0f} s -> {destino}')


if __name__ == '__main__':
    main(sys.argv[1:] or list(TEMAS))
