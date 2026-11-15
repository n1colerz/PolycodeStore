"""Modelos de dominio y constantes compartidas."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

ESTADOS = ("recibido", "en_preparacion", "enviado", "entregado", "cancelado")
ESTADOS_VALIDOS = frozenset(ESTADOS)

TIPOS_ENVIO = ("estandar", "express", "retiro")
TIPOS_ENVIO_VALIDOS = frozenset(TIPOS_ENVIO)

METODOS_PAGO = ("efectivo", "tarjeta", "transferencia")
METODOS_PAGO_VALIDOS = frozenset(METODOS_PAGO)

PRIORIDADES = ("alta", "media", "baja")
PRIORIDADES_VALIDAS = frozenset(PRIORIDADES)
ORDEN_PRIORIDAD = {"alta": 0, "media": 1, "baja": 2}

# Transiciones permitidas: recibido → en_preparacion → enviado → entregado.
# Cualquier estado no final puede pasar a cancelado.
TRANSICIONES: dict[str, frozenset[str]] = {
    "recibido": frozenset({"en_preparacion", "cancelado"}),
    "en_preparacion": frozenset({"enviado", "cancelado"}),
    "enviado": frozenset({"entregado", "cancelado"}),
    "entregado": frozenset(),
    "cancelado": frozenset(),
}


@dataclass(frozen=True)
class Cliente:
    id: str
    nombre: str
    email: str
    tipo: str


@dataclass(frozen=True)
class Producto:
    codigo: str
    nombre: str
    precioUnitario: float
    categoria: str


@dataclass(frozen=True)
class ItemPedido:
    codigoProducto: str
    nombre: str
    precioUnitario: Decimal
    cantidad: int

    def a_dict(self) -> dict:
        return {
            "codigoProducto": self.codigoProducto,
            "nombre": self.nombre,
            "precioUnitario": float(self.precioUnitario),
            "cantidad": self.cantidad,
        }


@dataclass(frozen=True)
class Pedido:
    id: str
    clienteId: str
    fechaCreacion: str
    estado: str
    tipoEnvio: str
    metodoPago: str
    prioridad: str
    items: tuple[ItemPedido, ...]
    fechaInstante: datetime

    def a_dict(self) -> dict:
        """Pedido normalizado sin cálculos."""
        return {
            "id": self.id,
            "clienteId": self.clienteId,
            "fechaCreacion": self.fechaCreacion,
            "estado": self.estado,
            "tipoEnvio": self.tipoEnvio,
            "metodoPago": self.metodoPago,
            "prioridad": self.prioridad,
            "items": [item.a_dict() for item in self.items],
        }


@dataclass(frozen=True)
class Calculos:
    subtotal: Decimal
    porcentajeDescuento: int
    descuento: Decimal
    impuesto: Decimal
    costoEnvio: Decimal
    total: Decimal

    def a_dict(self) -> dict:
        return {
            "subtotal": float(self.subtotal),
            "porcentajeDescuento": self.porcentajeDescuento,
            "descuento": float(self.descuento),
            "impuesto": float(self.impuesto),
            "costoEnvio": float(self.costoEnvio),
            "total": float(self.total),
        }
