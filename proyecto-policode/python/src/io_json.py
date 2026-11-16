"""Lectura y escritura de JSON y carga de catálogos/datasets."""

import json
import sys
from pathlib import Path
from typing import Any

from .errores import ErrorDatos
from .modelos import Cliente, Producto


def _constante_invalida(valor: str) -> None:
    """Rechaza NaN/Infinity, que no forman parte de JSON estricto."""
    raise ValueError(f"Constante JSON no permitida: {valor}")


def cargar_json_texto(texto: str) -> Any:
    """Parsea JSON estricto; lanza ValueError si no es válido."""
    return json.loads(texto, parse_constant=_constante_invalida)


def leer_json(ruta: str | Path) -> Any:
    ruta = Path(ruta)
    try:
        texto = ruta.read_text(encoding="utf-8")
    except OSError as exc:
        detalle = exc.strerror or str(exc)
        raise ErrorDatos(f"No se pudo leer '{ruta}': {detalle}") from exc

    try:
        return cargar_json_texto(texto)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ErrorDatos(f"El archivo '{ruta}' no contiene JSON válido: {exc}") from exc


def escribir_json(ruta: str | Path, datos: Any) -> None:
    ruta = Path(ruta)
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with ruta.open("w", encoding="utf-8", newline="\n") as archivo:
            json.dump(datos, archivo, ensure_ascii=False, indent=2)
            archivo.write("\n")
    except OSError as exc:
        detalle = exc.strerror or str(exc)
        raise ErrorDatos(f"No se pudo escribir '{ruta}': {detalle}") from exc


def serializar_json(datos: Any) -> str:
    return json.dumps(datos, ensure_ascii=False, indent=2) + "\n"


def _leer_texto_entrada(ruta: str | Path) -> str:
    if str(ruta) == "-":
        return sys.stdin.read()
    ruta = Path(ruta)
    try:
        return ruta.read_text(encoding="utf-8")
    except OSError as exc:
        detalle = exc.strerror or str(exc)
        raise ErrorDatos(f"No se pudo leer '{ruta}': {detalle}") from exc


def cargar_clientes(directorio: str | Path) -> dict[str, Cliente]:
    ruta = Path(directorio) / "clientes.json"
    datos = leer_json(ruta)
    if not isinstance(datos, dict) or not isinstance(datos.get("clientes"), list):
        raise ErrorDatos(f"'{ruta}' debe contener un objeto con la lista 'clientes'.")

    clientes: dict[str, Cliente] = {}
    for indice, bruto in enumerate(datos["clientes"]):
        if not isinstance(bruto, dict):
            raise ErrorDatos(f"El cliente en la posición {indice} no es un objeto.")
        try:
            cliente = Cliente(
                id=bruto["id"],
                nombre=bruto["nombre"],
                email=bruto["email"],
                tipo=bruto["tipo"],
            )
        except KeyError as exc:
            raise ErrorDatos(
                f"El cliente en la posición {indice} no tiene el campo '{exc.args[0]}'."
            ) from exc

        if not all(
            isinstance(valor, str) and valor
            for valor in (cliente.id, cliente.nombre, cliente.email, cliente.tipo)
        ):
            raise ErrorDatos(f"El cliente en la posición {indice} tiene campos inválidos.")
        if cliente.tipo not in {"vip", "regular"}:
            raise ErrorDatos(f"El cliente '{cliente.id}' tiene un tipo inválido.")
        if cliente.id in clientes:
            raise ErrorDatos(f"El cliente '{cliente.id}' está duplicado.")
        clientes[cliente.id] = cliente

    return clientes


def cargar_productos(directorio: str | Path) -> list[Producto]:
    ruta = Path(directorio) / "productos.json"
    datos = leer_json(ruta)
    if not isinstance(datos, dict) or not isinstance(datos.get("productos"), list):
        raise ErrorDatos(f"'{ruta}' debe contener un objeto con la lista 'productos'.")

    productos: list[Producto] = []
    codigos: set[str] = set()
    for indice, bruto in enumerate(datos["productos"]):
        if not isinstance(bruto, dict):
            raise ErrorDatos(f"El producto en la posición {indice} no es un objeto.")
        try:
            producto = Producto(
                codigo=bruto["codigo"],
                nombre=bruto["nombre"],
                precioUnitario=bruto["precioUnitario"],
                categoria=bruto["categoria"],
            )
        except KeyError as exc:
            raise ErrorDatos(
                f"El producto en la posición {indice} no tiene el campo '{exc.args[0]}'."
            ) from exc

        if isinstance(producto.precioUnitario, bool) or not isinstance(
            producto.precioUnitario, (int, float)
        ):
            raise ErrorDatos(f"El producto '{producto.codigo}' tiene un precio inválido.")
        if producto.precioUnitario < 0:
            raise ErrorDatos(f"El producto '{producto.codigo}' tiene un precio negativo.")
        if producto.codigo in codigos:
            raise ErrorDatos(f"El producto '{producto.codigo}' está duplicado.")
        codigos.add(producto.codigo)
        productos.append(producto)

    return productos


def cargar_pedidos_iniciales(
    directorio: str | Path, archivo: str = "pedidos_pequenos.json"
) -> list[dict]:
    ruta = Path(directorio) / archivo
    datos = leer_json(ruta)
    if not isinstance(datos, dict) or not isinstance(datos.get("pedidos"), list):
        raise ErrorDatos(f"'{ruta}' debe contener un objeto con la lista 'pedidos'.")
    return datos["pedidos"]


def cargar_entrada_lote(ruta: str | Path) -> list:
    """Acepta {pedidos: [...]} o un array; devuelve la lista cruda."""
    texto = _leer_texto_entrada(ruta)
    try:
        datos = cargar_json_texto(texto)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ErrorDatos(f"La entrada no contiene JSON válido: {exc}") from exc

    if isinstance(datos, list):
        return datos
    if isinstance(datos, dict) and isinstance(datos.get("pedidos"), list):
        return datos["pedidos"]
    raise ErrorDatos(
        "La entrada debe ser un array de pedidos o un objeto con la lista 'pedidos'."
    )
