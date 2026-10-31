// Formato de datos de los luchadores. Todo es serializable a JSON: los
// luchadores provisorios lo generan en código y los definitivos (hojas de
// sprites hechas con IA) lo cargarán desde archivos. Ver docs/FORMATO_SPRITES.md.

/** Botones de ataque. */
export type Btn = 'lp' | 'hp' | 'lk' | 'hk';
export const ATTACK_BUTTONS: readonly Btn[] = ['lp', 'hp', 'lk', 'hk'];

/**
 * Caja relativa a los pies del luchador, mirando a la derecha.
 * x hacia adelante, y negativa hacia arriba. Unidades de mundo (la pantalla
 * mide 480x270 unidades, sin importar la resolución de dibujo).
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** mid: se bloquea parado o agachado; low: solo agachado; high: solo parado (aéreos). */
export type GuardType = 'mid' | 'low' | 'high' | 'unblockable';
export type SparkKind = 'light' | 'heavy' | 'super';

export interface HitProps {
  damage: number;
  /** Daño al bloquear (solo especiales y súper). */
  chip?: number;
  hitstun: number;
  blockstun: number;
  /** Congelamiento de impacto, en cuadros. */
  hitstop?: number;
  guard?: GuardType;
  /** Distancia total de empuje, en pixeles. */
  pushback?: number;
  /** Si existe, el golpe manda al rival por el aire (vx hacia adelante del atacante). */
  launch?: { vx: number; vy: number };
  /** Golpe en el suelo que derriba (barrida). */
  knockdown?: boolean;
  /** Súper que gana el atacante. */
  meter?: number;
  spark?: SparkKind;
  /** Agarre: no le pega a un rival en el aire (se combina con guard 'unblockable'). */
  groundOnly?: boolean;
}

export interface HitboxDef extends Box {
  /** Índice de golpe dentro del movimiento: cada grupo conecta una sola vez. */
  group?: number;
  /** Propiedades que reemplazan las del movimiento para este golpe. */
  props?: Partial<HitProps>;
}

/** Un cuadro de animación. */
export interface FrameDef {
  /** Nombre de la textura en el atlas. */
  tex: string;
  /** Duración en cuadros de simulación (60 por segundo). */
  dur: number;
  /** Zonas donde se puede recibir golpes. Si falta, se reutilizan las del cuadro anterior. */
  hurt?: Box[];
  /** Zonas que golpean (solo en cuadros activos). */
  hit?: HitboxDef[];
  /** Caja de empuje (opcional, reemplaza la del estado). */
  push?: Box;
  /** Desplazamiento hacia adelante al entrar al cuadro. */
  move?: number;
  /** Fija la velocidad al entrar al cuadro (x hacia adelante). */
  vel?: { x?: number; y?: number };
  /** Invulnerable a golpes y proyectiles. */
  invuln?: boolean;
  throwInvuln?: boolean;
  /** Lanza un proyectil (id de FighterDef.projectiles) al entrar al cuadro. */
  spawn?: string;
  /** Sonido al entrar al cuadro. */
  sfx?: string;
  /** El luchador despega del suelo en este cuadro. */
  airborne?: boolean;
  /** Gravedad mientras dura el cuadro (por defecto la del salto). */
  gravity?: number;
  /** Interno (lo arma el motor): golpes programados de la secuencia del ultra al entrar al cuadro. */
  ultraHit?: number;
}

export interface AnimDef {
  frames: FrameDef[];
  loop?: boolean;
}

/** Una capa de sonido sintetizado (oscilador o ruido con envolvente). */
export interface SoundLayer {
  wave: 'sin' | 'square' | 'saw' | 'triangle' | 'noise';
  /** Frecuencia inicial y final en Hz (barrido exponencial). En el ruido es el corte del filtro. */
  freq: [number, number];
  /** Inicio y duración en segundos. */
  start?: number;
  dur: number;
  /** Ataque en segundos y velocidad de caída exponencial (más alto = más corto). */
  attack?: number;
  decay?: number;
  vol?: number;
  /** Vibrato: [frecuencia en Hz, profundidad 0..1]. */
  vibrato?: [number, number];
  /** Filtro paso bajo: corte inicial y final en Hz. */
  lowpass?: [number, number];
  seed?: number;
}

/** Sonido definido como datos: el motor lo sintetiza al cargar. */
export interface SoundSpec {
  layers: SoundLayer[];
  /** Saturación (0 = limpio). */
  drive?: number;
  echo?: { delay: number; feedback: number; mix: number };
  volume?: number;
}

/** Cinemática del súper: congelamiento, fondo oscuro y cartel con el luchador. */
export interface SuperCinematic {
  /** Cuadros de congelamiento con el cartel. */
  freeze: number;
  /** Color del cartel y del destello. */
  color: number;
  /** Sonido propio del súper (clave de FighterDef.sounds). */
  sound: string;
  /** Textura del retrato; si falta, se usa la silueta del luchador. */
  portrait?: string;
  /** Unidades de mundo por pixel del retrato (si falta, se ajusta al alto del cartel). */
  portraitScale?: number;
  /**
   * Show de luces mientras dura el súper: 'disco' = bola de espejos, focos y manchas de color al
   * ritmo; 'tormenta' = cielo oscuro, lluvia y relámpagos; 'ultrainstinto' = pantalla oscura,
   * aura plateada y destellos (el Vendedor de Leña); 'fiesta' = focos de colores, confeti y fuegos artificiales.
   */
  lights?: LightsKind;
  /** Escenario que reemplaza al de la pelea mientras dura (ej. el ultra en otro lugar): id de escenario. */
  backdrop?: string;
  /** Pedazo de canción que suena con el súper: voz propia del luchador ("voz/…"). */
  song?: string;
}

/**
 * ff: adelante, adelante (→ →). bf: atrás, adelante (← →, sin cargar). fbf: → ← → (sin cargar).
 * hcf: media vuelta hacia adelante, una U (← ↙ ↓ ↘ →). hcb: media vuelta hacia atrás (→ ↘ ↓ ↙ ←).
 * mash: machacar el botón (varias veces seguidas). hold: mantener el botón apretado medio
 * segundo y soltarlo. chargeSuper: cargar atrás y luego → ← →.
 */
/** Show de luces de un súper (ver CinematicDef.lights). */
export type LightsKind = 'disco' | 'tormenta' | 'ultrainstinto' | 'fiesta' | 'neon';

export type MotionId =
  | 'qcf' | 'qcb' | 'dp' | 'qcf2' | 'hcf' | 'hcb' | 'charge' | 'ff' | 'bb' | 'dd' | 'bf' | 'fbf' | 'mash' | 'hold' | 'chargeSuper';
export type MoveKind = 'normal' | 'special' | 'super' | 'ultra' | 'throw';

/** Un tramo de la secuencia automática del ultra: una animación del luchador y cuántos golpes da. */
export interface UltraStep {
  /** Animación (clave de FighterDef.anims). */
  anim: string;
  /** Golpes de este tramo: caen en los cuadros activos de la animación o, si no tiene, repartidos. */
  hits: number;
  /** Velocidad de la animación (por defecto la de UltraDef.speed). */
  speed?: number;
  /** Voz del luchador al empezar el tramo ("voz/…"): las frases van en fila, sin pisarse. */
  voice?: string;
}

/**
 * Ultra (estilo "Ultra Combo" de Killer Instinct). El arranque es la animación
 * del movimiento; si conecta de golpe, el rival queda pegado al frente y la
 * secuencia corre sola. Sin escalado de daño.
 */
export interface UltraDef {
  /** Vida del rival (fracción) desde la que se puede hacer: rival EN PELIGRO. En práctica no se pide. Por defecto 0.25. */
  danger?: number;
  /** Tramos de la secuencia, en orden. */
  sequence: UltraStep[];
  /** Daño de cada golpe de la secuencia. */
  damage: number;
  /** Último golpe: daño y hacia dónde sale volando el rival. */
  final: { damage: number; launch: { vx: number; vy: number } };
  /** Velocidad de toda la secuencia (por defecto 1.25). */
  speed?: number;
  /** Distancia a la que queda el rival pegado, en unidades (por defecto 42). */
  distance?: number;
}
/** Dirección del viejo modo fácil (botón especial + dirección). Ya no hay botón especial: se ignora. */
export type EasyDir = 'neutral' | 'forward' | 'back' | 'down';
export type Stance = 'stand' | 'crouch' | 'air';

export interface MoveDef {
  /** Nombre visible (en español). */
  name: string;
  anim: string;
  kind: MoveKind;
  stance: Stance;
  hit: HitProps;
  cancelInto?: Array<'special' | 'super'>;
  motion?: MotionId;
  /** Botones que activan el especial junto al movimiento. */
  buttons?: Btn[];
  /** @deprecated Ya no hay botón de especial fácil: especiales y súper solo con su movimiento. Se ignora. */
  easy?: EasyDir;
  meterCost?: number;
  /** Proyectil que lanza: si ya hay uno propio en pantalla, no se puede repetir. */
  projectile?: string;
  /** Cuadros de recuperación al aterrizar. */
  landRecovery?: number;
  /** El movimiento termina en el aire y el luchador cae hasta aterrizar. */
  endsInAir?: boolean;
  /** Súper y ultra: cinemática antes de su animación. */
  cinematic?: SuperCinematic;
  /** Solo ultra: la secuencia automática (ver UltraDef). */
  ultra?: UltraDef;
  /** Agarre: si al llegar al cuadro `at` no conectó, salta al cuadro `to` (la recuperación). */
  whiffTo?: { at: number; to: number };
  /** Letras de cómic que salen en cada golpe que conecta, en orden (ej. "¡TOC!"). */
  hitText?: string[];
  /** Dibujo encima de la cabeza del rival mientras dura el movimiento (ej. 'tarro'). */
  hitOverlay?: string;
}

export interface ProjectileDef {
  frames: string[];
  frameDur: number;
  /** Unidades de mundo por pixel de textura (1 = pixel art a escala de mundo; ~0.3 para arte HD). */
  texScale?: number;
  /** Pixeles por cuadro. */
  speed: number;
  /** Caja relativa al centro del proyectil. */
  box: Box;
  hits: number;
  hitInterval?: number;
  life: number;
  hit: HitProps;
  /** Propiedades del último golpe (ej: lanzar al rival). */
  finalHit?: Partial<HitProps>;
  /** Punto de aparición relativo a los pies, mirando a la derecha. */
  offset: { x: number; y: number };
  /** Color y tamaño del brillo en la capa de efectos HD. */
  glow: number;
  glowSize: number;
  /** Prioridad al chocar con otro proyectil. */
  strength: number;
  /** Factor de velocidad mientras está golpeando (súper multigolpe). */
  slowOnHit?: number;
  /**
   * 'opponent': aparece donde está el rival (en el suelo bajo él, más offset.y) en vez de
   * delante del que lo lanza; offset.x se suma hacia adelante. Para rayos y remolinos.
   */
  at?: 'opponent';
  /** Cuadros de aviso antes de que pueda golpear (el rayo que va a caer). */
  delay?: number;
  /**
   * Dibujo propio en vez de (o además de) sus cuadros: 'rayo', 'tornado', 'rastas', 'geiser' (el Flaitiano);
   * 'silbido', 'tronco', 'troncos', 'sonico' (el Vendedor de Leña); 'cola', 'cajon', 'letras' (Carlitos).
   * Usa los efectos pintados compartidos (public/efectos/) si están cargados.
   */
  look?: string;
  /** 'add': sus cuadros brillan (mezcla aditiva; para los efectos de video sin fondo, vfx/…). */
  blend?: 'add';
  /** Sus cuadros miran al revés (la onda de René: la cola de ondas queda detrás). */
  flip?: boolean;
}

/** Filtrado de las texturas: 'linear' para arte HD, 'nearest' para pixel art a escala de mundo. */
export type TexFilter = 'linear' | 'nearest';

/**
 * Ajustes opcionales de las mecánicas avanzadas. Todo tiene valores por
 * defecto: un luchador sin este bloque igual tiene cadenas, lanzador,
 * supersalto, salto corto, rodada, Modo Poder y contraataque.
 */
export interface MechanicsDef {
  /** Cadenas de normales débil → fuerte al conectar (suelo y aire). Por defecto true. */
  chains?: boolean;
  /** Movimiento lanzador (id de moves). Por defecto el golpe fuerte agachado; '' lo desactiva. */
  launcher?: string;
  /** Velocidad con que el lanzador manda al rival hacia arriba (por defecto vx 0.5, vy -9.6). */
  launchVel?: { vx: number; vy: number };
  /** Supersalto: abajo y luego arriba rápido, o arriba tras un lanzador que conecta. */
  superJump?: { vy: number; vx: number };
  /** Salto corto: tocar arriba y soltar antes de despegar. */
  shortHop?: { vy: number; vx: number };
  /** Rodada (golpe débil + patada débil). frames: duración total; invuln: cuadros invulnerables. */
  roll?: { speed?: number; frames?: number; invuln?: number };
  /** Modo Poder (golpe fuerte + patada fuerte). duration en cuadros; damage: multiplicador. */
  powerMode?: { cost?: number; duration?: number; damage?: number };
  /** Contraataque desde el bloqueo (adelante + golpe débil + patada débil). move: id cuya animación se usa. */
  guardCancel?: { move?: string; cost?: number; damage?: number };
}

export interface FighterDef {
  id: string;
  name: string;
  /**
   * Unidades de mundo por pixel de textura. 1 = un pixel del sprite es una
   * unidad de mundo (provisorios); ~0.32 para cuadros de 512 px de un luchador
   * de ~155 unidades de alto. Las cajas siguen en unidades de mundo y los
   * anchors en la textura. Por defecto 1.
   */
  texScale?: number;
  /** Filtrado de las texturas del luchador (por defecto 'linear' al cargar desde archivos). */
  texFilter?: TexFilter;
  health: number;
  walkF: number;
  walkB: number;
  jump: { vy: number; vx: number; gravity: number };
  push: { stand: Box; crouch: Box; air: Box };
  anims: Record<string, AnimDef>;
  moves: Record<string, MoveDef>;
  normals: Record<Stance, Record<Btn, string>>;
  /**
   * Especiales (2 o 3 por luchador; un especial puede tener versión débil y
   * fuerte como dos movimientos) y el súper, en orden de prioridad de lectura.
   */
  specials: string[];
  /** Sonidos propios del luchador (súper, especiales). Se usan desde FrameDef.sfx y SuperCinematic.sound. */
  sounds?: Record<string, SoundSpec>;
  throwMove: string;
  throwRange: number;
  throwDamage: number;
  projectiles: Record<string, ProjectileDef>;
  ui: { color: number; fx: number };
  /**
   * Frases de la pelá (burla): el texto del globo o { text, voice } con la voz
   * propia que dice esa frase (clave de sus voces, ej. "voz/queriToo").
   */
  taunts: Array<string | TauntLine>;
  /**
   * Combos sugeridos para la pantalla de movimientos. `steps` usa GD/GF/PD/PF
   * para los botones, flechas Unicode (↓↘→…) para las direcciones y " > " entre pasos.
   */
  combos?: Array<{ name: string; steps: string }>;
  /** Ajustes de las mecánicas avanzadas (opcional). */
  mechanics?: MechanicsDef;
  /**
   * Efectos que crecen con el largo de sus combos: 'electrico' = chispas, brillo, agua y rayos;
   * 'fuego' = brasas, aura de llamas, estallidos y un pilar de fuego.
   */
  comboFx?: 'electrico' | 'fuego' | 'cola';
  /** Cuál es su ropa, para los colores alternativos (ver render/costume.ts). */
  costume?: CostumeDef;
  /** De dónde es (para el mapa del ARCADE): nombre de la ciudad, latitud y longitud. */
  ciudad?: { nombre: string; lat: number; lon: number };
  /**
   * 2 VS 2: movimiento (id de moves) que hace al entrar como AYUDA. Si falta, el
   * primer especial que lanza un proyectil; si no tiene, el primer especial.
   */
  assist?: string;
}

/**
 * La ropa que cambia de color: oscura (negra o gris oscuro), clara (blanca o gris claro)
 * y/o rangos de tono [desde, hasta, saturación mínima] (0..1, el tono puede dar la vuelta).
 * head / feet: fracción de arriba y de abajo de cada cuadro que no se toca (cara, zapatillas).
 */
export interface CostumeDef {
  dark?: boolean;
  light?: boolean;
  hues?: Array<[number, number, number]>;
  head?: number;
  feet?: number;
  /** El color 1 es su ropa de visita: la ropa de los rangos de tono queda blanca (un luchador repetido la usa). */
  visita?: boolean;
  /**
   * Fracción de arriba del cuadro en que se reconoce la cara por la piel de alrededor (dientes,
   * ojos, labios quedan como estaban; la ropa de los hombros se tiñe). Con esto `head` puede ser 0.
   */
  face?: number;
  /** Cuántos de los 8 vecinos tienen que ser piel para que un pixel cuente como cara (por defecto 3). */
  faceNeighbors?: number;
}

/** Una frase de la pelá con su voz (la voz suena al empezar la burla, junto con el globo). */
export interface TauntLine {
  text: string;
  voice?: string;
}

/** Animaciones que todo luchador debe tener. */
export const REQUIRED_ANIMS = [
  'idle', 'walkF', 'walkB', 'crouchDown', 'crouch', 'crouchUp',
  'preJump', 'jumpUp', 'jumpTop', 'jumpFall', 'land',
  'blockStand', 'blockCrouch', 'hitHigh', 'hitLow', 'hitCrouch',
  'airHit', 'fall', 'knockdown', 'getup',
  'throwGrab', 'throwToss', 'taunt', 'win', 'lose', 'intro',
] as const;

/**
 * Animaciones opcionales. Si faltan se usan otras: 'roll' → 'crouch';
 * 'powerUp' → 'taunt' (o 'intro'); 'idleRelax' (guardia baja, brazos abajo: el
 * muñeco de práctica indefenso) → 'idle'. El supersalto y el salto corto usan las del salto.
 */
export const OPTIONAL_ANIMS = ['roll', 'powerUp', 'idleRelax'] as const;
