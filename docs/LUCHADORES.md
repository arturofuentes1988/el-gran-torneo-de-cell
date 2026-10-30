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

`arte/` y `referencias/` no se suben a GitHub. El orden del plantel está en `REAL_FIGHTERS`
de `src/main.ts`: `rene`, `pablito`, `flaitiano`, `lena`, `carlitos`.

---

## Loco René

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
- **Escenario propio**: todavía no (idea: feria libre). Es el finalista del ARCADE.
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
- **Escenario**: todavía no tiene propio; en el ARCADE pelea en Valdivia (LA CALLE DEL PABLITO).
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
