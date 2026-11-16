import { describe, expect, it } from "vitest";

import { catalogoClientes, cargarCasos, verificarCaso } from "./ayudas.js";

describe("casos borde", () => {
  it("son diez casos y todos pasan", async () => {
    const casos = await cargarCasos("casos_borde.json");
    expect(casos).toHaveLength(10);

    const clientes = await catalogoClientes();
    for (const caso of casos) {
      verificarCaso(caso, clientes);
    }
  });
});
