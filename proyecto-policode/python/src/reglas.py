"""Reglas de negocio: validación, cálculos, transiciones y lote concurrente."""

import logging
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from .errores import ErrorDominio
from .modelos import (
    Calculos,
    Cliente,
    ESTADOS_VALIDOS,
    ItemPedido,
    METODOS_PAGO_VALIDOS,
    Pedido,
    PRIORIDADES_VALIDAS,
    TIPOS_ENVIO_VALIDOS,
    TRANSICIONES,
)

CENTAVO = Decimal("0.01")
PATRON_ID = re.compile(r"^[A-Za-z0-9_-]{3,40}$")
PATRON_FECHA = re.compile(
    r"^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$"
)

_REGISTRO = logging.getLogger(__name__)


def _campo_requerido(campo: str) -> ErrorDominio:
    return ErrorDominio(
        "CAMPO_REQUERIDO", f"El campo '{campo}' es obligatorio.", campo, 400
    )


def _tipo_invalido(campo: str) -> ErrorDominio:
    return ErrorDominio(
        "TIPO_INVALIDO", f"El campo '{campo}' tiene un tipo inválido.", campo, 400
    )


def _es_numero(valor: object) -> bool:
    return (
        isinstance(valor, (int, float))
        and not isinstance(valor, bool)
        and math.isfinite(valor)
    )


def redondear(valor: Decimal) -> Decimal:
    """Redondeo monetario half-up a 2 decimales (decisión D1)."""
    return valor.quantize(CENTAVO, rounding=ROUND_HALF_UP)


def parsear_fecha(valor: str) -> datetime:
    """Valida ISO 8601 con zona horaria y devuelve el instante."""
    coincidencia = PATRON_FECHA.fullmatch(valor)
    if not coincidencia:
        raise ErrorDominio(
            "FECHA_INVALIDA",
            "La fechaCreacion debe estar en formato ISO 8601 con zona horaria.",
            "fechaCreacion",
            400,
        )

    fecha, hora, fraccion, zona = coincidencia.groups()
    # datetime.fromisoformat admite como máximo 6 dígitos fraccionarios.
    if fraccion and len(fraccion) > 7:
        fraccion = fraccion[:7]
    zona = "+00:00" if zona == "Z" else zona

    try:
        return datetime.fromisoformat(f"{fecha}T{hora}{fraccion or ''}{zona}")
    except ValueError as exc:
        raise ErrorDominio(
            "FECHA_INVALIDA",
            "La fechaCreacion debe estar en formato ISO 8601 con zona horaria.",
            "fechaCreacion",
            400,
        ) from exc


def validar_pedido(datos: object, clientes: dict[str, Cliente]) -> Pedido:
    """Valida una entrada y la convierte en un Pedido de dominio.

    El orden de validación es el fijado en el contrato (sección 3.1).
    """
    if not isinstance(datos, dict):
        raise ErrorDominio("CUERPO_INVALIDO", "El cuerpo debe ser un objeto JSON.", None, 400)

    for campo in ("id", "clienteId", "fechaCreacion", "tipoEnvio", "metodoPago", "items"):
        if campo not in datos or datos[campo] is None:
            raise _campo_requerido(campo)

    cadenas = ("id", "clienteId", "fechaCreacion", "tipoEnvio", "metodoPago")
    for campo in cadenas:
        if not isinstance(datos[campo], str):
            raise _tipo_invalido(campo)
    if not isinstance(datos["items"], list):
        raise _tipo_invalido("items")

    estado = datos.get("estado")
    if estado is None:
        estado = "recibido"
    elif not isinstance(estado, str):
        raise _tipo_invalido("estado")

    prioridad = datos.get("prioridad")
    if prioridad is None:
        prioridad = "media"
    elif not isinstance(prioridad, str):
        raise _tipo_invalido("prioridad")

    if not PATRON_ID.fullmatch(datos["id"]):
        raise ErrorDominio(
            "ID_INVALIDO",
            "El id debe cumplir el patrón ^[A-Za-z0-9_-]{3,40}$.",
            "id",
            400,
        )

    instante = parsear_fecha(datos["fechaCreacion"])

    if datos["tipoEnvio"] not in TIPOS_ENVIO_VALIDOS:
        raise ErrorDominio(
            "TIPO_ENVIO_INVALIDO",
            "El tipoEnvio debe ser uno de: estandar, express, retiro.",
            "tipoEnvio",
            400,
        )
    if datos["metodoPago"] not in METODOS_PAGO_VALIDOS:
        raise ErrorDominio(
            "METODO_PAGO_INVALIDO",
            "El metodoPago debe ser uno de: efectivo, tarjeta, transferencia.",
            "metodoPago",
            400,
        )
    if estado not in ESTADOS_VALIDOS:
        raise ErrorDominio(
            "ESTADO_INVALIDO",
            "El estado debe ser uno de: recibido, en_preparacion, enviado, entregado, cancelado.",
            "estado",
            400,
        )
    if prioridad not in PRIORIDADES_VALIDAS:
        raise ErrorDominio(
            "PRIORIDAD_INVALIDA",
            "La prioridad debe ser una de: alta, media, baja.",
            "prioridad",
            400,
        )

    if not datos["items"]:
        raise ErrorDominio(
            "PEDIDO_SIN_ITEMS",
            "El pedido debe tener al menos un item.",
            "items",
            400,
        )

    if datos["clienteId"] not in clientes:
        raise ErrorDominio(
            "CLIENTE_NO_ENCONTRADO",
            f"El cliente '{datos['clienteId']}' no existe en el catálogo.",
            "clienteId",
            404,
        )

    items: list[ItemPedido] = []
    for indice, bruto in enumerate(datos["items"]):
        if not isinstance(bruto, dict):
            raise _tipo_invalido(f"items[{indice}]")

        for campo in ("codigoProducto", "nombre", "precioUnitario", "cantidad"):
            if campo not in bruto or bruto[campo] is None:
                raise _campo_requerido(f"items[{indice}].{campo}")

        if not isinstance(bruto["codigoProducto"], str) or not bruto["codigoProducto"]:
            raise _campo_requerido(f"items[{indice}].codigoProducto")
        if not isinstance(bruto["nombre"], str) or not bruto["nombre"]:
            raise _campo_requerido(f"items[{indice}].nombre")

        if not _es_numero(bruto["precioUnitario"]):
            raise _tipo_invalido(f"items[{indice}].precioUnitario")
        precio = Decimal(str(bruto["precioUnitario"]))
        if precio < 0:
            raise ErrorDominio(
                "PRECIO_INVALIDO",
                "El precioUnitario debe ser un número mayor o igual que 0.",
                f"items[{indice}].precioUnitario",
                400,
            )

        if not _es_numero(bruto["cantidad"]):
            raise _tipo_invalido(f"items[{indice}].cantidad")
        if not float(bruto["cantidad"]).is_integer() or bruto["cantidad"] <= 0:
            raise ErrorDominio(
                "CANTIDAD_INVALIDA",
                "La cantidad debe ser un entero mayor que 0.",
                f"items[{indice}].cantidad",
                400,
            )

        items.append(
            ItemPedido(
                codigoProducto=bruto["codigoProducto"],
                nombre=bruto["nombre"],
                precioUnitario=precio,
                cantidad=int(bruto["cantidad"]),
            )
        )

    return Pedido(
        id=datos["id"],
        clienteId=datos["clienteId"],
        fechaCreacion=datos["fechaCreacion"],
        estado=estado,
        tipoEnvio=datos["tipoEnvio"],
        metodoPago=datos["metodoPago"],
        prioridad=prioridad,
        items=tuple(items),
        fechaInstante=instante,
    )


def calcular(pedido: Pedido, cliente: Cliente) -> Calculos:
    """Aplica las fórmulas del contrato con Decimal y redondeo half-up."""
    subtotal = redondear(
        sum(
            (item.precioUnitario * item.cantidad for item in pedido.items),
            Decimal("0"),
        )
    )

    porcentaje = 10 if cliente.tipo == "vip" else 0
    if subtotal >= Decimal("1000"):
        porcentaje += 5
    porcentaje = min(porcentaje, 20)

    descuento = redondear(subtotal * Decimal(porcentaje) / Decimal("100"))
    base_impuesto = redondear(subtotal - descuento)
    impuesto = redondear(base_impuesto * Decimal("0.16"))

    if pedido.tipoEnvio == "retiro":
        costo_envio = Decimal("0")
    elif pedido.tipoEnvio == "estandar":
        costo_envio = Decimal("0") if subtotal >= Decimal("500") else Decimal("50")
    else:
        costo_envio = Decimal("150")

    total = redondear(subtotal - descuento + impuesto + costo_envio)

    return Calculos(
        subtotal=subtotal,
        porcentajeDescuento=porcentaje,
        descuento=descuento,
        impuesto=impuesto,
        costoEnvio=costo_envio,
        total=total,
    )


def serializar_pedido(pedido: Pedido, clientes: dict[str, Cliente]) -> dict:
    """Pedido normalizado + cálculos, listo para JSON."""
    resultado = pedido.a_dict()
    resultado["calculos"] = calcular(pedido, clientes[pedido.clienteId]).a_dict()
    return resultado


def validar_transicion(estado_actual: str, estado_nuevo: str) -> None:
    """Valida el enum y la matriz de transiciones."""
    mensaje_estado = (
        "El estado debe ser uno de: recibido, en_preparacion, enviado, entregado, cancelado."
    )
    if estado_actual not in ESTADOS_VALIDOS:
        raise ErrorDominio("ESTADO_INVALIDO", mensaje_estado, "estado", 400)
    if estado_nuevo not in ESTADOS_VALIDOS:
        raise ErrorDominio("ESTADO_INVALIDO", mensaje_estado, "estado", 400)
    if estado_nuevo not in TRANSICIONES[estado_actual]:
        raise ErrorDominio(
            "TRANSICION_INVALIDA",
            f"Transición de estado no permitida: '{estado_actual}' → '{estado_nuevo}'.",
            "estado",
            409,
        )


def _max_workers(configurado: int | None) -> int:
    if configurado is not None:
        return max(1, configurado)
    desde_entorno = os.environ.get("POLY_WORKERS")
    if desde_entorno:
        try:
            return max(1, int(desde_entorno))
        except ValueError:
            pass
    return min(32, (os.cpu_count() or 4) + 4)


def _procesar_entrada(
    indice: int, bruto: object, clientes: dict[str, Cliente]
) -> tuple[dict, Decimal | None]:
    """Procesa una entrada del lote sin tocar estado compartido."""
    try:
        if not isinstance(bruto, dict):
            raise ErrorDominio(
                "CUERPO_INVALIDO",
                "El cuerpo debe ser un objeto JSON.",
                f"pedidos[{indice}]",
                400,
            )
        pedido = validar_pedido(bruto, clientes)
        calculos = calcular(pedido, clientes[pedido.clienteId])
        salida = pedido.a_dict()
        salida["calculos"] = calculos.a_dict()
        return {"indice": indice, "ok": True, "pedido": salida}, calculos.total
    except ErrorDominio as exc:
        return {"indice": indice, "ok": False, "error": exc.a_dict()}, None
    except Exception:  # noqa: BLE001 - un fallo inesperado no debe tumbar el lote
        _REGISTRO.exception("Error inesperado al procesar el pedido %s", indice)
        return (
            {
                "indice": indice,
                "ok": False,
                "error": {
                    "codigo": "ERROR_INTERNO",
                    "mensaje": "Error interno del servidor.",
                },
            },
            None,
        )


def procesar_lote(
    pedidos: object,
    clientes: dict[str, Cliente],
    max_workers: int | None = None,
) -> dict:
    """Procesa un lote en paralelo conservando el orden de entrada."""
    if not isinstance(pedidos, list):
        raise _tipo_invalido("pedidos")
    if not pedidos:
        raise ErrorDominio(
            "LOTE_VACIO",
            "La lista de pedidos no puede estar vacía.",
            "pedidos",
            400,
        )

    trabajadores = _max_workers(max_workers)
    with ThreadPoolExecutor(max_workers=trabajadores) as ejecutor:
        pares = list(
            ejecutor.map(
                lambda par: _procesar_entrada(par[0], par[1], clientes),
                enumerate(pedidos),
            )
        )

    resultados = [par[0] for par in pares]
    monto_total = redondear(
        sum((par[1] for par in pares if par[1] is not None), Decimal("0"))
    )
    exitosos = sum(1 for resultado in resultados if resultado["ok"])

    return {
        "resultados": resultados,
        "resumen": {
            "total": len(resultados),
            "exitosos": exitosos,
            "fallidos": len(resultados) - exitosos,
            "montoTotal": float(monto_total),
        },
    }
