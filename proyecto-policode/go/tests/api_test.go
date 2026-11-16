package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"polystore/internal/api"
)

// nuevoServidor levanta la API sobre un almacén con el dataset pequeño.
func nuevoServidor(t *testing.T) *httptest.Server {
	t.Helper()
	catalogo := cargarCatalogo(t)
	almacenPedidos := crearAlmacen(t, catalogo)
	return httptest.NewServer(api.NuevoServidor(almacenPedidos, catalogo, "go").Handler())
}

// pedir ejecuta una petición HTTP contra el servidor de pruebas.
func pedir(t *testing.T, servidor *httptest.Server, metodo, ruta string, cuerpo any) (int, []byte, http.Header) {
	t.Helper()

	var lector io.Reader
	if cuerpo != nil {
		datos, err := json.Marshal(cuerpo)
		if err != nil {
			t.Fatalf("no se pudo serializar el cuerpo: %v", err)
		}
		lector = bytes.NewReader(datos)
	}

	solicitud, err := http.NewRequest(metodo, servidor.URL+ruta, lector)
	if err != nil {
		t.Fatalf("no se pudo crear la petición: %v", err)
	}
	if cuerpo != nil {
		solicitud.Header.Set("Content-Type", "application/json")
	}

	respuesta, err := servidor.Client().Do(solicitud)
	if err != nil {
		t.Fatalf("la petición falló: %v", err)
	}
	defer respuesta.Body.Close()
	contenido, err := io.ReadAll(respuesta.Body)
	if err != nil {
		t.Fatalf("no se pudo leer la respuesta: %v", err)
	}
	return respuesta.StatusCode, contenido, respuesta.Header
}

// decodir convierte la respuesta JSON en un mapa.
func decodir(t *testing.T, contenido []byte) map[string]any {
	t.Helper()
	var valor map[string]any
	if err := json.Unmarshal(contenido, &valor); err != nil {
		t.Fatalf("respuesta no es JSON válido (%s): %v", contenido, err)
	}
	return valor
}

func TestSaludYCORS(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, cabeceras := pedir(t, servidor, http.MethodGet, "/salud", nil)
	if estado != http.StatusOK {
		t.Fatalf("estado: %d", estado)
	}
	cuerpo := decodir(t, contenido)
	if cuerpo["lenguaje"] != "go" || cuerpo["estado"] != "ok" {
		t.Errorf("salud inesperada: %v", cuerpo)
	}
	if cuerpo["pedidosEnMemoria"] != float64(10) {
		t.Errorf("pedidosEnMemoria: %v", cuerpo["pedidosEnMemoria"])
	}
	if cabeceras.Get("Access-Control-Allow-Origin") != "*" {
		t.Error("falta la cabecera CORS")
	}
}

func TestListarFiltrarYOrdenar(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, _ := pedir(t, servidor, http.MethodGet, "/pedidos", nil)
	if estado != http.StatusOK {
		t.Fatalf("estado: %d", estado)
	}
	if total := decodir(t, contenido)["total"]; total != float64(10) {
		t.Errorf("total: %v != 10", total)
	}

	_, contenido, _ = pedir(t, servidor, http.MethodGet, "/pedidos?estado=recibido", nil)
	pedidos := decodir(t, contenido)["pedidos"].([]any)
	if len(pedidos) != 2 {
		t.Fatalf("recibidos: %d != 2", len(pedidos))
	}
	if pedidos[0].(map[string]any)["id"] != "PED-0001" {
		t.Errorf("primer pedido: %v", pedidos[0])
	}

	_, contenido, _ = pedir(t, servidor, http.MethodGet, "/pedidos?clienteId=CLI-001", nil)
	if total := decodir(t, contenido)["total"]; total != float64(1) {
		t.Errorf("total por cliente: %v != 1", total)
	}

	_, contenido, _ = pedir(t, servidor, http.MethodGet, "/pedidos?clienteId=CLI-999", nil)
	vacio := decodir(t, contenido)
	if vacio["total"] != float64(0) || len(vacio["pedidos"].([]any)) != 0 {
		t.Errorf("cliente desconocido: %v", vacio)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodGet, "/pedidos?estado=pagado", nil)
	if estado != http.StatusBadRequest {
		t.Errorf("estado invalido: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "ESTADO_INVALIDO" {
		t.Errorf("error inesperado: %s", contenido)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodGet, "/pedidos?orden=peso", nil)
	if estado != http.StatusBadRequest {
		t.Errorf("orden invalido: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "ORDEN_INVALIDO" {
		t.Errorf("error inesperado: %s", contenido)
	}
}

func TestObtenerPedidoYNoEncontrado(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, _ := pedir(t, servidor, http.MethodGet, "/pedidos/PED-0001", nil)
	if estado != http.StatusOK {
		t.Fatalf("estado: %d", estado)
	}
	cuerpo := decodir(t, contenido)
	calculos := cuerpo["calculos"].(map[string]any)
	if centavos(calculos["total"].(float64)) != centavos(1006.08) {
		t.Errorf("total: %v != 1006.08", calculos["total"])
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodGet, "/pedidos/PED-9999", nil)
	if estado != http.StatusNotFound {
		t.Errorf("estado: %d", estado)
	}
	errorObtenido := decodir(t, contenido)
	if errorObtenido["codigo"] != "PEDIDO_NO_ENCONTRADO" || errorObtenido["campo"] != "id" {
		t.Errorf("error inesperado: %v", errorObtenido)
	}
}

func TestCrearPedidoValidoYDuplicado(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	casos := cargarCasos(t, "casos_prueba.json")
	var entrada map[string]any
	if e := json.Unmarshal(casos[0].Entrada, &entrada); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}
	entrada["id"] = "PED-API-01"

	estado, contenido, cabeceras := pedir(t, servidor, http.MethodPost, "/pedidos", entrada)
	if estado != http.StatusCreated {
		t.Fatalf("estado: %d (%s)", estado, contenido)
	}
	if cabeceras.Get("Location") != "/pedidos/PED-API-01" {
		t.Errorf("Location: %s", cabeceras.Get("Location"))
	}
	calculos := decodir(t, contenido)["calculos"].(map[string]any)
	if centavos(calculos["total"].(float64)) != centavos(719.20) {
		t.Errorf("total: %v != 719.20", calculos["total"])
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodPost, "/pedidos", entrada)
	if estado != http.StatusConflict {
		t.Errorf("estado duplicado: %d", estado)
	}
	errorObtenido := decodir(t, contenido)
	if errorObtenido["codigo"] != "PEDIDO_DUPLICADO" {
		t.Errorf("error inesperado: %v", errorObtenido)
	}
}

func TestCrearPedidoInvalidoYClienteInexistente(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	casos := cargarCasos(t, "casos_prueba.json")
	var invalido map[string]any
	if e := json.Unmarshal(casos[1].Entrada, &invalido); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}

	estado, contenido, _ := pedir(t, servidor, http.MethodPost, "/pedidos", invalido)
	if estado != http.StatusBadRequest {
		t.Fatalf("estado: %d", estado)
	}
	errorObtenido := decodir(t, contenido)
	if errorObtenido["codigo"] != "CANTIDAD_INVALIDA" || errorObtenido["campo"] != "items[0].cantidad" {
		t.Errorf("error inesperado: %v", errorObtenido)
	}

	var inexistente map[string]any
	if e := json.Unmarshal(casos[0].Entrada, &inexistente); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}
	inexistente["id"] = "PED-API-02"
	inexistente["clienteId"] = "CLI-999"

	estado, contenido, _ = pedir(t, servidor, http.MethodPost, "/pedidos", inexistente)
	if estado != http.StatusNotFound {
		t.Fatalf("estado: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "CLIENTE_NO_ENCONTRADO" {
		t.Errorf("error inesperado: %s", contenido)
	}
}

func TestPatchEstado(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, _ := pedir(t, servidor, http.MethodPatch, "/pedidos/PED-0001/estado", map[string]any{"estado": "en_preparacion"})
	if estado != http.StatusOK {
		t.Fatalf("estado: %d (%s)", estado, contenido)
	}
	if decodir(t, contenido)["estado"] != "en_preparacion" {
		t.Errorf("estado: %s", contenido)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodPatch, "/pedidos/PED-0001/estado", map[string]any{"estado": "en_preparacion"})
	if estado != http.StatusConflict {
		t.Errorf("estado repetido: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "TRANSICION_INVALIDA" {
		t.Errorf("error inesperado: %s", contenido)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodPatch, "/pedidos/PED-0004/estado", map[string]any{"estado": "en_preparacion"})
	if estado != http.StatusConflict {
		t.Errorf("estado desde entregado: %d", estado)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodPatch, "/pedidos/PED-0002/estado", map[string]any{"estado": "pagado"})
	if estado != http.StatusBadRequest {
		t.Errorf("enum inválido: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "ESTADO_INVALIDO" {
		t.Errorf("error inesperado: %s", contenido)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodPatch, "/pedidos/PED-9999/estado", map[string]any{"estado": "en_preparacion"})
	if estado != http.StatusNotFound {
		t.Errorf("pedido inexistente: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "PEDIDO_NO_ENCONTRADO" {
		t.Errorf("error inesperado: %s", contenido)
	}
}

func TestResumen(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, _ := pedir(t, servidor, http.MethodGet, "/resumen", nil)
	if estado != http.StatusOK {
		t.Fatalf("estado: %d", estado)
	}
	cuerpo := decodir(t, contenido)
	if cuerpo["totalPedidos"] != float64(10) {
		t.Errorf("totalPedidos: %v", cuerpo["totalPedidos"])
	}
	if centavos(cuerpo["montoTotal"].(float64)) != centavos(7262.56) {
		t.Errorf("montoTotal: %v != 7262.56", cuerpo["montoTotal"])
	}
}

func TestLoteOrdenadoYResumen(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	casos := cargarCasos(t, "casos_prueba.json")
	var primero map[string]any
	var segundo map[string]any
	if e := json.Unmarshal(casos[0].Entrada, &primero); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}
	if e := json.Unmarshal(casos[1].Entrada, &segundo); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}
	primero["id"] = "PED-LOTE-A"
	segundo["id"] = "PED-LOTE-B"

	estado, contenido, _ := pedir(t, servidor, http.MethodPost, "/pedidos/lote", map[string]any{"pedidos": []any{primero, segundo}})
	if estado != http.StatusOK {
		t.Fatalf("estado: %d (%s)", estado, contenido)
	}
	cuerpo := decodir(t, contenido)
	resultados := cuerpo["resultados"].([]any)
	if len(resultados) != 2 {
		t.Fatalf("resultados: %d != 2", len(resultados))
	}
	if resultados[0].(map[string]any)["indice"] != float64(0) {
		t.Errorf("indice 0 mal: %v", resultados[0])
	}
	if resultados[1].(map[string]any)["ok"] != false {
		t.Errorf("el segundo resultado debería fallar: %v", resultados[1])
	}
	resumen := cuerpo["resumen"].(map[string]any)
	if resumen["total"] != float64(2) || resumen["exitosos"] != float64(1) || resumen["fallidos"] != float64(1) {
		t.Errorf("resumen: %v", resumen)
	}
	if centavos(resumen["montoTotal"].(float64)) != centavos(719.20) {
		t.Errorf("montoTotal: %v != 719.20", resumen["montoTotal"])
	}
}

func TestLoteVacioYTipoInvalido(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, _ := pedir(t, servidor, http.MethodPost, "/pedidos/lote", map[string]any{"pedidos": []any{}})
	if estado != http.StatusBadRequest {
		t.Fatalf("estado: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "LOTE_VACIO" {
		t.Errorf("error inesperado: %s", contenido)
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodPost, "/pedidos/lote", map[string]any{"pedidos": "no-es-lista"})
	if estado != http.StatusBadRequest {
		t.Fatalf("estado: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "TIPO_INVALIDO" {
		t.Errorf("error inesperado: %s", contenido)
	}
}

func TestRutaYMetodoNoPermitidos(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, cabeceras := pedir(t, servidor, http.MethodGet, "/desconocida", nil)
	if estado != http.StatusNotFound {
		t.Errorf("estado: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "RUTA_NO_ENCONTRADA" {
		t.Errorf("error inesperado: %s", contenido)
	}
	if cabeceras.Get("Access-Control-Allow-Origin") != "*" {
		t.Error("falta la cabecera CORS en el error")
	}

	estado, contenido, _ = pedir(t, servidor, http.MethodDelete, "/pedidos", nil)
	if estado != http.StatusMethodNotAllowed {
		t.Errorf("estado: %d", estado)
	}
	if decodir(t, contenido)["codigo"] != "METODO_NO_PERMITIDO" {
		t.Errorf("error inesperado: %s", contenido)
	}

	estado, _, _ = pedir(t, servidor, http.MethodGet, "/pedidos/lote", nil)
	if estado != http.StatusMethodNotAllowed {
		t.Errorf("estado: %d", estado)
	}
}

func TestPreflight(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	estado, contenido, cabeceras := pedir(t, servidor, http.MethodOptions, "/pedidos", nil)
	if estado != http.StatusNoContent {
		t.Fatalf("estado: %d", estado)
	}
	if len(contenido) != 0 {
		t.Errorf("el preflight no debe tener cuerpo: %s", contenido)
	}
	if cabeceras.Get("Access-Control-Allow-Origin") != "*" {
		t.Error("falta la cabecera CORS")
	}
}

func TestJSONInvalido(t *testing.T) {
	servidor := nuevoServidor(t)
	defer servidor.Close()

	solicitud, err := http.NewRequest(http.MethodPost, servidor.URL+"/pedidos", bytes.NewReader([]byte(`{"id":`)))
	if err != nil {
		t.Fatalf("no se pudo crear la petición: %v", err)
	}
	solicitud.Header.Set("Content-Type", "application/json")

	respuesta, err := servidor.Client().Do(solicitud)
	if err != nil {
		t.Fatalf("la petición falló: %v", err)
	}
	defer respuesta.Body.Close()
	contenido, _ := io.ReadAll(respuesta.Body)

	if respuesta.StatusCode != http.StatusBadRequest {
		t.Errorf("estado: %d", respuesta.StatusCode)
	}
	if decodir(t, contenido)["codigo"] != "JSON_INVALIDO" {
		t.Errorf("error inesperado: %s", contenido)
	}
}
