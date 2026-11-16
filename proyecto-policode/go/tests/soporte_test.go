package tests

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"polystore/internal/errores"
	"polystore/internal/iojson"
	"polystore/internal/modelos"
	"polystore/internal/reglas"
)

// calculosEsperados son los importes que fija cada fixture.
type calculosEsperados struct {
	Subtotal            float64 `json:"subtotal"`
	PorcentajeDescuento int     `json:"porcentajeDescuento"`
	Descuento           float64 `json:"descuento"`
	Impuesto            float64 `json:"impuesto"`
	CostoEnvio          float64 `json:"costoEnvio"`
	Total               float64 `json:"total"`
}

// errorEsperado es el error que fija cada fixture.
type errorEsperado struct {
	Codigo  string `json:"codigo"`
	Mensaje string `json:"mensaje"`
	Campo   string `json:"campo"`
}

// esperadoEsperado es el resultado esperado de un fixture.
type esperadoEsperado struct {
	HTTP     int                `json:"http"`
	OK       bool               `json:"ok"`
	Estado   string             `json:"estado"`
	Calculos *calculosEsperados `json:"calculos"`
	Error    *errorEsperado     `json:"error"`
}

// casoPrueba es un fixture de casos_prueba.json o casos_borde.json.
type casoPrueba struct {
	ID          string           `json:"id"`
	Tipo        string           `json:"tipo"`
	Descripcion string           `json:"descripcion"`
	Entrada     json.RawMessage  `json:"entrada"`
	Expected    esperadoEsperado `json:"esperado"`
}

// directorioDatos es la ruta a ../datos desde el paquete de tests.
func directorioDatos() string {
	return filepath.Join("..", "..", "datos")
}

// cargarCatalogo construye el catálogo compartido de clientes.
func cargarCatalogo(t *testing.T) reglas.Catalogo {
	t.Helper()
	clientes, err := iojson.CargarClientes(directorioDatos())
	if err != nil {
		t.Fatalf("no se pudo cargar el catálogo de clientes: %v", err)
	}
	return reglas.Catalogo{Clientes: clientes}
}

// cargarCasos lee un archivo de fixtures.
func cargarCasos(t *testing.T, nombre string) []casoPrueba {
	t.Helper()
	contenido, err := os.ReadFile(filepath.Join(directorioDatos(), nombre))
	if err != nil {
		t.Fatalf("no se pudo leer %s: %v", nombre, err)
	}
	var archivo struct {
		Casos []casoPrueba `json:"casos"`
	}
	if e := json.Unmarshal(contenido, &archivo); e != nil {
		t.Fatalf("%s no es JSON válido: %v", nombre, e)
	}
	return archivo.Casos
}

// centavos convierte un importe a centavos enteros para comparar sin flotantes.
func centavos(valor float64) int64 {
	return int64(math.Round(valor * 100))
}

// assertCalculos compara los cálculos calculados con los esperados.
func assertCalculos(t *testing.T, calculos modelos.Calculos, esperado *calculosEsperados) {
	t.Helper()
	if esperado == nil {
		t.Fatal("el fixture no define calculos esperados")
	}
	if calculos.PorcentajeDescuento != esperado.PorcentajeDescuento {
		t.Errorf("porcentajeDescuento: %d != %d", calculos.PorcentajeDescuento, esperado.PorcentajeDescuento)
	}
	comparaciones := []struct {
		nombre    string
		calculado float64
		esperado  float64
	}{
		{"subtotal", float64(calculos.Subtotal), esperado.Subtotal},
		{"descuento", float64(calculos.Descuento), esperado.Descuento},
		{"impuesto", float64(calculos.Impuesto), esperado.Impuesto},
		{"costoEnvio", float64(calculos.CostoEnvio), esperado.CostoEnvio},
		{"total", float64(calculos.Total), esperado.Total},
	}
	for _, comparacion := range comparaciones {
		if centavos(comparacion.calculado) != centavos(comparacion.esperado) {
			t.Errorf("%s: %v != %v", comparacion.nombre, comparacion.calculado, comparacion.esperado)
		}
	}
}

// assertError compara un error de dominio con el esperado.
func assertError(t *testing.T, err *errores.Dominio, esperado *errorEsperado, status int) {
	t.Helper()
	if err == nil {
		t.Fatal("se esperaba un error y no se produjo")
	}
	if esperado == nil {
		t.Fatal("el fixture no define error esperado")
	}
	if err.Codigo != esperado.Codigo {
		t.Errorf("codigo: %s != %s", err.Codigo, esperado.Codigo)
	}
	if err.Mensaje != esperado.Mensaje {
		t.Errorf("mensaje: %s != %s", err.Mensaje, esperado.Mensaje)
	}
	if err.Campo != esperado.Campo {
		t.Errorf("campo: %s != %s", err.Campo, esperado.Campo)
	}
	if err.HTTP != status {
		t.Errorf("http: %d != %d", err.HTTP, status)
	}
}

// verificarCaso ejecuta un fixture completo.
func verificarCaso(t *testing.T, caso casoPrueba, catalogo reglas.Catalogo) {
	t.Helper()

	if caso.Tipo == "transicion" {
		var entrada struct {
			EstadoActual string `json:"estadoActual"`
			EstadoNuevo  string `json:"estadoNuevo"`
		}
		if e := json.Unmarshal(caso.Entrada, &entrada); e != nil {
			t.Fatalf("entrada inválida: %v", e)
		}
		err := reglas.ValidarTransicion(entrada.EstadoActual, entrada.EstadoNuevo)
		if caso.Expected.OK {
			if err != nil {
				t.Fatalf("se esperaba una transición válida y se obtuvo %v", err)
			}
			if entrada.EstadoNuevo != caso.Expected.Estado {
				t.Errorf("estado: %s != %s", entrada.EstadoNuevo, caso.Expected.Estado)
			}
			return
		}
		assertError(t, err, caso.Expected.Error, caso.Expected.HTTP)
		return
	}

	var entrada map[string]json.RawMessage
	if e := json.Unmarshal(caso.Entrada, &entrada); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}

	pedido, err := reglas.ValidarPedido(entrada, catalogo)
	if !caso.Expected.OK {
		assertError(t, err, caso.Expected.Error, caso.Expected.HTTP)
		return
	}
	if err != nil {
		t.Fatalf("se esperaba un pedido válido y se obtuvo %v", err)
	}

	calculos := reglas.Calcular(pedido, catalogo.Clientes[pedido.ClienteID])
	assertCalculos(t, calculos, caso.Expected.Calculos)
}
