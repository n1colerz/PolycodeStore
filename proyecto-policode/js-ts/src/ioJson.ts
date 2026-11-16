/**
 * Lectura y escritura de JSON y carga de catálogos/datasets.
 * El serializador propio mantiene el formato numérico idéntico al de Python
 * y Go (los enteros siempre llevan decimales: 250.0).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ErrorDatos } from "./errores.js";
import { Cliente, Importe, Producto } from "./modelos.js";

/** Formatea un número entero o decimal sin forzar decimales. */
export function formatearNumero(valor: number): string {
  return String(valor);
}

/** Formatea un importe: los valores enteros siempre llevan ".0". */
export function formatearImporte(valor: number): string {
  if (Number.isInteger(valor) && Math.abs(valor) < 1e21) {
    return `${valor}.0`;
  }
  return String(valor);
}

/** Serializa un valor a JSON con el formato del contrato. */
export function serializarJson(valor: unknown, espacios = 2): string {
  return volcar(valor, "", 0, espacios);
}

function volcar(valor: unknown, prefijo: string, nivel: number, espacios: number): string {
  if (valor === null) {
    return "null";
  }
  if (valor instanceof Importe) {
    return formatearImporte(valor.valor);
  }
  if (typeof valor === "number") {
    return formatearNumero(valor);
  }
  if (typeof valor === "boolean") {
    return valor ? "true" : "false";
  }
  if (typeof valor === "string") {
    return JSON.stringify(valor);
  }

  const salto = espacios > 0 ? "\n" : "";
  const sangria = espacios > 0 ? prefijo + " ".repeat(espacios * (nivel + 1)) : "";
  const cierre = espacios > 0 ? prefijo + " ".repeat(espacios * nivel) : "";

  if (Array.isArray(valor)) {
    if (valor.length === 0) {
      return "[]";
    }
    const partes = valor.map((elemento) => volcar(elemento, prefijo, nivel + 1, espacios));
    return `[${salto}${partes.map((p) => sangria + p).join(`,${salto}`)}${salto}${cierre}]`;
  }

  if (typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>).filter(
      ([clave]) => !clave.startsWith("_"),
    );
    if (entradas.length === 0) {
      return "{}";
    }
    const separador = espacios > 0 ? ": " : ":";
    const partes = entradas.map(
      ([clave, contenido]) =>
        `${JSON.stringify(clave)}${separador}${volcar(contenido, prefijo, nivel + 1, espacios)}`,
    );
    return `{${salto}${partes.map((p) => sangria + p).join(`,${salto}`)}${salto}${cierre}}`;
  }

  return "null";
}

async function leerTexto(ruta: string): Promise<string> {
  if (ruta === "-") {
    const trozos: Buffer[] = [];
    for await (const trozo of process.stdin) {
      trozos.push(trozo as Buffer);
    }
    return Buffer.concat(trozos).toString("utf-8");
  }
  try {
    return await readFile(ruta, "utf-8");
  } catch (error) {
    throw new ErrorDatos(`No se pudo leer '${ruta}': ${(error as Error).message}`);
  }
}

/** Lee y parsea un archivo JSON. */
export async function leerJson(ruta: string): Promise<unknown> {
  const texto = await leerTexto(ruta);
  try {
    return JSON.parse(texto);
  } catch (error) {
    throw new ErrorDatos(`El archivo '${ruta}' no contiene JSON válido: ${(error as Error).message}`);
  }
}

/** Escribe un valor como JSON UTF-8 con sangrado de dos espacios. */
export async function escribirJson(ruta: string, valor: unknown): Promise<void> {
  try {
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, `${serializarJson(valor)}\n`, "utf-8");
  } catch (error) {
    throw new ErrorDatos(`No se pudo escribir '${ruta}': ${(error as Error).message}`);
  }
}

/** Carga el catálogo de clientes indexado por id. */
export async function cargarClientes(directorio: string): Promise<Map<string, Cliente>> {
  const ruta = join(directorio, "clientes.json");
  const datos = (await leerJson(ruta)) as { clientes?: Cliente[] };
  if (!datos || !Array.isArray(datos.clientes)) {
    throw new ErrorDatos(`'${ruta}' debe contener un objeto con la lista 'clientes'.`);
  }

  const clientes = new Map<string, Cliente>();
  datos.clientes.forEach((cliente, indice) => {
    if (!cliente || !cliente.id || !cliente.nombre || !cliente.email || !cliente.tipo) {
      throw new ErrorDatos(`El cliente en la posición ${indice} tiene campos inválidos.`);
    }
    if (cliente.tipo !== "vip" && cliente.tipo !== "regular") {
      throw new ErrorDatos(`El cliente '${cliente.id}' tiene un tipo inválido.`);
    }
    if (clientes.has(cliente.id)) {
      throw new ErrorDatos(`El cliente '${cliente.id}' está duplicado.`);
    }
    clientes.set(cliente.id, cliente);
  });
  return clientes;
}

/** Carga el catálogo de productos de referencia. */
export async function cargarProductos(directorio: string): Promise<Producto[]> {
  const ruta = join(directorio, "productos.json");
  const datos = (await leerJson(ruta)) as { productos?: Producto[] };
  if (!datos || !Array.isArray(datos.productos)) {
    throw new ErrorDatos(`'${ruta}' debe contener un objeto con la lista 'productos'.`);
  }

  const vistos = new Set<string>();
  datos.productos.forEach((producto) => {
    if (!producto || !producto.codigo || !producto.nombre || !producto.categoria) {
      throw new ErrorDatos(`El archivo '${ruta}' tiene un producto con campos inválidos.`);
    }
    if (typeof producto.precioUnitario !== "number" || producto.precioUnitario < 0) {
      throw new ErrorDatos(`El producto '${producto.codigo}' tiene un precio inválido.`);
    }
    if (vistos.has(producto.codigo)) {
      throw new ErrorDatos(`El producto '${producto.codigo}' está duplicado.`);
    }
    vistos.add(producto.codigo);
  });
  return datos.productos;
}

/** Carga el dataset inicial como pedidos crudos. */
export async function cargarPedidosIniciales(directorio: string): Promise<unknown[]> {
  const ruta = join(directorio, "pedidos_pequenos.json");
  return extraerPedidos(await leerTexto(ruta), ruta);
}

/** Carga un lote desde archivo o entrada estándar. */
export async function cargarEntradaLote(ruta: string): Promise<unknown[]> {
  return extraerPedidos(await leerTexto(ruta), ruta);
}

function extraerPedidos(texto: string, origen: string): unknown[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch (error) {
    throw new ErrorDatos(`La entrada '${origen}' no contiene JSON válido: ${(error as Error).message}`);
  }

  if (Array.isArray(datos)) {
    return datos;
  }
  if (datos && typeof datos === "object" && Array.isArray((datos as { pedidos?: unknown[] }).pedidos)) {
    return (datos as { pedidos: unknown[] }).pedidos;
  }
  throw new ErrorDatos(
    "La entrada debe ser un array de pedidos o un objeto con la lista 'pedidos'.",
  );
}
