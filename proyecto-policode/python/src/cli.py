"""CLI de Python: `run` procesa un lote y `serve` levanta la API."""

import argparse
import os
import sys
from pathlib import Path

from . import __version__
from .almacen import Almacen
from .api import crear_servidor
from .errores import ErrorDatos, ErrorDominio
from .io_json import (
    cargar_clientes,
    cargar_entrada_lote,
    cargar_pedidos_iniciales,
    cargar_productos,
    escribir_json,
    serializar_json,
)
from .reglas import procesar_lote, validar_pedido


def _directorio_datos(valor: str | None) -> Path:
    return Path(valor or os.environ.get("POLY_DATA_DIR") or "datos")


def _resolver_puerto(valor: int | None) -> int:
    if valor is not None:
        return valor
    desde_entorno = os.environ.get("PY_PORT")
    if desde_entorno:
        try:
            return int(desde_entorno)
        except ValueError as exc:
            raise ErrorDatos(
                f"La variable PY_PORT debe ser un número entero, no '{desde_entorno}'."
            ) from exc
    return 8001


def _comando_run(args: argparse.Namespace) -> int:
    try:
        clientes = cargar_clientes(_directorio_datos(args.datos))
        pedidos = cargar_entrada_lote(args.entrada)
        resultado = procesar_lote(pedidos, clientes, max_workers=args.trabajadores)
        if args.salida and args.salida != "-":
            escribir_json(args.salida, resultado)
        else:
            sys.stdout.write(serializar_json(resultado))
    except (ErrorDatos, ErrorDominio) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


def _comando_serve(args: argparse.Namespace) -> int:
    directorio = _directorio_datos(args.datos)
    try:
        clientes = cargar_clientes(directorio)
        # productos.json se carga para validar el dataset, aunque las reglas no
        # validan codigoProducto contra el catálogo (decisión D12).
        cargar_productos(directorio)
        brutos = cargar_pedidos_iniciales(directorio)
        pedidos = [validar_pedido(bruto, clientes) for bruto in brutos]
        almacen = Almacen(pedidos, clientes)
        puerto = _resolver_puerto(args.puerto)
        servidor = crear_servidor(args.host, puerto, almacen)
    except (ErrorDatos, ErrorDominio, OSError) as exc:
        print(f"Error al iniciar la API: {exc}", file=sys.stderr)
        return 1

    print(
        f"API Python escuchando en http://{args.host}:{puerto} "
        f"(datos: {directorio.resolve()})",
        file=sys.stderr,
    )
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
    return 0


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m src.cli",
        description="Sistema de pedidos proyecto-polycode (Python).",
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )
    subcomandos = parser.add_subparsers(dest="comando", required=True)

    run = subcomandos.add_parser("run", help="procesa un JSON de pedidos en lote")
    run.add_argument("--entrada", required=True, help="archivo JSON o '-' para stdin")
    run.add_argument("--salida", help="archivo JSON de salida o '-' para stdout")
    run.add_argument("--datos", help="directorio con clientes.json")
    run.add_argument(
        "--trabajadores",
        type=int,
        default=None,
        help="hilos del lote (default: POLY_WORKERS o CPU+4, máximo 32)",
    )
    run.set_defaults(func=_comando_run)

    serve = subcomandos.add_parser("serve", help="levanta la API HTTP")
    serve.add_argument("--datos", help="directorio con los datasets")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--puerto", type=int, default=None)
    serve.set_defaults(func=_comando_serve)

    return parser


def _configurar_salida() -> None:
    """Fuerza UTF-8 para que los acentos no dependan del locale de Windows."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass


def main(argv: list[str] | None = None) -> int:
    _configurar_salida()
    parser = construir_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
