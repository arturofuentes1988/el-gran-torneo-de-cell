# Formato de sprites y datos de luchadores

Este documento explica cómo entregar un luchador definitivo (por ejemplo, con
sprites hechos con IA) para que el motor lo use **sin tocar el código del
motor**. Los luchadores provisorios (Rojo y Azul) se generan por código, pero
producen exactamente este mismo formato.

## 1. Medidas y convenciones

- **Unidades de mundo.** La pantalla mide siempre **480 × 270 unidades**. La
  simulación (posiciones, velocidades, cajas de golpe) trabaja en esas unidades,
  sin importar la resolución.
- **Dibujo en HD.** El mundo se dibuja **S veces más fino** que esas unidades:
  S = 4 en una pantalla de 1920 × 1080 (S va de 2 a 4 según el tamaño real de
  la ventana). Por eso el arte puede tener mucho más detalle que una unidad por pixel.
- **`texScale`**: unidades de mundo por pixel de textura. Ejemplo: un cuadro de
  512 px donde el personaje mide ~470 px, para un luchador de ~150 unidades de
  alto, lleva `texScale` ≈ 150 / 470 ≈ **0,32**. Los provisorios usan 1 (un
  pixel de textura = una unidad, se ven "pixelados").
- **Filtrado** (`texFilter`): `linear` para arte HD (por defecto al cargar desde
  archivos, con mipmaps) y `nearest` para pixel art a escala de mundo.
- Un luchador de pie mide **unos 150 a 160 unidades** de alto.
- Todos los sprites se dibujan **mirando a la derecha**. El motor los espeja
  cuando miran a la izquierda.
- El **anchor** de cada cuadro (en la textura, de 0 a 1) apunta **a los pies**
  (centro entre ambos pies, sobre el suelo).
- **Cajas** (hurt, hit, push): siempre en **unidades de mundo**, relativas a los
  pies, `x` positivo hacia adelante e `y` **negativo hacia arriba**. No dependen
  de la resolución de la textura.
- El tiempo se mide en **cuadros de simulación**: 60 por segundo.

## 2. Atlas de texturas (PNG + JSON)

Un PNG con los cuadros y un JSON en el formato de *spritesheet* de PixiJS (el
mismo que exportan TexturePacker o Aseprite en modo "JSON Hash"). Puede haber
**varios atlas por luchador** (por ejemplo, uno por animación). Cada cuadro
debe traer `anchor` apuntando a los pies:

```json
{
  "frames": {
    "rene/idle/0": {
      "frame": { "x": 0, "y": 0, "w": 512, "h": 512 },
      "sourceSize": { "w": 512, "h": 512 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 512, "h": 512 },
      "anchor": { "x": 0.48, "y": 0.96 }
    }
  },
  "meta": { "image": "rene-idle.png", "size": { "w": 2560, "h": 2560 }, "scale": "1" }
}
```

Los nombres de cuadro son libres; se recomienda `id/animación/número`.
Proyectiles, efectos y retratos van en los mismos atlas o en otros, con el
mismo formato. Tamaño máximo recomendado por imagen: 4096 × 4096 px.

## 3. Definición del luchador (`FighterDef` en JSON)

La fuente oficial de los tipos es `src/sim/types.ts`. Campos principales:

| Campo | Qué es |
|---|---|
| `id`, `name` | Identificador y nombre visible. |
| `texScale` | Unidades de mundo por pixel de textura (ver sección 1). Por defecto 1. |
| `texFilter` | `linear` (arte HD, por defecto al cargar) o `nearest` (pixel art a escala de mundo). |
| `health` | Vida (los provisorios usan 1000). |
| `walkF`, `walkB` | Velocidad al caminar adelante / atrás (unidades por cuadro). |
| `jump` | `{ vy, vx, gravity }` del salto. |
| `push` | Cajas de empuje `stand`, `crouch` y `air`. |
| `anims` | Animaciones (ver abajo). |
| `moves` | Movimientos: normales, especiales, súper y agarre. |
| `normals` | Qué movimiento sale con cada botón (`lp`, `hp`, `lk`, `hk`) parado, agachado y en el aire. |
| `specials` | Ids de especiales, súper y ultra (opcional), en orden de prioridad. **2 o 3 especiales + 1 súper.** |
| `throwMove`, `throwRange`, `throwDamage` | Agarre. |
| `projectiles` | Proyectiles que lanza. |
| `sounds` | Sonidos propios, definidos como datos (ver sección 6). |
| `ui` | `{ color, fx }`: color del luchador y de sus efectos. |
| `taunts` | Frases de la pelá: texto (`"¡DICEN!"`) o `{ "text": "¿QUERÍ TOO?", "voice": "voz/queriToo" }` con la voz propia que dice esa frase. Al empezar la burla se elige una (con la semilla de la pelea), sale el globo y suena su voz. |

Un especial puede tener versión débil y fuerte (dos movimientos con el mismo
`name`, por ejemplo `bolaL` y `bolaH`); cuenta como un solo especial.

### Animaciones obligatorias

`idle`, `walkF`, `walkB`, `crouchDown`, `crouch`, `crouchUp`, `preJump`,
`jumpUp`, `jumpTop`, `jumpFall`, `land`, `blockStand`, `blockCrouch`,
`hitHigh`, `hitLow`, `hitCrouch`, `airHit`, `fall`, `knockdown`, `getup`,
`throwGrab`, `throwToss`, `taunt`, `win`, `lose`, `intro`.

Además, una animación por cada movimiento (el campo `anim` del movimiento).

### Cuadros de animación

```json
{
  "tex": "rene/sHP/2",
  "dur": 3,
  "hurt": [{ "x": -14, "y": -150, "w": 28, "h": 30 }, { "x": -16, "y": -122, "w": 34, "h": 56 }],
  "hit": [{ "x": 40, "y": -128, "w": 26, "h": 16, "group": 0 }],
  "move": 2,
  "vel": { "x": 1.5 },
  "invuln": false,
  "spawn": "bola",
  "sfx": "superSuelta",
  "airborne": false
}
```

- `hurt`: zonas donde lo pueden golpear. Si un cuadro no las trae, se usan las del anterior.
- `hit`: zonas que golpean (solo en los cuadros activos). `group` numera los golpes de un
  movimiento de varios golpes: cada grupo conecta una sola vez.
- El arranque, los cuadros activos y la recuperación salen de las duraciones: por
  ejemplo, `dur` 2+2 sin `hit`, luego 2 con `hit`, luego 3+4 sin `hit` es un golpe de
  4 cuadros de arranque, 2 activos y 7 de recuperación.
- `move` / `vel`: desplazamiento o velocidad hacia adelante al entrar al cuadro.
- `airborne`: el luchador despega (con `vel.y` negativo); `gravity` la cambia mientras dura el cuadro.
- `spawn`: lanza el proyectil con ese id. `sfx`: hace sonar un sonido (primero se busca en
  los `sounds` del luchador, luego en los sonidos genéricos del juego).

### Movimientos

```json
{
  "name": "Gancho Volador",
  "anim": "dp",
  "kind": "special",
  "stance": "stand",
  "hit": { "damage": 60, "chip": 10, "hitstun": 20, "blockstun": 18, "hitstop": 10,
           "guard": "mid", "launch": { "vx": 1.2, "vy": -7.5 } },
  "motion": "dp",
  "buttons": ["lp", "hp"],
  "easy": "forward",
  "endsInAir": true,
  "landRecovery": 16,
  "cancelInto": ["super"]
}
```

- `kind`: `normal`, `special`, `super`, `ultra` (ver sección 4) o `throw`.
- `motion`: `qcf` (abajo, diagonal, adelante), `qcb` (abajo, diagonal, atrás),
  `dp` (adelante, abajo, diagonal), `qcf2` (dos veces abajo-adelante), `charge`
  (cargar atrás y luego adelante) o `ff` (adelante, adelante: hay que soltar →
  entre los dos toques; caminar manteniendo → no cuenta).
- Combos Killer: el DOBLE no se define; el juego lo arma solo con el normal
  parado de cada botón (necesita cuadros activos). Un especial con botón débil
  hace de ENLACE y con botón fuerte de REMATE, así que conviene que los
  especiales tengan las dos fuerzas en `buttons`.
- `easy`: dirección del modo fácil con el botón especial (`neutral`, `forward`, `back`, `down`).
- `guard`: `mid` (se bloquea parado o agachado), `low` (solo agachado), `high` (solo parado).
- `cancelInto`: en qué se puede cancelar si el golpe conecta.

## 4. Súper con cinemática

El súper lleva `cinematic`. Antes de su animación, el juego se congela,
oscurece el escenario y pasa un cartel con el nombre del luchador, el nombre
del súper y su retrato (mientras no haya retrato se muestra la silueta).

```json
"super": {
  "name": "SÚPER BOLA DE FUEGO",
  "anim": "super",
  "kind": "super",
  "stance": "stand",
  "hit": { "damage": 0, "hitstun": 0, "blockstun": 0 },
  "motion": "qcf2",
  "buttons": ["lp", "hp"],
  "easy": "down",
  "meterCost": 100,
  "cinematic": { "freeze": 60, "color": 16742954, "sound": "superCarga",
                 "portrait": "rene/retrato", "portraitScale": 0.12 }
}
```

- `freeze`: cuadros que dura la cinemática.
- `sound`: clave en `sounds`; suena al empezar la cinemática.
- `portrait`: textura del retrato (opcional, de cualquier resolución). Se apoya en
  el borde de abajo del cartel (la banda mide 64 unidades de alto).
- `portraitScale`: unidades de mundo por pixel del retrato. Si falta, el retrato se
  ajusta solo a 1,2 veces el alto de la banda.
- Sin retrato se usa la silueta del luchador al doble de tamaño (respeta `texScale`).
- `lights`: `"disco"` llena el escenario de luces de discoteca mientras dura el súper.
- `song`: voz propia del luchador (`"voz/shipitia"`) con un pedazo de canción que
  suena al empezar el súper, por el canal de voz del luchador (sección 12).
- El primer cuadro de la animación del súper se ve durante todo el congelamiento.

### Ultra (opcional)

Un movimiento `kind: "ultra"` es un "Ultra Combo" como el de Killer Instinct:
sale donde sale el súper (de neutro o cancelando), cuesta `meterCost` (por
defecto 200) y solo con el rival **en peligro** (`ultra.danger`, por defecto 25%
de vida; en práctica no se pide). Lleva `cinematic` como el súper (el cartel
dice ULTRA). Su `anim` es el arranque: si conecta de golpe, el rival queda
pegado al frente y corre la secuencia sola, sin escalado de daño. La voz
`voz/ultra` suena al activarlo.

```json
"ultra": {
  "name": "¡TO' YO!", "anim": "ultra", "kind": "ultra", "stance": "stand",
  "hit": { "damage": 20, "hitstun": 30, "blockstun": 16, "hitstop": 8 },
  "motion": "qcf2", "buttons": ["lk", "hk"], "meterCost": 200,
  "cinematic": { "freeze": 70, "color": 16734778, "sound": "superCarga", "portrait": "rene/retrato" },
  "ultra": {
    "danger": 0.25, "speed": 1.25, "damage": 12, "distance": 52,
    "final": { "damage": 80, "launch": { "vx": 3.4, "vy": -8 } },
    "sequence": [ { "anim": "queriToo", "hits": 5 }, { "anim": "sLP", "hits": 1 }, { "anim": "super", "hits": 6 } ]
  }
}
```

- `sequence`: animaciones del luchador en orden. Cada tramo da `hits` golpes: en
  el primer cuadro de cada golpe de esa animación o, si no tiene (proyectil,
  súper), repartidos desde el cuadro que lanza. Los proyectiles que lance la
  animación solo se ven. Los desplazamientos (`vel`, `move`) se ignoran.
- `damage`: daño de cada golpe; `final`: el último golpe (lanza al rival y, si
  se acaba la vida, K.O.). Nadie cae antes del golpe final.
- `speed`: velocidad de las animaciones (1.25 = 25% más rápido); `distance`:
  a cuántas unidades queda pegado el rival.
- `voice` (por tramo, opcional): voz propia que suena al empezar ese tramo
  (`"voz/ultra-1"`). Dentro del ultra las frases van en fila (una espera a que
  termine la anterior), así se llena de frases sin que se pisen.

Las voces de un luchador nunca suenan dos a la vez: la de un poder nuevo corta a
la que venía sonando (se oye la del último poder), las de los tramos del ultra
esperan su turno y la frase automática del final de un combo solo suena si el
luchador está callado.

## 5. Proyectiles

```json
"bola": {
  "frames": ["rene/bola/0", "rene/bola/1"], "frameDur": 4, "texScale": 0.3, "speed": 4.5,
  "box": { "x": -12, "y": -9, "w": 22, "h": 18 },
  "hits": 1, "life": 260,
  "hit": { "damage": 70, "chip": 12, "hitstun": 18, "blockstun": 16 },
  "offset": { "x": 60, "y": -108 },
  "glow": 16742954, "glowSize": 26, "strength": 1
}
```

`texScale` funciona igual que en el luchador (por defecto 1). `box` y `offset`
van en unidades de mundo; `box` es relativa al centro del proyectil (el anchor
de la textura). Con `hits` mayor que 1 y `hitInterval`, golpea varias veces;
`finalHit` cambia las propiedades del último golpe; `slowOnHit` lo frena
mientras golpea.

## 6. Sonidos como datos (`SoundSpec`)

Los sonidos propios no son archivos: se describen con capas de osciladores y
ruido, y el juego los sintetiza al cargar.

```json
"sounds": {
  "superCarga": {
    "layers": [
      { "wave": "saw", "freq": [90, 420], "dur": 0.95, "attack": 0.05, "decay": 0.8,
        "vol": 0.35, "vibrato": [7, 0.03], "lowpass": [400, 4200] },
      { "wave": "noise", "freq": [300, 5200], "dur": 0.95, "attack": 0.6, "decay": 2, "vol": 0.35 }
    ],
    "echo": { "delay": 0.08, "feedback": 0.3, "mix": 0.3 },
    "drive": 1.2
  }
}
```

- `wave`: `sin`, `square`, `saw`, `triangle` o `noise`.
- `freq`: frecuencia inicial y final en Hz (en el ruido es el corte del filtro).
- `start`, `dur`, `attack` en segundos; `decay` es la velocidad de caída.
- Opcionales: `vibrato`, `lowpass`, `echo`, `drive` (saturación), `volume`.

## 7. Cómo se carga

`src/content/loadFighter.ts` tiene `loadFighter(atlas, definicionJson)`, donde
`atlas` es la ruta de un JSON de atlas o una lista de rutas. Lee la definición,
carga los atlas con el filtrado de `texFilter`, valida todo (`validateFighter`)
y devuelve `{ def, textures }`, el mismo objeto que generan los provisorios en
`src/content/mannequin/fighters.ts`. Para cambiar un luchador basta con pasar
ese objeto al juego en lugar del provisorio.

## 8. De una hoja de AutoSprite a una animación

AutoSprite (Higgsfield) anima una imagen del personaje y entrega una hoja PNG
con N cuadros de igual tamaño (por ejemplo, 25 cuadros de 512 × 512 en una
grilla de 5 × 5), fondo transparente y, opcionalmente, los rectángulos de cada
cuadro. Cada hoja se convierte en **un atlas** y en **una animación**:

1. **Atlas:** una entrada por cuadro (`rene/sHP/0` … `rene/sHP/24`) con su
   rectángulo `frame`. La cámara de AutoSprite es fija y todas las animaciones
   salen de la misma imagen maestra, así que el **mismo `anchor`** (los pies en
   la pose neutra: la fila más baja con pixeles opacos y el punto medio entre los
   pies, dividido por el ancho y alto del cuadro) sirve para todos los cuadros.
2. **`texScale`:** alto deseado en unidades (~150) dividido por el alto del
   personaje en pixeles dentro del cuadro. Se define una vez por luchador.
3. **Tiempos:** los cuadros no tienen duración propia; se eligen en la
   animación. 25 cuadros con `dur` 2 duran 50 cuadros de simulación (0,83 s). Se
   pueden saltar cuadros para acelerar. En un golpe se marca qué cuadros son de
   arranque, cuáles llevan `hit` (activos) y cuáles son de recuperación.
4. **Cajas:** `hurt` y `hit` en unidades de mundo, relativas a los pies. Se
   revisan en el juego con **F1** (muestra las cajas) y **F2** (estado y cuadro).
5. **Ciclos:** `idle` y `walkF`/`walkB` llevan `"loop": true`; conviene que el
   último cuadro empalme con el primero.

```json
"sHP": {
  "frames": [
    { "tex": "rene/sHP/0", "dur": 2, "hurt": [{ "x": -18, "y": -150, "w": 36, "h": 150 }] },
    { "tex": "rene/sHP/3", "dur": 2 },
    { "tex": "rene/sHP/6", "dur": 3, "hit": [{ "x": 30, "y": -125, "w": 40, "h": 18 }] },
    { "tex": "rene/sHP/10", "dur": 4 },
    { "tex": "rene/sHP/16", "dur": 4 },
    { "tex": "rene/sHP/24", "dur": 3 }
  ]
}
```

## 9. Escenarios HD

Un escenario es un JSON (`StageDef`, en `src/render/stage.ts`) con capas de
imágenes de atrás hacia adelante, todas detrás de los luchadores. Las rutas de
las imágenes son relativas al JSON.

Los escenarios que aparecen en la pantalla ELIGE ESCENARIO (antes de cada pelea)
se listan en `public/escenarios/escenarios.json`, con rutas relativas a ese archivo.
El primero de la lista es el de los menús y las peleas de prueba hasta que se
elija otro. El escenario procedural de prueba solo aparece si la lista falta o
está vacía. Cada escenario se carga recién al elegirlo y queda en caché:

```json
[
  { "id": "rene", "nombre": "BATALLA DE RAP", "luchador": "rene",
    "json": "rene/escenario.json", "miniatura": "rene/miniatura.webp" }
]
```

`miniatura`: imagen 16:9 de unos 480x270 px. `luchador`: id del dueño (en la
pantalla sale "ESCENARIO DE …"). Para probar uno directo en la URL:
`?escena=pelea&modo=cpu&escenario=rene` (id de la lista) o
`?escenario=ruta/escenario.json`.

```json
{
  "id": "feria",
  "name": "Feria libre",
  "filter": "linear",
  "layers": [
    { "src": "cielo.png", "scale": 0.25, "parallax": [0, 0.2], "top": -390, "repeatX": true, "scrollX": 0.05 },
    { "src": "fondo.png", "scale": 0.25, "parallax": [0.4, 0.6], "top": -250 },
    { "frames": ["publico-0.png", "publico-1.png"], "frameDur": 12, "scale": 0.25, "parallax": [0.8, 0.9], "top": -150 },
    { "src": "piso.png", "scale": 0.25, "parallax": [1, 1], "top": -100 },
    { "src": "luces.png", "scale": 0.25, "parallax": [1, 1], "top": -260, "additive": true, "alpha": 0.7 }
  ]
}
```

- `scale`: unidades de mundo por pixel de imagen. Con 0,25 una imagen de 1920 px
  de ancho cubre una pantalla (480 unidades) con detalle completo en 1080p.
- `parallax`: `[horizontal, vertical]`; 0 = fija en pantalla, 1 = se mueve con el piso.
  El escenario mide 960 unidades de ancho: una capa con paralaje 1 debe medir
  960 unidades (3840 px con `scale` 0,25).
- `top`: y de mundo del borde superior (0 = suelo). `left`: x en pantalla del borde
  izquierdo con la cámara en el extremo izquierdo (por defecto 0).
- `repeatX` repite la imagen a lo ancho; `scrollX` la desplaza sola (nubes, humo).
- `frames` + `frameDur`: capa animada. `additive` y `alpha`: luces y brillos.
- `floor: { "strips": 64 }`: piso con perspectiva (el "line scroll" de los arcades).
  La imagen se dibuja en franjas horizontales: el paralaje va de `parallax[0]` en el
  borde superior a 1 en el suelo (y = 0) y sigue creciendo hacia abajo. Cada franja
  se estira lo justo para cubrir el recorrido de la cámara, y con la cámara al centro
  la imagen queda centrada. El borde superior del piso calza con un fondo del mismo
  paralaje.
- `pulse: { "min", "max", "period", "shape": "beat" | "sine", "flicker", "phase" }`:
  luz que late (el alpha va de `min` a `max` cada `period` cuadros). `beat` es golpe
  y caída, para luces al ritmo de una canción (100 bpm = 36 cuadros).
- `video: "fondo.mp4"`: capa de video en loop (H.264, sin sonido), en lugar de `src`.
  Va encima de la imagen fija del fondo, que queda de respaldo mientras carga. El
  video se pausa solo cuando el escenario no se está dibujando. Para que el loop no
  se note, se genera con la misma imagen como primer y último cuadro (MiniMax H3,
  2K, 21:9, 5 s, ~10 créditos) y cámara fija.
- `particles` (en el StageDef, no en una capa): polvo, lluvia, nieve o brasas
  detrás de los luchadores: `{ "type", "count", "color", "alpha", "size",
  "band": [arriba, abajo], "parallax" }`.
- `music` (en el StageDef): tema del escenario, clave de `public/musica/musica.json`
  (ej. `"rene-plaza"`). En `herramientas/armar_escenario.py` va como `"musica"`.

### Desde una imagen panorámica

`herramientas/armar_escenario.py arte/escenarios/<luchador>/<armado>.json` toma
una imagen 21:9 (Nano Banana Pro en 4K) y escribe todo en `public/escenarios/<id>/`:
el fondo con paralaje 0,7, el piso en franjas, las luces de la imagen como capas
que laten (máscaras por brillo y saturación), una bruma que se desplaza, las
partículas, la miniatura, y la entrada en `escenarios.json`. Se ajustan
`corte_suelo` (dónde empieza el piso: bajo la base de lo que está atrás) y `pies`
(dónde pisan los luchadores). Ver `arte/escenarios/rene/puente.json` y
los prompts en `arte/escenarios/prompts.md`.

## 10. Efectos HD

La capa de efectos (`src/render/fx.ts`) puede reproducir animaciones con
texturas propias de cualquier resolución, por ejemplo impactos dibujados con IA:

```ts
fx.playSheet(cuadros, x, y, { scale: 0.3, frameDur: 2, additive: true });
```

Las coordenadas son de mundo; `scale` es unidades por pixel de textura; con
`additive` el efecto pasa por el bloom.

## 11. Voces del anunciador

Las voces ("Round one", "Fight!", "K.O."…) son muestras de audio listadas en
`public/voces/voces.json`, con rutas relativas a ese archivo. Se cargan al
iniciar (si el archivo no existe, el juego queda sin voces) y suenan por su
propio canal: más fuertes y bajando un poco los demás efectos mientras hablan.

```json
{ "voz/round1": "round1.mp3", "voz/fight": "fight.mp3", "voz/ko": "ko.mp3" }
```

Nombres que usa la pelea (`src/audio/announcer.ts`): `voz/round1` a `voz/round4`,
`voz/final`, `voz/fight`, `voz/ko`, `voz/doubleKo`, `voz/perfect`, `voz/time`,
`voz/draw` y `voz/winner`.

El fondo de la pantalla de título es un escenario más (mismo formato) en
`public/titulo/escenario.json`, fuera de la lista. Si no existe, el título usa
el primer escenario de la lista.

## 12. Voces de los luchadores

Cada luchador cargado desde su carpeta puede tener voces propias (frases
reales) en `public/luchadores/<id>/voces/voces.json`, con rutas relativas a ese
archivo. Las claves empiezan con `voz/`; el valor es un archivo o una lista de
archivos (variantes: cada vez suena una al azar). Se cargan como
`<id>/voz/<clave>` (por ejemplo `rene/voz/queriToo`) y suenan por el canal de
voz, igual que el anunciador. Si el archivo o una clave falta, no suena nada.

```json
{
  "voz/queriToo": ["queri-too-1.mp3", "queri-too-2.mp3", "queri-too-3.mp3"],
  "voz/remate": "toy-de-campeon.mp3"
}
```

Claves que emite el juego (con el luchador que habla): `voz/queriToo` (al
empezar ¿Querí too?), `voz/viral` (El parlante), `voz/remate` (cuando conecta un
REMATE), `voz/ultra` (al activar el ultra), las voces de las frases de la pelá
(`taunts`, sección 3), `voz/victoria`
(pose de victoria), `voz/poder` (al activar el Modo Poder), `voz/risa` (cuando el rival queda BLOQUEADO por un COMBO
BREAKER equivocado), las de los tramos del ultra (`voice`) y la canción del súper
(`cinematic.song`) y, al terminar un combo de 3 golpes o más, `voz/combo-corto`
(3–4), `voz/combo-medio` (5–7), `voz/combo-largo` (8–11), `voz/combo-viral` (12 o
más) y `voz/combo-ultra` (ultra). Un cuadro de animación también puede pedir una
voz con `"sfx": "voz/<clave>"`.
