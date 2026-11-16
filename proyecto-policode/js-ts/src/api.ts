/** API HTTP del contrato, implementada con `node:http`. */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { Almacen } from "./almacen.js";
import { procesarLote } from "./async.js";
import {
  campoRequerido,
  cuerpoInvalido,
  ErrorDominio,
  estadoInvalido,
  jsonInvalido,
  metodoNoPermitido,
  ordenInvalido,
  pedidoNoEncontrado,
  rutaNoEncontrada,
  tipoInvalido,
} from "./errores.js";
import { serializarJson } from "./ioJson.js";
import { calcular, esObjeto, pedidoProcesado, validarPedido } from "./reglas.js";
import { Cliente, ESTADOS, Pedido, Salud, VERSION } from "./modelos.js";

const CABECERAS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ORDENES = new Set(["fecha", "monto", "prioridad"]);

/** Crea el servidor HTTP con el almacén y el catálogo. */
export function crearServidor(almacen: Almacen, clientes: Map<string, Cliente>): Server {
  return createServer((peticion, respuesta) => {
    manejar(peticion, respuesta, almacen, clientes).catch(() => {
      responder(respuesta, 500, { codigo: "ERROR_INTERNO", mensaje: "Error interno del servidor." });
    });
  });
}

async function manejar(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  almacen: Almacen,
  clientes: Map<string, Cliente>,
): Promise<void> {
  if (peticion.method === "OPTIONS") {
    respuesta.writeHead(204, CABECERAS_CORS);
    respuesta.end();
    return;
  }

  const url = new URL(peticion.url ?? "/", "http://localhost");
  const partes = url.pathname
    .split("/")
    .filter((parte) => parte !== "")
    .map((parte) => decodeURIComponent(parte));
  const ruta = normalizarRuta(url.pathname);

  try {
    if (partes.length === 1 && partes[0] === "salud") {
      exigirMetodo(peticion, "GET", ruta);
      const salud: Salud = {
        lenguaje: "js",
        estado: "ok",
        version: VERSION,
        pedidosEnMemoria: almacen.total(),
      };
      responder(respuesta, 200, salud);
      return;
    }

    if (partes.length === 1 && partes[0] === "resumen") {
      exigirMetodo(peticion, "GET", ruta);
      responder(respuesta, 200, almacen.resumen());
      return;
    }

    if (partes.length === 1 && partes[0] === "pedidos") {
      if (peticion.method === "GET") {
        listar(peticion, respuesta, almacen);
        return;
      }
      if (peticion.method === "POST") {
        await crear(peticion, respuesta, almacen, clientes);
        return;
      }
      throw metodoNoPermitido(peticion.method ?? "", ruta);
    }

    if (partes.length === 2 && partes[0] === "pedidos" && partes[1] === "lote") {
      exigirMetodo(peticion, "POST", ruta);
      await lote(peticion, respuesta, clientes);
      return;
    }

    if (partes.length === 2 && partes[0] === "pedidos") {
      exigirMetodo(peticion, "GET", ruta);
      const pedido = almacen.obtener(partes[1]);
      if (!pedido) {
        throw pedidoNoEncontrado(partes[1]);
      }
      responder(respuesta, 200, pedidoProcesado(pedido, calcular(pedido, clientes.get(pedido.clienteId) as Cliente)));
      return;
    }

    if (partes.length === 3 && partes[0] === "pedidos" && partes[2] === "estado") {
      exigirMetodo(peticion, "PATCH", ruta);
      await cambiarEstado(peticion, respuesta, almacen, clientes, partes[1]);
      return;
    }

    throw rutaNoEncontrada(ruta);
  } catch (error) {
    if (error instanceof ErrorDominio) {
      responder(respuesta, error.http, error.aObjeto());
      return;
    }
    throw error;
  }
}

function listar(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  almacen: Almacen,
): void {
  const url = new URL(peticion.url ?? "/", "http://localhost");
  const consulta = url.searchParams;

  const clienteId = consulta.has("clienteId") ? (consulta.get("clienteId") as string) : undefined;
  const estado = consulta.has("estado") ? (consulta.get("estado") as string) : undefined;
  const orden = consulta.has("orden") ? (consulta.get("orden") as string) : undefined;

  if (estado !== undefined && !ESTADOS.includes(estado as (typeof ESTADOS)[number])) {
    throw estadoInvalido();
  }
  if (orden !== undefined && !ORDENES.has(orden)) {
    throw ordenInvalido();
  }

  const pedidos = almacen.listar(clienteId, estado, orden);
  responder(respuesta, 200, { pedidos, total: pedidos.length });
}

async function crear(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  almacen: Almacen,
  clientes: Map<string, Cliente>,
): Promise<void> {
  const datos = await leerObjeto(peticion);
  const pedido: Pedido = validarPedido(datos, clientes);
  almacen.agregar(pedido);

  respuesta.setHeader("Location", `/pedidos/${encodeURIComponent(pedido.id)}`);
  responder(
    respuesta,
    201,
    pedidoProcesado(pedido, calcular(pedido, clientes.get(pedido.clienteId) as Cliente)),
  );
}

async function cambiarEstado(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  almacen: Almacen,
  clientes: Map<string, Cliente>,
  id: string,
): Promise<void> {
  const datos = await leerObjeto(peticion);
  if (!Object.prototype.hasOwnProperty.call(datos, "estado") || datos["estado"] === null) {
    throw campoRequerido("estado");
  }
  const estado = datos["estado"];
  if (typeof estado !== "string") {
    throw tipoInvalido("estado");
  }

  const pedido = almacen.actualizarEstado(id, estado);
  responder(respuesta, 200, pedidoProcesado(pedido, calcular(pedido, clientes.get(pedido.clienteId) as Cliente)));
}

async function lote(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  clientes: Map<string, Cliente>,
): Promise<void> {
  const datos = await leerObjeto(peticion);
  if (!Object.prototype.hasOwnProperty.call(datos, "pedidos") || datos["pedidos"] === null) {
    throw campoRequerido("pedidos");
  }
  const brutos = datos["pedidos"];
  if (!Array.isArray(brutos)) {
    throw tipoInvalido("pedidos");
  }

  const resultado = await procesarLote(brutos, clientes);
  responder(respuesta, 200, resultado);
}

/** Lee el cuerpo de la petición y exige un objeto JSON. */
async function leerObjeto(peticion: IncomingMessage): Promise<Record<string, unknown>> {
  const trozos: Buffer[] = [];
  for await (const trozo of peticion) {
    trozos.push(trozo as Buffer);
  }
  const texto = Buffer.concat(trozos).toString("utf-8");

  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw jsonInvalido();
  }
  if (!esObjeto(datos)) {
    throw cuerpoInvalido();
  }
  return datos;
}

function exigirMetodo(peticion: IncomingMessage, esperado: string, ruta: string): void {
  if (peticion.method !== esperado) {
    throw metodoNoPermitido(peticion.method ?? "", ruta);
  }
}

function normalizarRuta(ruta: string): string {
  if (ruta === "" || ruta === "/") {
    return "/";
  }
  return ruta.replace(/\/+$/, "");
}

function responder(respuesta: ServerResponse, estado: number, cuerpo: unknown): void {
  respuesta.writeHead(estado, {
    ...CABECERAS_CORS,
    "Content-Type": "application/json; charset=utf-8",
  });
  respuesta.end(serializarJson(cuerpo, 0));
}
