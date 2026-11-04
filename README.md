# El Gran Torneo de Cell

Juego de pelea 2D para el navegador, estilo arcade (SNK / Marvel vs Capcom)
con pixel art y efectos modernos.

**Estado: en desarrollo.** Se puede jugar con Loco René, Pablito Neuquén, el
Flaitiano, el Vendedor de Leña y Carlitos Run (sprites, voces y poderes definitivos) en los escenarios de René, en
la calle del Pablito (Valdivia, con lluvia), en los cerros de Valparaíso y en Santiago de noche. Los demás luchadores del plantel vienen después.

La web (`index.html`) tiene dos pestañas: **JUGAR**, con el juego (`juego.html`) dentro, y
**RANKING**: puntos de liga, victorias y mejor racha en línea, y los campeones del ARCADE
(los más rápidos en coronarse, por dificultad), con el avatar de cada jugador. Si entraste con tu
cuenta, arriba a la derecha salen tu avatar (la cara de un luchador) y tu apodo, con un menú
para cambiar el avatar o cerrar sesión. Abajo va el botón para DONAR con Mercado Pago (se ve
cuando hay enlaces en `DONACIONES`, en `src/web/portal.ts`).

Documentación del proyecto en `docs/`: [estado del proyecto](docs/ESTADO_DEL_PROYECTO.md)
(qué está hecho, qué falta y las reglas acordadas), [luchadores](docs/LUCHADORES.md),
[cómo se hace](docs/COMO_SE_HACE.md) un luchador, un escenario o un tema, y el
[formato técnico](docs/FORMATO_SPRITES.md).

## Cómo correrlo

Necesitas [Node.js](https://nodejs.org/) 20 o más reciente.

```bash
npm install      # solo la primera vez
npm run dev      # abre http://localhost:5173
```

Otros comandos:

```bash
npm run build    # revisa tipos y genera la versión publicable en dist/
npm run preview  # sirve dist/ para probar el build
```

La carpeta `dist/` es un sitio estático: se puede subir tal cual a itch.io,
GitHub Pages o Netlify.

El repositorio trae `.github/workflows/pages.yml`: cada vez que se sube algo a
`main`, GitHub arma el juego y lo publica en GitHub Pages. Pages funciona con el
repositorio público (con uno privado hace falta una cuenta de pago). Las carpetas
`arte/` (originales 4K, videos, clips) y `referencias/` (fotos) no se suben:
quedan solo en el computador de trabajo.

## Al abrir el juego

Aparece directo el título (**PRESIONA ENTER**). El navegador
solo deja sonar el audio y poner la pantalla completa después de un gesto del
jugador, así que el sonido y la música del título empiezan con la primera tecla
o clic, que también pide la pantalla completa.

Bajo el logo **EL GRAN TORNEO DE CELL** los luchadores entran uno por uno, como
en los Power Rangers: saltan desde su lado, aterrizan con explosiones y una
columna de fuego de sus colores y hacen su pose de victoria. Al final gritan
todos juntos con el aura encendida, se desvanecen y el ciclo vuelve a empezar
(`src/scenes/title.ts`; entra cada luchador con sprites definitivos). De fondo
está el ring del torneo de artes marciales (el de Dragon Ball) al atardecer:
ilustración con el mismo estilo de los escenarios, con video en loop (palmeras,
faroles, banderines y nubes que se mueven). Se arma con
`herramientas/armar_escenario.py arte/titulo/torneo.json` en `public/torneo/` y
no aparece en la lista de escenarios de pelea. Los menús usan otro fondo, un show de luces
(focos que barren, estrellas y un piso de neón que avanza:
`src/scenes/backdrop.ts`). Un clic en el título pone la pantalla completa y el
sonido sin pasar al menú.

## Personajes

La opción **PERSONAJES** del menú muestra la lista de movimientos de cada
luchador: especiales, súper, ultra, golpes y mecánicas (agarre, Modo Poder, pelá,
rodada, entrada y victoria). Al recorrerla con ↑↓, el luchador hace el movimiento
marcado en su vitrina, con el comando abajo; la primera vez suenan sus voces y lo
que lanza cruza la vitrina, después lo repite en silencio (Enter lo repite con
sonido). El ultra encadena toda su secuencia con las frases en fila. ←→ cambia de
luchador (`src/scenes/characters.ts`).

## Música

Cada pantalla tiene su tema en loop (`public/musica/musica.json`: archivo y puntos
del loop). El tema del título suena en la pantalla de inicio y sigue en los menús;
en la pelea suena el del escenario (campo `music` de su `escenario.json`). La
música baja un poco mientras alguien habla.

| Tema | Archivo | Origen |
|---|---|---|
| Título y menús | `titulo.mp3` | Suno V6 (vía kie.ai), versión 2 |
| La cabaña del lago | `rene-cabana.mp3` | Suno V6, versión 2 |
| La cancha | `rene-plaza.mp3` | Suno V6, versión 2 |
| La calle del Pablito | `pablito-calle.mp3` | ACE-Step 1.5 (local), versión 2, con lluvia |
| Los cerros de Valparaíso | `lena-valparaiso.mp3` | ACE-Step 1.5 (local), versión 2 (estilo videojuego de 16 bits de los 90) |
| Santiago de noche (arena) | `titulo.mp3` | El mismo tema del título |

Las dos versiones de cada tema están en `arte/musica/suno/`. Para cambiar de
versión o agregar un tema: `python -P -E herramientas/musica_loop.py <clave>
<archivo> <bpm aproximado> [--minimo 85]`, que busca dos momentos que suenen igual,
une el final con el inicio sin corte, iguala el volumen y actualiza `musica.json`.
`herramientas/musica_suno.py` pide temas nuevos a Suno (la clave de kie.ai va en
la variable `KIE_API_KEY`, nunca en el proyecto). También quedan
`herramientas/musica.py` (temas sintetizados en código, de reemplazo, guardados en
`arte/musica/sintetizados/`) y `herramientas/musica_ia.py` (ACE-Step, local: corre
en la tarjeta de video, sin créditos; sus versiones quedan en `arte/musica/ia/`).
`herramientas/musica_lluvia.py` mezcla una lluvia suave bajo un tema (la cumbia
sureña de la calle del Pablito).

## Controles

| Acción | Jugador 1 | Jugador 2 (teclado numérico) | Joystick |
|---|---|---|---|
| Moverse / saltar / agacharse | Flechas | 8 4 6, abajo 5 o 2 | Cruceta o palanca izquierda |
| Golpe débil / fuerte | A / S | 7 / 9 | X / Y |
| Patada débil / fuerte | Z / X | 1 / 3 | A / B |
| Modo Poder (fuertes juntos) | D | + | RB |
| Rodada (débiles juntos) | C | . (punto) | LB |
| Pelá (burla) | Ctrl izquierdo | 0 | Back / Select |
| Pausa | Esc | Esc | Start |

No hay botón de especial: los especiales y el súper salen solo con su
movimiento (ver abajo o la opción MOVIMIENTOS). Los botones de Modo Poder y
Rodada son atajos: hacen lo mismo que apretar los dos botones juntos.

En el modo 1 jugador y en práctica, el jugador 1 también puede usar las teclas
del jugador 2.

Menús: flechas (o cruceta) para moverse, Enter, Espacio o A para aceptar, Esc
o Retroceso para volver. También se tocan (o se hace clic) las opciones directo; en
el celular la cruceta y los botones salen solo en la pelea y ☰ vuelve atrás.

La primera vez, después del título aparece **TU CUENTA**: ENTRAR CON GOOGLE, ENTRAR CON
CORREO o JUGAR SIN CUENTA (queda recordado). La cuenta solo hace falta para EN LÍNEA. El
**MENÚ PRINCIPAL** tiene:

- **ARCADE**: eliges tu luchador y le ganas a cada uno de los demás contra la
  CPU. Antes de cada pelea, **LA TORRE**: un rascacielos de neón con un piso por rival
  y la final en la azotea; el ascensor sube con tu cara hasta el piso del próximo rival
  (los vencidos quedan en gris con una X) y a los lados salen los dos luchadores. El
  orden sale de las ciudades (campo `ciudad` de cada definición), siempre a la más
  cercana. Cada rival pelea en su escenario (o en uno de su ciudad), y la final es en
  el ring de EL GRAN TORNEO, contra quien no tenga escenario propio (la última pelea es
  un poco más difícil). Si pierdes, ¿CONTINUAR? repite esa pelea; si les ganas a todos,
  ¡CAMPEÓN!, con el tiempo total (lo que duraron tus peleas, también las perdidas), que
  se sube al ranking de la web si entraste con tu cuenta.
- **EN LÍNEA**: pide cuenta y un apodo único (3 a 14 letras) la primera vez. Por ahora tiene
  CAMBIAR APODO y CERRAR SESIÓN; CREAR SALA, UNIRSE CON CÓDIGO y PARTIDA RÁPIDA llegan en la
  fase 2. Las cuentas están en Supabase (`src/online/`, tablas en `supabase/migraciones/`).
- **CASUAL**: 1 VS CPU, 2 VS CPU (equipos de dos) y PRÁCTICA. ARCADE, 1 VS CPU y 2 VS CPU
  parten con **ELIGE LA DIFICULTAD**.
- **OPCIONES**: PERSONAJES, MOVIMIENTOS, ESCENARIOS, DEMOSTRACIÓN, CONTROLES, SONIDO,
  MÚSICA (volumen de a 10 %; aceptar la apaga o la prende) y GRÁFICOS (BAJA, MEDIA, ALTA o ULTRA; si no se
  cambia, se elige solo: MEDIA en celulares, ALTA o ULTRA en computadores). **DEMOSTRACIÓN** es la CPU contra la
  CPU en MUY DIFÍCIL, sin fin: cada round es una pelea nueva con otros dos
  luchadores (y colores) en otro escenario. Aceptar o volver sale.
- **SALIR**: deja la pantalla completa y vuelve al título (el navegador no deja
  cerrar la pestaña desde el juego).

Atajos: **M** activa o silencia el sonido, **F1** muestra las cajas de golpe
y daño, **F2** muestra datos de depuración.

### Especiales

Loco René (también en MOVIMIENTOS, con las teclas que tengas configuradas):

| Movimiento | Comando |
|---|---|
| Me río toa la noche (onda de risa por la boca) | abajo, diagonal, adelante + golpe |
| El parlante (trampa que golpea 3 veces) | abajo, diagonal, atrás + golpe |
| ¿Querí too? (agarra y descarga) | adelante, adelante + patada |
| Gancho (como Mortal Kombat; lanza al rival) | abajo + golpe fuerte |
| Súper 2 SHIPITIA (1 barra) | dos veces abajo, diagonal, adelante + golpe |
| Ultra ¡TO' YO! (2 barras, rival en peligro) | dos veces abajo, diagonal, adelante + patada |

Pablito Neuquén (sin cargar ni mantener: toques de atrás y adelante):

| Movimiento | Comando |
|---|---|
| ¡Sácate al tiro! (lanza una zapatilla) | atrás, adelante + golpe |
| Charchazo (cachetada que derriba) | machaca golpe 4 veces rápido |
| Con este chaquetón (contraataque) | atrás, adelante + patada |
| Súper ¡SÁCATE AL TIRO LAS ZAPATILLAS! (1 barra) | adelante, atrás, adelante + golpe |
| Ultra ¡YO SOY PABLITO NEUQUÉN! (2 barras, rival en peligro) | adelante, atrás, adelante + patada |

Flaitiano (agua y rayos: "¡junten agua, junten luz!"):

| Movimiento | Comando |
|---|---|
| ¡Cállate, cotorra! (sus rastas avanzan por el suelo como olas; se cubre agachado) | abajo, diagonal, adelante + golpe (también sale con la U completa) |
| ¡No hay luz! (se corta la luz y cae un rayo; con patada fuerte, sobre el rival) | abajo, diagonal, adelante + patada |
| ¡Cabeza de tarro! (agarre: tambor en la cabeza y patada) | adelante, adelante + golpe |
| Súper ¡JUNTEN AGUA, JUNTEN LUZ! (tormenta, remolino y rayo gigante; 1 barra) | dos veces abajo, diagonal, adelante + golpe |
| Ultra ¿HASTA CUÁNDO, AMIGO? (en el lago, con tormenta; 2 barras, rival en peligro) | dos veces abajo, diagonal, adelante + patada |

Sus combos se electrifican mientras más largos: chispas, rastas que brillan,
agua y, desde 12 golpes, rayos de fondo.

Vendedor de Leña (leña, fuego y el viento de su "silbido de la muerte"; todos sus
comandos son dos toques de una dirección y un botón):

| Movimiento | Comando |
|---|---|
| ¡Un silbidito! (remolino de viento con notas doradas; deja mareado al rival) | adelante, adelante + golpe |
| ¡Te paseo! (agarre: lo zamarrea en un remolino de fuego y lo lanza) | adelante, adelante + patada |
| ¡Leñazo! (lanza un tronco que vuela girando) | atrás, atrás + golpe |
| ¡Llegó la leña! (troncos ardiendo caen del cielo sobre el rival) | atrás, atrás + patada |
| Súper SILBIDO DE LA MUERTE: ULTRA INSTINTO (aura plateada, rayo sónico que triza la pantalla; 1 barra) | abajo, abajo + golpe |
| Ultra ¡EL NÚMERO UNO DEL PARTY! (fiesta con focos, confeti y fuegos artificiales; 2 barras, rival en peligro) | abajo, abajo + patada |

Sus combos se encienden mientras más largos: brasas, aura de llamas,
estallidos y, desde 12 golpes, un pilar de fuego. Cuando los dos jugadores lo
eligen, el segundo sale con su ropa de **VISITA** (la polera blanca).

Los toques perdonan el tiempo de una persona: la última flecha y el botón no
tienen que caer juntos (si el botón cae un pelo antes, el golpe que alcanzó a
salir se convierte en el especial), y al machacar cuentan también los golpes que
se aprietan mientras sale el primero. El motor sigue aceptando cargas
(`charge`, `chargeSuper`) y mantener y soltar (`hold`) para otros luchadores.

Carlitos Run (bebida con gas, velocidad y su BMX; también dos toques y un botón):

| Movimiento | Comando |
|---|---|
| ¡Quiero mi coca colita! (chorro de bebida con espuma; el fuerte pega 3 veces y derriba) | adelante, adelante + golpe |
| ¡Ruuun! (sale corriendo y embiste; el fuerte cruza la pantalla y derriba) | adelante, adelante + patada |
| En breve me la llevo en bicicleta (pasa encima en su BMX levantando la rueda) | atrás, atrás + golpe |
| ¡Regálame todo el cajón! (lanza un cajón de botellas que revienta en espuma) | atrás, atrás + patada |
| Súper ¡ENTRANDO PA' LA DISCOTECA! (discoteca de neón rojo, su canción y las letras R-U-N en llamas que caen sobre el rival; 1 barra) | abajo, abajo + golpe |
| Ultra ¡RUN MAFIA! (focos y confeti, encadena todos sus golpes; 2 barras, rival en peligro) | abajo, abajo + patada |

Sus combos se llenan de bebida: burbujas, espuma, estallidos y, desde 12 golpes,
un géiser. Su ropa de visita es la polera blanca.

- **Agarre:** pegado al rival, aprieta un golpe y una patada juntos (cualquiera
  de cada uno, hasta ~0,1 s de diferencia entre los dos; con atrás lo tira hacia atrás). También sale con adelante o
  atrás + golpe fuerte. Se escapa apretando golpe justo al ser agarrado. Los
  botones atajo RODADA y MODO PODER siguen haciendo rodada y Modo Poder aunque
  estés pegado.
- **Pelá:** burla de casi un segundo (René hace pistolitas y se ríe). Al
  empezar dice una de sus frases (globo y voz, sin efectos de sonido); si nadie
  la interrumpe, el rival pierde media barra de súper.
- Los golpes normales se pueden cancelar en especiales y súper si conectan.

### Mecánicas avanzadas

"Débiles juntos" es golpe débil + patada débil (J1: A+Z o C · J2: 7+1 o el
punto · joystick: X+A o LB). "Fuertes juntos" es golpe fuerte + patada fuerte
(J1: S+X o D · J2: 9+3 o + · joystick: Y+B o RB). Juntos significa a la vez o
con muy poca diferencia.

| Mecánica | Cómo | Qué hace |
|---|---|---|
| Cadenas | golpe débil → patada débil → golpe fuerte → patada fuerte, cada uno cuando el anterior conecta (golpe o bloqueo) | Combo de normales. Sirve parado, agachado y en el aire (en el aire, cada botón una vez por salto) |
| Lanzador (René: Gancho) | abajo + golpe fuerte | Si conecta, el rival sale volando hacia arriba. Arriba enseguida: supersalto para seguirlo y rematar con una cadena aérea. René lo hace con un gancho como el de Mortal Kombat |
| Supersalto | abajo y luego arriba rápido | Salto mucho más alto |
| Salto corto | tocar arriba y soltar enseguida | Salto bajo y rápido, para atacar por arriba |
| Rodada | débiles juntos (atrás + débiles: hacia atrás) | Invulnerable a golpes y proyectiles casi toda la rodada; atraviesa al rival. Castigable al final |
| Modo Poder | fuertes juntos (cuesta 1 barra) | 6 segundos de aura: +15% de daño y los especiales se cancelan entre sí |
| Contraataque | bloqueando, adelante + débiles (cuesta 1 barra) | Sale del bloqueo con un golpe invulnerable que aleja al rival |

Los combos aéreos tienen tope: después de varios golpes el rival cae más
rápido y ya no se le puede seguir pegando.

### Combos Killer (estilo Killer Instinct)

Los combos pueden seguir y seguir encadenando especiales y golpes automáticos:

| Paso | Cómo | Qué hace |
|---|---|---|
| Abridor | cualquier especial que pega (solo o al final de una cadena) | Abre la ventana del DOBLE (unos 18 cuadros, más lo que dura el especial) |
| DOBLE | un botón cualquiera, cerca del rival | Dos golpes automáticos con el golpe parado de ese botón, más rápido. Débil: 22 + 22 de daño; fuerte: 34 + 34 (antes del escalado) |
| ENLACE | durante el DOBLE, un especial con el botón débil | Sigue el combo y abre otro DOBLE (hasta 4 DOBLES por combo) |
| REMATE | durante el DOBLE, un especial con el botón fuerte, el súper o el ultra | Cierra el combo: derriba y suma 6 de daño por cada golpe que lleva el combo (tope 120). René grita su frase |
| COMBO BREAKER | recibiendo un DOBLE: débiles juntos contra uno débil, fuertes juntos contra uno fuerte | Rompe el combo: quien pegaba sale despedido y quien lo rompe gana un cuarto de barra |
| BLOQUEO | apretar el breaker con la fuerza equivocada (o fuera de un DOBLE) | 2 segundos sin poder intentar otro breaker ("BLOQUEO" bajo la vida) |

El escalado de daño de siempre sigue valiendo. El súper y el ultra no se pueden
romper. La CPU también hace dobles, enlaces y remates, y rompe combos según la
dificultad (FÁCIL 5%, NORMAL 15%, DIFÍCIL 30%, MUY DIFÍCIL 45% de los dobles,
acertando la fuerza 7 de cada 10 veces).

### Ultra

Con el rival **EN PELIGRO** (25% de vida o menos: su barra parpadea en rojo) y
2 barras, aparece "ULTRA" junto a la barra de súper. René hace **¡TO' YO!**
("to yo, toa la weá yo"): se tira encima y, si conecta, hace todos sus golpes
seguidos solo (26 golpes, el reloj se detiene) y remata con el rival volando.
Hace 388 de daño en total, así que siempre deja K.O. a un rival en peligro. Si
lo bloquean o falla, queda expuesto. En práctica no hace falta que el rival
esté en peligro.

### Nombres de combo

Cuando termina un combo de 3 golpes o más aparece su nombre en grande, con la
voz de quien lo hizo:

| Golpes | Nombre |
|---|---|
| 3 | ¡COMBO WENO! |
| 4 | ¡COMBO BACÁN! |
| 5 | ¡COMBO PULENTO! |
| 6 | ¡COMBO FILETE! |
| 7 | ¡COMBO BRÍGIDO! |
| 8 | ¡COMBO CUÁTICO! |
| 9 | ¡COMBO LA RAJA! |
| 10 | ¡COMBO BESTIAL! |
| 11 | ¡COMBO TERRIBLE! |
| 12 o más | ¡COMBO VIRAL! |
| Con el ultra | ¡ULTRA COMBO! |
| Roto | ¡COMBO BREAKER! |

La tabla está en `src/render/comboNames.ts`.

## Modos

- **1 jugador contra la CPU** (1 VS CPU, o en equipos de dos: 2 VS CPU).
- **Práctica:** el jugador 1 entrena contra un sparring, sin reloj ni K.O.
- **Movimientos:** los especiales, súper, ultra y combos sugeridos de cada luchador
  (los golpes y las mecánicas están en PERSONAJES). Desde la pausa abre en el luchador
  con que estás peleando.
- **Escenarios:** cada escenario a pantalla completa, con su animación y su tema
  musical, sin luchadores. ← → cambia, Esc vuelve.

Peleas al mejor de 3 rounds de 99 segundos.

Antes de pelear se elige luchador (**ELIGE LUCHADOR**): al centro, 8 casillas
con la cara de cada luchador (las que todavía no tienen uno, bloqueadas) y
ALEATORIO; a los lados, en grande, el luchador de cada jugador, en gris mientras
se marca y a color cuando se elige. No se elige color de ropa: si los dos eligen
al mismo luchador, el segundo sale con otra ropa (solo cambia la que dice su
definición, `costume`; la cara, el pelo y las zapatillas quedan igual). En 1 VS CPU
y práctica el jugador 1 elige el suyo y después el rival (CPU o sparring). Esc / Retroceso
vuelve un paso atrás o al menú. Las caras salen de `herramientas/caras.py`. El plantel son los luchadores de
`public/luchadores/` (René, Pablito, el Flaitiano, el Vendedor de Leña y Carlitos Run).

Antes de cada pelea se elige el escenario (**ELIGE ESCENARIO**, o ALEATORIO).
Mientras no se elija uno, los menús y las peleas de prueba usan el primero de
`public/escenarios/escenarios.json` (LA CABAÑA DEL LAGO). El viejo escenario
procedural de prueba ya no aparece en la lista: queda solo como respaldo si la
lista falta o está vacía.

### Dificultad de la CPU

Se elige al empezar el ARCADE, el 1 VS CPU o el 2 VS CPU (**ELIGE LA DIFICULTAD**, con lo
que hace la CPU en cada nivel escrito abajo). Queda guardada en el navegador (por defecto
NORMAL) y la usa también el sparring de práctica en modo CPU. La demo
(CPU contra CPU) siempre juega en NORMAL.

| Nivel | Cómo juega |
|---|---|
| FÁCIL | Reacciona tarde, casi nunca se cubre y pega golpes sueltos; rara vez especiales, nunca súper ni ultra, y a ratos camina sin atacar |
| NORMAL | Se cubre la mitad de las veces, combos cortos, algún especial y súper de vez en cuando |
| DIFÍCIL | Se cubre casi todo, castiga cuando fallas, combos con especiales, salta lejos de los imbloqueables y remata con el ultra |
| MUY DIFÍCIL | Reacciona al instante y no suelta la guardia, castiga casi todo, combos completos y gasta súper y ultra apenas puede |

`npx tsx herramientas/dificultad_sim.ts [semillas]` juega CPU contra CPU sin dibujar y muestra
cuánto le gana cada nivel a los otros (MUY DIFÍCIL le gana a FÁCIL y a NORMAL el 100 %).

### Práctica

Empieza como una pelea ("ROUND 1"… "FIGHT!", con la voz del anunciador). Después
no hay reloj ni fin de round: la vida nunca llega a cero. Las opciones se
cambian con las teclas numéricas (en el celular, con los cuatro botones con íconos
de abajo al centro) y se ven en la barra de abajo:

| Tecla | Opción | Valores |
|---|---|---|
| 1 | Súper infinito | SÍ / NO (la barra de súper del jugador siempre llena) |
| 2 | Sparring | GUARDIA BAJA (brazos abajo, nunca bloquea) / AGACHADO / SALTA / BLOQUEA TODO / BLOQUEA TRAS EL 1ER GOLPE / CPU (con la dificultad elegida) |
| 3 | Vida | SE RECUPERA (se rellena un segundo después de cada combo) / NORMAL (baja, pero nunca hay K.O.) |
| 4 | Reiniciar posición | Los dos vuelven al centro |

Arriba a la izquierda se ven el daño y los golpes del último combo (queda hasta
el siguiente) y el mejor combo de la sesión. La pausa (Esc), la lista de
movimientos, F1 y F2 funcionan igual que en una pelea.

### Transmisión en vivo

El Gran Torneo de Cell vive en los lives, así que la pelea se ve como uno:

- Bajo el reloj, **● EN VIVO** y las **VISTAS**: suben con cada golpe (más con
  combos, súper y K.O.) y bajan de a poco si no pasa nada. Al final del round y
  de la pelea se muestran las vistas.
- Con 2 golpes o más de combo suben corazones desde el lado de quien pega y
  entra su **regalo**: el retrato del luchador, los golpes, el daño y un ícono
  que mejora con el largo del combo (corazón, rosa, corona, cohete).
- Al terminar un combo sale su nombre (ver **Nombres de combo**). Un súper que
  conecta remata con **¡TENDENCIA!**.
- Desde 4 golpes aparecen mensajes del chat (los mismos para la misma semilla).

## Parámetros para pruebas

- `?escena=pelea&modo=cpu` (o `2p`, `practica`, o `demo` para CPU contra
  CPU) entra directo a una pelea. `&semilla=123` fija la semilla y
  `&luchadores=0,1` elige los luchadores (índices del plantel).
- `?qa=1` publica el estado del juego en un elemento oculto del DOM, para
  pruebas automáticas. Comandos (en `#qa-cmd`, uno por línea): `meter:0:300`,
  `health:1:200` e `input:0:6,5*2,6+lk` (entradas forzadas de un lado, un
  cuadro por elemento: dirección de teclado numérico, botones con `+` y `*N`
  para repetir).
- `?escenario=rene-plaza` (un id de la lista) cambia el escenario de la pelea de prueba.
- `?calidad=baja|media|alta|ultra` fuerza los gráficos (`hd` y `liviano` siguen
  sirviendo: son ALTA y MEDIA) y `?tactil=1` muestra los controles de celular.
- Los atajos van en `juego.html` (o en la web, que se los pasa al juego).

## Estructura

```
index.html            la web: pestañas JUGAR (el juego en un iframe) y RANKING (src/web/)
juego.html            el juego
src/
  main.ts             arranque y bucle (lógica a 60 Hz fijos)
  config.ts           constantes (resolución 480x270, tiempos, barras)
  app/                pantalla (capas y escalado), escenas, puente de pruebas
  input/              teclado, joystick y búfer de comandos
  sim/                simulación determinista: luchador, pelea, CPU, tipos de datos
  content/            carga: luchadores, escenarios, efectos, calidades y descargas con barra
  render/             escenario, luchadores, efectos HD, HUD, texto pixel
  audio/              efectos sintetizados, muestras (voces) y música
  scenes/             título, menús (elegir luchador, escenario), cuenta y EN LÍNEA, escenarios y pelea
  online/             cuentas (Supabase: entrar con Google o correo, apodo) y formularios HTML
public/
  escenarios/         escenarios HD (escenarios.json es la lista)
  titulo/             escenario Santiago de noche (escenario.json, también arena de pelea)
  luchadores/<id>/    sprites, definición y voces (voces/voces.json)
  voces/              voces del anunciador
  sonidos/            jingle de consola (ya no se usa)
herramientas/         scripts en Python para armar luchadores, escenarios y sonidos
supabase/migraciones/ tablas y reglas de seguridad de la base de datos (ya aplicadas)
docs/
  FORMATO_SPRITES.md  formato para entregar luchadores definitivos
```

## Aviso

Hecho por fans. No es un producto oficial de ninguna persona, programa ni marca.
