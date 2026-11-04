"""Mete cuadros intermedios en los golpes normales de un luchador (armado.json), sin cambiar sus tiempos.

Uso:
  python herramientas/fluidez.py arte/loco-rene/armado.json [--max 3] [--hueco 6] [--prueba]

Los videos van a 24 cuadros por segundo y el juego a 60: un golpe que muestra un cuadro del
video cada 2 o 3 y lo deja 2 o 3 cuadros del juego se ve a saltos. Entre dos cuadros elegidos
seguidos, si el primero dura 2 o más y en el video hay cuadros entre medio (hasta `--hueco`),
se reparte su duración entre él y los del medio (hasta `--max` dibujos). Cada cuadro elegido
sigue empezando en el mismo instante: el arranque, los cuadros que golpean y la recuperación
duran lo mismo que antes. Los saltos grandes (más de `--hueco` cuadros del video) se respetan,
porque son cortes a propósito (el brazo estirado que se queda quieto, por ejemplo).

Solo toca las animaciones de los golpes normales de pie y agachado (las de `normals` en la
definición). Corre de nuevo sobre el mismo archivo sin cambiar nada: lo ya repartido no se
vuelve a partir (los cuadros intermedios quedan seguidos, sin hueco).
"""
import json
import sys
from pathlib import Path


def lista(spec) -> list[int]:
    c = spec["cuadros"]
    if isinstance(c, dict):
        return list(range(c["desde"], c["hasta"] + 1, c.get("paso", 1)))
    return list(c)


def repartir(spec: dict, maximo: int, hueco: int) -> int:
    # Los golpes de varios grupos (cada uno conecta una vez) tienen claves por posición: no se tocan.
    if "grupos" in spec or "props_grupo" in spec:
        return 0
    idx = lista(spec)
    durs = spec["dur"] if isinstance(spec["dur"], list) else [spec["dur"]] * len(idx)
    activos = set(spec.get("activos", []))
    extra = spec.get("extra", {})
    n_idx: list[int] = []
    n_dur: list[int] = []
    n_act: set[int] = set()
    n_extra: dict = {}
    for k, (i, d) in enumerate(zip(idx, durs)):
        if str(k) in extra:
            n_extra[str(len(n_idx))] = extra[str(k)]
        sig = idx[k + 1] if k + 1 < len(idx) else None
        g = sig - i if sig is not None else 0
        m = min(d, g, maximo) if sig is not None and d >= 2 and 2 <= g <= hueco else 1
        # La duración se reparte; el cuadro elegido se queda con lo que sobra.
        partes = [d // m + (1 if j < d % m else 0) for j in range(m)]
        for j in range(m):
            n_idx.append(i + round(j * g / m))
            n_dur.append(partes[j])
            if k in activos:
                n_act.add(len(n_idx) - 1)
    agregados = len(n_idx) - len(idx)
    spec["cuadros"] = n_idx
    spec["dur"] = n_dur
    if activos:
        spec["activos"] = sorted(n_act)
    if extra:
        spec["extra"] = n_extra
    return agregados


def main() -> None:
    args = sys.argv[1:]
    maximo = int(args[args.index("--max") + 1]) if "--max" in args else 3
    hueco = int(args[args.index("--hueco") + 1]) if "--hueco" in args else 6
    prueba = "--prueba" in args
    ruta = Path(args[0])
    cfg = json.loads(ruta.read_text(encoding="utf-8"))
    definicion = json.loads((ruta.parent / cfg["definicion"]).read_text(encoding="utf-8"))
    nombres = []
    for postura in ("stand", "crouch"):
        for mov in definicion["normals"][postura].values():
            anim = definicion["moves"][mov]["anim"]
            if anim not in nombres:
                nombres.append(anim)
    total = 0
    for nombre in nombres:
        spec = cfg["anims"][nombre]
        antes = sum(spec["dur"]) if isinstance(spec["dur"], list) else spec["dur"] * len(lista(spec))
        n = repartir(spec, maximo, hueco)
        assert sum(spec["dur"]) == antes, nombre
        total += n
        print(f"{nombre}: +{n} cuadros ({len(spec['cuadros'])} en total, {antes} cuadros de juego)")
    print(f"total: +{total} cuadros")
    if not prueba:
        ruta.write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
