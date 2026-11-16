// Package modelos contiene los tipos de dominio y las constantes compartidas.
package modelos

import (
	"math/big"
	"strconv"
	"strings"
	"time"

	"polystore/internal/errores"
)

// Version es la versión del contrato implementada.
const Version = "0.1.0"

// Importe es un número monetario que siempre se serializa con decimales,
// igual que hace Python al convertir Decimal a float.
type Importe float64

// MarshalJSON implementa json.Marshaler.
func (i Importe) MarshalJSON() ([]byte, error) {
	texto := strconv.FormatFloat(float64(i), 'f', -1, 64)
	if !strings.Contains(texto, ".") {
		texto += ".0"
	}
	return []byte(texto), nil
}

// Estados del pedido.
const (
	EstadoRecibido      = "recibido"
	EstadoEnPreparacion = "en_preparacion"
	EstadoEnviado       = "enviado"
	EstadoEntregado     = "entregado"
	EstadoCancelado     = "cancelado"
)

// Estados es el enum de estados del contrato.
var Estados = []string{
	EstadoRecibido,
	EstadoEnPreparacion,
	EstadoEnviado,
	EstadoEntregado,
	EstadoCancelado,
}

// TiposEnvio es el enum de tipos de envío.
var TiposEnvio = []string{"estandar", "express", "retiro"}

// MetodosPago es el enum de métodos de pago.
var MetodosPago = []string{"efectivo", "tarjeta", "transferencia"}

// Prioridades es el enum de prioridades.
var Prioridades = []string{"alta", "media", "baja"}

// Transiciones permite únicamente: recibido → en_preparacion → enviado →
// entregado, y la cancelación desde cualquier estado no final.
var Transiciones = map[string][]string{
	EstadoRecibido:      {EstadoEnPreparacion, EstadoCancelado},
	EstadoEnPreparacion: {EstadoEnviado, EstadoCancelado},
	EstadoEnviado:       {EstadoEntregado, EstadoCancelado},
	EstadoEntregado:     {},
	EstadoCancelado:     {},
}

// OrdenPrioridad ordena las prioridades de mayor a menor urgencia.
var OrdenPrioridad = map[string]int{"alta": 0, "media": 1, "baja": 2}

// Cliente del catálogo.
type Cliente struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	Email  string `json:"email"`
	Tipo   string `json:"tipo"`
}

// Producto del catálogo de referencia.
type Producto struct {
	Codigo         string  `json:"codigo"`
	Nombre         string  `json:"nombre"`
	PrecioUnitario float64 `json:"precioUnitario"`
	Categoria      string  `json:"categoria"`
}

// Item de un pedido. PrecioExacto conserva el valor decimal literal para
// que los cálculos no dependan de la coma flotante.
type Item struct {
	CodigoProducto string   `json:"codigoProducto"`
	Nombre         string   `json:"nombre"`
	PrecioUnitario Importe  `json:"precioUnitario"`
	Cantidad       int64    `json:"cantidad"`
	PrecioExacto   *big.Rat `json:"-"`
}

// Pedido normalizado; Calculos se rellena en las respuestas.
type Pedido struct {
	ID            string    `json:"id"`
	ClienteID     string    `json:"clienteId"`
	FechaCreacion string    `json:"fechaCreacion"`
	Estado        string    `json:"estado"`
	TipoEnvio     string    `json:"tipoEnvio"`
	MetodoPago    string    `json:"metodoPago"`
	Prioridad     string    `json:"prioridad"`
	Items         []Item    `json:"items"`
	Calculos      *Calculos `json:"calculos,omitempty"`
	FechaInstante time.Time `json:"-"`
}

// Calculos de un pedido (importes ya redondeados a 2 decimales).
type Calculos struct {
	Subtotal            Importe `json:"subtotal"`
	PorcentajeDescuento int     `json:"porcentajeDescuento"`
	Descuento           Importe `json:"descuento"`
	Impuesto            Importe `json:"impuesto"`
	CostoEnvio          Importe `json:"costoEnvio"`
	Total               Importe `json:"total"`
	TotalCents          int64   `json:"-"`
}

// ConteoEstado cuenta pedidos por estado.
type ConteoEstado struct {
	Recibido      int `json:"recibido"`
	EnPreparacion int `json:"en_preparacion"`
	Enviado       int `json:"enviado"`
	Entregado     int `json:"entregado"`
	Cancelado     int `json:"cancelado"`
}

// ConteoPrioridad cuenta pedidos por prioridad.
type ConteoPrioridad struct {
	Alta  int `json:"alta"`
	Media int `json:"media"`
	Baja  int `json:"baja"`
}

// Resumen de ventas.
type Resumen struct {
	TotalPedidos int             `json:"totalPedidos"`
	MontoTotal   Importe         `json:"montoTotal"`
	PorEstado    ConteoEstado    `json:"porEstado"`
	PorPrioridad ConteoPrioridad `json:"porPrioridad"`
}

// ListaPedidos es la respuesta de GET /pedidos.
type ListaPedidos struct {
	Pedidos []Pedido `json:"pedidos"`
	Total   int      `json:"total"`
}

// ResultadoLote es el resultado de una entrada del lote.
type ResultadoLote struct {
	Indice int          `json:"indice"`
	OK     bool         `json:"ok"`
	Pedido *Pedido      `json:"pedido,omitempty"`
	Error  *errores.API `json:"error,omitempty"`
}

// ResumenLote resume el procesamiento de un lote.
type ResumenLote struct {
	Total      int     `json:"total"`
	Exitosos   int     `json:"exitosos"`
	Fallidos   int     `json:"fallidos"`
	MontoTotal Importe `json:"montoTotal"`
}

// Lote es la respuesta de POST /pedidos/lote.
type Lote struct {
	Resultados []ResultadoLote `json:"resultados"`
	Resumen    ResumenLote     `json:"resumen"`
}

// Salud es la respuesta de GET /salud.
type Salud struct {
	Lenguaje         string `json:"lenguaje"`
	Estado           string `json:"estado"`
	Version          string `json:"version"`
	PedidosEnMemoria int    `json:"pedidosEnMemoria"`
}
