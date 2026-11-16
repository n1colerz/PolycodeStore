import { describe, expect, it } from "vitest";

import { Almacen } from "../src/almacen.js";
import { procesarLote } from "../src/async.js";
import { ErrorDominio } from "../src/errores.js";
import { Cliente, ESTADOS, Pedido, TRANSICIONES } from "../src/modelos.js";
import { validarPedido } from "../src/reglas.js";
import { centavos, catalogoClientes, cargarCasos, crearAlmacen, esperarError, esperarErrorAsync } from "./ayudas.js";

async function clientesYAlmacen(): Promise<{ clientes: Map<string, Cliente>; almacen: Almacen }> {
  const clientes = await catalogoClientes();
  const almacen = await crearAlmacen(clientes);
  return { clientes, almacen };
}

describe("reglas", () => {
  it("el resumen coincide con el dataset", async () => {
    const { almacen } = await clientesYAlmacen();
    const resumen = almacen.resumen();

    expect(resumen.totalPedidos).toBe(10);
    expect(centavos(resumen.montoTotal.valor)).toBe(centavos(7262.56));
    expect(resumen.porEstado).toEqual({
      recibido: 2,
      en_preparacion: 2,
      enviado: 2,
      entregado: 2,
      cancelado: 2,
    });
    expect(resumen.porPrioridad).toEqual({ alta: 4, media: 3, baja: 3 });
  });

  it("aplica filtros y órdenes", async () => {
    const { almacen } = await clientesYAlmacen();

    expect(almacen.listar(undefined, "recibido").map((p) => p.id)).toEqual(["PED-0001", "PED-0006"]);
    expect(almacen.listar("CLI-001").map((p) => p.id)).toEqual(["PED-0001"]);
    expect(almacen.listar("CLI-999")).toEqual([]);

    expect(almacen.listar(undefined, undefined, "fecha").map((p) => p.id)).toEqual(
      Array.from({ length: 10 }, (_, indice) => `PED-${String(indice + 1).padStart(4, "0")}`),
    );

    const porMonto = almacen.listar(undefined, undefined, "monto");
    expect(porMonto[0].id).toBe("PED-0009");
    for (let indice = 1; indice < porMonto.length; indice += 1) {
      expect(porMonto[indice - 1].calculos._totalCentavos).toBeGreaterThanOrEqual(
        porMonto[indice].calculos._totalCentavos,
      );
    }

    expect(almacen.listar(undefined, undefined, "prioridad").map((p) => p.id)).toEqual([
      "PED-0001",
      "PED-0004",
      "PED-0007",
      "PED-0010",
      "PED-0002",
      "PED-0005",
      "PED-0008",
      "PED-0003",
      "PED-0006",
      "PED-0009",
    ]);
  });

  it("respeta la matriz completa de transiciones", async () => {
    const { validarTransicion } = await import("../src/reglas.js");
    for (const actual of ESTADOS) {
      for (const nuevo of ESTADOS) {
        const permitido = (TRANSICIONES[actual] as readonly string[]).includes(nuevo);
        if (permitido) {
          expect(() => validarTransicion(actual, nuevo)).not.toThrow();
        } else {
          expect(() => validarTransicion(actual, nuevo)).toThrow(ErrorDominio);
        }
      }
    }
  });

  it("rechaza ids duplicados y pedidos inexistentes", async () => {
    const { almacen } = await clientesYAlmacen();

    const existente = almacen.obtener("PED-0001") as Pedido;
    esperarError(() => almacen.agregar(existente), "PEDIDO_DUPLICADO");
    esperarError(() => almacen.actualizarEstado("PED-9999", "en_preparacion"), "PEDIDO_NO_ENCONTRADO");
  });

  it("cambia el estado solo con transiciones válidas", async () => {
    const { almacen } = await clientesYAlmacen();

    const actualizado = almacen.actualizarEstado("PED-0001", "en_preparacion");
    expect(actualizado.estado).toBe("en_preparacion");

    esperarError(() => almacen.actualizarEstado("PED-0001", "en_preparacion"), "TRANSICION_INVALIDA");
    esperarError(() => almacen.actualizarEstado("PED-0004", "en_preparacion"), "TRANSICION_INVALIDA");
  });

  it("acepta cantidades enteras y rechaza las que no lo son", async () => {
    const { clientes } = await clientesYAlmacen();
    const casos = await cargarCasos("casos_prueba.json");
    const entrada = casos[0].entrada as { items: Record<string, unknown>[] };

    const conDos = structuredClone(entrada);
    conDos.items[0].cantidad = 2.0;
    const pedido = validarPedido(conDos, clientes);
    expect(pedido.items[0].cantidad).toBe(2);

    const conFraccion = structuredClone(entrada);
    conFraccion.items[0].cantidad = 2.5;
    esperarError(() => validarPedido(conFraccion, clientes), "CANTIDAD_INVALIDA");

    const conPrecioNegativo = structuredClone(entrada);
    conPrecioNegativo.items[0].precioUnitario = -1;
    esperarError(() => validarPedido(conPrecioNegativo, clientes), "PRECIO_INVALIDO");
  });

  it("el lote conserva el orden y resume los importes", async () => {
    const { clientes } = await clientesYAlmacen();
    const casos = await cargarCasos("casos_prueba.json");
    const base = casos[0].entrada as Record<string, unknown>;

    const brutos = Array.from({ length: 20 }, (_, indice) => ({
      ...base,
      id: `PED-LOTE-${String(indice).padStart(2, "0")}`,
    }));

    const lote = await procesarLote(brutos, clientes);
    expect(lote.resultados).toHaveLength(20);
    expect(lote.resultados.map((resultado) => resultado.indice)).toEqual(
      Array.from({ length: 20 }, (_, indice) => indice),
    );
    expect(lote.resultados.map((resultado) => resultado.pedido?.id)).toEqual(
      Array.from({ length: 20 }, (_, indice) => `PED-LOTE-${String(indice).padStart(2, "0")}`),
    );
    expect(lote.resumen.exitosos).toBe(20);
    expect(lote.resumen.fallidos).toBe(0);
    expect(centavos(lote.resumen.montoTotal.valor)).toBe(centavos(14384));
  });

  it("rechaza un lote vacío", async () => {
    const { clientes } = await clientesYAlmacen();
    await esperarErrorAsync(() => procesarLote([], clientes), "LOTE_VACIO");
  });
});
