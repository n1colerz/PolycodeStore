package tests

import "testing"

// TestCasosBorde ejecuta los 10 casos borde de datos/casos_borde.json.
func TestCasosBorde(t *testing.T) {
	casos := cargarCasos(t, "casos_borde.json")
	if len(casos) != 10 {
		t.Fatalf("se esperaban 10 casos borde y hay %d", len(casos))
	}

	catalogo := cargarCatalogo(t)
	for _, caso := range casos {
		caso := caso
		t.Run(caso.ID, func(t *testing.T) {
			verificarCaso(t, caso, catalogo)
		})
	}
}
