"""Pruebas de integración de la API HTTP."""

import json
import threading
from copy import deepcopy
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from ayudas import cargar_json, importe
from src.almacen import Almacen
from src.api import crear_servidor
from src.reglas import validar_pedido

C1 = next(c for c in cargar_json("casos_prueba.json")["casos"] if c["id"] == "C1")
C2 = next(c for c in cargar_json("casos_prueba.json")["casos"] if c["id"] == "C2")


@pytest.fixture()
def base_url(clientes: dict) -> str:
    brutos = cargar_json("pedidos_pequenos.json")["pedidos"]
    pedidos = [validar_pedido(bruto, clientes) for bruto in brutos]
    almacen = Almacen(pedidos, clientes)
    servidor = crear_servidor("127.0.0.1", 0, almacen)
    hilo = threading.Thread(
        target=lambda: servidor.serve_forever(poll_interval=0.05), daemon=True
    )
    hilo.start()
    try:
        yield f"http://127.0.0.1:{servidor.server_address[1]}"
    finally:
        servidor.shutdown()
        servidor.server_close()
        hilo.join(timeout=5)


def pedir(
    base: str, metodo: str, ruta: str, cuerpo: object | None = None
) -> tuple[int, object | None, object]:
    datos = (
        None
        if cuerpo is None
        else json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
    )
    solicitud = Request(
        base + ruta,
        data=datos,
        method=metodo,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(solicitud, timeout=5) as respuesta:
            contenido = respuesta.read()
            return (
                respuesta.status,
                json.loads(contenido) if contenido else None,
                respuesta.headers,
            )
    except HTTPError as error:
        contenido = error.read()
        return (
            error.code,
            json.loads(contenido) if contenido else None,
            error.headers,
        )


def pedir_crudo(base: str, metodo: str, ruta: str, cuerpo: bytes) -> tuple[int, dict]:
    solicitud = Request(
        base + ruta,
        data=cuerpo,
        method=metodo,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(solicitud, timeout=5) as respuesta:
            return respuesta.status, json.loads(respuesta.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def test_salud_y_cors(base_url: str) -> None:
    estado, cuerpo, cabeceras = pedir(base_url, "GET", "/salud")

    assert estado == 200
    assert cuerpo == {
        "lenguaje": "python",
        "estado": "ok",
        "version": "0.1.0",
        "pedidosEnMemoria": 10,
    }
    assert cabeceras.get("Access-Control-Allow-Origin") == "*"


def test_listar_filtrar_y_ordenar(base_url: str) -> None:
    estado, cuerpo, _ = pedir(base_url, "GET", "/pedidos")
    assert estado == 200
    assert cuerpo["total"] == 10
    assert len(cuerpo["pedidos"]) == 10

    _, recibidos, _ = pedir(base_url, "GET", "/pedidos?estado=recibido")
    assert [pedido["id"] for pedido in recibidos["pedidos"]] == [
        "PED-0001",
        "PED-0006",
    ]

    _, por_cliente, _ = pedir(base_url, "GET", "/pedidos?clienteId=CLI-001")
    assert por_cliente["total"] == 1
    assert por_cliente["pedidos"][0]["id"] == "PED-0001"

    _, ordenados, _ = pedir(base_url, "GET", "/pedidos?orden=monto")
    assert ordenados["pedidos"][0]["id"] == "PED-0009"

    _, desconocido, _ = pedir(base_url, "GET", "/pedidos?clienteId=CLI-999")
    assert desconocido == {"pedidos": [], "total": 0}

    error_estado, error_estado_cuerpo, _ = pedir(
        base_url, "GET", "/pedidos?estado=pagado"
    )
    assert error_estado == 400
    assert error_estado_cuerpo["codigo"] == "ESTADO_INVALIDO"

    error_orden, error_orden_cuerpo, _ = pedir(base_url, "GET", "/pedidos?orden=peso")
    assert error_orden == 400
    assert error_orden_cuerpo["codigo"] == "ORDEN_INVALIDO"


def test_obtener_pedido_y_404(base_url: str) -> None:
    estado, cuerpo, _ = pedir(base_url, "GET", "/pedidos/PED-0001")
    assert estado == 200
    assert cuerpo["id"] == "PED-0001"
    assert importe(cuerpo["calculos"]["total"]) == importe("1006.08")

    estado_404, cuerpo_404, _ = pedir(base_url, "GET", "/pedidos/PED-9999")
    assert estado_404 == 404
    assert cuerpo_404 == {
        "codigo": "PEDIDO_NO_ENCONTRADO",
        "mensaje": "El pedido 'PED-9999' no existe.",
        "campo": "id",
    }


def test_crear_pedido_valido_y_duplicado(base_url: str) -> None:
    entrada = deepcopy(C1["entrada"])
    entrada["id"] = "PED-API-01"

    estado, cuerpo, cabeceras = pedir(base_url, "POST", "/pedidos", entrada)
    assert estado == 201
    assert cuerpo["id"] == "PED-API-01"
    assert importe(cuerpo["calculos"]["total"]) == importe("719.20")
    assert cabeceras.get("Location") == "/pedidos/PED-API-01"

    _, salud, _ = pedir(base_url, "GET", "/salud")
    assert salud["pedidosEnMemoria"] == 11

    estado_dup, cuerpo_dup, _ = pedir(base_url, "POST", "/pedidos", entrada)
    assert estado_dup == 409
    assert cuerpo_dup == {
        "codigo": "PEDIDO_DUPLICADO",
        "mensaje": "Ya existe un pedido con el id 'PED-API-01'.",
        "campo": "id",
    }


def test_crear_pedido_invalido(base_url: str) -> None:
    estado, cuerpo, _ = pedir(base_url, "POST", "/pedidos", C2["entrada"])
    assert estado == 400
    assert cuerpo == {
        "codigo": "CANTIDAD_INVALIDA",
        "mensaje": "La cantidad debe ser un entero mayor que 0.",
        "campo": "items[0].cantidad",
    }


def test_crear_pedido_con_cliente_inexistente(base_url: str) -> None:
    entrada = deepcopy(C1["entrada"])
    entrada["id"] = "PED-API-02"
    entrada["clienteId"] = "CLI-999"

    estado, cuerpo, _ = pedir(base_url, "POST", "/pedidos", entrada)
    assert estado == 404
    assert cuerpo["codigo"] == "CLIENTE_NO_ENCONTRADO"


def test_patch_estado_valido_e_invalido(base_url: str) -> None:
    estado, cuerpo, _ = pedir(
        base_url,
        "PATCH",
        "/pedidos/PED-0001/estado",
        {"estado": "en_preparacion"},
    )
    assert estado == 200
    assert cuerpo["estado"] == "en_preparacion"

    estado_same, cuerpo_same, _ = pedir(
        base_url,
        "PATCH",
        "/pedidos/PED-0001/estado",
        {"estado": "en_preparacion"},
    )
    assert estado_same == 409
    assert cuerpo_same["codigo"] == "TRANSICION_INVALIDA"

    estado_entregado, cuerpo_entregado, _ = pedir(
        base_url,
        "PATCH",
        "/pedidos/PED-0004/estado",
        {"estado": "en_preparacion"},
    )
    assert estado_entregado == 409
    assert cuerpo_entregado == {
        "codigo": "TRANSICION_INVALIDA",
        "mensaje": "Transición de estado no permitida: 'entregado' → 'en_preparacion'.",
        "campo": "estado",
    }

    estado_enum, cuerpo_enum, _ = pedir(
        base_url,
        "PATCH",
        "/pedidos/PED-0002/estado",
        {"estado": "pagado"},
    )
    assert estado_enum == 400
    assert cuerpo_enum["codigo"] == "ESTADO_INVALIDO"

    estado_404, cuerpo_404, _ = pedir(
        base_url,
        "PATCH",
        "/pedidos/PED-9999/estado",
        {"estado": "en_preparacion"},
    )
    assert estado_404 == 404
    assert cuerpo_404["codigo"] == "PEDIDO_NO_ENCONTRADO"


def test_resumen(base_url: str) -> None:
    estado, cuerpo, _ = pedir(base_url, "GET", "/resumen")

    assert estado == 200
    assert cuerpo["totalPedidos"] == 10
    assert importe(cuerpo["montoTotal"]) == importe("7262.56")
    assert cuerpo["porEstado"] == {
        "recibido": 2,
        "en_preparacion": 2,
        "enviado": 2,
        "entregado": 2,
        "cancelado": 2,
    }
    assert cuerpo["porPrioridad"] == {"alta": 4, "media": 3, "baja": 3}


def test_lote_ordenado_y_resumen(base_url: str) -> None:
    primero = deepcopy(C1["entrada"])
    primero["id"] = "PED-LOTE-A"
    segundo = deepcopy(C2["entrada"])
    segundo["id"] = "PED-LOTE-B"

    estado, cuerpo, _ = pedir(
        base_url, "POST", "/pedidos/lote", {"pedidos": [primero, segundo]}
    )

    assert estado == 200
    assert [fila["indice"] for fila in cuerpo["resultados"]] == [0, 1]
    assert cuerpo["resultados"][0]["ok"] is True
    assert importe(cuerpo["resultados"][0]["pedido"]["calculos"]["total"]) == importe(
        "719.20"
    )
    assert cuerpo["resultados"][1]["ok"] is False
    assert cuerpo["resultados"][1]["error"]["codigo"] == "CANTIDAD_INVALIDA"
    assert cuerpo["resumen"] == {
        "total": 2,
        "exitosos": 1,
        "fallidos": 1,
        "montoTotal": 719.2,
    }


def test_lote_conserva_orden_con_muchas_entradas(base_url: str) -> None:
    pedidos = []
    for indice in range(30):
        entrada = deepcopy(C1["entrada"])
        entrada["id"] = f"PED-ORD-{indice:02d}"
        pedidos.append(entrada)

    estado, cuerpo, _ = pedir(base_url, "POST", "/pedidos/lote", {"pedidos": pedidos})

    assert estado == 200
    assert [fila["pedido"]["id"] for fila in cuerpo["resultados"]] == [
        f"PED-ORD-{indice:02d}" for indice in range(30)
    ]
    assert cuerpo["resumen"]["exitosos"] == 30


def test_lote_vacio_y_tipo_invalido(base_url: str) -> None:
    estado, cuerpo, _ = pedir(base_url, "POST", "/pedidos/lote", {"pedidos": []})
    assert estado == 400
    assert cuerpo["codigo"] == "LOTE_VACIO"

    estado_tipo, cuerpo_tipo, _ = pedir(
        base_url, "POST", "/pedidos/lote", {"pedidos": "no-es-lista"}
    )
    assert estado_tipo == 400
    assert cuerpo_tipo["codigo"] == "TIPO_INVALIDO"


def test_json_invalido(base_url: str) -> None:
    estado, cuerpo = pedir_crudo(base_url, "POST", "/pedidos", b'{"id":')
    assert estado == 400
    assert cuerpo == {
        "codigo": "JSON_INVALIDO",
        "mensaje": "El cuerpo de la solicitud no es un JSON válido.",
    }


def test_ruta_y_metodo_no_permitidos(base_url: str) -> None:
    estado, cuerpo, cabeceras = pedir(base_url, "GET", "/desconocida")
    assert estado == 404
    assert cuerpo == {
        "codigo": "RUTA_NO_ENCONTRADA",
        "mensaje": "La ruta '/desconocida' no existe.",
    }
    assert cabeceras.get("Access-Control-Allow-Origin") == "*"

    estado_metodo, cuerpo_metodo, _ = pedir(base_url, "DELETE", "/pedidos")
    assert estado_metodo == 405
    assert cuerpo_metodo == {
        "codigo": "METODO_NO_PERMITIDO",
        "mensaje": "El método 'DELETE' no está permitido para '/pedidos'.",
    }

    estado_lote, _, _ = pedir(base_url, "GET", "/pedidos/lote")
    assert estado_lote == 405


def test_preflight_options(base_url: str) -> None:
    estado, cuerpo, cabeceras = pedir(base_url, "OPTIONS", "/pedidos")
    assert estado == 204
    assert cuerpo is None
    assert cabeceras.get("Access-Control-Allow-Origin") == "*"
    assert "PATCH" in cabeceras.get("Access-Control-Allow-Methods", "")
