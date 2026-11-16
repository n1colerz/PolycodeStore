/** CLI de JS/TS: `run` procesa un lote y `serve` levanta la API. */

import type { Server } from "node:http";
import { resolve as resolverRuta } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { Almacen } from "./almacen.js";
import { crearServidor } from "./api.js";
import { procesarLote } from "./async.js";
import { ErrorDominio } from "./errores.js";
import {
  cargarClientes,
  cargarEntradaLote,
  cargarPedidosIniciales,
  cargarProductos,
  escribirJson,
  serializarJson,
} from "./ioJson.js";
import { Pedido, VERSION } from "./modelos.js";
import { validarPedido } from "./reglas.js";

const PUERTO_POR_DEFECTO = 8003;
const HOST_POR_DEFECTO = "127.0.0.1";

/** Ejecuta la CLI y devuelve el código de salida. */
export async function ejecutar(args: string[]): Promise<number> {
  const [comando, ...resto] = args;

  switch (comando) {
    case "run":
      return ejecutarRun(resto);
    case "serve":
      return ejecutarServe(resto);
    case "--version":
    case "version":
      console.log(VERSION);
      return 0;
    case "--help":
    case "-h":
    case "help":
      imprimirAyuda(process.stdout);
      return 0;
    case undefined:
      imprimirAyuda(process.stderr);
      return 2;
    default:
      console.error(`Comando desconocido: ${comando}`);
      imprimirAyuda(process.stderr);
      return 2;
  }
}

function imprimirAyuda(salida: NodeJS.WriteStream): void {
  salida.write(
    [
      "Uso: node dist/cli.js <comando> [opciones]",
      "",
      "Comandos:",
      "  run    procesa un JSON de pedidos en lote y escribe el resultado",
      "  serve  levanta la API HTTP",
      "",
      "Opciones de run:",
      "  --entrada <archivo|->   archivo JSON de pedidos (o '-' para stdin)",
      "  --salida <archivo|->    archivo JSON de salida (o '-' para stdout)",
      "  --datos <directorio>    directorio con clientes.json",
      "",
      "Opciones de serve:",
      "  --datos <directorio>    directorio con los datasets",
      "  --host <host>           host de escucha (default 127.0.0.1)",
      "  --puerto <n>            puerto (default JS_PORT u 8003)",
      "",
      "Variables de entorno: JS_PORT, POLY_DATA_DIR",
      "",
    ].join("\n"),
  );
}

function directorioDatos(valor?: string): string {
  return valor ?? process.env.POLY_DATA_DIR ?? "datos";
}

function resolverPuerto(valor?: string): number {
  if (valor !== undefined) {
    const puerto = Number(valor);
    if (!Number.isInteger(puerto) || puerto <= 0) {
      throw new Error(`El puerto '${valor}' no es válido.`);
    }
    return puerto;
  }
  const desdeEntorno = process.env.JS_PORT;
  if (desdeEntorno) {
    const puerto = Number(desdeEntorno);
    if (!Number.isInteger(puerto) || puerto <= 0) {
      throw new Error(`La variable JS_PORT debe ser un número entero, no '${desdeEntorno}'.`);
    }
    return puerto;
  }
  return PUERTO_POR_DEFECTO;
}

async function ejecutarRun(args: string[]): Promise<number> {
  let valores: Record<string, string | undefined>;
  try {
    ({ values: valores } = parseArgs({
      args,
      options: {
        entrada: { type: "string" },
        salida: { type: "string" },
        datos: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    console.error("Error: argumentos inválidos para 'run'.");
    return 2;
  }

  if (!valores.entrada) {
    console.error("Error: falta el argumento --entrada.");
    return 2;
  }

  try {
    const clientes = await cargarClientes(directorioDatos(valores.datos));
    const brutos = await cargarEntradaLote(valores.entrada);
    const lote = await procesarLote(brutos, clientes);

    if (valores.salida && valores.salida !== "-") {
      await escribirJson(valores.salida, lote);
    } else {
      process.stdout.write(`${serializarJson(lote)}\n`);
    }
  } catch (error) {
    const mensaje = error instanceof ErrorDominio ? error.message : (error as Error).message;
    console.error(`Error: ${mensaje}`);
    return 1;
  }
  return 0;
}

async function ejecutarServe(args: string[]): Promise<number> {
  let valores: Record<string, string | undefined>;
  try {
    ({ values: valores } = parseArgs({
      args,
      options: {
        datos: { type: "string" },
        host: { type: "string" },
        puerto: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    console.error("Error: argumentos inválidos para 'serve'.");
    return 2;
  }

  const directorio = directorioDatos(valores.datos);
  const host = valores.host ?? HOST_POR_DEFECTO;

  let servidor: Server;
  try {
    const clientes = await cargarClientes(directorio);
    // productos.json se carga para validar el dataset; las reglas no validan
    // codigoProducto contra el catálogo (decisión D12 del contrato).
    await cargarProductos(directorio);
    const brutos = await cargarPedidosIniciales(directorio);
    const pedidos: Pedido[] = brutos.map((bruto) => validarPedido(bruto, clientes));
    const almacen = new Almacen(clientes, pedidos);
    const puerto = resolverPuerto(valores.puerto);

    servidor = crearServidor(almacen, clientes);
    await new Promise<void>((cumplir, fallar) => {
      servidor.once("error", fallar);
      servidor.listen(puerto, host, () => {
        console.error(
          `API JS escuchando en http://${host}:${puerto} (datos: ${resolverRuta(directorio)})`,
        );
        cumplir();
      });
    });

    await new Promise<void>((cumplir) => {
      const cerrar = () => {
        servidor.close(() => cumplir());
      };
      process.on("SIGINT", cerrar);
      process.on("SIGTERM", cerrar);
    });
  } catch (error) {
    const mensaje = error instanceof ErrorDominio ? error.message : (error as Error).message;
    console.error(`Error al iniciar la API: ${mensaje}`);
    return 1;
  }
  return 0;
}

const invocadoDirectamente =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoDirectamente) {
  process.exitCode = await ejecutar(process.argv.slice(2));
}
