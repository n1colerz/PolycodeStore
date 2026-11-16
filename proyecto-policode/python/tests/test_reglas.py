"""Pruebas unitarias de almacén, filtros, orden, transiciones y lote."""

from copy import deepcopy
from decimal import Decimal

import pytest

from ayudas import cargar_json, importe
from src.almacen import Almacen
from src.errores import ErrorDominio
from src.modelos import ESTADOS, TRANSICIONES
from src.reglas import procesar_lote, validar_pedido, validar_transicion

C1 = next(c for c in cargar_json("casos_prueba.json")["casos"] if c["id"] == "C1")
C2 = next(c for c in cargar_json("casos_prueba.json")["casos"] if c["id"] == "C2")


def crear_almacen(clientes: dict) -> Almacen:
    brutos = cargar_json("pedidos_pequenos.json")["pedidos"]
    pedidos = [validar_pedido(bruto, clientes) for bruto in brutos]
    return Almacen(pedidos, clientes)


def test_resumen_coincide_con_dataset(clientes: dict) -> None:
    resumen = crear_almacen(clientes).resumen()

    assert resumen["totalPedidos"] == 10
    assert importe(resumen["montoTotal"]) == importe("7262.56")
    assert resumen["porEstado"] == {
        "recibido": 2,
        "en_preparacion": 2,
        "enviado": 2,
        "entregado": 2,
        "cancelado": 2,
    }
    assert resumen["porPrioridad"] == {"alta": 4, "media": 3, "baja": 3}


def test_filtros_combinados(clientes: dict) -> None:
    almacen = crear_almacen(clientes)

    recibidos = almacen.listar(estado="recibido")
    assert [pedido["id"] for pedido in recibidos] == ["PED-0001", "PED-0006"]

    de_cliente = almacen.listar(clienteId="CLI-001")
    assert [pedido["id"] for pedido in de_cliente] == ["PED-0001"]

    combinado = almacen.listar(clienteId="CLI-001", estado="recibido")
    assert [pedido["id"] for pedido in combinado] == ["PED-0001"]

    assert almacen.listar(clienteId="CLI-999") == []


def test_orden_fecha_ascendente(clientes: dict) -> None:
    pedidos = crear_almacen(clientes).listar(orden="fecha")
    assert [pedido["id"] for pedido in pedidos] == [
        f"PED-{numero:04d}" for numero in range(1, 11)
    ]


def test_orden_monto_descendente(clientes: dict) -> None:
    pedidos = crear_almacen(clientes).listar(orden="monto")
    montos = [pedido["calculos"]["total"] for pedido in pedidos]

    assert pedidos[0]["id"] == "PED-0009"
    assert montos == sorted(montos, reverse=True)


def test_orden_prioridad_y_desempate_por_fecha(clientes: dict) -> None:
    pedidos = crear_almacen(clientes).listar(orden="prioridad")
    assert [pedido["id"] for pedido in pedidos] == [
        "PED-0001",
        "PED-0004",
        "PED-0007",
        "PED-0010",
        "PED-0002",
        "PED-0005",
        "PED-0008",
        "PED-0003",
        "PED-0006",
        "PED-0009",
    ]


def test_agregar_duplicado(clientes: dict) -> None:
    almacen = crear_almacen(clientes)
    existente = almacen.obtener("PED-0001")
    assert existente is not None

    with pytest.raises(ErrorDominio) as excinfo:
        almacen.agregar(existente)

    assert excinfo.value.codigo == "PEDIDO_DUPLICADO"
    assert excinfo.value.http == 409


def test_actualizar_estado_valido_y_rechazos(clientes: dict) -> None:
    almacen = crear_almacen(clientes)

    actualizado = almacen.actualizar_estado("PED-0001", "en_preparacion")
    assert actualizado.estado == "en_preparacion"

    with pytest.raises(ErrorDominio) as mismo_estado:
        almacen.actualizar_estado("PED-0001", "en_preparacion")
    assert mismo_estado.value.codigo == "TRANSICION_INVALIDA"

    with pytest.raises(ErrorDominio) as desde_entregado:
        almacen.actualizar_estado("PED-0004", "en_preparacion")
    assert desde_entregado.value.codigo == "TRANSICION_INVALIDA"

    with pytest.raises(ErrorDominio) as inexistente:
        almacen.actualizar_estado("PED-9999", "en_preparacion")
    assert inexistente.value.codigo == "PEDIDO_NO_ENCONTRADO"
    assert inexistente.value.http == 404


def test_matriz_completa_de_transiciones() -> None:
    for actual in ESTADOS:
        for nuevo in ESTADOS:
            if nuevo in TRANSICIONES[actual]:
                validar_transicion(actual, nuevo)
            else:
                with pytest.raises(ErrorDominio) as excinfo:
                    validar_transicion(actual, nuevo)
                assert excinfo.value.codigo == "TRANSICION_INVALIDA"


def test_cantidad_entera_2_0_es_valida(clientes: dict) -> None:
    entrada = deepcopy(C1["entrada"])
    entrada["items"][0]["cantidad"] = 2.0

    pedido = validar_pedido(entrada, clientes)
    assert pedido.items[0].cantidad == 2


def test_cantidad_fraccionaria_es_rechazada(clientes: dict) -> None:
    entrada = deepcopy(C1["entrada"])
    entrada["items"][0]["cantidad"] = 2.5

    with pytest.raises(ErrorDominio) as excinfo:
        validar_pedido(entrada, clientes)
    assert excinfo.value.codigo == "CANTIDAD_INVALIDA"


def test_precio_negativo_es_rechazado(clientes: dict) -> None:
    entrada = deepcopy(C1["entrada"])
    entrada["items"][0]["precioUnitario"] = -1

    with pytest.raises(ErrorDominio) as excinfo:
        validar_pedido(entrada, clientes)
    assert excinfo.value.codigo == "PRECIO_INVALIDO"
    assert excinfo.value.campo == "items[0].precioUnitario"


def test_campos_extra_se_ignoran(clientes: dict) -> None:
    entrada = deepcopy(C1["entrada"])
    entrada["campoExtra"] = "ignorado"
    entrada["items"][0]["otroExtra"] = 123

    pedido = validar_pedido(entrada, clientes)
    assert "campoExtra" not in pedido.a_dict()
    assert "otroExtra" not in pedido.a_dict()["items"][0]


def test_lote_conserva_orden_y_suma_total(clientes: dict) -> None:
    pedidos = []
    for indice in range(20):
        entrada = deepcopy(C1["entrada"])
        entrada["id"] = f"PED-LOTE-{indice:02d}"
        pedidos.append(entrada)

    resultado = procesar_lote(pedidos, clientes, max_workers=4)

    assert [fila["indice"] for fila in resultado["resultados"]] == list(range(20))
    assert [fila["pedido"]["id"] for fila in resultado["resultados"]] == [
        f"PED-LOTE-{indice:02d}" for indice in range(20)
    ]
    assert resultado["resumen"] == {
        "total": 20,
        "exitosos": 20,
        "fallidos": 0,
        "montoTotal": 14384.0,
    }


def test_lote_mezcla_exitos_y_errores(clientes: dict) -> None:
    resultado = procesar_lote([C1["entrada"], C2["entrada"]], clientes, max_workers=2)

    assert resultado["resultados"][0]["ok"] is True
    assert resultado["resultados"][1]["ok"] is False
    assert resultado["resultados"][1]["error"]["codigo"] == "CANTIDAD_INVALIDA"
    assert resultado["resumen"]["exitosos"] == 1
    assert resultado["resumen"]["fallidos"] == 1
    assert importe(resultado["resumen"]["montoTotal"]) == importe("719.20")


def test_lote_vacio_es_rechazado(clientes: dict) -> None:
    with pytest.raises(ErrorDominio) as excinfo:
        procesar_lote([], clientes)
    assert excinfo.value.codigo == "LOTE_VACIO"


def test_descuento_vip_no_alcanza_el_tope(clientes: dict) -> None:
    """Con 10 % + 5 %, el tope de 20 % queda como defensa, no se alcanza."""
    almacen = crear_almacen(clientes)
    pedido = almacen.obtener("PED-0009")
    assert pedido is not None

    from src.reglas import calcular

    calculos = calcular(pedido, clientes[pedido.clienteId])
    assert calculos.porcentajeDescuento == 15
    assert calculos.porcentajeDescuento <= 20
    assert importe(calculos.total) == importe(Decimal("1498.72"))
