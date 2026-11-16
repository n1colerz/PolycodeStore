package tests

import "testing"

// TestCasosComunes ejecuta los 5 casos comunes de datos/casos_prueba.json.
func TestCasosComunes(t *testing.T) {
	casos := cargarCasos(t, "casos_prueba.json")
	if len(casos) != 5 {
		t.Fatalf("se esperaban 5 casos comunes y hay %d", len(casos))
	}

	catalogo := cargarCatalogo(t)
	for _, caso := range casos {
		caso := caso
		t.Run(caso.ID, func(t *testing.T) {
			verificarCaso(t, caso, catalogo)
		})
	}
}
