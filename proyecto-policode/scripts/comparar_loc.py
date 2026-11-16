"""Cuenta las líneas de código por lenguaje (sin tests) para el panel comparativo.

Criterio: líneas físicas no vacías, excluyendo las que solo contienen un
comentario. No se cuentan los tests, ni los artefactos generados.

    python scripts/comparar_loc.py
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]

PARADIGMAS = {
    "python": "OOP + funcional",
    "go": "concurrencia + compilado",
    "js": "asincronía + funcional",
}


def comentario_bloque(linea: str) -> bool:
    """True si la línea abre un bloque de comentario (/* ... */ o docstring)."""
    return linea.startswith("/*") or linea.startswith('"""') or linea.startswith("'''")


def cierra_bloque(linea: str) -> bool:
    """True si la línea cierra el bloque de comentario abierto."""
    return "*/" in linea or '"""' in linea or "'''" in linea


def contar(archivos: list[Path], prefijo: str) -> dict:
    """Cuenta líneas físicas, vacías, de comentario y de código."""
    totales = vacias = comentarios = loc = 0
    for archivo in archivos:
        texto = archivo.read_text(encoding="utf-8")
        en_bloque = False
        for linea in texto.splitlines():
            totales += 1
            recortada = linea.strip()
            if not recortada:
                vacias += 1
                continue
            if en_bloque:
                comentarios += 1
                en_bloque = not cierra_bloque(recortada)
                continue
            if comentario_bloque(recortada):
                comentarios += 1
                en_bloque = not cierra_bloque(recortada)
                continue
            if recortada.startswith(prefijo):
                comentarios += 1
                continue
            loc += 1
    return {
        "archivos": len(archivos),
        "lineasTotales": totales,
        "lineasVacias": vacias,
        "lineasComentario": comentarios,
        "loc": loc,
    }


def archivos_python() -> list[Path]:
    return sorted((BASE / "python" / "src").rglob("*.py"))


def archivos_go() -> list[Path]:
    return sorted(
        archivo
        for archivo in (BASE / "go").rglob("*.go")
        if not archivo.name.endswith("_test.go") and "tests" not in archivo.parts
    )


def archivos_js() -> list[Path]:
    return sorted(
        archivo
        for archivo in (BASE / "js-ts" / "src").rglob("*.ts")
        if not archivo.name.endswith(".test.ts") and not archivo.name.endswith(".spec.ts")
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Cuenta líneas de código por lenguaje.")
    parser.add_argument(
        "--salida",
        default=str(BASE / "loc_resultados.json"),
        help="archivo JSON de resultados",
    )
    args = parser.parse_args()

    catalogos = {
        "python": (archivos_python(), "#"),
        "go": (archivos_go(), "//"),
        "js": (archivos_js(), "//"),
    }

    lenguales = []
    for lenguaje, (archivos, prefijo) in catalogos.items():
        resultado = contar(archivos, prefijo)
        resultado["lenguaje"] = lenguaje
        resultado["paradigma"] = PARADIGMAS[lenguaje]
        lenguales.append(resultado)

    documento = {
        "generadoEn": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "criterio": (
            "líneas físicas no vacías y sin comentarios; se excluyen los tests. "
            "En Python los docstrings se cuentan como comentarios."
        ),
        "lenguajes": lenguales,
    }

    ruta = Path(args.salida)
    ruta.write_text(json.dumps(documento, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{'lenguaje':<10}{'archivos':>9}{'líneas':>9}{'vacías':>9}{'comentarios':>13}{'LOC':>8}  paradigma")
    print("-" * 74)
    for entrada in lenguales:
        print(
            f"{entrada['lenguaje']:<10}{entrada['archivos']:>9}{entrada['lineasTotales']:>9}"
            f"{entrada['lineasVacias']:>9}{entrada['lineasComentario']:>13}{entrada['loc']:>8}  {entrada['paradigma']}"
        )
    print(f"\nResultados escritos en {ruta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
