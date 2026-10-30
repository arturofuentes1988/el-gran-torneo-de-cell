# Cómo se hace

Paso a paso para agregar un luchador, un escenario o un tema musical, con lo que funcionó,
lo que cuesta y los problemas conocidos. Las herramientas de Python están en `herramientas/`
(se corren con `python -P -E herramientas/<script>.py …` desde la raíz del proyecto).

## Costos de referencia (Higgsfield, plan plus)

| Qué | Modelo | Costo |
|---|---|---|
| Diseño del luchador (una imagen 2k 3:4) | Nano Banana Pro (`nano_banana_pro`) | 2 |
| Edición de un diseño (cambiar boca, zapatillas…) | Nano Banana Pro con la imagen como referencia | 2 |
| Clip de animación de 3 s | Kling 3.0 (`kling3_0`, `std`, sin sonido, 1:1) | 4,5 |
| Set completo de animaciones (23 clips) | Kling 3.0 | ~104 |
| Imagen de escenario 4K 21:9 | Nano Banana Pro | 4 |
| Loop animado del escenario (5 s, 2K, 21:9) | MiniMax H3 (`minimax_h3`) | 10 |
| Frase del anunciador | ElevenLabs `text2speech_v2`, voz "Caspian" | 0,15 |

Un luchador completo sale en unos 130 créditos (diseños ~10, prueba 4,5, animaciones ~104,
escenario 14). **Siempre** se pide aprobación explícita antes de gastar, con el costo.

**Problemas conocidos de Higgsfield**

- Los videos con imagen de inicio y final a veces devuelven la recomendación del preset
  "IN THE DARK" en vez de crear el trabajo. Se evita pasando
  `declined_preset_id: "24bae836-2c4a-48e0-89b6-49fcc0b21612"`.
- Para subir una imagen propia: `media_upload` (devuelve una URL firmada), `curl -X PUT -H
  "Content-Type: image/png" --data-binary @archivo "<url>"` y `media_confirm`. Si la
  línea de comando con la URL es muy larga, guardar la URL en un archivo y leerla de ahí.
- Un trabajo anterior se puede usar como referencia pasando su id de trabajo en `medias`.
- Los lotes (`generate_image_batch`, `generate_video_batch`) aceptan hasta 12 pedidos.

---

## 1. Un luchador nuevo

### 1.1 Material del usuario e investigación

1. El usuario deja fotos en `referencias/<carpeta>/` y manda links de YouTube o TikTok donde
   la persona hable.
2. Buscar en internet quién es y por qué es conocido. Dejar fuera salud, pobreza, adicciones,
   violencia real y tragedias personales.
3. Bajar los videos (ver 1.6) y sacar cuadros de su cara de frente: dan mucho mejor parecido
   que las fotos chicas (`ffmpeg -ss <t> -i video.mp4 -frames:v 1 cara.png`).

### 1.2 Diseño

Nano Banana Pro, 2k, 3:4. Referencias, en este orden: el diseño final de Pablito como
**estilo** (`arte/pablito-neuquen/diseno-final.png`), 3 o 4 cuadros de su cara y una foto con
la ropa. Plantilla que funcionó:

> The first image is ONLY the approved art style for a 2D fighting game (premium high-detail
> pixel art like SNK's Garou: Mark of the Wolves and The King of Fighters XIII sprites: crisp
> pixel clusters, bold dark outline, rich cel shading with 4-5 tones per color, vibrant
> saturated colors, subtle rim light). Copy that art style, rendering quality and sprite scale
> exactly, but do not copy that character's face or body. Draw the man shown in the next
> close-up face photos, with a faithful, respectful likeness of his real face (never a
> caricature): <rasgos: forma de la cabeza, pelo, ojos, nariz, piel, cuerpo>. Expression: <…>.
> Full body, <guardia>, side view facing right (three-quarter view), both feet visible.
> Outfit: <ropa, sin letras ni logos>. He wears NO <accesorios de otros luchadores>.
> Plain flat light grey background, no floor shadow, no text, no logos, no watermark.

- Hacer 2 versiones, compararlas con cuadros de su cara y dejar que el usuario elija.
- No repetir accesorios de otro luchador (el bananano, las cadenas y los lentes son de René).
- La guardia queda como primer y último cuadro de todos los clips: con la boca cerrada y
  neutra (si silba o grita, lo hace en todas las animaciones).
- El aprobado se copia a `arte/<carpeta>/diseno-final.png`.

**Guardia cuadrada** para Kling (mismo encuadre para todos): 1536 × 1536, el personaje con
1230 px de alto y los pies en y = 1390, centrado, fondo del mismo gris del diseño. Se recorta
la silueta del diseño (fondo = mediana de los bordes, diferencia > 30), se escala y se pega.
Queda en `arte/<carpeta>/guardia-cuadrada.png`.

**Ropa blanca que queda transparente al moverse rápido** (el Flaitiano al saltar y rodar): en el
`armado.json`, `"estricto": {"rodada": 24, "salto": 24}` hace que en esos clips solo se quite lo
cercano al color del fondo y que el interior de la silueta quede relleno. Sirve en poses cerradas;
los cuadros con mucho desenfoque conviene sacarlos. También se cortan brazos o ruedas que se salen
del borde del video: esos cuadros se dejan fuera (victoria y bicicleta de Carlitos).

**Luchadores pintados (estilo de los fondos) con ropa blanca**: el recorte por color no sirve (el
gris claro del fondo se come la chaqueta: puños flotando, jeans con hoyos). `"ia": true` en el
`armado.json` recorta con IA (rembg con isnet-anime, menos de 1 s por cuadro) y le suma lo que es
claramente oscuro o de color (piel, pelo, bolso, zapatillas); los resplandores blancos que agrega
el video quedan fuera. El borde queda suave. Se instala con `pip install --user rembg`.
Con ropa oscura (Pablito) va además `"ropa_blanca": false`: no se rellenan los huecos encerrados
(el hueco entre la mano y la pierna es fondo; se rellenaba y quedaba una mancha clara). Para los
próximos luchadores pintados conviene pedir la guardia sobre fondo de color plano (verde, o magenta
si el luchador tiene verde, como el Flaitiano) y recortar por color.

**Colores alternativos** (`costume` en la definición): revisar con una vista previa de los 3 colores.
Una franja de cabeza (`head`) que corta una prenda la deja de dos colores (el gorro del polerón de
Pablito): mejor dejar fuera esa prenda (Pablito conserva el polerón amarillo). Con `face`, subir
`faceNeighbors` a 6 en arte HD para que la ropa junto a manos y cuello también se tiña.

**Saltos y clavados que se salen por arriba**: se piden a Kling con una guardia achicada al 75 % en
torno a los pies (`guardia-pintada-chica.png`, con aire arriba y a los lados) poniendo
`"guardia": URL` en ese clip del `kie.json`, y en el `armado.json` `"reescalar": {"salto": 0.75}`
los agranda de vuelta al tamaño de los demás.

**Revisar antes de armar** (luchadores pintados): por cada clip, una hoja con el número de cada
cuadro y una pasada que avise qué cuadros tocan el borde del video. Se rehacen los clips con
errores de continuidad: objetos que aparecen o quedan flotando (el agarre del Flaitiano), el
personaje que se achica al alejarse de la cámara (la caída de Pablito) o accesorios que se sacan y
vuelven a aparecer (las zapatillas del súper de Pablito).

### 1.3 Clip de prueba y animaciones

Kling 3.0, 3 s, `std`, `sound: off`, 1:1, imagen de inicio y de final = la guardia subida.
Primero un **clip de prueba** de la guardia (4,5) para ver que la cara no cambie y que el fondo
se quite limpio; después el set completo. Plantilla:

> 2D fighting game sprite animation of this exact pixel-art character (same face, <rasgos y
> ropa>, colors and pixel art style in every frame). He always faces right in side view and
> never turns around. <acción>. Snappy arcade fighting game timing. Locked static camera, no
> zoom, no pan, no cuts, the plain flat light grey background never changes, full body always
> inside the frame, no visual effects, no motion lines, no particles. He ends exactly in the
> same fighting stance as the first frame.

Los 23 clips del Vendedor de Leña (los del Flaitiano son parecidos): caminar, golpe_debil,
golpe_fuerte, patada_debil, patada_fuerte, agachado_golpes, agachado_barrida, gancho, salto,
defensa, golpeado_alto, golpeado_bajo, caida, intro, victoria, pela (burla), poder, rodada y
uno por cada especial y el ultra. Caminar, victoria y rodada van **sin** imagen final (no
vuelven a la guardia). Los efectos (fuego, rayos, troncos…) no se piden al video: se dibujan
con código. Los ids de los trabajos se guardan en `arte/<carpeta>/videos/trabajos.json`.

Problemas vistos: el video a veces dibuja objetos que no van (un "rival invisible" verde, un
fierro), cambia al personaje (la victoria del Vendedor salió con otro tipo) o le corta la
cabeza arriba en el salto. Se revisa cada clip con una hoja de cuadros antes de armar.

### 1.4 Cuadros y armado

1. `video_a_cuadros.py arte/<carpeta>/videos/<clip>.mp4 arte/<carpeta>/clips/<clip>` saca los
   cuadros sin fondo (se pueden correr varios en paralelo).
2. `linea_de_tiempo.py arte/<carpeta>/clips salida.png clip1 clip2 … --paso 3` hace una hoja
   con el número de cada cuadro (a 24 por segundo) para elegir.
3. `arte/<carpeta>/armado.json` dice qué cuadros forman cada animación. Opciones útiles:
   `cuadros` (lista o `desde/hasta/paso`), `dur`, `activos` (cuadros que golpean), `grupos`,
   `props_grupo`, `extra` (por cuadro: `sfx`, `spawn` de proyectil, `vel`, `hit`), `pies`
   (en el aire), `centrar`, `copia` + `reversa`, `boca_fija` (la guardia no abre la boca),
   `cabeza` (completa la cabeza cortada con la de la guardia), `borrar_objeto` (borra una
   mancha blanca lisa) y `borrar_tono` (borra una mancha de un color, ej. verde
   `[0.18, 0.5]`, y los pedacitos sueltos). `alto_mundo` fija el alto en el juego (René 150,
   Pablito y Flaitiano 160, Vendedor 146).
4. `arte/<carpeta>/definicion.json`: movimientos (`moves`), orden de los especiales
   (`specials`), proyectiles (con `look` para los dibujados con código), sonidos
   sintetizados (`sounds`), colores de la interfaz (`ui`), `comboFx`, burlas (`taunts`),
   combos sugeridos, ayuda del 2 VS 2 (`assist`), colores de ropa (`costume`) y `ciudad`.
   Formato completo en [FORMATO_SPRITES.md](FORMATO_SPRITES.md).
5. `armar_luchador.py arte/<carpeta>/armado.json` escribe `public/luchadores/<id>/` (atlas
   WebP, `<id>.json`). La definición se mezcla al armar: si se cambia, hay que volver a armar.
6. Cara para ELIGE LUCHADOR: agregar el luchador a `LUCHADORES` en `caras.py` y correrlo.
   Retrato del súper: un busto recortado del diseño, sin fondo, en `arte/<carpeta>/efectos/retrato.png`
   (`imagenes.retrato` en el armado).
7. Agregar el id a `REAL_FIGHTERS` en `src/main.ts`.

**Comandos** disponibles (`motion`): `qcf` (↓↘→), `qcb` (↓↙←), `dp` (→↓↘), `qcf2`, `hcf`,
`hcb`, `ff` (→→), `bb` (←←), `dd` (↓↓), `bf` (←→), `fbf` (→←→), `mash` (machacar),
`charge`, `hold`, `chargeSuper`. El usuario prefiere los fáciles (dos toques + botón).

**Colores de ropa** (`costume`): `dark` (ropa oscura), `light` (ropa clara), `hues`
(rangos de tono `[desde, hasta, saturación mínima]`), `head` / `feet` (franjas que no se
tocan), `face` + `faceNeighbors` (en la parte de arriba, lo rodeado de piel queda igual:
así los hombros se tiñen enteros) y `visita` (el color 1 deja blanca la ropa de los tonos).

### 1.5 Efectos con código

Los efectos de cada luchador se dibujan con vectores en `src/render/` (sin créditos):
`elemental.ts` (agua y rayos del Flaitiano) y `fuego.ts` (leña, fuego y viento del Vendedor).
Un proyectil con `look` se dibuja en `ProjectileLook`; los golpes con ese `look` tienen su
efecto en `elementalHit` de `src/scenes/fight.ts`. Los súper pueden tener luces
(`cinematic.lights`: `disco`, `tormenta`, `ultrainstinto`, `fiesta`) y un escenario de
reemplazo (`cinematic.backdrop`).

### 1.6 Voces reales

1. **Bajar**: `yt-dlp --js-runtimes node -f "bv*[height<=1080]+ba/b" --merge-output-format mp4
   -o "referencias/<carpeta>/video-<id>.mp4" --write-info-json <url>`.
2. **Separar la voz**: Demucs (`demucs --two-stems vocals -n htdemucs`). Los silbidos y efectos
   quedan en la pista de música: esos se cortan del audio original.
3. **Transcribir**: faster-whisper `large-v3` con tiempos por palabra, en español. Whisper se
   equivoca con el chileno ("un saldito" era "un silbidito").
4. **Cortes para revisar** en `referencias/<carpeta>/frases-para-revisar/` y el usuario
   confirma cuáles sirven y el texto.
5. `arte/<carpeta>/voces/voces.json` (fuentes, cortes con `desde`/`hasta`/`texto`, claves del
   motor) y `voces_luchador.py arte/<carpeta>/voces/voces.json` escribe
   `public/luchadores/<id>/voces/`.

Claves que usa el motor: `voz/intro`, `voz/poder`, `voz/victoria`, `voz/remate`, `voz/ultra`,
`voz/ultra-1…`, `voz/risa`, `voz/combo-corto`, `voz/combo-medio`, `voz/combo-largo`,
`voz/combo-viral`, `voz/combo-ultra`, más las propias de cada movimiento (`voz/<algo>` en
`extra.sfx` o `taunts`). Las claves sin `voz/` (ej. `silbido/largo`) suenan como efecto y no
cortan la voz del luchador.

yt-dlp, Demucs y faster-whisper se instalaron en un entorno de Python temporal; para
reinstalarlos: `python -m venv venv-audio` y `venv-audio/Scripts/pip install yt-dlp demucs
faster-whisper`.

---

## 2. Un escenario

1. **Imagen**: Nano Banana Pro, 4K, 21:9. Plantilla:

   > <descripción del lugar, con la paleta y la hora del día>. Floor: <piso>.
   >
   > Wide panoramic background art for a 2D fighting game stage (side-view arena like Street
   > Fighter 6, King of Fighters XV or Guilty Gear Strive stages). Camera: straight-on side
   > view at eye level. The ground is a perfectly flat, horizontal floor that fills the bottom
   > quarter of the image across the whole width. The center and the lower part of the frame
   > is an open, empty fighting area: no people, no characters and no objects in front.
   > Background people only as tiny silhouettes far away. No other text, no logos, no watermark.
   >
   > Style: high-end HD hand-painted digital art with crisp detail, cinematic lighting, rich
   > saturated colors with slightly softer contrast than foreground characters would have.

2. **Loop animado**: MiniMax H3, 2K, 21:9, 5 s, imagen de inicio y final = el id del trabajo
   de la imagen, con `declined_preset_id`. El texto pide cámara fija, qué se mueve (agua,
   lluvia, nubes, gaviotas, luces) y qué queda quieto, el piso vacío y "seamless loop".
3. **Configuración** en `arte/escenarios/<luchador>/<nombre>.json`: `id`, `nombre`,
   `luchador`, `orden`, `lugar` (`nombre`, `lat`, `lon` para el mapa), `imagen`, `video`,
   `salida`, `corte_suelo`, `pies`, `niebla`, `particulas` (`lluvia`, `nieve`, `brasas`,
   `polvo`) y `musica`.
4. `armar_escenario.py arte/escenarios/<luchador>/<nombre>.json` escribe
   `public/escenarios/<id>/` y su entrada en `escenarios.json` (ordenada por `orden`).
5. Los textos usados están en `arte/escenarios/prompts.md`.

---

## 3. Un tema musical

**ACE-Step 1.5** (gratis, en la tarjeta de video), instalado en
`C:\Users\fuent\musica-ia\ACE-Step-1.5`:

1. Un archivo `.toml` con `caption` (en inglés y **solo ASCII**: la ñ y la ü se rompen),
   `instrumental = true`, `lyrics = "[Instrumental]"`, `bpm`, `keyscale`, `duration = 100`,
   `batch_size = 2`, `thinking = true` y `save_dir`.
2. Con `thinking = true` el programa se detiene a pedir que se edite un borrador, salvo que
   exista `ACE-Step-1.5/instruction.txt`: ese archivo se usa sin preguntar, así que **hay que
   reescribirlo con el mismo caption, bpm y tonalidad** antes de cada tema.
3. Correr: `PYTHONUTF8=1 .venv/Scripts/python.exe cli.py -c <archivo.toml> --backend pt`
   (unos 2 minutos, salen 2 versiones en WAV).
4. Revisar que no tenga voces: Demucs y comparar la energía de la voz contra el resto por
   tramos de 5 s (lo normal es -40 dB; un tramo cerca de -15 dB suena casi a voz y se corta).
5. Los temas quedan registrados en `TEMAS` de `herramientas/musica_ia.py`.

**Suno** (mejor calidad, de pago): `herramientas/musica_suno.py` con la clave de kie.ai en la
variable `KIE_API_KEY` (unos 12 créditos de kie por pedido, 2 versiones).

**Loop**: `musica_loop.py <clave> <audio> <bpm> [--minimo S]` busca el mejor punto de
costura, iguala la sonoridad (-16 LUFS) y escribe `public/musica/<clave>.mp3` y su entrada en
`musica.json`. Para lluvia de fondo: `musica_lluvia.py`. El escenario apunta al tema con
`musica`.

---

## 4. Probar

- `npm run dev` (puerto 5173), `npx tsc --noEmit -p .` y `npm run build`.
- Atajos de URL: `?escena=pelea&modo=cpu|2p|demo|practica&luchadores=i,j&escenario=<id>`
  (índices del plantel: 0 René, 1 Pablito, 2 Flaitiano, 3 Vendedor de Leña).
- `?qa=1` agrega el puente de pruebas: el estado del juego se lee del elemento `#qa-state`
  y se mandan órdenes escribiendo en `#qa-cmd`, una por línea:
  - `input:<lado>:<entradas>`: un cuadro por elemento, dirección de teclado numérico absoluta,
    botones con `+` y repeticiones con `*N` (ej. `input:0:4,5*2,4+lp,5*10` = ← ← + golpe débil).
  - `meter:<lado>:<valor>` (100 = una barra) y `health:<lado>:<valor>`.
- En práctica, la tecla 4 reinicia la posición.
- Las capturas se sacan con el navegador automático (`browser.mjs … --script prueba.mjs`).

---

## 5. Herramientas

| Script | Para qué |
|---|---|
| `video_a_cuadros.py` | Cuadros sin fondo de un video, con hoja de contacto y GIF. |
| `linea_de_tiempo.py` | Hoja con el número de cada cuadro de varios clips, para elegir. |
| `armar_luchador.py` | Arma el luchador (atlas, cajas de golpe, definición) desde `armado.json`. |
| `caras.py` | Caras de ELIGE LUCHADOR desde cada diseño aprobado. |
| `voces_luchador.py` | Cortes de voz de un luchador desde `voces.json`. |
| `preparar_voces.py` | Voces del anunciador (`arte/voces/originales/` a `public/voces/`). |
| `armar_escenario.py` | Arma un escenario HD (fondo, piso, video, bruma, partículas). |
| `musica_ia.py` | Temas con ACE-Step (registro de los textos usados). |
| `musica_suno.py` | Temas con Suno por kie.ai (`KIE_API_KEY`). |
| `kie_video.py` | Animaciones con Kling 3.0 por kie.ai desde `arte/<luchador>/kie.json` (`KIE_API_KEY`). |
| `musica_loop.py` | Prepara un tema para sonar en loop y lo agrega a `musica.json`. |
| `musica_lluvia.py` | Cama de lluvia sintetizada para mezclar bajo un tema. |
| `musica.py` | Temas sintetizados desde cero (respaldo, sin IA). |
| `sonido_intro.py` | Jingle de encendido estilo consola de los 90 (ya no se usa en el juego). |
| `bocetos.py` | Bocetos gratis de movimientos con FLUX.1 Kontext (Hugging Face). |
