"""Utilidades compartidas por los tests de Python."""

import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pytest

RAIZ_PYTHON = Path(__file__).resolve().parents[1]
RAIZ_PROYECTO = RAIZ_PYTHON.parent
DIR_DATOS = RAIZ_PROYECTO / "datos"

CENTAVO = Decimal("0.01")


def cargar_json(nombre: str) -> dict:
    return json.loads((DIR_DATOS / nombre).read_text(encoding="utf-8"))


def importe(valor: float | int | str) -> Decimal:
    return Decimal(str(valor)).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def assert_calculos(actual: dict, esperado: dict) -> None:
    assert set(actual) == set(esperado)
    assert actual["porcentajeDescuento"] == esperado["porcentajeDescuento"]
    for clave in ("subtotal", "descuento", "impuesto", "costoEnvio", "total"):
        assert importe(actual[clave]) == importe(esperado[clave]), (
            f"{clave}: {actual[clave]} != {esperado[clave]}"
        )


def verificar_caso(caso: dict, clientes: dict) -> None:
    """Ejecuta un fixture de casos_prueba/casos_borde."""
    from src.errores import ErrorDominio
    from src.reglas import calcular, validar_pedido, validar_transicion

    esperado = caso["esperado"]

    if caso["tipo"] == "transicion":
        entrada = caso["entrada"]
        if esperado["ok"]:
            validar_transicion(entrada["estadoActual"], entrada["estadoNuevo"])
            assert entrada["estadoNuevo"] == esperado["estado"]
        else:
            with pytest.raises(ErrorDominio) as excinfo:
                validar_transicion(entrada["estadoActual"], entrada["estadoNuevo"])
            assert excinfo.value.http == esperado["http"]
            assert excinfo.value.a_dict() == esperado["error"]
        return

    if esperado["ok"]:
        pedido = validar_pedido(caso["entrada"], clientes)
        calculos = calcular(pedido, clientes[pedido.clienteId])
        assert_calculos(calculos.a_dict(), esperado["calculos"])
    else:
        with pytest.raises(ErrorDominio) as excinfo:
            validar_pedido(caso["entrada"], clientes)
        assert excinfo.value.http == esperado["http"]
        assert excinfo.value.a_dict() == esperado["error"]
