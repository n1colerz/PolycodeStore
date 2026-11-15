"""Genera los datasets mediano y grande de forma determinista.

El mismo algoritmo (PRNG mulberry32) está reimplementado en el frontend
(frontend/datasets.js) para que el navegador pueda construir el mismo lote
cuando se abre el HTML sin servidor.

Uso:
    python scripts/generar_datasets.py [--salida datos]
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEMILLA = 20261114
PREFIJOS = {"mediano": "M", "grande": "G"}
CANTIDADES = {"mediano": 100, "grande": 1000}

BASE = Path(__file__).resolve().parents[1]
DIRECTORIO_DATOS = BASE / "datos"


def mulberry32(semilla: int):
    """PRNG determinista de 32 bits, idéntico al de JavaScript."""
    estado = semilla & 0xFFFFFFFF
    while True:
        estado = (estado + 0x6D2B79F5) & 0xFFFFFFFF
        t = estado
        x = (t ^ (t >> 15)) & 0xFFFFFFFF
        t = (x * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        yield ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def generar_pedidos(termino: str, clientes: list, productos: list) -> list:
    """Construye la lista de pedidos del dataset pedido."""
    aleatorio = mulberry32(SEMILLA)
    estados = ["recibido", "en_preparacion", "enviado", "entregado", "cancelado"]
    envios = ["estandar", "express", "retiro"]
    pagos = ["efectivo", "tarjeta", "transferencia"]
    prioridades = ["alta", "media", "baja"]
    prefijo = PREFIJOS[termino]
    inicio = datetime(2026, 1, 1, 8, 0, 0, tzinfo=timezone.utc)

    pedidos = []
    for indice in range(CANTIDADES[termino]):
        cliente = clientes[int(next(aleatorio) * len(clientes))]
        estado = estados[int(next(aleatorio) * len(estados))]
        tipo_envio = envios[int(next(aleatorio) * len(envios))]
        metodo_pago = pagos[int(next(aleatorio) * len(pagos))]
        prioridad = prioridades[int(next(aleatorio) * len(prioridades))]
        cantidad_items = 1 + int(next(aleatorio) * 3)

        items = []
        for _ in range(cantidad_items):
            producto = productos[int(next(aleatorio) * len(productos))]
            cantidad = 1 + int(next(aleatorio) * 4)
            items.append(
                {
                    "codigoProducto": producto["codigo"],
                    "nombre": producto["nombre"],
                    "precioUnitario": producto["precioUnitario"],
                    "cantidad": cantidad,
                }
            )

        fecha = inicio + timedelta(minutes=7 * indice)
        pedidos.append(
            {
                "id": f"PED-{prefijo}-{indice + 1:04d}",
                "clienteId": cliente["id"],
                "fechaCreacion": fecha.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "estado": estado,
                "tipoEnvio": tipo_envio,
                "metodoPago": metodo_pago,
                "prioridad": prioridad,
                "items": items,
            }
        )
    return pedidos


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera los datasets mediano y grande.")
    parser.add_argument("--salida", default=str(DIRECTORIO_DATOS), help="directorio de salida")
    args = parser.parse_args()

    directorio = Path(args.salida)
    clientes = json.loads((directorio / "clientes.json").read_text(encoding="utf-8"))["clientes"]
    productos = json.loads((directorio / "productos.json").read_text(encoding="utf-8"))["productos"]

    for termino, archivo in (("mediano", "pedidos_medios.json"), ("grande", "pedidos_grandes.json")):
        pedidos = generar_pedidos(termino, clientes, productos)
        ruta = directorio / archivo
        ruta.write_text(
            json.dumps({"version": 1, "pedidos": pedidos}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"{ruta}: {len(pedidos)} pedidos")

    # Copia del catálogo para el frontend (permite abrirlo con file://).
    ruta_catalogo = BASE / "frontend" / "catalogos.js"
    ruta_catalogo.parent.mkdir(parents=True, exist_ok=True)
    ruta_catalogo.write_text(
        "// Generado por scripts/generar_datasets.py: copia de datos/clientes.json y datos/productos.json.\n"
        "window.POLY_CATALOGOS = {\n"
        f"  clientes: {json.dumps(clientes, ensure_ascii=False, indent=2)},\n"
        f"  productos: {json.dumps(productos, ensure_ascii=False, indent=2)}\n"
        "};\n",
        encoding="utf-8",
    )
    print(f"{ruta_catalogo}: {len(clientes)} clientes y {len(productos)} productos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
