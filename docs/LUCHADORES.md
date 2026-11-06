# Luchadores

Ficha de cada luchador jugable: quién es, cómo se ve, sus comandos, sus voces y dónde están
sus archivos. Los comandos son para quien mira a la derecha (al mirar a la izquierda se
invierten). "Golpe" es golpe débil o fuerte (cambia la fuerza); "patada", igual.

Archivos de cada luchador (con `<id>` del juego y `<carpeta>` de trabajo):

| Qué | Dónde |
|---|---|
| Lo que carga el juego | `public/luchadores/<id>/` (atlas WebP, `<id>.json`, `cara.webp`, `voces/`) |
| Definición (movimientos, proyectiles, sonidos, colores, ciudad) | `arte/<carpeta>/definicion.json` |
| Qué cuadros de qué video forman cada animación | `arte/<carpeta>/armado.json` |
| Videos de Kling y sus trabajos | `arte/<carpeta>/videos/` (`trabajos.json` con los ids) |
| Cortes de voz | `arte/<carpeta>/voces/voces.json` (+ `fuentes/`) |
| Diseño aprobado y guardia | `arte/<carpeta>/diseno-final.png`, `guardia-cuadrada.png` |
| Notas de trabajo | `arte/<carpeta>/plan.md` |
| Fotos y videos del usuario | `referencias/<carpeta>/` |

`arte/` y `referencias/` no se suben a GitHub. El orden del plantel está en `FIGHTERS`
de `src/main.ts`: `rene`, `pablito`, `flaitiano`, `lena`, `carlitos`, `micky`, `maki`, `samurai`.

---

## Tío René

- **id**: `rene` · **carpeta**: `arte/loco-rene/` · **ciudad**: Santiago
- **Quién es**: René Puente, "Duro como tuna", rapero; su canción "2 Shipitia" (ImpactMusic, 2022).
- **Diseño**: pelo azul en punta, polera negra, cadenas y reloj de oro, bananano cruzado,
  buzo negro, zapatillas blancas y negras (diseño A).
- **Escenarios**: LA CABAÑA DEL LAGO (la cabaña del reality "Secreto en el Lago", sin nada
  del video filtrado) y LA CANCHA (batalla de rap en una plaza de población).
- **Colores**: ropa oscura (`dark`), franja de cabeza 0.19.

| Movimiento | Comando |
|---|---|
| Me río toa la noche (onda de risa por la boca) | ↓ ↘ → + golpe |
| El parlante (trampa que golpea 3 veces) | ↓ ↙ ← + golpe |
| ¿Querí too? (agarra y descarga) | → → + patada |
| Gancho (como Mortal Kombat; lanza al rival) | ↓ + golpe fuerte |
| Súper 2 SHIPITIA (luces de disco y el pedazo de su canción; 1 barra) | ↓ ↘ → ↓ ↘ → + golpe |
| Ultra ¡TO' YO! (rival con 25% o menos, 2 barras; encadena todo, 26 golpes) | ↓ ↘ → ↓ ↘ → + patada |

**Voces** (de los videos del usuario): "¿Querí too?" (3 tomas), "¡Toy de campeón!",
"¡Cabréate de grabar!" (sin el garabato que sigue), "¡To yo, toa la weá yo!", "¡To yo!",
"Yo nací de un pueblo demasiao bajo", sus risas, "¡Me río toa la noche!" y el pedazo de
"2 Shipitia" del video oficial zaE6N55KHzo (17,6 a 23,3 s), sin letra en pantalla.

---

## Pablito Neuquén

- **id**: `pablito` · **carpeta**: `arte/pablito-neuquen/` · **ciudad**: Valdivia
- **Quién es**: el del video "sácate altiro las zapatillas" (short 7MSOuGi0XpM, una calle de
  población lluviosa de noche). Las tres primeras frases del video son de quien graba y no se usan.
- **Diseño**: proporciones reales, chaquetón cerrado, jockey, puños arriba (diseño A).
- **Escenario**: LA CALLE DEL PABLITO (Valdivia de noche con lluvia, cumbia sureña).
- **Colores**: ropa oscura + tonos amarillo y azul marino, franja de cabeza 0.14.
- El salto usa `"cabeza": true` en el armado (el video le cortaba el gorro arriba).

| Movimiento | Comando |
|---|---|
| ¡Sácate al tiro! (lanza una zapatilla) | ← → + golpe |
| Charchazo (cachetada que derriba) | machaca golpe 4 veces rápido |
| Con este chaquetón (contraataque) | ← → + patada |
| Súper ¡SÁCATE AL TIRO LAS ZAPATILLAS! (lluvia de zapatillas; 1 barra) | → ← → + golpe |
| Ultra ¡YO SOY PABLITO NEUQUÉN! (rival en peligro, 2 barras) | → ← → + patada |

**Voces**: "Yo vengo deportado de Venecia, de Italia", "Nací y criado en Neuquén",
"Imagínate, fratello, mangiare tonini", "¿Qué hacés, pibes?", "¡Sácate las zapatillas,
boludo!", "Con este chaquetón, fierushi", "Le pego un charchazo" (y la frase completa),
"Porque yo soy Pablito Neuquén", "Yo soy Pablito Neuquén", "¡Sácate al tiro!",
"¡Sácate al tiro las zapatillas!". Se escribe **Charchazo** (los ids internos dicen `chachazo`).

---

## Flaitiano

- **id**: `flaitiano` · **carpeta**: `arte/flaitiano/` · **ciudad**: Santiago
- **Tema**: agua y rayos ("¡junten agua, junten luz!").
- **Diseño** (B2 con zapatillas nuevas): puffer blanco sobre polerón blanco, jeans blancos con
  dibujos tipo grafiti (sin letras), bananano negro, rastas largas con hilos blancos y puntas
  verdes, zapatillas bajas de running blancas con verde.
- **Escenario propio**: LA CANCHA (era de René; idea original: feria libre).
- **Colores**: ropa clara (`light`), `face` 0.5 con 3 vecinos de piel (la capucha y los
  hombros se tiñen enteros; dientes y ojos quedan).
- **Combos eléctricos**: chispas desde 3 golpes, rastas que brillan desde 5, agua desde 8,
  rayos desde 12.

| Movimiento | Comando |
|---|---|
| ¡Cállate, cotorra! (sus rastas avanzan por el suelo como olas) | ↓ ↘ → + golpe (también la U completa) |
| ¡No hay luz! (se corta la luz y cae un rayo; con patada fuerte, sobre el rival) | ↓ ↘ → + patada |
| ¡Cabeza de tarro! (agarre: tambor en la cabeza y patada) | → → + golpe |
| Súper ¡JUNTEN AGUA, JUNTEN LUZ! (tormenta, remolino y rayo gigante; 1 barra) | ↓ ↘ → ↓ ↘ → + golpe |
| Ultra ¿HASTA CUÁNDO, AMIGO? (en el lago, con tormenta y piquero; 2 barras) | ↓ ↘ → ↓ ↘ → + patada |

**Voces** (videos XFSG8NGLkMo, mDD9LgTxHL4, U78lusp70Dg, -PIVaxlFZH4, i7ZbollAYKI):
"¡Guacho culiao pesao, weón!", sus risas, "¡Cállate, cotorra!", "¡Cabeza de tarro!" (2 tomas),
"¿Hasta cuándo me van a hacer caso, amigo?", "Junten agua, junten luz", "Mira lo que está
pasando ahora mismo", "No hay luz", "Te pareces a la bolsa de basura…", "Me veo negro en la
cámara, joder" (frase suelta de burla, nunca ligada a oscuridad). No se usa el tramo 8,6 a
16,4 s de -PIVaxlFZH4 (chiste sobre su color de piel) ni las frases de Junior Playboy.

---

## Vendedor de Leña

- **id**: `lena` · **carpeta**: `arte/vendedor-de-lena/` · **ciudad**: Valparaíso
- **Quién es**: Roberto Ibacache. Primer lugar del ranking del Torneo de Cell de diciembre
  de 2022 (The Clinic). Su sello es el "silbido de la muerte". Fuera del juego: la muerte de
  su hijo y el reportaje de Mega.
- **Tema**: leña, fuego y el viento de su silbido.
- **Diseño** (B2 con la boca cerrada): bajo y macizo, pelo negro plano y cuadrado arriba con
  los costados rapados, ojos achinados, polera roja con estampado barroco más oscuro, jeans
  azules, zapatillas crema gruesas, tatuaje en el antebrazo derecho. Sin bananano, cadenas ni
  lentes (son de René). Para el parecido se usaron cuadros de su cara del video del auto.
- **Escenario**: LOS CERROS DE VALPARAÍSO (atardecer, ascensor, bahía, rumas de leña), con
  música de videojuego de 16 bits.
- **Colores**: tono rojo de la polera `[0.94, 0.012, 0.5]`, `face` 0.26 con 2 vecinos de piel,
  y **ropa de visita** (`visita: true`): en el color 1 la polera queda blanca; en ELIGE
  LUCHADOR se llama VISITA y un luchador repetido la usa solo.
- **Alto**: 146 unidades (más bajo que René).
- **Combos de fuego**: brasas desde 3 golpes, aura de llamas desde 5, estallidos desde 8,
  pilar de fuego desde 12.

Todos sus comandos son dos toques de una dirección y un botón:

| Movimiento | Comando |
|---|---|
| ¡Un silbidito! (remolino de viento con notas doradas; deja mareado con estrellitas) | → → + golpe |
| ¡Te paseo! (agarre imbloqueable: lo zamarrea en un remolino de fuego y lo lanza) | → → + patada |
| ¡Leñazo! (lanza un tronco que vuela girando, sin fuego; el fuerte derriba) | ← ← + golpe |
| ¡Llegó la leña! (troncos ardiendo caen del cielo sobre el rival) | ← ← + patada |
| Súper SILBIDO DE LA MUERTE: ULTRA INSTINTO (aura plateada, rayo sónico de 9 golpes, la pantalla se triza; 1 barra) | ↓ ↓ + golpe |
| Ultra ¡EL NÚMERO UNO DEL PARTY! (focos, confeti y fuegos artificiales; rival en peligro, 2 barras) | ↓ ↓ + patada |

- **Entrada**: llega con un atado de leña al hombro y lo tira ("¡Aquí estamos!").
- **Victoria**: el baile con el jockey rojo ("Yo soy tu taita" o "Soy el número uno del
  party"). El clip de victoria propio salió con otro tipo y no se usa.
- **Burla**: "¡No tenís ni un brillo!" o "¡Yo soy tu taita!".

**Voces** (videos lUzavuRG6y8 "hace pebre al Papi Micky", sqLCIqr6OAE "silbido de la muerte
ultra instinto", D3_mJeS5MT4 "x Fortnite"): "¡Aquí estamos!", "¡Un silbidito!", "¡Es el día
del legendario!" (texto dudoso), "¡Jamás vais a buscar las esferas del dragón, Perkins!",
"Soy el número uno del party", "No tenís ni un brillo", "Yo soy tu taita", "Te paseo, te
paseo", "Te paseamos" y sus silbidos. Los silbidos se cortan del audio original (Demucs los
deja en la pista de música) y suenan por el canal de efectos (claves `silbido/…`), así no
cortan la frase que está diciendo. Fuera: los chistes de la placa dental del Papi Micky.

**Efectos** (todos con código, `src/render/fuego.ts`): proyectiles `silbido`, `tronco`,
`troncos` y `sonico`; luces `ultrainstinto` y `fiesta`; el remolino de fuego del agarre
(`hitOverlay: "remolino"`); las estrellitas del mareo; la pantalla trizada; `FxLayer.fire`.

---

## Carlitos Run

- **id**: `carlitos` · **carpeta**: `arte/carlitos-run/` · **ciudad**: Valdivia
- **Quién es**: Carlos Andrés Oyarzo, de Valdivia. Partió imitando a Pablito ("Carlitos Neuquén")
  y le quedó Carlitos Run por el "¡ruuun!" con que termina sus videos. Viral: "quiero mi coca
  colita". Hace música ("Entrando pa' la discoteca") con su grupo Run Mafia; su mánager es el
  Tío Trap. Anda siempre en su BMX naranja.
- **Cuidado especial**: tiene una discapacidad. Se muestra solo como una estrella poderosa, con
  frases suyas de sus propios videos; sin insultos, sin pistolas, nada sobre su discapacidad ni
  su salud ("no tomo más Coca-Cola"), ni el reality para adultos. Su mánager pidió que no le
  hagan bullying.
- **Diseño**: polera roja con "CARLITOS RUN" en cursiva blanca (sin el logo de Coca-Cola),
  pantalón de camuflaje gris, zapatillas negras con suela roja. Bajo y macizo. La cara se hizo
  primero en grande con GPT Image 2.5 desde una foto suya (Nano Banana Pro no lograba el
  parecido) y después el cuerpo con esa cara de guía.
- **Escenario**: LA COSTANERA DE VALDIVIA (río Calle-Calle con lobos marinos, música synth funk de los 80/90).
- **Colores**: tono rojo de la polera, `face` 0.3, ropa de visita (polera blanca).
- **Combos de bebida** (`comboFx: "cola"`): burbujas desde 3 golpes, espuma desde 5, estallidos
  desde 8, géiser desde 12.

| Movimiento | Comando |
|---|---|
| ¡Quiero mi coca colita! (chorro de bebida con espuma) | → → + golpe |
| ¡Ruuun! (carrera y embestida) | → → + patada |
| En breve me la llevo en bicicleta (BMX, varios golpes y lanza) | ← ← + golpe |
| ¡Regálame todo el cajón! (cajón de botellas) | ← ← + patada |
| Súper ¡ENTRANDO PA' LA DISCOTECA! (neón rojo `lights: "neon"`, letras R-U-N en llamas; 1 barra) | ↓ ↓ + golpe |
| Ultra ¡RUN MAFIA! (luces de fiesta, 8 tramos; 2 barras, rival en peligro) | ↓ ↓ + patada |

- **Entrada**: saluda y hace un corazón con las manos ("En breve me la llevo en bicicleta").
- **Victoria**: brazos arriba y corazón con las manos ("Gracias por recuperar mi bicicleta").
- **Burla**: "¡Run!".

**Voces** (links del usuario): "Quiero mi coca colita, run" (guaracha -QSpwDBOv6s, voz separada),
"En breve me la llevo en bicicleta" (zccKCqeXZxs, voz separada), "Gracias por recuperar mi
bicicleta" y "¡Run!" (rBQLgXM5i2o, en la PDI), y para la súper "Entrando pa' la discoteca" con el
beat (zccKCqeXZxs). Otras frases cortadas para revisar están en
`referencias/carlitos-run/frases-para-revisar/` (sin confirmar por el usuario).

**Efectos** (código, `src/render/cola.ts`): proyectiles `cola`, `cajon` y `letras`;
`FxLayer.fizz`; luces `neon` (DiscoShow con paleta roja).

## Papi Micky

- **id**: `micky` · **carpeta**: `arte/papi-micky/` · **ciudad**: sin confirmar (no se inventa)
- **Quién es**: Miguel Devia, ex cantante de C4, conocido por "Llegó la hora" y su "¡PAAA!".
- **Cuidado especial**: nada sobre su detención, drogas (tampoco en las letras), la placa dental, su familia
  ni los documentales de su decadencia; no se usa el video en que lo engañan con un falso directo.
- **Diseño**: el de la Gala Épica 2025 (camisa blanca, chaleco azul de cachemira, humita azul), lentes blancos
  bajados en la nariz, pelo rubio decolorado en puntas, pantalón y zapatos negros, reloj; sin cadena (René ya
  la tiene). Cara y cuerpo con GPT Image 2.5. La guardia quedó casi de frente (el usuario la aprobó así).
- **Escenario**: EL SET DE LLEGÓ LA HORA (set de TV juvenil estilo Yingo, eurodance de los 90).
- **Colores**: tono azul del chaleco, `face` 0.3, ropa de visita (chaleco blanco).
- **Combos de neón** (`comboFx: "neon"`): estrellas de colores desde 3 golpes, aura desde 5, estallidos desde
  8 y una lluvia de estallidos de colores desde 12.

| Movimiento | Comando |
|---|---|
| ¡PAAA! (onda de neón alrededor suyo; el fuerte pega dos veces y lanza) | ↓ ↘ → + golpe |
| Todo es gratis, papito (lluvia de monedas de oro sobre el rival) | → → + golpe |
| Paso de C4 (saltitos de boy band y tres patadas) | → → + patada |
| Súper ¡DIOS ES EL DUEÑO DEL ORO! (columna dorada, lingotes, monedas y estrellas; 1 barra) | ↓ ↓ + golpe |
| Súper ¡EL MORTAL DEL PAPI! (mortal con las piernas estiradas como Eddy Gordo; lanza; 1 barra) | ← ← + patada |
| Ultra ¡LLEGÓ LA HORA! (su baile en su set, luces de fiesta, su canción; 2 barras, rival en peligro) | ↓ ↓ + patada |

- **Entrada**: "¡PAAA! ¿Qué pasa, guatones? ¿Cómo están?".
- **Victoria**: pose de cantante ("Si yo soy de Dios, todo es gratis, papito").
- **Burla**: se baja los lentes, apunta y "¡PAAA!".

**Voces** (links del usuario y su video oficial): ¡PAAA! (xhaBjGSpJ-E y VMLh1INSK-Y; de este último solo el
¡PAAA!), "Si yo soy de Dios, todo es gratis, papito" y "Dios es el dueño del oro" (svgBzb4KCMI), "soy el real
del género" y el coro de "Llegó la hora" (wmNkTDQQQIo, sin las partes de alcohol ni las frases sobre mujeres).

**Efectos** (código, `src/render/neon.ts`): proyectiles `paaa`, `monedas`, `oro`; estrellas `starPop`; luces
`neon` en el mortal y `fiesta` en el ultra.

## Dr. Maki Gero

- **id**: `maki` · **carpeta**: `arte/maki-gero/` · **ciudad**: sin confirmar (no se inventa)
- **Quién es**: mánager de Tío René; le dice "mi androide". Su apodo viene del Dr. Gero de Dragon Ball.
- **Cuidado especial**: nunca la escena de los cachetazos del short X1lq6CXrd6Y ni su texto del CESFAM (solo el
  audio de "cambia, es por tu bien", como poder de reprogramar); nada de drogas ni recaídas, la balacera de
  Concepción, la denuncia de Chilevisión, la estafa, ni amenazas o insultos al Papi Micky.
- **Diseño**: jockey negro con emblema dorado, polera negra, bata blanca de laboratorio arremangada, brazos
  tatuados, pantalón oscuro y zapatillas negras; sin lentes, cadenas ni reloj (son de René).
- **Escenario**: EL LABORATORIO DEL DR. MAKI GERO (cápsulas con androides, bobinas Tesla, la cordillera).
- **Colores**: la ropa oscura (`dark`).
- **Combos del laboratorio** (`comboFx: "laboratorio"`): chispas de colores desde 3 golpes, aura desde 5,
  estallidos desde 8 y el rival electrificado desde 12.

| Movimiento | Comando |
|---|---|
| ¡Dale color! (bola de plasma arcoíris; el fuerte es un rayo arcoíris que pega tres veces) | ↓ ↑ + golpe |
| ¡El auténtico! (patada voladora hacia arriba con rayos y sello dorado; lanza) | ↓ ↑ + patada |
| ¡Son todos androides! (androides cromados que salen de una cápsula y embisten; 2 o 4) | → → + patada |
| Súper ¡CAMBIA, CAMBIA, ES POR TU BIEN! (la máquina de reprogramar; 1 barra) | ↓ ↓ + golpe |
| Súper ¡AQUÍ ESTAMOS NUEVAMENTE CON MI ANDROIDE! (Tío René robot gigante; 1 barra) | ← ← + patada |
| Ultra ¡EL LABORATORIO DEL DR. MAKI GERO! (2 barras, rival en peligro) | ↓ ↓ + patada |

- **Entrada**: se acomoda la bata ("¡El auténtico!").
- **Victoria**: abre los brazos como inventor orgulloso ("Son todos androides, pues, cachái").
- **Burla**: su risa de científico loco ("Aquí estamos nuevamente con mi androide").
- **Patada baja y barrida**: del intento 1 de Kling con las piernas volteadas (`herramientas/voltear_piernas.py`).

**Voces** (videos 7i1TMb7CxE4 y TNkvmNHj2J4, y el audio del short X1lq6CXrd6Y; voz separada con Demucs).

**Efectos** (código, `src/render/lab.ts`): proyectiles `color`, `colorRayo`, `androides`, `cambia` (con su parte
delantera `drawCambiaFrente`) y `robo`; ayudantes pintados en `ProjectileDef.sprites`.

## El Samurai de Pudahuel

- **id**: `samurai` · **carpeta**: `arte/samurai-de-pudahuel/` · **ciudad**: Pudahuel (Santiago)
- **Quién es**: el "Ninja Malveke" de Pudahuel Sur, conocido por sus "consejos" y sus "frases para el día".
- **Cómo se muestra**: como un maestro ninja **sabio y súper poderoso**. Nunca: drogas, la vida en la calle,
  internaciones, su mamá, los rumores de que "desapareció", insultos ni el documental o "la triste historia".
- **Diseño**: la cara A (pañuelo ninja negro, pelo parado con canas, barba gris), su chaqueta de camuflaje hecha
  chaqueta ninja, collar de cuentas de madera, katana en la mano y el bastón de madera que es su vaina en la
  espalda, kusarigama en la cintura, shuriken en el cinturón, botas tabi. Cara y cuerpo con GPT Image 2.5.
- **Escenario**: LAGUNA SUR CON LA ESTRELLA (la esquina de verdad, desde el Street View del usuario: la iglesia
  con el campanario de concreto, el bandejón con palmeras, la feria con toldos azules, la micro, el quiltro y la
  cordillera nevada). El ultra ¡HAGA SOMBRA! pasa en LOS TECHOS DE PUDAHUEL bajo la luna (`samurai-luna`, solo
  de fondo del ultra: `"soloUltra": true`).
- **Clips sobre magenta** (su chaqueta es verde): `"fondo": "magenta"` en el armado.
- **Combos ninja** (`comboFx: "ninja"`): chispas doradas de KI desde 3 golpes, aura dorada desde 5, tajos de luz
  desde 8 y un destello blanco desde 12.

| Movimiento | Comando |
|---|---|
| ¡La palabra no se la lleva el viento! (shuriken con estela de viento; fuerte: 3 en abanico) | ↓ ↘ → + golpe |
| ¡Ven a probar suerte pa' acá! (la cadena de la kusarigama lo atrapa y lo tira hacia él) | ↓ ↙ ← + golpe |
| ¡Haga sombra! (bomba de humo y 2 o 3 sombras ninja que cruzan al rival) | → → + patada |
| Súper ¡EL AMOR TODO LO PUEDE! (corte iai de luz rosa y dorada que cruza la pantalla; 1 barra) | ↓ ↓ + golpe |
| Súper ¡EL 0,01 % DE SU PODER! (humo de teletransporte y lluvia de kunai sobre el rival; 1 barra) | ← ← + patada |
| Ultra ¡UNA FRASE PA'L DÍA! (escribe la frase en el aire a katanazos, en letras doradas; 2 barras) | ↓ ↓ + patada |
| Ultra ¡HAGA SOMBRA! (los techos de Pudahuel bajo la luna, los dos como siluetas; 2 barras) | ↓ ↘ → ↓ ↘ → + patada |

- **Entrada**: "Una frase pa'l día… Maldito el hombre que cree en el hombre".
- **Victoria**: se sienta a meditar ("Yo soy Goku, el verdadero Goku").
- **Burla**: medita ("Una frase pa'l día").
- **Al levantarse**: "Cada vez que despertái, resucitái".
- **Patadas**: siempre hacia adelante. La barrida es la de Kling con las piernas volteadas
  (`herramientas/voltear_piernas.py --magenta`, clip achicado al 0,75).

**Voces** (de sus propios videos, voz separada con Demucs; recortes elegidos por el usuario en
`referencias/samurai-de-pudahuel/frases-elegidas/`): 01, 05, 06a, 09, 13, 21, 22 y 23.

**Efectos** (código, `src/render/ninja.ts`): proyectiles `shuriken`, `cadena`, `sombras` (con sus propios cuadros
teñidos), `iai`, `kunai`, `caligrafia` y `cortes`; la silueta del ultra es `cinematic.silueta`.
