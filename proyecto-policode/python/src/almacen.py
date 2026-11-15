"""Almacén en memoria de pedidos con acceso concurrente seguro."""

from dataclasses import replace
from decimal import Decimal
from threading import RLock

from .errores import ErrorDatos, ErrorDominio
from .modelos import (
    Cliente,
    ESTADOS,
    ORDEN_PRIORIDAD,
    PRIORIDADES,
    Pedido,
)
from .reglas import calcular, redondear, serializar_pedido, validar_transicion


class Almacen:
    """Pedidos en memoria, protegidos por un lock reentrante."""

    def __init__(self, pedidos: list[Pedido], clientes: dict[str, Cliente]) -> None:
        self._clientes = clientes
        self._lock = RLock()
        self._pedidos: list[Pedido] = []
        self._por_id: dict[str, Pedido] = {}
        self._indice: dict[str, int] = {}

        for pedido in pedidos:
            if pedido.id in self._por_id:
                raise ErrorDatos(f"El pedido '{pedido.id}' está duplicado en el dataset.")
            self._indice[pedido.id] = len(self._pedidos)
            self._pedidos.append(pedido)
            self._por_id[pedido.id] = pedido

    @property
    def clientes(self) -> dict[str, Cliente]:
        return self._clientes

    def total(self) -> int:
        with self._lock:
            return len(self._pedidos)

    def listar(
        self,
        clienteId: str | None = None,
        estado: str | None = None,
        orden: str | None = None,
    ) -> list[dict]:
        with self._lock:
            pedidos = list(self._pedidos)

        if clienteId is not None:
            pedidos = [pedido for pedido in pedidos if pedido.clienteId == clienteId]
        if estado is not None:
            pedidos = [pedido for pedido in pedidos if pedido.estado == estado]

        if orden == "fecha":
            pedidos.sort(key=lambda pedido: (pedido.fechaInstante, pedido.id))
        elif orden == "monto":
            totales = {
                pedido.id: calcular(pedido, self._clientes[pedido.clienteId]).total
                for pedido in pedidos
            }
            pedidos.sort(key=lambda pedido: (-totales[pedido.id], pedido.id))
        elif orden == "prioridad":
            pedidos.sort(
                key=lambda pedido: (
                    ORDEN_PRIORIDAD[pedido.prioridad],
                    pedido.fechaInstante,
                    pedido.id,
                )
            )

        return [serializar_pedido(pedido, self._clientes) for pedido in pedidos]

    def obtener(self, pedido_id: str) -> Pedido | None:
        with self._lock:
            return self._por_id.get(pedido_id)

    def agregar(self, pedido: Pedido) -> None:
        with self._lock:
            if pedido.id in self._por_id:
                raise ErrorDominio(
                    "PEDIDO_DUPLICADO",
                    f"Ya existe un pedido con el id '{pedido.id}'.",
                    "id",
                    409,
                )
            self._indice[pedido.id] = len(self._pedidos)
            self._pedidos.append(pedido)
            self._por_id[pedido.id] = pedido

    def actualizar_estado(self, pedido_id: str, estado_nuevo: str) -> Pedido:
        with self._lock:
            pedido = self._por_id.get(pedido_id)
            if pedido is None:
                raise ErrorDominio(
                    "PEDIDO_NO_ENCONTRADO",
                    f"El pedido '{pedido_id}' no existe.",
                    "id",
                    404,
                )
            validar_transicion(pedido.estado, estado_nuevo)
            actualizado = replace(pedido, estado=estado_nuevo)
            indice = self._indice[pedido_id]
            self._pedidos[indice] = actualizado
            self._por_id[pedido_id] = actualizado
            return actualizado

    def resumen(self) -> dict:
        with self._lock:
            pedidos = list(self._pedidos)

        por_estado = {estado: 0 for estado in ESTADOS}
        por_prioridad = {prioridad: 0 for prioridad in PRIORIDADES}
        monto = Decimal("0")

        for pedido in pedidos:
            por_estado[pedido.estado] += 1
            por_prioridad[pedido.prioridad] += 1
            if pedido.estado != "cancelado":
                monto += calcular(pedido, self._clientes[pedido.clienteId]).total

        return {
            "totalPedidos": len(pedidos),
            "montoTotal": float(redondear(monto)),
            "porEstado": por_estado,
            "porPrioridad": por_prioridad,
        }
