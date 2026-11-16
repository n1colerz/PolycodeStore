import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crearServidor } from "../src/api.js";
import { Cliente } from "../src/modelos.js";
import { catalogoClientes, centavos, cargarCasos, crearAlmacen } from "./ayudas.js";

let servidor: Server;
let base: string;
let clientes: Map<string, Cliente>;

/** Levanta un servidor aislado, para las pruebas que modifican el almacén. */
async function nuevoServidor(): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const clientesLocales = await catalogoClientes();
  const almacen = await crearAlmacen(clientesLocales);
  const servidorLocal = crearServidor(almacen, clientesLocales);
  servidorLocal.listen(0, "127.0.0.1");
  await once(servidorLocal, "listening");
  const url = `http://127.0.0.1:${(servidorLocal.address() as AddressInfo).port}`;
  return {
    url,
    cerrar: () => new Promise<void>((cumplir) => servidorLocal.close(() => cumplir())),
  };
}

beforeAll(async () => {
  clientes = await catalogoClientes();
  const almacen = await crearAlmacen(clientes);
  servidor = crearServidor(almacen, clientes);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((cumplir) => servidor.close(() => cumplir()));
});

async function pedir(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<Response> {
  return fetch(`${base}${ruta}`, {
    method: metodo,
    headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

describe("API HTTP", () => {
  it("responde el estado de salud con CORS", async () => {
    const respuesta = await pedir("/salud");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("access-control-allow-origin")).toBe("*");

    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    expect(cuerpo.lenguaje).toBe("js");
    expect(cuerpo.estado).toBe("ok");
    expect(cuerpo.pedidosEnMemoria).toBe(10);
  });

  it("lista, filtra y ordena pedidos", async () => {
    const todos = (await (await pedir("/pedidos")).json()) as { total: number };
    expect(todos.total).toBe(10);

    const recibidos = (await (await pedir("/pedidos?estado=recibido")).json()) as {
      pedidos: { id: string }[];
    };
    expect(recibidos.pedidos.map((p) => p.id)).toEqual(["PED-0001", "PED-0006"]);

    const porCliente = (await (await pedir("/pedidos?clienteId=CLI-001")).json()) as {
      total: number;
    };
    expect(porCliente.total).toBe(1);

    const desconocido = (await (await pedir("/pedidos?clienteId=CLI-999")).json()) as {
      total: number;
      pedidos: unknown[];
    };
    expect(desconocido.total).toBe(0);
    expect(desconocido.pedidos).toEqual([]);

    const invalido = await pedir("/pedidos?estado=pagado");
    expect(invalido.status).toBe(400);
    expect(((await invalido.json()) as { codigo: string }).codigo).toBe("ESTADO_INVALIDO");

    const ordenInvalido = await pedir("/pedidos?orden=peso");
    expect(ordenInvalido.status).toBe(400);
    expect(((await ordenInvalido.json()) as { codigo: string }).codigo).toBe("ORDEN_INVALIDO");
  });

  it("obtiene un pedido y responde 404 si no existe", async () => {
    const respuesta = await pedir("/pedidos/PED-0001");
    expect(respuesta.status).toBe(200);

    const cuerpo = (await respuesta.json()) as { calculos: { total: number } };
    expect(centavos(cuerpo.calculos.total)).toBe(centavos(1006.08));

    const ausente = await pedir("/pedidos/PED-9999");
    expect(ausente.status).toBe(404);
    const error = (await ausente.json()) as { codigo: string; campo: string };
    expect(error.codigo).toBe("PEDIDO_NO_ENCONTRADO");
    expect(error.campo).toBe("id");
  });

  it("crea un pedido y rechaza el id duplicado", async () => {
    const aislado = await nuevoServidor();
    try {
      const casos = await cargarCasos("casos_prueba.json");
      const entrada = { ...(casos[0].entrada as Record<string, unknown>), id: "PED-API-01" };

      const respuesta = await fetch(`${aislado.url}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entrada),
      });
      expect(respuesta.status).toBe(201);
      expect(respuesta.headers.get("location")).toBe("/pedidos/PED-API-01");

      const cuerpo = (await respuesta.json()) as { calculos: { total: number } };
      expect(centavos(cuerpo.calculos.total)).toBe(centavos(719.2));

      const duplicado = await fetch(`${aislado.url}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entrada),
      });
      expect(duplicado.status).toBe(409);
      expect(((await duplicado.json()) as { codigo: string }).codigo).toBe("PEDIDO_DUPLICADO");
    } finally {
      await aislado.cerrar();
    }
  });

  it("rechaza pedidos inválidos y clientes inexistentes", async () => {
    const casos = await cargarCasos("casos_prueba.json");

    const invalido = await pedir("/pedidos", "POST", casos[1].entrada);
    expect(invalido.status).toBe(400);
    const error = (await invalido.json()) as { codigo: string; campo: string };
    expect(error.codigo).toBe("CANTIDAD_INVALIDA");
    expect(error.campo).toBe("items[0].cantidad");

    const inexistente = await pedir("/pedidos", "POST", {
      ...(casos[0].entrada as Record<string, unknown>),
      id: "PED-API-02",
      clienteId: "CLI-999",
    });
    expect(inexistente.status).toBe(404);
    expect(((await inexistente.json()) as { codigo: string }).codigo).toBe("CLIENTE_NO_ENCONTRADO");
  });

  it("cambia el estado respetando las transiciones", async () => {
    const aislado = await nuevoServidor();
    const parche = (ruta: string, cuerpo: unknown) =>
      fetch(`${aislado.url}${ruta}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });

    try {
      const valido = await parche("/pedidos/PED-0001/estado", { estado: "en_preparacion" });
      expect(valido.status).toBe(200);
      expect(((await valido.json()) as { estado: string }).estado).toBe("en_preparacion");

      const repetido = await parche("/pedidos/PED-0001/estado", { estado: "en_preparacion" });
      expect(repetido.status).toBe(409);
      expect(((await repetido.json()) as { codigo: string }).codigo).toBe("TRANSICION_INVALIDA");

      const desdeEntregado = await parche("/pedidos/PED-0004/estado", { estado: "en_preparacion" });
      expect(desdeEntregado.status).toBe(409);

      const enumInvalido = await parche("/pedidos/PED-0002/estado", { estado: "pagado" });
      expect(enumInvalido.status).toBe(400);
      expect(((await enumInvalido.json()) as { codigo: string }).codigo).toBe("ESTADO_INVALIDO");

      const inexistente = await parche("/pedidos/PED-9999/estado", { estado: "en_preparacion" });
      expect(inexistente.status).toBe(404);
    } finally {
      await aislado.cerrar();
    }
  });

  it("devuelve el resumen de ventas", async () => {
    const respuesta = await pedir("/resumen");
    expect(respuesta.status).toBe(200);

    const cuerpo = (await respuesta.json()) as {
      totalPedidos: number;
      montoTotal: number;
      porEstado: Record<string, number>;
      porPrioridad: Record<string, number>;
    };
    expect(cuerpo.totalPedidos).toBe(10);
    expect(centavos(cuerpo.montoTotal)).toBe(centavos(7262.56));
    expect(cuerpo.porEstado.recibido).toBe(2);
    expect(cuerpo.porPrioridad.alta).toBe(4);
  });

  it("procesa el lote en paralelo conservando el orden", async () => {
    const casos = await cargarCasos("casos_prueba.json");
    const primero = { ...(casos[0].entrada as Record<string, unknown>), id: "PED-LOTE-A" };
    const segundo = { ...(casos[1].entrada as Record<string, unknown>), id: "PED-LOTE-B" };

    const respuesta = await pedir("/pedidos/lote", "POST", { pedidos: [primero, segundo] });
    expect(respuesta.status).toBe(200);

    const cuerpo = (await respuesta.json()) as {
      resultados: { indice: number; ok: boolean; error?: { codigo: string } }[];
      resumen: { total: number; exitosos: number; fallidos: number; montoTotal: number };
    };
    expect(cuerpo.resultados.map((r) => r.indice)).toEqual([0, 1]);
    expect(cuerpo.resultados[0].ok).toBe(true);
    expect(cuerpo.resultados[1].ok).toBe(false);
    expect(cuerpo.resultados[1].error?.codigo).toBe("CANTIDAD_INVALIDA");
    expect(cuerpo.resumen.total).toBe(2);
    expect(cuerpo.resumen.exitosos).toBe(1);
    expect(centavos(cuerpo.resumen.montoTotal)).toBe(centavos(719.2));
  });

  it("rechaza lotes vacíos o con tipo inválido", async () => {
    const vacio = await pedir("/pedidos/lote", "POST", { pedidos: [] });
    expect(vacio.status).toBe(400);
    expect(((await vacio.json()) as { codigo: string }).codigo).toBe("LOTE_VACIO");

    const tipo = await pedir("/pedidos/lote", "POST", { pedidos: "no-es-lista" });
    expect(tipo.status).toBe(400);
    expect(((await tipo.json()) as { codigo: string }).codigo).toBe("TIPO_INVALIDO");
  });

  it("gestiona rutas, métodos y JSON inválido", async () => {
    const ruta = await pedir("/desconocida");
    expect(ruta.status).toBe(404);
    expect(ruta.headers.get("access-control-allow-origin")).toBe("*");
    expect(((await ruta.json()) as { codigo: string }).codigo).toBe("RUTA_NO_ENCONTRADA");

    const metodo = await pedir("/pedidos", "DELETE");
    expect(metodo.status).toBe(405);
    expect(((await metodo.json()) as { codigo: string }).codigo).toBe("METODO_NO_PERMITIDO");

    const loteConGet = await pedir("/pedidos/lote");
    expect(loteConGet.status).toBe(405);

    const jsonRoto = await fetch(`${base}/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"id":',
    });
    expect(jsonRoto.status).toBe(400);
    expect(((await jsonRoto.json()) as { codigo: string }).codigo).toBe("JSON_INVALIDO");
  });

  it("responde el preflight CORS", async () => {
    const respuesta = await fetch(`${base}/pedidos`, { method: "OPTIONS" });
    expect(respuesta.status).toBe(204);
    expect(respuesta.headers.get("access-control-allow-origin")).toBe("*");
    expect(respuesta.headers.get("access-control-allow-methods")).toContain("PATCH");
  });
});
