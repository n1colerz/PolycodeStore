"""Errores del dominio y de carga de datos.

Los errores de dominio se traducen directamente al contrato HTTP
({codigo, mensaje, campo?}). Los errores de datos son fallos fatales de
lectura/escritura y no se exponen al cliente de la API.
"""


class ErrorDominio(Exception):
    """Error de negocio o de validación con su equivalente HTTP."""

    def __init__(
        self,
        codigo: str,
        mensaje: str,
        campo: str | None = None,
        http: int = 400,
    ) -> None:
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje
        self.campo = campo
        self.http = http

    def a_dict(self) -> dict:
        """Representación exacta del contrato de error."""
        error = {"codigo": self.codigo, "mensaje": self.mensaje}
        if self.campo is not None:
            error["campo"] = self.campo
        return error


class ErrorDatos(Exception):
    """Fallo fatal al leer o escribir archivos de datos."""
