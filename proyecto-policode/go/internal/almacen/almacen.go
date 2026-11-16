// Package almacen mantiene los pedidos en memoria con acceso concurrente
// seguro mediante sync.RWMutex.
package almacen

import (
	"fmt"
	"sort"
	"sync"

	"polystore/internal/errores"
	"polystore/internal/modelos"
	"polystore/internal/reglas"
)

// Almacen es el repositorio en memoria de pedidos.
type Almacen struct {
	mutex      sync.RWMutex
	pedidos    []modelos.Pedido
	posiciones map[string]int
	clientes   map[string]modelos.Cliente
}

// Nuevo crea el almacén con el dataset inicial.
func Nuevo(pedidos []modelos.Pedido, clientes map[string]modelos.Cliente) (*Almacen, error) {
	almacen := &Almacen{
		pedidos:    make([]modelos.Pedido, 0, len(pedidos)),
		posiciones: make(map[string]int, len(pedidos)),
		clientes:   clientes,
	}
	for _, pedido := range pedidos {
		if _, ok := almacen.posiciones[pedido.ID]; ok {
			return nil, &errores.Datos{Mensaje: fmt.Sprintf("El pedido '%s' está duplicado en el dataset.", pedido.ID)}
		}
		almacen.posiciones[pedido.ID] = len(almacen.pedidos)
		almacen.pedidos = append(almacen.pedidos, pedido)
	}
	return almacen, nil
}

// Clientes devuelve el catálogo de clientes.
func (a *Almacen) Clientes() map[string]modelos.Cliente {
	return a.clientes
}

// Total devuelve la cantidad de pedidos almacenados.
func (a *Almacen) Total() int {
	a.mutex.RLock()
	defer a.mutex.RUnlock()
	return len(a.pedidos)
}

// Listar filtra y ordena los pedidos, ya calculados.
func (a *Almacen) Listar(clienteID *string, estado *string, orden *string) []modelos.Pedido {
	a.mutex.RLock()
	pedidos := make([]modelos.Pedido, len(a.pedidos))
	copy(pedidos, a.pedidos)
	a.mutex.RUnlock()

	if clienteID != nil {
		filtrados := pedidos[:0]
		for _, pedido := range pedidos {
			if pedido.ClienteID == *clienteID {
				filtrados = append(filtrados, pedido)
			}
		}
		pedidos = filtrados
	}
	if estado != nil {
		filtrados := pedidos[:0]
		for _, pedido := range pedidos {
			if pedido.Estado == *estado {
				filtrados = append(filtrados, pedido)
			}
		}
		pedidos = filtrados
	}

	switch {
	case orden != nil && *orden == "fecha":
		sort.SliceStable(pedidos, func(i, j int) bool {
			if !pedidos[i].FechaInstante.Equal(pedidos[j].FechaInstante) {
				return pedidos[i].FechaInstante.Before(pedidos[j].FechaInstante)
			}
			return pedidos[i].ID < pedidos[j].ID
		})
	case orden != nil && *orden == "monto":
		montos := make(map[string]int64, len(pedidos))
		for _, pedido := range pedidos {
			montos[pedido.ID] = reglas.Calcular(pedido, a.clientes[pedido.ClienteID]).TotalCents
		}
		sort.SliceStable(pedidos, func(i, j int) bool {
			if montos[pedidos[i].ID] != montos[pedidos[j].ID] {
				return montos[pedidos[i].ID] > montos[pedidos[j].ID]
			}
			return pedidos[i].ID < pedidos[j].ID
		})
	case orden != nil && *orden == "prioridad":
		sort.SliceStable(pedidos, func(i, j int) bool {
			rangoI := modelos.OrdenPrioridad[pedidos[i].Prioridad]
			rangoJ := modelos.OrdenPrioridad[pedidos[j].Prioridad]
			if rangoI != rangoJ {
				return rangoI < rangoJ
			}
			if !pedidos[i].FechaInstante.Equal(pedidos[j].FechaInstante) {
				return pedidos[i].FechaInstante.Before(pedidos[j].FechaInstante)
			}
			return pedidos[i].ID < pedidos[j].ID
		})
	}

	for indice := range pedidos {
		pedidos[indice] = reglas.ConCalculos(pedidos[indice], a.clientes[pedidos[indice].ClienteID])
	}
	return pedidos
}

// Obtener devuelve el pedido con ese id.
func (a *Almacen) Obtener(id string) (modelos.Pedido, bool) {
	a.mutex.RLock()
	defer a.mutex.RUnlock()
	posicion, ok := a.posiciones[id]
	if !ok {
		return modelos.Pedido{}, false
	}
	return a.pedidos[posicion], true
}

// Agregar inserta un pedido y rechaza ids duplicados.
func (a *Almacen) Agregar(pedido modelos.Pedido) *errores.Dominio {
	a.mutex.Lock()
	defer a.mutex.Unlock()
	if _, ok := a.posiciones[pedido.ID]; ok {
		return errores.PedidoDuplicado(pedido.ID)
	}
	a.posiciones[pedido.ID] = len(a.pedidos)
	a.pedidos = append(a.pedidos, pedido)
	return nil
}

// ActualizarEstado aplica una transición de estado sobre un pedido.
func (a *Almacen) ActualizarEstado(id, estadoNuevo string) (modelos.Pedido, *errores.Dominio) {
	a.mutex.Lock()
	defer a.mutex.Unlock()

	posicion, ok := a.posiciones[id]
	if !ok {
		return modelos.Pedido{}, errores.PedidoNoEncontrado(id)
	}
	pedido := a.pedidos[posicion]
	if err := reglas.ValidarTransicion(pedido.Estado, estadoNuevo); err != nil {
		return modelos.Pedido{}, err
	}

	pedido.Estado = estadoNuevo
	a.pedidos[posicion] = pedido
	return pedido, nil
}

// Resumen calcula el resumen de ventas del almacén.
func (a *Almacen) Resumen() modelos.Resumen {
	a.mutex.RLock()
	defer a.mutex.RUnlock()

	var resumen modelos.Resumen
	var totalCents int64

	for _, pedido := range a.pedidos {
		resumen.TotalPedidos++
		switch pedido.Estado {
		case modelos.EstadoRecibido:
			resumen.PorEstado.Recibido++
		case modelos.EstadoEnPreparacion:
			resumen.PorEstado.EnPreparacion++
		case modelos.EstadoEnviado:
			resumen.PorEstado.Enviado++
		case modelos.EstadoEntregado:
			resumen.PorEstado.Entregado++
		case modelos.EstadoCancelado:
			resumen.PorEstado.Cancelado++
		}
		switch pedido.Prioridad {
		case "alta":
			resumen.PorPrioridad.Alta++
		case "media":
			resumen.PorPrioridad.Media++
		case "baja":
			resumen.PorPrioridad.Baja++
		}
		if pedido.Estado != modelos.EstadoCancelado {
			totalCents += reglas.Calcular(pedido, a.clientes[pedido.ClienteID]).TotalCents
		}
	}

	resumen.MontoTotal = modelos.Importe(float64(totalCents) / 100)
	return resumen
}
