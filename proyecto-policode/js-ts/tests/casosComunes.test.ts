import { describe, expect, it } from "vitest";

import { catalogoClientes, cargarCasos, verificarCaso } from "./ayudas.js";

describe("casos comunes", () => {
  it("son cinco casos y todos pasan", async () => {
    const casos = await cargarCasos("casos_prueba.json");
    expect(casos).toHaveLength(5);

    const clientes = await catalogoClientes();
    for (const caso of casos) {
      verificarCaso(caso, clientes);
    }
  });
});
