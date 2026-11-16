// Package reglas implementa la validación, los cálculos y las transiciones
// de estado del contrato. Es el equivalente Go de src/reglas.py en Python.
package reglas

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"time"

	"polystore/internal/errores"
	"polystore/internal/modelos"
)

var (
	patronID    = regexp.MustCompile(`^[A-Za-z0-9_-]{3,40}$`)
	patronFecha = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$`)
)

// Catalogo agrupa los clientes y productos cargados desde disco.
type Catalogo struct {
	Clientes  map[string]modelos.Cliente
	Productos []modelos.Producto
}

// ---------------------------------------------------------------- validación

func esNull(bruto json.RawMessage) bool {
	return string(bytes.TrimSpace(bruto)) == "null"
}

// requerido devuelve el valor de un campo obligatorio.
func requerido(mapa map[string]json.RawMessage, campo string) (json.RawMessage, *errores.Dominio) {
	bruto, ok := mapa[campo]
	if !ok || esNull(bruto) {
		return nil, errores.CampoRequerido(campo)
	}
	return bruto, nil
}

// texto devuelve un campo de tipo string.
func texto(mapa map[string]json.RawMessage, campo string) (string, *errores.Dominio) {
	bruto, err := requerido(mapa, campo)
	if err != nil {
		return "", err
	}
	var valor string
	if e := json.Unmarshal(bruto, &valor); e != nil {
		return "", errores.TipoInvalido(campo)
	}
	return valor, nil
}

// textoOpcional devuelve un campo string con valor por defecto.
func textoOpcional(mapa map[string]json.RawMessage, campo, defecto string) (string, *errores.Dominio) {
	bruto, ok := mapa[campo]
	if !ok || esNull(bruto) {
		return defecto, nil
	}
	var valor string
	if e := json.Unmarshal(bruto, &valor); e != nil {
		return "", errores.TipoInvalido(campo)
	}
	return valor, nil
}

// numero devuelve un campo numérico (JSON number estricto).
func numero(mapa map[string]json.RawMessage, campo string) (json.Number, *errores.Dominio) {
	bruto, err := requerido(mapa, campo)
	if err != nil {
		return "", err
	}
	decodificador := json.NewDecoder(bytes.NewReader(bruto))
	decodificador.UseNumber()
	var valor any
	if e := decodificador.Decode(&valor); e != nil {
		return "", errores.TipoInvalido(campo)
	}
	numeroJSON, ok := valor.(json.Number)
	if !ok {
		return "", errores.TipoInvalido(campo)
	}
	return numeroJSON, nil
}

// lista devuelve un campo de tipo array.
func lista(mapa map[string]json.RawMessage, campo string) ([]json.RawMessage, *errores.Dominio) {
	bruto, err := requerido(mapa, campo)
	if err != nil {
		return nil, err
	}
	var elementos []json.RawMessage
	if e := json.Unmarshal(bruto, &elementos); e != nil {
		return nil, errores.TipoInvalido(campo)
	}
	return elementos, nil
}

func contiene(lista []string, valor string) bool {
	for _, elemento := range lista {
		if elemento == valor {
			return true
		}
	}
	return false
}

// parsearFecha valida ISO 8601 con zona horaria.
func parsearFecha(valor string) (time.Time, *errores.Dominio) {
	coincidencia := patronFecha.FindStringSubmatch(valor)
	if coincidencia == nil {
		return time.Time{}, errores.FechaInvalida()
	}

	fraccion := coincidencia[3]
	// Se conservan 6 decimales, igual que la precisión de Python.
	if len(fraccion) > 7 {
		fraccion = fraccion[:7]
	}
	zona := coincidencia[4]
	if zona == "Z" {
		zona = "+00:00"
	}

	instante, err := time.Parse(time.RFC3339, coincidencia[1]+"T"+coincidencia[2]+fraccion+zona)
	if err != nil {
		return time.Time{}, errores.FechaInvalida()
	}
	return instante, nil
}

// ValidarPedido valida una entrada cruda y devuelve el pedido de dominio.
func ValidarPedido(bruto map[string]json.RawMessage, catalogo Catalogo) (modelos.Pedido, *errores.Dominio) {
	for _, campo := range []string{"id", "clienteId", "fechaCreacion", "tipoEnvio", "metodoPago", "items"} {
		if _, err := requerido(bruto, campo); err != nil {
			return modelos.Pedido{}, err
		}
	}

	for _, campo := range []string{"id", "clienteId", "fechaCreacion", "tipoEnvio", "metodoPago"} {
		if _, err := texto(bruto, campo); err != nil {
			return modelos.Pedido{}, err
		}
	}

	itemsCrudos, err := lista(bruto, "items")
	if err != nil {
		return modelos.Pedido{}, err
	}

	estado, err := textoOpcional(bruto, "estado", modelos.EstadoRecibido)
	if err != nil {
		return modelos.Pedido{}, err
	}
	prioridad, err := textoOpcional(bruto, "prioridad", "media")
	if err != nil {
		return modelos.Pedido{}, err
	}

	id, _ := texto(bruto, "id")
	if !patronID.MatchString(id) {
		return modelos.Pedido{}, errores.IDInvalido()
	}

	fechaCreacion, _ := texto(bruto, "fechaCreacion")
	instante, err := parsearFecha(fechaCreacion)
	if err != nil {
		return modelos.Pedido{}, err
	}

	tipoEnvio, _ := texto(bruto, "tipoEnvio")
	if !contiene(modelos.TiposEnvio, tipoEnvio) {
		return modelos.Pedido{}, errores.TipoEnvioInvalido()
	}
	metodoPago, _ := texto(bruto, "metodoPago")
	if !contiene(modelos.MetodosPago, metodoPago) {
		return modelos.Pedido{}, errores.MetodoPagoInvalido()
	}
	if !contiene(modelos.Estados, estado) {
		return modelos.Pedido{}, errores.EstadoInvalido()
	}
	if !contiene(modelos.Prioridades, prioridad) {
		return modelos.Pedido{}, errores.PrioridadInvalida()
	}

	if len(itemsCrudos) == 0 {
		return modelos.Pedido{}, errores.PedidoSinItems()
	}

	clienteID, _ := texto(bruto, "clienteId")
	if _, ok := catalogo.Clientes[clienteID]; !ok {
		return modelos.Pedido{}, errores.ClienteNoEncontrado(clienteID)
	}

	items := make([]modelos.Item, 0, len(itemsCrudos))
	for indice, itemCrudo := range itemsCrudos {
		item, err := validarItem(itemCrudo, indice)
		if err != nil {
			return modelos.Pedido{}, err
		}
		items = append(items, item)
	}

	return modelos.Pedido{
		ID:            id,
		ClienteID:     clienteID,
		FechaCreacion: fechaCreacion,
		Estado:        estado,
		TipoEnvio:     tipoEnvio,
		MetodoPago:    metodoPago,
		Prioridad:     prioridad,
		Items:         items,
		FechaInstante: instante,
	}, nil
}

// validarItem valida un item del pedido.
func validarItem(bruto json.RawMessage, indice int) (modelos.Item, *errores.Dominio) {
	var mapa map[string]json.RawMessage
	if e := json.Unmarshal(bruto, &mapa); e != nil || mapa == nil {
		return modelos.Item{}, errores.TipoInvalido(fmt.Sprintf("items[%d]", indice))
	}

	for _, campo := range []string{"codigoProducto", "nombre", "precioUnitario", "cantidad"} {
		if _, err := requerido(mapa, campo); err != nil {
			return modelos.Item{}, err
		}
	}

	codigoProducto, err := texto(mapa, "codigoProducto")
	if err != nil {
		return modelos.Item{}, err
	}
	if codigoProducto == "" {
		return modelos.Item{}, errores.CampoRequerido(fmt.Sprintf("items[%d].codigoProducto", indice))
	}

	nombre, err := texto(mapa, "nombre")
	if err != nil {
		return modelos.Item{}, err
	}
	if nombre == "" {
		return modelos.Item{}, errores.CampoRequerido(fmt.Sprintf("items[%d].nombre", indice))
	}

	precioNumero, err := numero(mapa, "precioUnitario")
	if err != nil {
		return modelos.Item{}, err
	}
	precioExacto, ok := ratDesdeNumero(precioNumero)
	if !ok {
		return modelos.Item{}, errores.TipoInvalido(fmt.Sprintf("items[%d].precioUnitario", indice))
	}
	if precioExacto.Sign() < 0 {
		return modelos.Item{}, errores.PrecioInvalido(fmt.Sprintf("items[%d].precioUnitario", indice))
	}
	precio, e := strconv.ParseFloat(precioNumero.String(), 64)
	if e != nil && math.IsInf(precio, 0) {
		return modelos.Item{}, errores.TipoInvalido(fmt.Sprintf("items[%d].precioUnitario", indice))
	}

	cantidadNumero, err := numero(mapa, "cantidad")
	if err != nil {
		return modelos.Item{}, err
	}
	cantidadFloat, e := strconv.ParseFloat(cantidadNumero.String(), 64)
	if e != nil && math.IsInf(cantidadFloat, 0) {
		return modelos.Item{}, errores.TipoInvalido(fmt.Sprintf("items[%d].cantidad", indice))
	}
	cantidadExacta, ok := ratDesdeNumero(cantidadNumero)
	if !ok {
		return modelos.Item{}, errores.TipoInvalido(fmt.Sprintf("items[%d].cantidad", indice))
	}
	if !cantidadExacta.IsInt() || cantidadExacta.Sign() <= 0 || !cantidadExacta.Num().IsInt64() {
		return modelos.Item{}, errores.CantidadInvalida(fmt.Sprintf("items[%d].cantidad", indice))
	}

	return modelos.Item{
		CodigoProducto: codigoProducto,
		Nombre:         nombre,
		PrecioUnitario: modelos.Importe(precio),
		Cantidad:       cantidadExacta.Num().Int64(),
		PrecioExacto:   precioExacto,
	}, nil
}

// ------------------------------------------------------------------ cálculos

// Calcular aplica las fórmulas del contrato con aritmética decimal exacta.
func Calcular(pedido modelos.Pedido, cliente modelos.Cliente) modelos.Calculos {
	subtotalRacional := new(big.Rat)
	for _, item := range pedido.Items {
		cantidad := new(big.Rat).SetInt64(item.Cantidad)
		subtotalRacional.Add(subtotalRacional, new(big.Rat).Mul(item.PrecioExacto, cantidad))
	}
	subtotal := redondearACentavos(subtotalRacional)

	porcentaje := 0
	if cliente.Tipo == "vip" {
		porcentaje = 10
	}
	if subtotal >= 100000 {
		porcentaje += 5
	}
	if porcentaje > 20 {
		porcentaje = 20
	}

	descuento := redondearACentavos(new(big.Rat).Quo(
		new(big.Rat).Mul(unidadesDesdeCentavos(subtotal), ratDesdeCentavos(int64(porcentaje))),
		ratDesdeCentavos(100),
	))
	base := subtotal - descuento
	impuesto := redondearACentavos(new(big.Rat).Quo(
		new(big.Rat).Mul(unidadesDesdeCentavos(base), ratDesdeCentavos(16)),
		ratDesdeCentavos(100),
	))

	var costoEnvio int64
	switch pedido.TipoEnvio {
	case "retiro":
		costoEnvio = 0
	case "estandar":
		if subtotal < 50000 {
			costoEnvio = 5000
		}
	default:
		costoEnvio = 15000
	}

	total := subtotal - descuento + impuesto + costoEnvio

	return modelos.Calculos{
		Subtotal:            modelos.Importe(floatDesdeCentavos(subtotal)),
		PorcentajeDescuento: porcentaje,
		Descuento:           modelos.Importe(floatDesdeCentavos(descuento)),
		Impuesto:            modelos.Importe(floatDesdeCentavos(impuesto)),
		CostoEnvio:          modelos.Importe(floatDesdeCentavos(costoEnvio)),
		Total:               modelos.Importe(floatDesdeCentavos(total)),
		TotalCents:          total,
	}
}

// ConCalculos devuelve una copia del pedido con sus cálculos.
func ConCalculos(pedido modelos.Pedido, cliente modelos.Cliente) modelos.Pedido {
	calculos := Calcular(pedido, cliente)
	pedido.Calculos = &calculos
	return pedido
}

// --------------------------------------------------------------- transiciones

// ValidarTransicion valida el enum y la matriz de transiciones.
func ValidarTransicion(estadoActual, estadoNuevo string) *errores.Dominio {
	if !contiene(modelos.Estados, estadoActual) || !contiene(modelos.Estados, estadoNuevo) {
		return errores.EstadoInvalido()
	}
	for _, permitido := range modelos.Transiciones[estadoActual] {
		if permitido == estadoNuevo {
			return nil
		}
	}
	return errores.TransicionInvalida(estadoActual, estadoNuevo)
}
