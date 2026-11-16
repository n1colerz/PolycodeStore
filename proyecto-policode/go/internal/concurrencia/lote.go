// Package concurrencia procesa lotes de pedidos en paralelo con goroutines,
// sync.WaitGroup y un canal de resultados. La salida conserva el orden de
// entrada, por lo que es determinista.
package concurrencia

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sync"

	"polystore/internal/errores"
	"polystore/internal/modelos"
	"polystore/internal/reglas"
)

// resultadoInterno transporta el resultado de una entrada por el canal.
type resultadoInterno struct {
	indice     int
	lote       modelos.ResultadoLote
	totalCents int64
}

// TrabajadoresPorDefecto devuelve el número de goroutines por defecto.
func TrabajadoresPorDefecto() int {
	if desdeEntorno := os.Getenv("POLY_WORKERS"); desdeEntorno != "" {
		var valor int
		if _, err := fmt.Sscanf(desdeEntorno, "%d", &valor); err == nil && valor > 0 {
			return valor
		}
	}
	return min(runtime.NumCPU()+4, 32)
}

// ProcesarLote valida y calcula cada pedido en paralelo.
func ProcesarLote(
	brutos []json.RawMessage,
	catalogo reglas.Catalogo,
	trabajadores int,
) (modelos.Lote, *errores.Dominio) {
	if len(brutos) == 0 {
		return modelos.Lote{}, errores.LoteVacio()
	}
	if trabajadores < 1 {
		trabajadores = 1
	}

	resultados := make([]modelos.ResultadoLote, len(brutos))
	canal := make(chan resultadoInterno, len(brutos))
	semaforo := make(chan struct{}, trabajadores)

	var grupo sync.WaitGroup
	for indice, bruto := range brutos {
		grupo.Add(1)
		go func(indice int, bruto json.RawMessage) {
			defer grupo.Done()
			semaforo <- struct{}{}
			defer func() { <-semaforo }()

			resultado, total := procesarUno(indice, bruto, catalogo)
			canal <- resultadoInterno{indice: indice, lote: resultado, totalCents: total}
		}(indice, bruto)
	}

	grupo.Wait()
	close(canal)

	var totalCents int64
	exitosos := 0
	for resultado := range canal {
		resultados[resultado.indice] = resultado.lote
		if resultado.lote.OK {
			exitosos++
			totalCents += resultado.totalCents
		}
	}

	return modelos.Lote{
		Resultados: resultados,
		Resumen: modelos.ResumenLote{
			Total:      len(resultados),
			Exitosos:   exitosos,
			Fallidos:   len(resultados) - exitosos,
			MontoTotal: modelos.Importe(float64(totalCents) / 100),
		},
	}, nil
}

// procesarUno valida y calcula una entrada sin tocar estado compartido.
func procesarUno(
	indice int,
	bruto json.RawMessage,
	catalogo reglas.Catalogo,
) (modelos.ResultadoLote, int64) {
	var mapa map[string]json.RawMessage
	if e := json.Unmarshal(bruto, &mapa); e != nil || mapa == nil {
		error := errores.CuerpoInvalido(fmt.Sprintf("pedidos[%d]", indice))
		api := error.API()
		return modelos.ResultadoLote{Indice: indice, OK: false, Error: &api}, 0
	}

	pedido, err := reglas.ValidarPedido(mapa, catalogo)
	if err != nil {
		api := err.API()
		return modelos.ResultadoLote{Indice: indice, OK: false, Error: &api}, 0
	}

	cliente := catalogo.Clientes[pedido.ClienteID]
	calculos := reglas.Calcular(pedido, cliente)
	pedido.Calculos = &calculos

	return modelos.ResultadoLote{Indice: indice, OK: true, Pedido: &pedido}, calculos.TotalCents
}
