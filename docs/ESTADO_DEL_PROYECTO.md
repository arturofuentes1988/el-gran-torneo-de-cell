# Estado del proyecto

Resumen de dónde está **El Gran Torneo de Cell**, qué está hecho, qué falta y las reglas
que se acordaron. Actualizado al 30 de octubre de 2026.

Documentos relacionados:

- [LUCHADORES.md](LUCHADORES.md): ficha de cada luchador (comandos, voces, archivos).
- [COMO_SE_HACE.md](COMO_SE_HACE.md): paso a paso para hacer un luchador, un escenario o
  un tema musical, con costos y problemas conocidos.
- [FORMATO_SPRITES.md](FORMATO_SPRITES.md): formato técnico de luchadores, escenarios y sonidos.
- [../README.md](../README.md): cómo correr el juego, controles y especiales.

## Qué es

Juego de pelea 2D para el navegador (Vite 6, TypeScript estricto, PixiJS v8), estilo SNK y
Marvel vs Capcom, con los personajes del fenómeno de TikTok chileno "Torneo de Cell".
Parodia sin fines de lucro.

- Repositorio público: https://github.com/arturofuentes1988/el-gran-torneo-de-cell
- Juego en línea: https://arturofuentes1988.github.io/el-gran-torneo-de-cell/
- Cada push a `main` se publica solo con GitHub Actions (`.github/workflows/pages.yml`).
- `arte/` y `referencias/` no se suben (están en `.gitignore`): ahí quedan los videos,
  fotos, diseños y notas de trabajo de cada luchador.

## Plantel

Ocho luchadores elegidos por el usuario. Cuatro ya se pueden jugar.

| Luchador | Estado | Ciudad (mapa del ARCADE) | Escenario propio |
|---|---|---|---|
| Loco René | jugable | Santiago | LA CABAÑA DEL LAGO, LA CANCHA |
| Pablito Neuquén | jugable | Valdivia | LA CALLE DEL PABLITO |
| Flaitiano | jugable | Santiago | (ninguno todavía; idea: feria libre) |
| Vendedor de Leña | jugable | Valparaíso | LOS CERROS DE VALPARAÍSO |
| Papi Micky (Miguel Devia) | pendiente | | idea: set de TV juvenil con neón (guiño a Yingo) |
| Guatón Ñackson | pendiente | | idea: picada de completos |
| Doctor Maki Gero | pendiente | | idea: laboratorio en la cordillera |
| Diego González | pendiente | | por decidir |

Cada luchador completo cuesta unos 130 créditos de Higgsfield (ver COMO_SE_HACE.md).

## Escenarios

En `public/escenarios/escenarios.json`, en este orden:

1. `rene-cabana`: LA CABAÑA DEL LAGO (sur de Chile, de día). Video de fondo.
2. `rene-plaza`: LA CANCHA (Santiago, de noche, batalla de rap con el grafiti "DURO COMO TUNA").
3. `pablito-calle`: LA CALLE DEL PABLITO (Valdivia, de noche con lluvia).
4. `lena-valparaiso`: LOS CERROS DE VALPARAÍSO (al atardecer, ascensor, bahía, rumas de leña).
5. `santiago`: SANTIAGO DE NOCHE (el mismo fondo del título).

Fuera de la lista: el ring de EL GRAN TORNEO (`public/torneo/`, fondo del título y final del
ARCADE) y el horizonte de Santiago (`public/titulo/`).

## Música

| Tema | Archivo | Origen |
|---|---|---|
| Título y menús | `titulo.mp3` | Suno V6 (kie.ai) |
| La cabaña del lago | `rene-cabana.mp3` | Suno V6 (kie.ai) |
| La cancha | `rene-plaza.mp3` | Suno V6 (kie.ai) |
| La calle del Pablito | `pablito-calle.mp3` | ACE-Step 1.5 local, cumbia sureña con lluvia |
| Los cerros de Valparaíso | `lena-valparaiso.mp3` | ACE-Step 1.5 local, videojuego de 16 bits de los 90 |

## Modos

- **ARCADE**: eliges luchador y le ganas a los demás. Un mapa de Chile (acostado) muestra el
  viaje desde tu ciudad hasta la de cada rival, siempre a la más cercana. Cada rival pelea en
  su escenario; la final es en el ring, contra quien no tenga escenario propio (hoy el Flaitiano).
- **CASUAL**: 1 VS CPU, 1 VS 1, 2 VS 2 (con cambio y ayuda) y PRÁCTICA.
- **OPCIONES**: PERSONAJES, MOVIMIENTOS, ESCENARIOS, DEMOSTRACIÓN, CONTROLES, DIFICULTAD y SONIDO.
  - **DEMOSTRACIÓN** (`src/scenes/demo.ts`): la CPU contra la CPU en MUY DIFÍCIL, sin fin. Cada
    round es una pelea nueva con otros dos luchadores al azar, colores al azar y otro escenario.
    Aceptar o volver sale a OPCIONES.
- Colores de ropa: 4 por luchador (el 0 es el original). El Vendedor de Leña tiene **ropa de
  visita** (polera blanca) en el color 1; un luchador repetido la usa solo.

## Trabajo del 30 de octubre de 2026 (subido y publicado)

- Nuevo luchador **Vendedor de Leña** (`public/luchadores/lena/`): 23 animaciones, voces reales,
  efectos de fuego, viento y troncos dibujados con código (`src/render/fuego.ts`), súper con
  aura plateada y pantalla trizada, ultra de fiesta con focos, confeti y fuegos artificiales.
- Comandos fáciles del Vendedor: dos toques de una dirección y un botón (motions nuevos `bb` y `dd`).
- Su escenario LOS CERROS DE VALPARAÍSO y su tema de 16 bits.
- Arreglo de los colores de ropa: antes una franja fija arriba de cada cuadro dejaba los
  hombros y la capucha con el color original (Flaitiano y Vendedor). Ahora el filtro reconoce
  la cara por la piel de alrededor (`face` en CostumeDef).
- Opción DEMOSTRACIÓN en OPCIONES.
- Nombres largos de súper se achican solos para caber en el cartel.
- Herramientas: `borrar_tono` en `armar_luchador.py` (borra una mancha de un color que el
  video dibujó), cara del Vendedor en `caras.py`.

## Pendiente y decisiones abiertas

- **Victoria del Vendedor de Leña**: el clip de victoria salió con otro tipo (musculoso, otra
  cara). Por ahora usa el baile con el jockey rojo. Rehacerla con los pulgares al pecho
  ("Yo soy tu taita") cuesta 4,5 créditos.
- **Comandos fáciles para los demás**: se ofreció dejar a René, Pablito y el Flaitiano con el
  mismo sistema de dos toques + botón; falta la respuesta del usuario.
- **Loco René**: "El parlante" usa la frase "¡Toy de campeón!" hasta que el usuario mande un
  video donde René diga "el más viral de Chile". El clip original de "Me río toa la noche"
  (short vlG8WK4Onm8) no se pudo bajar; usa sus risas de otro video.
- **Escenario del Flaitiano** (idea: feria libre) y de Diego González: sin hacer.
- **Los cuatro luchadores que faltan**: cada uno necesita fotos, videos con sus frases y
  aprobación de créditos.
- La música de Valparaíso tiene un loop con costura menos pareja (parecido 0,36); falta que el
  usuario la escuche.

## Créditos

- **Higgsfield** (plan plus): saldo de unos **428,6 créditos** al 30 de octubre de 2026.
  - Vendedor de Leña: diseños 4 + 4 + 2, clip de prueba 4,5, 23 animaciones 103,5, escenario 14.
- **kie.ai** (Suno): quedaban 37 créditos. La clave de la API nunca se guarda en el proyecto;
  se pasa en la variable de entorno `KIE_API_KEY` y el usuario la entrega cada vez.
- ACE-Step, Demucs y Whisper corren gratis en la tarjeta de video del usuario.

## Reglas acordadas con el usuario

- **Créditos**: nunca gastar créditos de Higgsfield sin aprobación explícita, diciendo antes el
  costo. La forma que funciona: "sí, gasta N créditos en …".
- **Subir a GitHub**: commit y push solo cuando el usuario lo pide. Publicar es inmediato y público.
- **Voces**: solo la voz real de cada persona, cortada de los videos que manda el usuario
  (yt-dlp, Demucs, Whisper). Nunca voces generadas ni clonadas. La única voz generada es la
  del anunciador. Antes de poner una frase en pantalla, confirmar el texto con el usuario.
  Una voz nueva corta a la anterior del mismo luchador; solo las del ultra hacen fila.
- **Cómo se muestra a cada persona**: luchadores poderosos; el humor sale de sus frases y su
  estilo, nunca de su salud, pobreza, adicciones, violencia real ni tragedias personales.
  Nada de chistes sobre el color de piel ("Me veo negro" del Flaitiano va como frase suelta,
  nunca ligada a poderes de oscuridad). Del Vendedor de Leña quedan fuera la muerte de su
  hijo y el reportaje de Mega; de Pablito, nada que no esté en sus videos.
- **Movimientos**: todos los golpes y poderes salen de los memes, frases y gestos de cada
  persona, y se definen con el usuario antes de animar. Regla general: los poderes tienen que
  ser **fabulosos** (efectos grandes, cinemáticas, temas elementales propios de cada uno:
  René sonido y disco; Flaitiano agua y rayos; Vendedor de Leña leña, fuego y viento).
- **Diseños**: tienen que parecerse a la persona real y no repetir los accesorios de otro
  luchador (el bananano, las cadenas de oro y los lentes son de René). Para el parecido sirven
  cuadros de frente sacados de los videos.
- **Calidad del arte**: nada de sprites dibujados con código; el estándar es superar a
  conchetufight.cl. Mostrar la calidad antes de construir.
- **Comandos**: el usuario prefiere comandos fáciles (toques cortos, nada de cargar ni mantener).
