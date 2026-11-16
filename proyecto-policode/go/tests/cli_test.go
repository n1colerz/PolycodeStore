package tests

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"polystore/internal/cli"
)

func TestCLIRunEscribeArchivoDeSalida(t *testing.T) {
	casos := cargarCasos(t, "casos_prueba.json")
	var entrada map[string]any
	if e := json.Unmarshal(casos[0].Entrada, &entrada); e != nil {
		t.Fatalf("entrada inválida: %v", e)
	}
	entrada["id"] = "PED-CLI-01"

	directorio := t.TempDir()
	rutaEntrada := filepath.Join(directorio, "entrada.json")
	rutaSalida := filepath.Join(directorio, "salida.json")

	contenido, _ := json.Marshal(map[string]any{"pedidos": []any{entrada}})
	if e := os.WriteFile(rutaEntrada, contenido, 0o644); e != nil {
		t.Fatalf("no se pudo escribir la entrada: %v", e)
	}

	codigo := cli.Run([]string{
		"run",
		"--entrada", rutaEntrada,
		"--salida", rutaSalida,
		"--datos", directorioDatos(),
		"--trabajadores", "2",
	})
	if codigo != 0 {
		t.Fatalf("código de salida: %d", codigo)
	}

	leido, err := os.ReadFile(rutaSalida)
	if err != nil {
		t.Fatalf("no se pudo leer la salida: %v", err)
	}
	var salida map[string]any
	if e := json.Unmarshal(leido, &salida); e != nil {
		t.Fatalf("salida inválida: %v", e)
	}

	resumen := salida["resumen"].(map[string]any)
	if resumen["exitosos"] != float64(1) || resumen["fallidos"] != float64(0) {
		t.Errorf("resumen: %v", resumen)
	}
	resultado := salida["resultados"].([]any)[0].(map[string]any)
	pedido := resultado["pedido"].(map[string]any)
	if pedido["id"] != "PED-CLI-01" {
		t.Errorf("id: %v", pedido["id"])
	}
	calculos := pedido["calculos"].(map[string]any)
	if centavos(calculos["total"].(float64)) != centavos(719.20) {
		t.Errorf("total: %v != 719.20", calculos["total"])
	}
}

func TestCLIRunArchivoInexistente(t *testing.T) {
	codigo := cli.Run([]string{
		"run",
		"--entrada", filepath.Join(t.TempDir(), "no-existe.json"),
		"--datos", directorioDatos(),
	})
	if codigo != 1 {
		t.Errorf("código de salida: %d != 1", codigo)
	}
}

func TestCLIArgumentosInvalidos(t *testing.T) {
	if codigo := cli.Run(nil); codigo != 2 {
		t.Errorf("sin comando: %d != 2", codigo)
	}
	if codigo := cli.Run([]string{"desconocido"}); codigo != 2 {
		t.Errorf("comando desconocido: %d != 2", codigo)
	}
	if codigo := cli.Run([]string{"run"}); codigo != 2 {
		t.Errorf("run sin --entrada: %d != 2", codigo)
	}
}

func TestCLIVersion(t *testing.T) {
	if codigo := cli.Run([]string{"--version"}); codigo != 0 {
		t.Errorf("código de salida: %d != 0", codigo)
	}
}
