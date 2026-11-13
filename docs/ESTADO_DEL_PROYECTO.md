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

- Repositorio público: https://github.com/arturofuentes1988/el-gran-torneo-de-cell
- Juego en línea: https://elgrantorneodecell.com (desde el 10 de noviembre; la dirección vieja de
  github.io y www.elgrantorneodecell.com redirigen ahí). El dominio se compró en Cloudflare (registro y
  DNS ahí: 4 registros A a GitHub Pages y CNAME www, con la nube gris "DNS only"); el dominio está
  puesto en GitHub → Settings → Pages, con HTTPS obligatorio (certificado de Let's Encrypt que GitHub
  renueva solo).
- Cada push a `main` se publica solo con GitHub Actions (`.github/workflows/pages.yml`).
- `arte/` y `referencias/` no se suben (están en `.gitignore`): ahí quedan los videos,
  fotos, diseños y notas de trabajo de cada luchador.

## Plantel

Ocho luchadores elegidos por el usuario más Carlitos Run (agregado el 30 de octubre). Siete ya se pueden jugar.

| Luchador | Estado | Ciudad | Escenario propio |
|---|---|---|---|
| Tío René | jugable | Santiago | LA CABAÑA DEL LAGO |
| Pablito Neuquén | jugable | Valdivia | LA CALLE DEL PABLITO |
| Flaitiano | jugable | Santiago | LA CANCHA (era de René) |
| Vendedor de Leña | jugable | Valparaíso | LOS CERROS DE VALPARAÍSO |
| Carlitos Run | jugable | Valdivia | LA COSTANERA DE VALDIVIA |
| Papi Micky (Miguel Devia) | jugable | (sin confirmar) | EL SET DE LLEGÓ LA HORA |
| Guatón Ñackson | pendiente | | idea: picada de completos |
| Dr. Maki Gero | jugable | (sin confirmar) | EL LABORATORIO DEL DR. MAKI GERO |
| Diego González | pendiente | | por decidir |

Cada luchador completo cuesta unos 130 créditos de Higgsfield (ver COMO_SE_HACE.md).

## Escenarios

En `public/escenarios/escenarios.json`, en este orden:

1. `rene-cabana`: LA CABAÑA DEL LAGO (sur de Chile, de día). Video de fondo.
2. `rene-plaza`: LA CANCHA (Santiago, de noche: esquina oscura de la pobla con maleantes en las sombras; rehecho el 30 oct).
3. `pablito-calle`: LA CALLE DEL PABLITO (Valdivia, de noche con lluvia).
4. `lena-valparaiso`: LOS CERROS DE VALPARAÍSO (al atardecer, ascensor, bahía, rumas de leña).
5. `santiago`: SANTIAGO DE NOCHE (el mismo fondo del título).

Fuera de la lista: el ring de EL GRAN TORNEO (`public/torneo/`, fondo del título y final del
ARCADE) y el horizonte de Santiago (`public/titulo/`).

## Música

| Tema | Archivo | Origen |
|---|---|---|
| Título y menús | `titulo.mp3` | Suno V6 (kie.ai) |
| La cabaña del lago | `rene-cabana.mp3` | Suno V6 (kie.ai), versión arcade 80/90 del 30 oct (`rene-cabana-v2`) |
| La cancha | `rene-plaza.mp3` | Suno V6 (kie.ai) |
| La calle del Pablito | `pablito-calle.mp3` | Suno V6 (kie.ai), electro cumbia con synthwave y lluvia a -17 dB (`pablito-calle-v2`) |
| Los cerros de Valparaíso | `lena-valparaiso.mp3` | Suno V6 (kie.ai), synth rock arcade (`lena-valparaiso-v2`) |

## Modos

- **ARCADE**: eliges luchador y le ganas a los demás. LA TORRE tiene un piso por rival, siempre
  en el mismo orden (el de ELIGE LUCHADOR, de abajo hacia arriba; la final es el último piso, hoy
  el Dr. Maki Gero). Cada rival pelea en su propio escenario.
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

## Trabajo del 30 de octubre, segunda parte (sin subir)

- Menús: de fondo el ring del templo (el del título) con velo morado y el piso de neón que avanza
  (`src/scenes/backdrop.ts`, `src/scenes/titleArena.ts`).
- Golpes más vistosos: `FxLayer.impact` (rayos de luz, doble onda de choque, rayos eléctricos en
  los fuertes, del color de quien pega), tirón de zoom en los fuertes y destello en los de súper.
- Sonido del bloqueo nuevo (golpe seco acolchado, sin el zumbido de ondas cuadradas).
- René tiene frase de entrada: "¿Querí too?".
- Música nueva de la cabaña, la calle del Pablito y Valparaíso (Suno, estilo arcade 80/90).
- Carlitos Run jugable: 23 animaciones, voces, efectos de bebida (`src/render/cola.ts`), súper con
  discoteca de neón rojo (`lights: "neon"`) y ultra ¡RUN MAFIA!.
- Escenarios con más vida: la cancha nueva (oscura, con maleantes), la cabaña con Diego González,
  la Gatita Veve, el Barbero Exótico, Marcianeke y Junior Playboy bailando, y videos nuevos con más
  movimiento en la calle del Pablito, Valparaíso y Santiago (`arte/escenarios/trabajos-vida.json`).

## Trabajo del 30 de octubre, tercera parte (sin subir)

- Al empezar la pelea cada luchador espera en guardia y hace su entrada una sola vez, justo antes
  del "FIGHT!" (antes la repetía en loop). `Match.introShown` en `src/sim/match.ts`.
- Música de la calle del Pablito rehecha sin cumbia: synthwave oscuro con guitarra (`pablito-calle-v3`).
- Escenarios, segunda vuelta (48 créditos): Valparaíso con un ciclista por la vereda y sin bicis
  volando; Santiago con un helicóptero de policía grande que alumbra la terraza; la cancha con cinco
  tipos alentando a la izquierda; la calle del Pablito con niños jugando a la pelota junto al auto.
- Victoria de Carlitos sin los cuadros del salto (el video le cortaba los brazos arriba).
- Después, a pedido del usuario: la calle del Pablito vuelve a la versión con autos y paraguas (los
  niños no le gustaron) y Valparaíso al loop original (el ciclista no calzaba). Santiago tiene un video
  de 10 s (20 créditos): el helicóptero entra por la izquierda, alumbra la terraza, da la vuelta y sale
  por la izquierda, sin retroceder ni desaparecer.

## Trabajo del 30 de octubre, cuarta parte (sin subir): Flaitiano y Pablito pintados

- El Flaitiano y Pablito Neuquén dejan el pixel art: ahora están pintados en HD, con el mismo
  estilo de los fondos (diseños aprobados con GPT Image 2.5, 5,5 créditos de Higgsfield).
- 51 animaciones nuevas con Kling 3.0 `pro` (1440 px) por kie.ai: 3.078 créditos de kie
  (unos US$15). Se revisó cada clip cuadro por cuadro y se rehicieron 5 con errores de
  continuidad: salto y piquero del Flaitiano (el pelo y las manos se salían por arriba; se
  pidieron con la guardia achicada), su agarre "cabeza de tarro" (le salía un mango negro y la
  mano quedaba flotando), el súper de Pablito (se sacaba las zapatillas y se las volvía a poner;
  ahora ordena y apunta al cielo sin objetos) y su caída (se achicaba al alejarse de la cámara).
- Recorte con IA (`"ia": true`, rembg isnet-anime) porque el gris del fondo se comía la ropa
  blanca del Flaitiano; interior sólido y borde suave. Más cuadros por movimiento, con los mismos
  ticks por fase (arranque, golpe, recuperación) que antes, así que el juego se siente igual.
- La zapatilla que lanza Pablito también es pintada (sacada de un clip descartado).
- Respaldo de la versión pixel: `arte/<luchador>/armado-pixel.json`, `diseno-final-pixel.png`,
  `efectos/retrato-pixel.png` y `efectos/zapatilla-N-pixel.png`; los videos viejos siguen en
  `videos/`.

## Trabajo del 30 de octubre, quinta parte (sin subir): poderes pintados y diseños nuevos

- Poderes con efectos pintados (7 videos de efectos por kie.ai, 294 créditos de kie; 4 objetos con
  GPT Image): rayo y tornado del Flaitiano; onda y súper onda de René (portal de sonido con ondas) y su
  parlante; silbido (remolino con notas), tronco, troncos en llamas y rayo sónico del Vendedor de Leña;
  botella, cajón, espuma al pegar y letras en llamas de Carlitos. Se cargan de `public/efectos/`.
- Diseños pintados aprobados para René (A), el Vendedor de Leña y Carlitos Run (cara nueva más parecida
  a las fotos, cuerpo entero con su contextura real). El Vendedor pasó por varias vueltas: mira al rival
  (a la derecha, no a la cámara), tiene el cuerpo como René (macizo, no musculoso ni gordo) y la cabeza un
  12 % más grande (deformación suave hecha a mano, `scratchpad cabeza_lena.py`), con la piel de la cara
  limpia de manchones. Total de rediseños del Vendedor: 22 créditos.
  Ya son su `diseno-final.png` (respaldo `diseno-final-pixel.png`); falta animarlos (kie.ai).

## Trabajo del 30 de octubre, sexta parte (sin subir): los cinco pintados

- René, el Vendedor de Leña y Carlitos Run ya están pintados y animados (Kling 3.0 `pro` por kie.ai,
  unos 4.300 créditos de kie con los clips rehechos). Ahora los cinco luchadores son HD pintado.
- Los videos se pidieron sobre **verde chroma** (`guardia-verde.png`, y `guardia-verde-chica.png` al 75 %
  para saltos, caídas y movimientos que suben) y se recortan por color (`"fondo": "verde"`, alfa_verde):
  borde limpio, sin reflejo verde y sin las manchas grises del recorte con IA.
- Clips rehechos por errores: el cadenazo de René (la cadena se estiraba como látigo y se salía del
  cuadro; ahora es un puñetazo con la cadena enrollada), sus dos patadas (pateaba hacia atrás) y la
  patada fuerte y la victoria del Vendedor (la victoria no se movía; ahora pulgares al pecho y brazos
  cruzados).
- Carlitos sin corazones: entrada con el puño al cielo y victoria de campeón. Su bicicleta aparece y
  se va en humo, deja estela de fuego y líneas de velocidad, hace caballito y revienta en fuego al pegar.
- Poderes de todos: al arrancar un especial o súper sale un anillo de energía del color del luchador.
- DEMOSTRACIÓN: peleas al mejor de tres, dos luchadores distintos (nunca el mismo contra sí mismo) y
  siempre con su color original. Atajo de prueba: `?escena=demostracion`.
- Retratos de la cinemática del súper y caras de ELIGE LUCHADOR, rehechos desde los diseños pintados.

## Versión para celular (31 de octubre)

- En pantallas táctiles salen controles en pantalla (`src/input/touch.ts`): joystick flotante a la
  izquierda (aparece donde se toca, 8 direcciones), los cuatro botones de golpe y patada a la derecha,
  RODAR, PODER y PELÁ, y ☰ arriba a la derecha (pausa en la pelea, volver en los menús). Aprietan las
  mismas teclas que el jugador 1, así sirven en la pelea, los menús, la selección y el título (el golpe
  débil acepta). Vibran al tocar (Android).
- Horizontal: el juego ocupa la pantalla y los controles van encima, semitransparentes. Vertical: el
  juego sube arriba, los controles quedan debajo y aparece "GIRA EL CELULAR PARA VERLO MÁS GRANDE".
  En pantalla completa Android se queda horizontal.
- `?tactil=1` muestra los controles en el computador (pruebas).

## Carga liviana, cruceta y limpieza (3 de noviembre)

- **Cruceta** en vez de la palanca: fija abajo a la izquierda, 4 direcciones y las diagonales
  apretando entre dos brazos (50° por dirección y 40° por diagonal). El brazo apretado se ilumina.
- **Carga por partes.** Antes el juego bajaba ~107 MB al abrir y subía ~1,6 GB de texturas a la
  memoria de video (por eso se trababa en celulares). Ahora:
  - Al abrir baja solo lo de los menús, con una barra que muestra los MB: ~9,5 MB en HD y ~4 MB
    en liviano (más el código, ~220 KB).
  - Cada pelea baja lo suyo la primera vez (texturas de pelea de sus dos luchadores, voces,
    efectos, escenario), con barra en ELIGE ESCENARIO, el VS del ARCADE, la DEMOSTRACIÓN y la
    galería de PERSONAJES: ~17-25 MB en HD y ~7-10 MB en liviano. Después queda guardado.
  - Al empezar una pelea se suelta lo que lleva rato sin usarse (en liviano, solo queda lo de la
    pelea en curso; en HD, hasta 4 luchadores y 3 escenarios). La música guarda solo la pista que
    suena y la del título.
- **Dos calidades** (`src/content/calidad.ts`): HD en computadores y liviana en celulares y tablets
  (mitad de resolución, música mono). Se cambia en OPCIONES > GRÁFICOS.
- **Archivos más chicos**: atlas en WebP 80 (antes 92, no se nota); videos de fondo a 2208 px (antes
  2944, 5 veces más livianos); efectos al 75 %. Si un video no parte (ahorro de batería en
  iPhone), a los 8 s se sigue con la imagen fija.
- **Limpieza**: fuera los luchadores provisorios Rojo y Azul y el escenario de prueba dibujado por
  código (~1.900 líneas), dos brillos sin usar, 7 cuadros de René que no se usaban, las capturas viejas de `docs/` (28 MB) y la fuente
  pixel que ya no se usaba.

## Menús que se tocan (3 de noviembre)

- Todas las opciones de los menús se tocan (o se hacen clic) directo: `MenuInput.tap`
  (`src/input/devices.ts`) da el punto tocado en unidades de pantalla y cada escena mira qué hay ahí.
  Un toque es levantar el dedo sin arrastrarlo; si se arrastra, `MenuInput.dragY` desplaza las listas.
  - Título: "TOCA LA PANTALLA" (en cualquier parte). MENÚ PRINCIPAL, CASUAL, OPCIONES y PAUSA: tocar
    la opción la elige; en las de `< >` (dificultad, sonido, gráficos) los costados de la barra cambian
    el valor y el medio acepta.
  - ELIGE LUCHADOR: tocar una cara la marca y tocarla otra vez la elige; el color, con los costados
    del luchador grande (◄ ►), y tocarlo al medio lo acepta. ARMA TU EQUIPO: un toque por tarjeta.
  - ELIGE ESCENARIO: una miniatura la muestra; tocarla otra vez (o la vista grande) empieza la pelea.
  - ARCADE (mapa, VS, ¿CONTINUAR?, CAMPEÓN), DEMOSTRACIÓN y "NO SE PUDO CARGAR": un toque es aceptar.
  - PERSONAJES y MOVIMIENTOS: ← → junto al nombre cambian de luchador, se arrastra la lista y en
    PERSONAJES tocar un movimiento lo hace en la vitrina. ESCENARIOS: los costados cambian.
  - CONTROLES: tocar una casilla y tocarla otra vez espera la tecla (un toque cancela); los botones de
    abajo y el aviso de cambios sin guardar se tocan. PRÁCTICA: las opciones 1-4 de abajo se tocan.
- En el celular, la cruceta y los botones de golpe salen solo en la pelea (no en la pausa ni en los
  menús, donde tapaban opciones); queda ☰ arriba a la derecha para volver o pausar. Los textos de
  ayuda dicen "TOCA" y "☰ VUELVE" en vez de ENTER y ESC.

## En línea, fase 1: cuentas (3 de noviembre)

- Proyecto de Supabase gratis en São Paulo (organización "torneo de cell", ref `hmyesbgnihxgaygmkuck`).
  La URL y la llave publicable están en `src/online/config.ts` (son públicas a propósito; las reglas
  de seguridad de cada tabla mandan). La contraseña de la base de datos y la llave secreta nunca van
  al repositorio.
- Tabla `perfiles` (apodo único sin importar mayúsculas, 3 a 14 letras, números, espacios, - y _):
  `supabase/migraciones/001_perfiles.sql`. Cualquiera con cuenta ve los apodos; cada uno cambia solo
  el suyo; sin cuenta no se lee nada. El conector de Supabase de Claude no ve esta organización, así
  que los cambios a la base de datos se pegan en el SQL Editor del panel.
- Pantallas (`src/scenes/cuenta.ts`):
  - TU CUENTA aparece la primera vez después del título, con ENTRAR CON GOOGLE, ENTRAR CON CORREO y
    JUGAR SIN CUENTA. Si eliges jugar sin cuenta, queda recordado en el navegador.
  - EN LÍNEA vuelve a pedir cuenta a quien no ha entrado y pide el apodo la primera vez. Ofrece
    CAMBIAR APODO y CERRAR SESIÓN. CREAR SALA, UNIRSE CON CÓDIGO y PARTIDA RÁPIDA dicen que llegan en
    la próxima actualización.
  - ENTRAR CON CORREO y ELIGE TU APODO son formularios HTML encima del juego (`src/online/formulario.ts`).
    El teclado del juego no toma las teclas mientras se escribe en un campo.
- La librería de Supabase (~55 KB comprimida) se baja solo al usar la cuenta, o al abrir el juego si
  ya hay una sesión guardada. Quien juega sin cuenta no baja nada más.
- En el panel de Supabase está apagado "Confirm email": Supabase no manda correos a jugadores sin un
  servicio de correo propio. Por lo mismo, todavía no hay "olvidé mi contraseña".
- **Falta**:
  - La entrada con Google: el usuario tiene que crear la llave en Google Cloud y pegarla en Supabase.
    Mientras tanto, el juego dice "todavía no está lista · usa el correo".
  - Revisar que la URL Configuration del panel tenga la dirección del juego.
  - Borrar las cuentas de prueba `qa.torneo.*@example.com` en Authentication → Users.

## Web con ranking y lote de mejoras (3 de noviembre)

- **La web** (`index.html`, `src/web/`): pestañas JUGAR (el juego, `juego.html`, en un iframe;
  en el celular ocupa toda la pantalla bajo la cabecera) y RANKING (`#ranking` en la dirección
  la abre directo).
  - Cuatro tablas: PUNTOS DE LIGA (tipo ELO, todos parten con 1.000), VICTORIAS (con % de
    ganadas), MEJOR RACHA y CAMPEONES DEL ARCADE (mejor tiempo de cada jugador, por dificultad).
  - Las de en línea quedan vacías hasta la fase 2 ("las salas llegan en la próxima actualización").
  - Se leen sin cuenta con las funciones `ranking_liga` y `ranking_arcade`
    (`supabase/migraciones/002_ranking_y_errores.sql`), que dan solo apodos y números.
  - La pestaña RANKING calla el juego (`postMessage` → `Sfx.pausarAudio`).
  - Dentro de la web, el juego no se pone solo en pantalla completa al primer toque: tiene su botón.
  - Entrar con Google desde la web se hace con la página entera (Google no se deja mostrar en un
    iframe). Vuelve a la web con `?code=…`, que se lo pasa al juego.
- **ARCADE**:
  - El mapa con avión pasó a ser **LA TORRE** (idea de Mortal Kombat, no igual): un rascacielos
    de neón dibujado con código, con un piso por rival y la final en la azotea.
  - Al coronarse muestra el tiempo total (`match.frame` de todas sus peleas, también las
    perdidas) y los continues, y lo sube a `arcade_records` si tiene cuenta y apodo.
- **Colores**: ya no se eligen. Si los dos eligen al mismo luchador, el segundo sale con otra
  ropa (lo hacía `FightScene`).
- **Práctica**:
  - MUÑECO pasó a llamarse SPARRING.
  - En el celular, cuatro botones con íconos abajo al centro (∞ SÚPER, SPARRING, VIDA,
    ↺ POSICIÓN). Aprietan las teclas 1 a 4 y se esconden en la pausa.
- **Celular**:
  - Los botones dicen COMBO DÉBIL, COMBO FUERTE, PATADA DÉBIL y PATADA FUERTE.
  - La cruceta muestra las diagonales (más chicas).
  - Botón de pantalla completa: abajo a la derecha en los menús, junto a ☰ en la pelea y chico
    en el computador. Pone el celular horizontal en Android; en iPhone no existe.
- **MOVIMIENTOS**:
  - Muestra solo especiales, súper, ultra y combos sugeridos.
  - Desde la pausa abre en el luchador con que estás peleando.
  - La pausa es más grande (filas de 31 unidades, unos 45 px en un celular) y se toca la fila entera.
- **Dificultad**:
  - Se rehízo la tabla de la CPU (`src/sim/ai.ts`) para que cada nivel se note.
  - `herramientas/dificultad_sim.ts` lo mide: MUY DIFÍCIL le gana a DIFÍCIL el 86 % y a NORMAL y
    FÁCIL el 100 %.
  - FÁCIL ya no le gana ni a uno que aprieta botones al azar.
- **GRÁFICOS**: BAJA, MEDIA, ALTA y ULTRA (`src/content/calidad.ts`).
  - BAJA: arte liviano, escala 2, la mitad de las chispas y sin videos de fondo.
  - MEDIA: liviano, como el celular de antes.
  - ALTA: HD con escala 3.
  - ULTRA: HD con escala 4.
  - Lo guardado como "hd" se lee como ALTA y "liviano" como MEDIA.
- **Que nada congele el juego** (`src/app/errores.ts`). Un error en un cuadro ya no corta el
  bucle: se anota y el juego sigue. Si falla 1,5 s seguidos, vuelve al menú.
  - Si el celular pierde la pantalla (WebGL), avisa y ofrece recargar.
  - Los errores se mandan a la tabla `errores` de Supabase (se ven en el panel, Table Editor).
    Los mapas del código se arman aparte (`sourcemap: 'hidden'`) para poder leerlos.
  - **Causa de la imagen congelada** (práctica en el celular, y la final del ARCADE): al soltar
    un escenario viejo (`StageLibrary.evict`), `StageView.destroy` destruía también las texturas
    de las partículas, que son una sola para todos los escenarios. El escenario en pantalla
    quedaba con partículas rotas, el dibujo fallaba y el bucle se cortaba. En calidad liviana se
    sueltan escenarios en casi cada pelea, por eso pasaba en el celular. Ahora cada escenario
    destruye solo las texturas que bajó.

## Dificultad al empezar, música, avatares y donaciones (3 de noviembre)

- **ELIGE LA DIFICULTAD** antes del ARCADE, el 1 VS CPU y el 2 VS CPU, con una línea que dice
  cómo juega la CPU en cada nivel. Queda guardada y ya no está en OPCIONES.
- **CASUAL**: sin 1 VS 1. El 2 VS 2 pasó a llamarse **2 VS CPU** y el jugador 2 ya no se puede
  unir.
- **Música**:
  - Botón para prenderla o apagarla junto al de pantalla completa (`src/app/musica.ts`). En la
    pelea con controles táctiles se esconde, para no tapar la vida del rival.
  - Volumen en OPCIONES > MÚSICA, aparte del que baja solo cuando alguien habla.
- **MOVIMIENTOS en el celular**:
  - Usa los nombres de los botones de la pantalla (COMBO DÉBIL, PATADA FUERTE, PODER...).
  - Las teclas ya no cortan la letra (pasaba desde que se agrandó la letra de la lista).
- **Avatares** (`src/online/avatares.ts`):
  - El jugador elige la cara de un luchador.
  - En la web va arriba a la derecha con su apodo y un menú (CAMBIAR AVATAR, CERRAR SESIÓN).
    En el juego, en EN LÍNEA (CAMBIAR AVATAR y la cara junto a "JUGANDO COMO").
  - También sale en el ranking.
  - Se guarda en `perfiles.avatar` (`supabase/migraciones/003_avatar.sql`). Mientras no se pegue
    ese SQL, el juego funciona igual pero dice que los avatares todavía no están listos.
  - La web y el juego se avisan con `postMessage({ torneo: 'cuenta' })` cuando alguien entra,
    sale o cambia el apodo o el avatar.
- **Donar**:
  - Abajo en la web, con Mercado Pago: un botón por enlace de pago, en `DONACIONES`
    (`src/web/portal.ts`).
  - No se ve mientras la lista esté vacía; faltan los enlaces del usuario.
- Se sacó "parodia sin fines de lucro" de la web, el README, este documento y `package.json`.

## Golpes más fluidos y gancho estilo Mortal Kombat (3 de noviembre)

- **Donar**: tuvo los enlaces de Mercado Pago ($2.000 y $5.000) hasta el 10 de noviembre; ese día el
  usuario pidió sacarlas ("por ahora nada de donaciones"): `DONACIONES` quedó vacía y la parte de DONAR no
  se ve (los enlaces siguen en el historial de git si se quieren volver a poner). El SQL de avatares (003)
  está pegado y revisado.
- **Golpes fluidos**: los normales de pie y agachados de los cinco usan el doble de dibujos
  (`herramientas/fluidez.py`), con los mismos tiempos de antes.
- El primer cuadro activo del golpe fuerte de pie del Vendedor y de Carlitos y del gancho de Pablito solo
  tenía la punta del pie que avanza (pegaba a ras de suelo, con la chispa en los pies): ya no pega.
- **Estelas** (`src/render/smear.ts`): cada normal deja una medialuna de luz. Las débiles son finas y
  casi blancas, y las fuertes gruesas y del color del luchador. La diferencia entre débil y fuerte se ve
  de lejos.
- **Gancho** (el lanzador, ↓ + golpe fuerte): al conectar suena un golpe propio que retumba (`uppercut`
  en sfx.ts). Además salen una columna de luz con chispas hacia arriba, polvo, un tirón de zoom con
  destello y dos cuadros en negativo. El rival sale volando de espaldas, inclinado, y se endereza al
  perder impulso.
- **Golpes agachados y gancho nuevos** (15 clips de Kling 3.0 `pro` por kie.ai, 54 créditos de kie cada uno,
  810 en total; quedan unos 1.289). Los videos de "barrida" de René, el Vendedor y Carlitos estiraban la
  pierna de atrás, sin patear hacia adelante. El golpe bajo de René y el del Flaitiano salían de pie, y
  cuatro ganchos iban en diagonal. Los clips nuevos (`agachado_golpe`, `agachado_patada`, `barrida`,
  `gancho_mk` en cada `kie.json`) salieron así:
  - **Ganchos estilo Mortal Kombat**: buenos los cinco (se agachan hondo y suben con el puño recto arriba).
    Hechos con la guardia achicada (`reescalar` 0,75), menos el de Pablito.
  - **René**: sirven el golpe agachado y la barrida (la pierna de adelante estirada hacia el rival). Con la
    barrida salen la patada baja (corta) y la barrida (larga). Su agachado de siempre ahora sale del golpe
    agachado nuevo: el de antes tenía el brazo estirado.
  - **El Vendedor y Carlitos**: sirve la patada baja (la pierna de adelante hacia el rival). De ella salen
    la patada baja y la barrida (la pierna estirada más rato).
  - **El Flaitiano**: sirven el golpe agachado y la patada baja. Su barrida de break no cambia (ya iba hacia
    adelante).
  - **No sirvieron**: la patada baja de René y de Pablito (otra vez estocada o golpe) y la barrida del
    Vendedor y de Carlitos (otra vez la pierna de atrás). Kling insiste en esa pose; no se repitieron porque
    los otros clips alcanzan.
  - Los tiempos (arranque, cuadros activos, total) son los mismos de antes. Respaldo: `armado-antes-agachados.json`.

## Tío René y la tecla Esc (4 de noviembre)

- **Loco René pasa a llamarse Tío René** en todo el juego (el id interno sigue siendo `rene` y la carpeta
  `arte/loco-rene`).
- **Su cara al agacharse**: los cuadros de la bajada y el agachado del clip nuevo tenían la cara borrosa y
  doble (Kling la dibujó en pleno movimiento). Ahora usa solo cuadros nítidos: bajada 5 y 7, agachado 11
  (casi a la altura de antes). El golpe agachado, el gancho y la barrida también dejaron los cuadros borrosos.
- **Esc en pantalla completa**: solo en la pantalla de título achica la pantalla; en la pelea abre la pausa y
  en los menús vuelve atrás. El bloqueo de Esc (Chrome y Edge) se le pide a la página de más arriba, porque
  dentro de la web el juego va en un iframe y ahí el navegador lo rechazaba. Firefox y Safari no dejan
  bloquear Esc: ahí siempre sale.

## Papi Micky y dos escenarios nuevos (4 de noviembre)

- **Papi Micky** (id `micky`, sexto del plantel): look de la Gala Épica 2025 (camisa blanca, chaleco azul de
  cachemira, humita azul, lentes blancos bajados, pelo rubio en puntas; sin cadena). Cara y cuerpo con GPT
  Image 2.5 (5,5 créditos de Higgsfield). 25 clips de Kling `pro` por kie.ai más 3 repetidos: Kling rechazó
  "salto", "intro" y "paaa" por "información sensible" (palabras como gritar o clímax); se pidieron con
  textos más simples. La patada agachada salió con la pierna de atrás otra vez y se pidió de nuevo
  (`patada_baja`, describiendo la pierna por el lado de la pantalla: salió bien).
  - Especiales: ¡PAAA! (↓↘→ + golpe: onda de neón alrededor suyo), Todo es gratis, papito (→ → + golpe: lluvia
    de monedas de oro sobre el rival), Paso de C4 (→ → + patada: saltitos de boy band y tres patadas).
  - Súper ¡DIOS ES EL DUEÑO DEL ORO! (↓↓ + golpe: se abre el cielo, columna dorada, lingotes, monedas y
    estrellas) y súper ¡EL MORTAL DEL PAPI! (← ← + patada, pedido del usuario: el mortal de Eddy Gordo; el
    clip salió como mortal hacia adelante y se usa al revés).
  - Ultra ¡LLEGÓ LA HORA! (↓↓ + patada): su baile, luces de fiesta, el escenario cambia a su set y suena el
    coro de su canción y "soy el real del género".
  - Efectos en código (`src/render/neon.ts`: `paaa`, `monedas`, `oro`), `comboFx: "neon"` (estrellas de
    colores, aura, estallidos), estrellas `FxLayer.starPop`.
  - Voces: "¡PAAA!" (tomas 1 y 5), "¡PAAA! ¿Qué pasa, guatones?", "Si yo soy de Dios, todo es gratis, papito",
    "Dios es el dueño del oro", "soy el real del género" y el coro de "Llegó la hora" (`arte/papi-micky/voces/`).
- **EL SET DE LLEGÓ LA HORA** (`micky-set`): set de TV juvenil estilo Yingo con público, bailarinas, DJ y
  neón; loop MiniMax (14 créditos de Higgsfield). Partículas nuevas `confeti` (`src/render/stage.ts`).
  Música eurodance de los 90 con Suno (`micky-set`).
- **LA COSTANERA DE VALDIVIA** (`carlitos-costanera`): el río Calle-Calle con lobos marinos en un muelle,
  lanchas, la feria fluvial y el puente; se borraron dos personas que nadaban; loop MiniMax (14 créditos de
  Higgsfield). Música synth funk de los 80/90 con Suno (`carlitos-costanera`).
- **LA CANCHA** pasa al Flaitiano (pedido del usuario); René queda con la cabaña.
- Gasto: 1.518 créditos de kie (1.494 en clips y 24 en música; quedan 9.771) y 33,5 de Higgsfield.

## Dr. Maki Gero (4 de noviembre)

- **Dr. Maki Gero** (id `maki`, séptimo del plantel): mánager de Tío René; su nombre viene del Dr. Gero de Dragon
  Ball. Look elegido por el usuario: jockey negro con emblema dorado, polera negra, bata blanca de laboratorio con
  las mangas arremangadas y los brazos tatuados. Cara y cuerpo con GPT Image 2.5 desde fotos del usuario
  (5,5 créditos de Higgsfield).
- 23 clips de Kling `pro` por kie.ai y 2 de ayudantes (el Tío René robot gigante y un androide, diseñados con
  GPT Image 2.5). Revisión cuadro por cuadro: en ¡Dale color! se saltan unos cuadros con un destello que dibujó
  Kling; la patada en el aire de ¡El auténtico! salió hacia atrás y se usa volteada (`el_autentico_mix.mp4`).
  La patada baja salió tres veces hacia atrás; el intento 1 (una barrida limpia a ras de suelo) se usa con las
  piernas volteadas y el cuerpo de arriba sin tocar (`herramientas/voltear_piernas.py`), así `cLK`/`cHK` van
  hacia adelante con la pierna de adelante, sin gastar créditos. La barrida levanta polvo y la fuerte deja un
  rastro de colores en el suelo.
  - Especiales: ¡Dale color! (↓↑ + golpe), ¡El auténtico! (↓↑ + patada), ¡Son todos androides! (→ → + patada).
  - Súper ¡Cambia, cambia, es por tu bien! (↓↓ + golpe; solo el audio de esa frase, convertido en una máquina de
    reprogramar) y súper ¡Aquí estamos nuevamente con mi androide! (← ← + patada; el Tío René robot).
  - Ultra ¡El laboratorio del Dr. Maki Gero! (↓↓ + patada), con su laboratorio de fondo.
  - Movimiento nuevo ↓↑ (`du`): `src/input/buffer.ts`, `types.ts`, `ai.ts`, `moveListPanel.ts`; en el
    pre-salto, el botón gana y sale el especial (`Fighter.tryUpSpecial`).
  - Efectos en código (`src/render/lab.ts`: `color`, `colorRayo`, `androides`, `cambia`, `robo`); los ayudantes
    son cuadros pintados que el dibujo propio toma de `ProjectileDef.sprites`. Sello dorado "¡EL AUTÉNTICO!" y
    `comboFx: "laboratorio"` en `fight.ts`.
  - Voces: sus cinco frases reales ("aquí estamos nuevamente con mi androide", "¡cambia, cambia, es por tu
    bien!", "¡dale color!", "¡el auténtico!", "son todos androides, pues, cachái"; `arte/maki-gero/voces/`).
- **EL LABORATORIO DEL DR. MAKI GERO** (`maki-lab`): laboratorio secreto en la cordillera con cápsulas de
  androides, bobinas Tesla y la ventana a los Andes; loop MiniMax (14 créditos de Higgsfield). Música con Suno
  (`maki-lab`): synthwave de los 80 con techno industrial de los 90, medio cyberpunk (bajo en arpegio, beeps de
  computador, rayos láser). De las dos versiones se usa la 2: la única con un loop de ritmo bien calzado
  (30,1 a 60,5 s; antes suena una vez la entrada).
- `herramientas/kie_video.py` guarda cada tarea apenas la pide, retoma las que siguen en proceso y no reintenta
  un pedido sin respuesta (un pedido cortado por tiempo de espera igual se creó y se cobró).
- Gasto: 1.614 créditos de kie (1.602 del luchador y el escenario, 12 de la música; quedan 8.157) y 19,5 de
  Higgsfield (quedan 60,1).

## Voces al pegar, quejidos, frases de combo y golpes grabados (4 de noviembre, noche)

- **Gritos al pegar** (`voz/golpe`) y **quejidos al recibir** (`voz/dolor`), con la voz real de cada uno
  (`fight.ts`, `grunt`): el grito sale en el 60 % de los golpes normales fuertes y el 20 % de los débiles; el
  quejido en el 70 % de los golpes fuertes que recibe y siempre en el K.O. No cortan otra frase del luchador y no
  se repiten antes de ~0,8 s.
  - Tío René: "¡To yo!", su risa y "¿Querí too?"; se queja con "¡Cabréate de grabar!".
  - Pablito: "Le pego un charchazo" y "¿Qué hacés, pibes?"; se queja con "¡Sácate al tiro!".
  - El Flaitiano: "¡Cállate, cotorra!", "No hay luz" y "¡Cabeza de tarro!"; se queja con "¿Hasta cuándo?".
  - El Vendedor de Leña: "¡Ahora!", "¡Aquí estamos!" y su silbido corto (sin quejido: el "¡Basta!" de su video
    no se entiende cortado).
  - Carlitos Run: "¡Run!" y "¡Y vamos!" (sin quejido).
  - Papi Micky: tres "¡PAAA!"; se queja con "¡Oye, oye!" (de "Llegó la hora").
  - Dr. Maki Gero: dos "¡Eso!" de su narración (sin quejido).
- **Más frases de combo**: dos por tramo donde se repetían (Carlitos ya no dice "¡Run!" en todos; Papi Micky
  deja el "¡PAAA!" para los golpes y usa "Tres, dos, uno", "Dios es el dueño del oro", "Todo es gratis, papito",
  "el real del género" y "Estoy de vuelta"; el Maki suma "¡Ahí viene, viene!", "Pero el René es el número uno" y
  "Cell perfecto, dueño del torneo Cell").
- **La frase del combo siempre habla**: si el combo terminó con un poder, espera a que acabe su frase (hasta
  3 s) en vez de perderse.
- Cortes nuevos verificados con Whisper (large-v3) uno por uno; los que no se entendían quedaron fuera. Del video
  XF-IYe2uLxo del Maki no se usa nada. Carlitos suma la voz separada de su short 7FlELiL1PRs ("¡Y vamos!",
  "¡Y más run!").
- **Golpes y bloqueos grabados**: `herramientas/sonidos_golpes.py` arma 5 variantes de golpe débil, fuerte,
  súper y bloqueo desde grabaciones reales (Impact Sounds de Kenney, CC0) con capas de retumbe grave, chasquido y
  eco corto para exagerarlos (`public/sonidos/`). Reemplazan a los sintetizados del mismo nombre; en cada golpe
  suena una al azar. El bloqueo viejo tenía un tono puro de 2.929 Hz (por eso sonaba a metal hueco); el nuevo es un
  golpe sordo contra los antebrazos con el roce de la ropa.

## LA TORRE del ARCADE ordenada (5 de noviembre)

Pedido del usuario: "quiero que el edificio tenga a los enemigos y que cada uno de los
personajes pelee en su escenario, no quiero que sea tan desordenado".

- Antes el orden salía de un viaje por ciudades (distinto según con quién jugabas) y varios
  peleaban en un escenario ajeno: el Tío René en LA CANCHA, el Flaitiano en SANTIAGO DE NOCHE
  y el finalista en el ring.
- Ahora el orden es siempre el de ELIGE LUCHADOR, sin el del jugador, de abajo hacia arriba;
  la final es el último piso (hoy el Dr. Maki Gero, o Papi Micky si juegas con el Maki).
- Cada rival pelea en el escenario que tiene su `luchador` en `escenarios.json`. Quien no tiene
  uno pelea en uno que no es de nadie del plantel (SANTIAGO DE NOCHE). Si tampoco hay, pelea en
  el del jugador. El ring de EL GRAN TORNEO ya no se usa en el ARCADE.
- La torre muestra a los enemigos: cada uno espera de pie detrás del vidrio de su piso, con la
  luz de su color, su nombre, el piso y el nombre de su escenario. Los vencidos quedan en gris
  con una X. Primero se ve la torre entera (unos 0,75 s); después la cámara se acerca mientras
  sube el ascensor. Fondo propio: cielo de noche con estrellas y la ciudad (ya no se ve el
  templo de los menús detrás).
- El campo `ciudad` de cada definición ya no se usa en el ARCADE (queda como dato).
- Textos: el borde negro ya no deja puntas en los vértices agudos (la "M"); `miterLimit` 2
  en `outlinedText`.

## El Samurai de Pudahuel (6 de noviembre)

Pedido del usuario: agregarlo al torneo **como una persona sabia**, un ninja súper poderoso que pelea con katana
y armas ninja; primero se analizaron sus videos (frases y personaje) y después se definieron los poderes.

- Octavo luchador (`samurai`): con él se completan las 8 casillas de ELIGE LUCHADOR. Es el último del plantel,
  así que en el ARCADE ahora es el piso final (antes el Dr. Maki Gero).
- Voces de sus propios videos: el usuario eligió 8 frases y los recortes (ver `docs/LUCHADORES.md`).
- Diseño: cara A con pañuelo ninja (GPT Image 2.5), cuerpo con la chaqueta de camuflaje hecha chaqueta ninja.
- Escenario LAGUNA SUR CON LA ESTRELLA, desde el Street View del usuario y una foto libre de Wikimedia; el ultra
  ¡HAGA SOMBRA! pasa en LOS TECHOS DE PUDAHUEL bajo la luna (escenario `"soloUltra": true`: no sale en las listas)
  con los dos luchadores en silueta (`cinematic.silueta`). Música Suno "Laguna Sur con La Estrella" (shamisen,
  shakuhachi, taikos y rock de los 90).
- Motor: `UltraDef.voice` (cada ultra con su voz), `cinematic.silueta`, `soloUltra` en los escenarios,
  `"fondo": "magenta"` en el armado y `--magenta` en `voltear_piernas.py`, `comboFx: "ninja"`, efectos en
  `src/render/ninja.ts`.
- Clips: 25 de Kling por kie (kie subió el precio: 60,6 por clip de 3 s y 80,8 por los de 4 s). La barrida salió
  hacia atrás y se volteó sin gastar. Provisorios mientras el usuario decide si se repiten: la patada fuerte de pie
  (salió hacia atrás) usa la patada de frente; el golpe fuerte (Kling borró la hoja bajo unas estelas) usa el
  arrancón con corte; la victoria (casi no se mueve) usa la meditación; el corte iai del súper se ve con poco
  movimiento (el efecto de luz hace el trabajo).

## En línea, fase 2 · Paso A: la pelea se puede rebobinar (7 de noviembre)

Plan acordado para jugar en línea: **A** preparar la simulación (este paso), **B** salas con código
(conexión directa entre los dos navegadores, WebRTC, con Supabase solo para presentarlos), **C** servidor
de respaldo (TURN de Cloudflare), desconexiones, revancha, PARTIDA RÁPIDA y puntos de liga.

- `src/sim/estado.ts`: `guardar(match)` saca una foto de todo lo que cambia en la pelea, `cargar(foto)`
  la deja igual (escribe en los mismos objetos: la pantalla no se entera) y `huella(foto)` la resume en un
  número para notar si dos computadores se separaron. Las definiciones de los luchadores no se copian
  (campos `FIJOS`). Si se agrega a la simulación un campo que apunte a una definición, sumarlo ahí.
- `src/online/rollback.ts` (`SesionRollback`): el control propio se aplica 2 cuadros después; del rival se
  adivina que sigue igual y, cuando llega distinto, se carga la foto y se rehacen hasta 8 cuadros. Los
  avisos (sonidos, chispas) que ya salieron no se repiten al rehacer. Cada 30 cuadros se comparan
  huellas. Arma y recibe paquetes; no sabe de redes (eso lo hace la sala, Paso B).
- `herramientas/rollback_prueba.ts`: peleas de la CPU contra la CPU (también 2 VS 2) jugadas por dos
  computadores simulados con red perfecta, 50 ms, 100 ms con 10 % de paquetes perdidos y 170 ms con 25 %
  perdidos: todos los cuadros quedaron idénticos a la pelea de referencia. Foto: 12 µs guardar, 6 µs
  cargar; un cuadro de simulación, 15 a 18 µs (rehacer 8 cuadros cuesta ~0,2 ms en un computador).
  - La prueba tiene además una huella independiente que recorre todo el objeto de la pelea sin usar
    `FIJOS`, y desvíos con todos los botones (también la pelá, que usa el generador al azar). Se
    comprobó que avisa si a `guardar()` se le escapa el generador al azar o si la sesión no rehace.
- La simulación ya era determinista: generador al azar con semilla (`Rng`), sin `Math.random`, sin hora
  y sin funciones matemáticas que den distinto entre navegadores (solo sumas, multiplicaciones y
  `Math.sqrt`, que es exacta). Los datos de los luchadores son los mismos en HD y en liviano.
- **Para el Paso B**:
  - La espera de las frases de entrada (`introDelay`) hoy sale del largo de los audios: en línea tiene
    que ser un número fijo igual en los dos.
  - Los dos tienen que tener la misma versión del juego: comparar una huella de las definiciones al conectarse.
  - Con más de ~130 ms de ida el rollback de 8 cuadros no alcanza y el juego espera: subir el retraso
    según el ping (Paso C).

## En línea, fase 2 · Paso B: salas con código (7 de noviembre)

- **EN LÍNEA > CREAR SALA** muestra un código de 4 letras (sin I ni O; tocarlo lo copia). El rival entra
  a **EN LÍNEA > UNIRSE CON CÓDIGO** y lo escribe. PARTIDA RÁPIDA sigue apagada (Paso C).
- `src/online/sala.ts` (`Sala`): Supabase Realtime solo presenta a los dos (canal `sala-<CÓDIGO>`,
  presencia y la oferta/respuesta/ICE de WebRTC; no hace falta pegar SQL ni configurar nada). Después
  quedan conectados directo entre navegadores: canal "juego" (sin orden ni reenvíos, los controles de
  cada cuadro) y "control" (seguro: elección, escenario, listo, empezar, ping, adiós). Sin noticias del
  otro por 6 s, se da por cortada. Al conectarse se compara la versión del juego (`versionJuego`: la
  huella de la definición de cada luchador al cargarla, `FighterAsset.huella`).
- **ELIGE LUCHADOR en línea** (`CharacterSelectScene` modo `'online'`): tú a la izquierda, el rival a la
  derecha con su apodo; su cursor y su elección llegan por la red (`'sel'`, por vuelta: `sala.ronda`).
  ESC sin nada elegido sale de la sala.
- **PREPARANDO LA PELEA** (`src/scenes/sala.ts`): quien creó la sala elige el escenario al azar y manda
  los dos luchadores; cada uno baja lo suyo y avisa; con los dos listos manda la semilla y la espera de
  las frases de entrada (`esperaDeEntrada`, la misma en los dos). Quien crea la sala pelea a la izquierda.
- **La pelea en línea** (`FightScene` modo `'online'`): la sesión de rollback del Paso A con el control del
  jugador (teclado o joystick); manda un paquete cada cuadro. Si va adelantado, se salta un cuadro de vez
  en cuando para que el otro alcance (`debeFrenar`, como GGPO). Arriba: "ESPERANDO A …" si el rival se
  atrasa, y abajo el ping y el botón ☰ MENÚ (en el computador). La pelea termina recién cuando
  llegaron todos los controles del otro (los dos ven el mismo final); después, ELIGE LUCHADOR otra vez con
  "¡GANASTE!" o "PERDISTE" (la revancha). Si las huellas se separan, se avisa, se anota en `errores` y se sale.
- Probado con dos navegadores en el mismo computador (`?escena=sala`, ver COMO_SE_HACE.md): sala en 1,5 s,
  conectados en 1,5 a 4 s, peleas idénticas (vida y huellas), pelea completa hasta el K.O., revancha con
  otros luchadores y salida de uno (el otro ve "TU RIVAL SALIÓ DE LA SALA").
- **Arreglo del 10 de noviembre** (la primera prueba real entre dos personas no conectó): la primera lista
  de presentes que manda Supabase a veces llega sin el anfitrión (tiene varios servidores y el del
  invitado puede tardar en enterarse; medido en 1 de 10 entradas). Antes el invitado miraba la lista a los
  0,9 s fijos y podía decir "NO HAY NINGUNA SALA CON ESE CÓDIGO" con la sala abierta. Ahora espera hasta
  ver al anfitrión (máximo 8 s, `ESPERA_ANFITRION`). Además, si no se conectan, cada lado anota en la
  tabla `errores` (mensaje "sala: …") la etapa a la que llegó, sus caminos de red (host, srflx, relay),
  los del rival, los estados ICE y el tipo de red: ahí se ve si falta el TURN. La pantalla de CREAR SALA
  dice "NO SALGAS DE ESTA PANTALLA" (en el celular, salir a WhatsApp puede congelar la sala).
- **Pausa en línea, para los dos** (10 de noviembre, pedido del usuario): cada jugador tiene 2 pausas por
  partido. ESC, el ☰ del celular o el botón ☰ MENÚ piden la pausa; viaja con los controles del cuadro
  (`FrameInput.pausa`: 1 pedirla, 2 terminarla; bits 24 y 25 del paquete), así empieza y termina en el
  mismo cuadro en los dos computadores aunque haya rollback (`Match.pausaEnLinea`, opción `pausas`).
  Congela todo, el reloj también. Quien pausó ve CONTINUAR, MOVIMIENTOS, CONTROLES y SALIR DE LA SALA;
  el otro ve "PAUSA DE …" sin CONTINUAR: solo quien pausó sigue. A los 60 s sigue sola (`PAUSA_MAX`).
  Al seguir, "3, 2, 1" grande en los dos (`CUENTA_PAUSA`). Durante un súper, la cámara lenta o un ultra
  la pausa queda pedida y empieza apenas se pueda; fuera del round no se puede. Sin pausas, ESC abre el
  menú sobre la pelea, que sigue con el luchador propio quieto ("YA USASTE TUS 2 PAUSAS"). MOVIMIENTOS
  abre en el luchador propio con las teclas de J1. Probado: `herramientas/rollback_prueba.ts` tiene una
  pelea con pausas (las 4 redes simuladas dan lo mismo) y dos navegadores quedan congelados en el mismo
  cuadro.
- **Liga en línea** (10 de noviembre): al terminar cada pelea en línea, cada jugador manda su resultado
  (`src/online/liga.ts` → función `reportar_pelea` de `supabase/migraciones/004_liga_en_linea.sql`, que el
  usuario pega en el SQL Editor). La pelea se reconoce por el código de la sala y la semilla. Cuando llegan
  los dos resultados y coinciden, suma puntos tipo ELO (K = 32, todos parten con 1.000) a los dos; si no
  coinciden o la misma cuenta mandó los dos lados, no cuenta; entre los mismos dos, 10 peleas por día como
  máximo. El ranking de la liga ahora muestra a todos los que tienen apodo (antes solo a quien tenía
  peleas, y como nada anotaba peleas no salía nadie). Probado en un Postgres de prueba (PGlite) con las 4
  migraciones. Las peleas de antes no quedaron anotadas en ninguna parte.
- **Lobby, SALAS ABIERTAS, PARTIDA RÁPIDA y jugadores en línea** (11 de noviembre, pedido del usuario):
  - `src/online/lobby.ts`: un canal de Supabase Realtime ("lobby") donde se anuncian todos los que están
    en EN LÍNEA (apodo, avatar, versión y estado: menú, buscando, sala abierta con su código, jugando).
    Se entra al abrir EN LÍNEA y se sale con VOLVER o CERRAR SESIÓN (o cerrando el juego). Sin SQL.
  - EN LÍNEA ahora: PARTIDA RÁPIDA, SALAS ABIERTAS, CREAR SALA PRIVADA, UNIRSE CON CÓDIGO, CAMBIAR APODO,
    CAMBIAR AVATAR, CERRAR SESIÓN, VOLVER; arriba a la derecha "● N JUGADORES EN LÍNEA" (también en
    PARTIDA RÁPIDA y SALAS ABIERTAS).
  - SALAS ABIERTAS: la lista de salas que esperan rival (entrar es un toque) y "+ CREAR SALA ABIERTA".
    Una sala abierta también tiene código. Al llenarse desaparece de la lista.
  - PARTIDA RÁPIDA: los que buscan se ordenan por cuándo empezaron y se juntan de a dos (`pareja`); el
    primero crea la sala con un código que sale de los dos identificadores (`codigoDe`), así los dos
    llegan al mismo sin hablarse. La pareja tiene que verse igual 0,7 s antes de armar la sala; si no
    resulta (12 s sin rival, o la sala se cierra), los dos vuelven al final de la fila.
  - Medido: la presencia de Supabase entre servidores se pone al día cada 1,5 a 3 s (y cada cambio de
    estado se agrega al final de la lista de esa persona: vale el último). Por eso todo va también por
    mensaje directo, que llega al tiro: en el lobby (estado, "hola" al entrar, repetido cada 2,5 s por
    los que buscan o tienen sala abierta, "adios" al salir) y en la sala (el anfitrión repite "aquí está
    la sala" y el invitado "hola" cada segundo mientras esperan; el anfitrión ofrece apenas lo oye y
    contesta "llena" a un tercero). Resultado: partida rápida conectada en 1,3 a 2,1 s (antes 2 a 9 s) y
    salas privadas en 0,4 a 1,1 s.
  - PROTOCOLO 2 (`sala.ts`): los controles llevan la pausa; un juego viejo no puede pelear con uno nuevo
    (se les pide recargar).
- **Falta (Paso C)**: servidor de respaldo TURN (sin él, algunas redes, como los datos móviles con CGNAT o
  redes de empresa, no se dejan conectar directo y sale "NO SE PUDO CONECTAR"; el código ya está, falta el
  Worker de Cloudflare); retraso según el ping; los apodos en la barra de vida; mostrar los puntos ganados
  al terminar la pelea.
- **Web: jugadores en línea y visitas** (11 de noviembre, pedido del usuario): arriba al centro (en el
  computador) "● N JUGADORES EN LÍNEA · N VISITAS"; en el celular arriba no cabe y se ve en el RANKING
  (con las de hoy). Los jugadores: la web mira el lobby sin anunciarse (`mirarLobby`), así no se cuenta.
  Las visitas: `supabase/migraciones/005_visitas.sql` (tabla `visitas` por día de Chile y la función
  `visitas_web(contar)`), una por navegador por día (`localStorage` 'torneoDeCell.visita'); mientras no
  se pegue la 005, no se muestran. Se cuentan desde que se pegó (no hay historia de antes). También: en
  el celular angosto (≤ 430 px) el nombre y JUGAR / RANKING caben en una fila (antes se montaban).

## Rendimiento en el celular (13 de noviembre)

Pedido del usuario: en el celular a veces se queda pegado o anda lento. Medido con una pelea de
demostración (perfil de CPU con el procesador frenado y registro de lo que se sube a la tarjeta de video):

- **El procesador no era el problema**: la lógica y el armado del dibujo ocupan ~18 % del cuadro con el
  procesador frenado 4 veces. Lo que pesa es la tarjeta de video.
- **Causa de los tirones (lo de "se queda pegado")**: cada hoja de un luchador (2048 x 2048 en liviano,
  4096 en HD) se subía a la tarjeta de video la primera vez que salía uno de sus cuadros, o sea en plena
  pelea (un tirón por hoja, hasta 8 por pelea más los efectos), y los programas de los filtros (brillo,
  zoom, negativo) se compilaban en el primer golpe.
  - Ahora `Contenido.prepare` termina con `calentar` (`src/render/calentar.ts`): con la barra de carga en
    pantalla sube todas las texturas de la pelea (luchadores, efectos y escenario), una por cuadro, y
    dibuja una vez cada filtro fuera de pantalla. Medido: en la pelea ya no se sube ninguna hoja y quedan
    2 programas por compilar (antes 10).
- **Textos**: cada vez que cambia un texto, Pixi lo redibuja y sube una textura nueva. Las VISTAS del
  "EN VIVO" cambiaban en cada cuadro mientras subían: ahora cambian 10 veces por segundo y el amarillo
  del salto es un teñido (no rehace la textura). Los fondos del "EN VIVO" y de las vistas se redibujan
  solo si cambian de tamaño.
- **Escenarios**: la imagen fija que va debajo de cada video ya no se dibuja mientras el video anda (era
  una pantalla completa pintada dos veces en cada cuadro). Si el video se detiene, vuelve la imagen.
- **Ahorro automático** (`src/app/rendimiento.ts`): con GRÁFICOS en AUTOMÁTICO, si la pelea se dibuja a
  menos de 45 cuadros por segundo durante 4 segundos seguidos, el juego se aliviana solo, un nivel por
  vez, sin recargar (y no vuelve a subir en esa sesión):
  1. el mundo se dibuja a escala 2, el brillo usa 2 pasadas a densidad 1 y los textos a 2x como máximo;
  2. además, densidad de pantalla 1,5 como máximo y escenarios sin video;
  3. además, densidad de pantalla 1.
  Si el jugador eligió un nivel en OPCIONES > GRÁFICOS (o con `?calidad=`), se respeta y no se aliviana.
  `?ahorro=1|2|3` lo fuerza (pruebas) y el puente de pruebas lo informa (`ahorro`).
- **Peso**: se midió recomprimir las hojas (WebP 72 y 65 en vez de 80): ahorra apenas 10 a 15 % y se nota
  en la imagen, así que no se hizo. El peso ya está repartido (ver "Carga liviana").

## Pendiente y decisiones abiertas

- **Victoria del Vendedor de Leña**: el clip de victoria salió con otro tipo (musculoso, otra
  cara). Por ahora usa el baile con el jockey rojo. Rehacerla con los pulgares al pecho
  ("Yo soy tu taita") cuesta 4,5 créditos.
- **Comandos fáciles para los demás**: se ofreció dejar a René, Pablito y el Flaitiano con el
  mismo sistema de dos toques + botón; falta la respuesta del usuario.
- **Tío René**: "El parlante" usa la frase "¡Toy de campeón!" hasta que el usuario mande un
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
- **kie.ai** (Suno y Kling): 6.911 créditos al 30 de octubre de 2026 (1 crédito ≈ US$0,005). La clave de la API nunca se guarda en el proyecto;
  se pasa en la variable de entorno `KIE_API_KEY` y el usuario la entrega cada vez.
- ACE-Step, Demucs y Whisper corren gratis en la tarjeta de video del usuario.
- Sonidos de golpe: Impact Sounds de Kenney (CC0), en `arte/sonidos/kenney-impact/`.

## Reglas acordadas con el usuario

- **Créditos**: nunca gastar créditos de Higgsfield sin aprobación explícita, diciendo antes el
  costo. La forma que funciona: "sí, gasta N créditos en …".
- **Subir a GitHub**: commit y push solo cuando el usuario lo pide. Publicar es inmediato y público.
- **Voces**: solo la voz real de cada persona, cortada de los videos que manda el usuario
  (yt-dlp, Demucs, Whisper). Nunca voces generadas ni clonadas. La única voz generada es la
  del anunciador. Antes de poner una frase en pantalla, confirmar el texto con el usuario.
  Una voz nueva corta a la anterior del mismo luchador; las del ultra y la frase del combo hacen fila; los gritos
  y quejidos solo suenan si el luchador está callado.
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
