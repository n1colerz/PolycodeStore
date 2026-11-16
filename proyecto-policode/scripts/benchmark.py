"""Benchmark del procesamiento en lote contra las tres APIs.

Mide POST /pedidos/lote para cada lenguaje y cada dataset, descarta una
ejecución de calentamiento y reporta media y mediana.

Las tres APIs deben estar levantadas. Uso:

    python scripts/benchmark.py --repeticiones 5
    python scripts/benchmark.py --urls python=http://localhost:8001,go=...,js=...
"""

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
DIRECTORIO_DATOS = BASE / "datos"

APIS_POR_DEFECTO = {
    "python": "http://127.0.0.1:8001",
    "go": "http://127.0.0.1:8002",
    "js": "http://127.0.0.1:8003",
}

DATASETS = {
    "pequeno": "pedidos_pequenos.json",
    "mediano": "pedidos_medios.json",
    "grande": "pedidos_grandes.json",
}


def leer_urls(argumento: str | None) -> dict[str, str]:
    if not argumento:
        return dict(APIS_POR_DEFECTO)
    urls: dict[str, str] = {}
    for parte in argumento.split(","):
        if "=" not in parte:
            raise SystemExit(f"Formato inválido en --urls: {parte}. Usa lenguaje=url.")
        lenguaje, url = parte.split("=", 1)
        urls[lenguaje.strip()] = url.strip().rstrip("/")
    return urls


def comprobar_salud(url: str, timeout: float) -> dict:
    try:
        with urllib.request.urlopen(f"{url}/salud", timeout=timeout) as respuesta:
            return json.loads(respuesta.read())
    except Exception as exc:  # noqa: BLE001 - mensaje claro para el usuario
        raise SystemExit(
            f"No se pudo contactar con {url}/salud ({exc}).\n"
            "Levanta las tres APIs antes de lanzar el benchmark:\n"
            "  python/src:  python -m src.cli serve --datos ../datos\n"
            "  go:          go run ./cmd serve --datos ../datos\n"
            "  js-ts:       node dist/cli.js serve --datos ../datos"
        )


def enviar_lote(url: str, cuerpo: bytes, timeout: float) -> dict:
    solicitud = urllib.request.Request(
        f"{url}/pedidos/lote",
        data=cuerpo,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(solicitud, timeout=timeout) as respuesta:
            return json.loads(respuesta.read())
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"La API {url} respondió {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark de las tres APIs.")
    parser.add_argument("--repeticiones", type=int, default=5, help="mediciones por combinación")
    parser.add_argument("--calentamiento", type=int, default=1, help="ejecuciones descartadas")
    parser.add_argument(
        "--datasets",
        default="pequeno,mediano,grande",
        help="datasets a medir (separados por comas)",
    )
    parser.add_argument("--urls", default=None, help="lenguaje=url separados por comas")
    parser.add_argument("--timeout", type=float, default=60.0, help="timeout de cada petición")
    parser.add_argument(
        "--salida",
        default=str(BASE / "benchmark_resultados.json"),
        help="archivo JSON de resultados",
    )
    args = parser.parse_args()

    urls = leer_urls(args.urls)
    datasets = [nombre.strip() for nombre in args.datasets.split(",") if nombre.strip()]

    for lenguaje, url in urls.items():
        salud = comprobar_salud(url, args.timeout)
        print(f"API {lenguaje} en {url} -> {salud.get('lenguaje')} {salud.get('version')}")

    resultados = []
    for nombre in datasets:
        archivo = DIRECTORIO_DATOS / DATASETS[nombre]
        if not archivo.exists():
            raise SystemExit(
                f"Falta el dataset {archivo}. Generarlo con: python scripts/generar_datasets.py"
            )
        pedidos = json.loads(archivo.read_text(encoding="utf-8"))["pedidos"]
        cuerpo = json.dumps({"pedidos": pedidos}, ensure_ascii=False).encode("utf-8")

        for lenguaje, url in urls.items():
            for _ in range(args.calentamiento):
                enviar_lote(url, cuerpo, args.timeout)

            tiempos = []
            ultima = None
            for _ in range(args.repeticiones):
                inicio = time.perf_counter()
                ultima = enviar_lote(url, cuerpo, args.timeout)
                tiempos.append((time.perf_counter() - inicio) * 1000)

            resumen = ultima["resumen"]
            resultados.append(
                {
                    "lenguaje": lenguaje,
                    "dataset": nombre,
                    "pedidos": len(pedidos),
                    "tiemposMs": [round(valor, 3) for valor in tiempos],
                    "mediaMs": round(statistics.fmean(tiempos), 3),
                    "medianaMs": round(statistics.median(tiempos), 3),
                    "minMs": round(min(tiempos), 3),
                    "maxMs": round(max(tiempos), 3),
                    "exitosos": resumen["exitosos"],
                    "fallidos": resumen["fallidos"],
                    "montoTotal": resumen["montoTotal"],
                }
            )

    # Coherencia: las tres APIs deben devolver el mismo monto para el mismo lote.
    coherencia = []
    for nombre in datasets:
        montos = {r["lenguaje"]: r["montoTotal"] for r in resultados if r["dataset"] == nombre}
        coherencia.append(
            {
                "dataset": nombre,
                "montoTotal": montos,
                "iguales": len({round(float(v), 6) for v in montos.values()}) == 1,
            }
        )

    documento = {
        "generadoEn": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repeticiones": args.repeticiones,
        "calentamiento": args.calentamiento,
        "urls": urls,
        "resultados": resultados,
        "coherencia": coherencia,
    }

    ruta = Path(args.salida)
    ruta.write_text(json.dumps(documento, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print()
    print(f"{'lenguaje':<10}{'dataset':<10}{'pedidos':>9}{'media ms':>11}{'mediana ms':>12}{'min ms':>10}{'max ms':>10}{'monto total':>14}")
    print("-" * 86)
    for resultado in resultados:
        print(
            f"{resultado['lenguaje']:<10}{resultado['dataset']:<10}{resultado['pedidos']:>9}"
            f"{resultado['mediaMs']:>11.3f}{resultado['medianaMs']:>12.3f}"
            f"{resultado['minMs']:>10.3f}{resultado['maxMs']:>10.3f}{resultado['montoTotal']:>14.2f}"
        )
    print()
    for entrada in coherencia:
        estado = "idéntico" if entrada["iguales"] else "DIFERENTE"
        print(f"Coherencia {entrada['dataset']}: {estado} -> {entrada['montoTotal']}")
    print(f"\nResultados escritos en {ruta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
