// Package errores define el catálogo de errores del dominio y su traducción
// al contrato HTTP ({codigo, mensaje, campo?}).
package errores

import "fmt"

// Dominio es un error de negocio o de validación.
type Dominio struct {
	Codigo  string
	Mensaje string
	Campo   string
	HTTP    int
}

// Error implementa la interfaz error.
func (e *Dominio) Error() string {
	return fmt.Sprintf("%s: %s", e.Codigo, e.Mensaje)
}

// API es la representación JSON de un error del contrato.
type API struct {
	Codigo  string `json:"codigo"`
	Mensaje string `json:"mensaje"`
	Campo   string `json:"campo,omitempty"`
}

// API convierte el error de dominio al formato de la API.
func (e *Dominio) API() API {
	return API{Codigo: e.Codigo, Mensaje: e.Mensaje, Campo: e.Campo}
}

// Datos es un fallo fatal de lectura o escritura de archivos de datos.
type Datos struct {
	Mensaje string
}

// Error implementa la interfaz error.
func (e *Datos) Error() string { return e.Mensaje }

func crear(codigo, mensaje, campo string, status int) *Dominio {
	return &Dominio{Codigo: codigo, Mensaje: mensaje, Campo: campo, HTTP: status}
}

// CampoRequerido indica que falta un campo obligatorio.
func CampoRequerido(campo string) *Dominio {
	return crear("CAMPO_REQUERIDO", fmt.Sprintf("El campo '%s' es obligatorio.", campo), campo, 400)
}

// TipoInvalido indica que un campo tiene un tipo inesperado.
func TipoInvalido(campo string) *Dominio {
	return crear("TIPO_INVALIDO", fmt.Sprintf("El campo '%s' tiene un tipo inválido.", campo), campo, 400)
}

// IDInvalido indica que el id no cumple el patrón del contrato.
func IDInvalido() *Dominio {
	return crear("ID_INVALIDO", "El id debe cumplir el patrón ^[A-Za-z0-9_-]{3,40}$.", "id", 400)
}

// FechaInvalida indica que la fecha no es ISO 8601 con zona horaria.
func FechaInvalida() *Dominio {
	return crear(
		"FECHA_INVALIDA",
		"La fechaCreacion debe estar en formato ISO 8601 con zona horaria.",
		"fechaCreacion",
		400,
	)
}

// TipoEnvioInvalido indica un tipoEnvio fuera del enum.
func TipoEnvioInvalido() *Dominio {
	return crear(
		"TIPO_ENVIO_INVALIDO",
		"El tipoEnvio debe ser uno de: estandar, express, retiro.",
		"tipoEnvio",
		400,
	)
}

// MetodoPagoInvalido indica un metodoPago fuera del enum.
func MetodoPagoInvalido() *Dominio {
	return crear(
		"METODO_PAGO_INVALIDO",
		"El metodoPago debe ser uno de: efectivo, tarjeta, transferencia.",
		"metodoPago",
		400,
	)
}

// EstadoInvalido indica un estado fuera del enum.
func EstadoInvalido() *Dominio {
	return crear(
		"ESTADO_INVALIDO",
		"El estado debe ser uno de: recibido, en_preparacion, enviado, entregado, cancelado.",
		"estado",
		400,
	)
}

// PrioridadInvalida indica una prioridad fuera del enum.
func PrioridadInvalida() *Dominio {
	return crear("PRIORIDAD_INVALIDA", "La prioridad debe ser una de: alta, media, baja.", "prioridad", 400)
}

// PedidoSinItems indica un pedido sin items.
func PedidoSinItems() *Dominio {
	return crear("PEDIDO_SIN_ITEMS", "El pedido debe tener al menos un item.", "items", 400)
}

// ClienteNoEncontrado indica que el cliente no está en el catálogo.
func ClienteNoEncontrado(clienteID string) *Dominio {
	return crear(
		"CLIENTE_NO_ENCONTRADO",
		fmt.Sprintf("El cliente '%s' no existe en el catálogo.", clienteID),
		"clienteId",
		404,
	)
}

// PrecioInvalido indica un precioUnitario negativo.
func PrecioInvalido(campo string) *Dominio {
	return crear(
		"PRECIO_INVALIDO",
		"El precioUnitario debe ser un número mayor o igual que 0.",
		campo,
		400,
	)
}

// CantidadInvalida indica una cantidad que no es un entero mayor que 0.
func CantidadInvalida(campo string) *Dominio {
	return crear("CANTIDAD_INVALIDA", "La cantidad debe ser un entero mayor que 0.", campo, 400)
}

// PedidoDuplicado indica que el id ya existe en el almacén.
func PedidoDuplicado(id string) *Dominio {
	return crear("PEDIDO_DUPLICADO", fmt.Sprintf("Ya existe un pedido con el id '%s'.", id), "id", 409)
}

// PedidoNoEncontrado indica que el pedido no está en el almacén.
func PedidoNoEncontrado(id string) *Dominio {
	return crear("PEDIDO_NO_ENCONTRADO", fmt.Sprintf("El pedido '%s' no existe.", id), "id", 404)
}

// TransicionInvalida indica una transición de estado no permitida.
func TransicionInvalida(actual, nuevo string) *Dominio {
	return crear(
		"TRANSICION_INVALIDA",
		fmt.Sprintf("Transición de estado no permitida: '%s' → '%s'.", actual, nuevo),
		"estado",
		409,
	)
}

// OrdenInvalido indica un valor de orden no soportado.
func OrdenInvalido() *Dominio {
	return crear(
		"ORDEN_INVALIDO",
		"El parámetro orden debe ser uno de: fecha, monto, prioridad.",
		"orden",
		400,
	)
}

// LoteVacio indica un lote sin pedidos.
func LoteVacio() *Dominio {
	return crear("LOTE_VACIO", "La lista de pedidos no puede estar vacía.", "pedidos", 400)
}

// JSONInvalido indica un cuerpo que no es JSON válido.
func JSONInvalido() *Dominio {
	return crear("JSON_INVALIDO", "El cuerpo de la solicitud no es un JSON válido.", "", 400)
}

// CuerpoInvalido indica un cuerpo JSON que no es un objeto.
func CuerpoInvalido(campo string) *Dominio {
	return crear("CUERPO_INVALIDO", "El cuerpo debe ser un objeto JSON.", campo, 400)
}

// RutaNoEncontrada indica una ruta inexistente.
func RutaNoEncontrada(ruta string) *Dominio {
	return crear("RUTA_NO_ENCONTRADA", fmt.Sprintf("La ruta '%s' no existe.", ruta), "", 404)
}

// MetodoNoPermitido indica un método HTTP no soportado en la ruta.
func MetodoNoPermitido(metodo, ruta string) *Dominio {
	return crear(
		"METODO_NO_PERMITIDO",
		fmt.Sprintf("El método '%s' no está permitido para '%s'.", metodo, ruta),
		"",
		405,
	)
}

// ErrorInterno representa un fallo inesperado.
func ErrorInterno() *Dominio {
	return crear("ERROR_INTERNO", "Error interno del servidor.", "", 500)
}
