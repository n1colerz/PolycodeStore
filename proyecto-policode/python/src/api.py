"""API HTTP de la implementación Python (stdlib)."""

import json
import logging
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

from . import __version__
from .almacen import Almacen
from .errores import ErrorDominio
from .io_json import cargar_json_texto
from .modelos import ESTADOS_VALIDOS
from .reglas import procesar_lote, serializar_pedido, validar_pedido

_REGISTRO = logging.getLogger(__name__)


class ServidorAPI(ThreadingHTTPServer):
    """Servidor multihilo con el almacén y el lenguaje asociados."""

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def __init__(
        self,
        direccion: tuple[str, int],
        almacen: Almacen,
        lenguaje: str = "python",
    ) -> None:
        self.almacen = almacen
        self.lenguaje = lenguaje
        super().__init__(direccion, ManejadorAPI)


class ManejadorAPI(BaseHTTPRequestHandler):
    """Enrutador y traductor de errores de dominio a HTTP."""

    server_version = "PolycodePython/0.1"
    sys_version = ""

    # ------------------------------------------------------------------ HTTP

    def do_GET(self) -> None:
        self._despachar("GET")

    def do_POST(self) -> None:
        self._despachar("POST")

    def do_PATCH(self) -> None:
        self._despachar("PATCH")

    def do_PUT(self) -> None:
        self._despachar("PUT")

    def do_DELETE(self) -> None:
        self._despachar("DELETE")

    def do_OPTIONS(self) -> None:
        self._responder(204)

    def log_message(self, formato: str, *argumentos: object) -> None:
        if os.environ.get("POLY_LOG") == "1":
            super().log_message(formato, *argumentos)

    # ------------------------------------------------------------- Enrutado

    def _despachar(self, metodo: str) -> None:
        try:
            ruta, partes, consulta = self._analizar_ruta()
            self._enrutar(metodo, ruta, partes, consulta)
        except ErrorDominio as exc:
            self._responder(exc.http, exc.a_dict())
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:  # noqa: BLE001 - nunca filtrar detalles internos
            _REGISTRO.exception("Error inesperado atendiendo %s", self.path)
            self._responder(
                500,
                {"codigo": "ERROR_INTERNO", "mensaje": "Error interno del servidor."},
            )

    def _analizar_ruta(self) -> tuple[str, list[str], dict[str, list[str]]]:
        analizada = urlparse(self.path)
        ruta = analizada.path or "/"
        if ruta != "/":
            ruta = ruta.rstrip("/")
        partes = [unquote(parte) for parte in ruta.split("/") if parte]
        consulta = parse_qs(analizada.query, keep_blank_values=True)
        return ruta, partes, consulta

    def _enrutar(
        self,
        metodo: str,
        ruta: str,
        partes: list[str],
        consulta: dict[str, list[str]],
    ) -> None:
        if partes == ["salud"]:
            self._permitir(metodo, "GET", ruta)
            self._salud()
            return

        if partes == ["resumen"]:
            self._permitir(metodo, "GET", ruta)
            self._resumen()
            return

        if partes == ["pedidos"]:
            if metodo == "GET":
                self._listar(consulta)
                return
            if metodo == "POST":
                self._crear()
                return
            self._permitir(metodo, "GET", ruta)

        if partes == ["pedidos", "lote"]:
            self._permitir(metodo, "POST", ruta)
            self._lote()
            return

        if len(partes) == 2 and partes[0] == "pedidos":
            self._permitir(metodo, "GET", ruta)
            self._obtener(partes[1])
            return

        if len(partes) == 3 and partes[0] == "pedidos" and partes[2] == "estado":
            self._permitir(metodo, "PATCH", ruta)
            self._cambiar_estado(partes[1])
            return

        raise ErrorDominio(
            "RUTA_NO_ENCONTRADA",
            f"La ruta '{ruta}' no existe.",
            None,
            404,
        )

    def _permitir(self, metodo: str, esperado: str, ruta: str) -> None:
        if metodo != esperado:
            raise ErrorDominio(
                "METODO_NO_PERMITIDO",
                f"El método '{metodo}' no está permitido para '{ruta}'.",
                None,
                405,
            )

    # ------------------------------------------------------------ Endpoints

    def _salud(self) -> None:
        self._responder(
            200,
            {
                "lenguaje": self.server.lenguaje,  # type: ignore[attr-defined]
                "estado": "ok",
                "version": __version__,
                "pedidosEnMemoria": self.server.almacen.total(),  # type: ignore[attr-defined]
            },
        )

    def _listar(self, consulta: dict[str, list[str]]) -> None:
        cliente_id = self._parametro(consulta, "clienteId")
        estado = self._parametro(consulta, "estado")
        orden = self._parametro(consulta, "orden")

        if estado is not None and estado not in ESTADOS_VALIDOS:
            raise ErrorDominio(
                "ESTADO_INVALIDO",
                "El estado debe ser uno de: recibido, en_preparacion, enviado, entregado, cancelado.",
                "estado",
                400,
            )
        if orden is not None and orden not in {"fecha", "monto", "prioridad"}:
            raise ErrorDominio(
                "ORDEN_INVALIDO",
                "El parámetro orden debe ser uno de: fecha, monto, prioridad.",
                "orden",
                400,
            )

        pedidos = self.server.almacen.listar(  # type: ignore[attr-defined]
            clienteId=cliente_id, estado=estado, orden=orden
        )
        self._responder(200, {"pedidos": pedidos, "total": len(pedidos)})

    def _obtener(self, pedido_id: str) -> None:
        pedido = self.server.almacen.obtener(pedido_id)  # type: ignore[attr-defined]
        if pedido is None:
            raise ErrorDominio(
                "PEDIDO_NO_ENCONTRADO",
                f"El pedido '{pedido_id}' no existe.",
                "id",
                404,
            )
        self._responder(
            200,
            serializar_pedido(
                pedido,
                self.server.almacen.clientes,  # type: ignore[attr-defined]
            ),
        )

    def _crear(self) -> None:
        datos = self._leer_cuerpo_json()
        almacen = self.server.almacen  # type: ignore[attr-defined]
        pedido = validar_pedido(datos, almacen.clientes)
        almacen.agregar(pedido)
        self._responder(
            201,
            serializar_pedido(pedido, almacen.clientes),
            {"Location": f"/pedidos/{quote(pedido.id, safe='')}"},
        )

    def _cambiar_estado(self, pedido_id: str) -> None:
        datos = self._leer_cuerpo_json()
        if "estado" not in datos or datos["estado"] is None:
            raise ErrorDominio(
                "CAMPO_REQUERIDO", "El campo 'estado' es obligatorio.", "estado", 400
            )
        if not isinstance(datos["estado"], str):
            raise ErrorDominio(
                "TIPO_INVALIDO",
                "El campo 'estado' tiene un tipo inválido.",
                "estado",
                400,
            )

        almacen = self.server.almacen  # type: ignore[attr-defined]
        pedido = almacen.actualizar_estado(pedido_id, datos["estado"])
        self._responder(200, serializar_pedido(pedido, almacen.clientes))

    def _resumen(self) -> None:
        self._responder(200, self.server.almacen.resumen())  # type: ignore[attr-defined]

    def _lote(self) -> None:
        datos = self._leer_cuerpo_json()
        if "pedidos" not in datos or datos["pedidos"] is None:
            raise ErrorDominio(
                "CAMPO_REQUERIDO",
                "El campo 'pedidos' es obligatorio.",
                "pedidos",
                400,
            )
        if not isinstance(datos["pedidos"], list):
            raise ErrorDominio(
                "TIPO_INVALIDO",
                "El campo 'pedidos' tiene un tipo inválido.",
                "pedidos",
                400,
            )
        resultado = procesar_lote(
            datos["pedidos"],
            self.server.almacen.clientes,  # type: ignore[attr-defined]
        )
        self._responder(200, resultado)

    # -------------------------------------------------------------- Utilidades

    @staticmethod
    def _parametro(consulta: dict[str, list[str]], nombre: str) -> str | None:
        valores = consulta.get(nombre)
        return valores[0] if valores else None

    def _leer_cuerpo_json(self) -> dict:
        longitud_texto = self.headers.get("Content-Length")
        if longitud_texto is None:
            raise self._error_json()
        try:
            longitud = int(longitud_texto)
        except ValueError as exc:
            raise self._error_json() from exc
        if longitud <= 0:
            raise self._error_json()

        crudo = self.rfile.read(longitud)
        try:
            texto = crudo.decode("utf-8")
            datos = cargar_json_texto(texto)
        except (UnicodeDecodeError, ValueError) as exc:
            raise self._error_json() from exc

        if not isinstance(datos, dict):
            raise ErrorDominio(
                "CUERPO_INVALIDO", "El cuerpo debe ser un objeto JSON.", None, 400
            )
        return datos

    @staticmethod
    def _error_json() -> ErrorDominio:
        return ErrorDominio(
            "JSON_INVALIDO",
            "El cuerpo de la solicitud no es un JSON válido.",
            None,
            400,
        )

    def _responder(
        self,
        estado: int,
        cuerpo: dict | None = None,
        cabeceras: dict[str, str] | None = None,
    ) -> None:
        datos = (
            b""
            if cuerpo is None
            else json.dumps(cuerpo, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
        )
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        for nombre, valor in (cabeceras or {}).items():
            self.send_header(nombre, valor)
        self.end_headers()

        if datos:
            try:
                self.wfile.write(datos)
            except (BrokenPipeError, ConnectionResetError):
                pass


def crear_servidor(
    host: str,
    puerto: int,
    almacen: Almacen,
    lenguaje: str = "python",
) -> ServidorAPI:
    return ServidorAPI((host, puerto), almacen, lenguaje)
