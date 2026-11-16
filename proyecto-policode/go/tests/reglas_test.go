package tests

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"polystore/internal/almacen"
	"polystore/internal/concurrencia"
	"polystore/internal/modelos"
	"polystore/internal/reglas"
)

// crearAlmacen carga el dataset pequeño en un almacén nuevo.
func crearAlmacen(t *testing.T, catalogo reglas.Catalogo) *almacen.Almacen {
	t.Helper()
	contenido, err := os.ReadFile(filepath.Join(directorioDatos(), "pedidos_pequenos.json"))
	if err != nil {
		t.Fatalf("no se pudo leer el dataset: %v", err)
	}
	var archivo struct {
		Pedidos []map[string]json.RawMessage `json:"pedidos"`
	}
	if e := json.Unmarshal(contenido, &archivo); e != nil {
		t.Fatalf("dataset inválido: %v", e)
	}

	pedidos := make([]modelos.Pedido, 0, len(archivo.Pedidos))
	for _, bruto := range archivo.Pedidos {
		pedido, err := reglas.ValidarPedido(bruto, catalogo)
		if err != nil {
			t.Fatalf("pedido inválido en el dataset: %v", err)
		}
		pedidos = append(pedidos, pedido)
	}

	almacenPedidos, err := almacen.Nuevo(pedidos, catalogo.Clientes)
	if err != nil {
		t.Fatalf("no se pudo crear el almacén: %v", err)
	}
	return almacenPedidos
}

func TestResumenCoincideConDataset(t *testing.T) {
	catalogo := cargarCatalogo(t)
	resumen := crearAlmacen(t, catalogo).Resumen()

	if resumen.TotalPedidos != 10 {
		t.Errorf("totalPedidos: %d != 10", resumen.TotalPedidos)
	}
	if centavos(float64(resumen.MontoTotal)) != centavos(7262.56) {
		t.Errorf("montoTotal: %v != 7262.56", resumen.MontoTotal)
	}
	esperadoEstado := modelos.ConteoEstado{Recibido: 2, EnPreparacion: 2, Enviado: 2, Entregado: 2, Cancelado: 2}
	if resumen.PorEstado != esperadoEstado {
		t.Errorf("porEstado: %+v != %+v", resumen.PorEstado, esperadoEstado)
	}
	esperadoPrioridad := modelos.ConteoPrioridad{Alta: 4, Media: 3, Baja: 3}
	if resumen.PorPrioridad != esperadoPrioridad {
		t.Errorf("porPrioridad: %+v != %+v", resumen.PorPrioridad, esperadoPrioridad)
	}
}

func TestFiltrosYOrdenes(t *testing.T) {
	catalogo := cargarCatalogo(t)
	pedidos := crearAlmacen(t, catalogo)

	recibido := "recibido"
	porEstado := pedidos.Listar(nil, &recibido, nil)
	if len(porEstado) != 2 || porEstado[0].ID != "PED-0001" || porEstado[1].ID != "PED-0006" {
		t.Errorf("filtro por estado: %+v", ids(porEstado))
	}

	cliente := "CLI-001"
	porCliente := pedidos.Listar(&cliente, nil, nil)
	if len(porCliente) != 1 || porCliente[0].ID != "PED-0001" {
		t.Errorf("filtro por cliente: %+v", ids(porCliente))
	}

	desconocido := "CLI-999"
	if vacio := pedidos.Listar(&desconocido, nil, nil); len(vacio) != 0 {
		t.Errorf("cliente desconocido debería devolver lista vacía: %+v", ids(vacio))
	}

	fecha := "fecha"
	porFecha := pedidos.Listar(nil, nil, &fecha)
	for indice, pedido := range porFecha {
		esperado := fmt.Sprintf("PED-%04d", indice+1)
		if pedido.ID != esperado {
			t.Errorf("orden por fecha en la posición %d: %s != %s", indice, pedido.ID, esperado)
		}
	}

	monto := "monto"
	porMonto := pedidos.Listar(nil, nil, &monto)
	if porMonto[0].ID != "PED-0009" {
		t.Errorf("orden por monto: %s != PED-0009", porMonto[0].ID)
	}
	for indice := 1; indice < len(porMonto); indice++ {
		if porMonto[indice-1].Calculos.TotalCents < porMonto[indice].Calculos.TotalCents {
			t.Errorf("el orden por monto no es descendente en la posición %d", indice)
		}
	}

	prioridad := "prioridad"
	porPrioridad := pedidos.Listar(nil, nil, &prioridad)
	esperado := []string{
		"PED-0001", "PED-0004", "PED-0007", "PED-0010",
		"PED-0002", "PED-0005", "PED-0008",
		"PED-0003", "PED-0006", "PED-0009",
	}
	for indice, pedido := range porPrioridad {
		if pedido.ID != esperado[indice] {
			t.Errorf("orden por prioridad en la posición %d: %s != %s", indice, pedido.ID, esperado[indice])
		}
	}
}

func ids(pedidos []modelos.Pedido) []string {
	lista := make([]string, 0, len(pedidos))
	for _, pedido := range pedidos {
		lista = append(lista, pedido.ID)
	}
	return lista
}

func TestTransiciones(t *testing.T) {
	for _, actual := range modelos.Estados {
		for _, nuevo := range modelos.Estados {
			err := reglas.ValidarTransicion(actual, nuevo)
			permitido := false
			for _, candidato := range modelos.Transiciones[actual] {
				if candidato == nuevo {
					permitido = true
				}
			}
			if permitido && err != nil {
				t.Errorf("%s -> %s debería permitirse: %v", actual, nuevo, err)
			}
			if !permitido {
				if err == nil {
					t.Errorf("%s -> %s debería rechazarse", actual, nuevo)
					continue
				}
				if err.Codigo != "TRANSICION_INVALIDA" {
					t.Errorf("%s -> %s: %s", actual, nuevo, err.Codigo)
				}
			}
		}
	}
}

func TestAgregarDuplicadoYAñadir(t *testing.T) {
	catalogo := cargarCatalogo(t)
	pedidos := crearAlmacen(t, catalogo)

	existente, ok := pedidos.Obtener("PED-0001")
	if !ok {
		t.Fatal("no se encontró PED-0001")
	}
	if err := pedidos.Agregar(existente); err == nil || err.Codigo != "PEDIDO_DUPLICADO" {
		t.Fatalf("se esperaba PEDIDO_DUPLICADO y se obtuvo %v", err)
	}
}

func TestActualizarEstado(t *testing.T) {
	catalogo := cargarCatalogo(t)
	pedidos := crearAlmacen(t, catalogo)

	actualizado, err := pedidos.ActualizarEstado("PED-0001", "en_preparacion")
	if err != nil {
		t.Fatalf("transición válida rechazada: %v", err)
	}
	if actualizado.Estado != "en_preparacion" {
		t.Errorf("estado: %s != en_preparacion", actualizado.Estado)
	}

	if _, err := pedidos.ActualizarEstado("PED-0001", "en_preparacion"); err == nil {
		t.Error("se esperaba TRANSICION_INVALIDA al repetir el estado")
	}
	if _, err := pedidos.ActualizarEstado("PED-0004", "en_preparacion"); err == nil {
		t.Error("se esperaba TRANSICION_INVALIDA desde entregado")
	}
	if _, err := pedidos.ActualizarEstado("PED-9999", "en_preparacion"); err == nil {
		t.Error("se esperaba PEDIDO_NO_ENCONTRADO")
	}
}

func TestCantidadYPrecios(t *testing.T) {
	catalogo := cargarCatalogo(t)
	casos := cargarCasos(t, "casos_prueba.json")
	var entradaC1 map[string]json.RawMessage
	if e := json.Unmarshal(casos[0].Entrada, &entradaC1); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}

	conDos := map[string]json.RawMessage{}
	for clave, valor := range entradaC1 {
		conDos[clave] = valor
	}
	var items []map[string]json.RawMessage
	if e := json.Unmarshal(entradaC1["items"], &items); e != nil {
		t.Fatalf("items inválidos: %v", e)
	}
	items[0]["cantidad"] = json.RawMessage("2.0")
	itemsCopia, _ := json.Marshal(items)
	conDos["items"] = itemsCopia

	pedido, err := reglas.ValidarPedido(conDos, catalogo)
	if err != nil {
		t.Fatalf("2.0 debería ser una cantidad válida: %v", err)
	}
	if pedido.Items[0].Cantidad != 2 {
		t.Errorf("cantidad: %d != 2", pedido.Items[0].Cantidad)
	}

	items[0]["cantidad"] = json.RawMessage("2.5")
	itemsCopia, _ = json.Marshal(items)
	conDos["items"] = itemsCopia
	if _, err := reglas.ValidarPedido(conDos, catalogo); err == nil || err.Codigo != "CANTIDAD_INVALIDA" {
		t.Errorf("se esperaba CANTIDAD_INVALIDA y se obtuvo %v", err)
	}

	items[0]["cantidad"] = json.RawMessage("2")
	items[0]["precioUnitario"] = json.RawMessage("-1")
	itemsCopia, _ = json.Marshal(items)
	conDos["items"] = itemsCopia
	if _, err := reglas.ValidarPedido(conDos, catalogo); err == nil || err.Codigo != "PRECIO_INVALIDO" {
		t.Errorf("se esperaba PRECIO_INVALIDO y se obtuvo %v", err)
	}
}

func TestLoteConservaElOrden(t *testing.T) {
	catalogo := cargarCatalogo(t)
	casos := cargarCasos(t, "casos_prueba.json")
	var base map[string]json.RawMessage
	if e := json.Unmarshal(casos[0].Entrada, &base); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}

	brutos := make([]json.RawMessage, 0, 20)
	for indice := 0; indice < 20; indice++ {
		copia := map[string]json.RawMessage{}
		for clave, valor := range base {
			copia[clave] = valor
		}
		copia["id"] = json.RawMessage(`"PED-LOTE-` + string(rune('0'+indice/10)) + string(rune('0'+indice%10)) + `"`)
		contenido, _ := json.Marshal(copia)
		brutos = append(brutos, contenido)
	}

	lote, err := concurrencia.ProcesarLote(brutos, catalogo, 4)
	if err != nil {
		t.Fatalf("el lote falló: %v", err)
	}
	if len(lote.Resultados) != 20 {
		t.Fatalf("resultados: %d != 20", len(lote.Resultados))
	}
	for indice, resultado := range lote.Resultados {
		if resultado.Indice != indice {
			t.Errorf("indice: %d != %d", resultado.Indice, indice)
		}
		if !resultado.OK || resultado.Pedido == nil {
			t.Errorf("el resultado %d debería ser válido", indice)
			continue
		}
		esperado := "PED-LOTE-" + string(rune('0'+indice/10)) + string(rune('0'+indice%10))
		if resultado.Pedido.ID != esperado {
			t.Errorf("id: %s != %s", resultado.Pedido.ID, esperado)
		}
	}
	if lote.Resumen.Exitosos != 20 || lote.Resumen.Fallidos != 0 {
		t.Errorf("resumen: %+v", lote.Resumen)
	}
	if centavos(float64(lote.Resumen.MontoTotal)) != centavos(14384.0) {
		t.Errorf("montoTotal: %v != 14384.0", lote.Resumen.MontoTotal)
	}
}

func TestLoteVacio(t *testing.T) {
	catalogo := cargarCatalogo(t)
	if _, err := concurrencia.ProcesarLote(nil, catalogo, 2); err == nil || err.Codigo != "LOTE_VACIO" {
		t.Errorf("se esperaba LOTE_VACIO y se obtuvo %v", err)
	}
}
