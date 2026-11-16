import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { ErrorDominio } from "../src/errores.js";
import { Almacen } from "../src/almacen.js";
import { cargarClientes } from "../src/ioJson.js";
import { Cliente } from "../src/modelos.js";
import { calcular, validarPedido, validarTransicion } from "../src/reglas.js";

const aqui = dirname(fileURLToPath(import.meta.url));

/** Ruta a ../datos desde el paquete de tests. */
export const DIR_DATOS = join(aqui, "..", "..", "datos");

export interface ErrorEsperado {
  codigo: string;
  mensaje: string;
  campo?: string;
}

export interface CasoPrueba {
  id: string;
  tipo: string;
  descripcion: string;
  entrada: unknown;
  esperado: {
    http: number;
    ok: boolean;
    estado?: string;
    calculos?: {
      subtotal: number;
      porcentajeDescuento: number;
      descuento: number;
      impuesto: number;
      costoEnvio: number;
      total: number;
    };
    error?: ErrorEsperado;
  };
}

/** Carga los casos de un fixture compartido. */
export async function cargarCasos(nombre: string): Promise<CasoPrueba[]> {
  const texto = await readFile(join(DIR_DATOS, nombre), "utf-8");
  const archivo = JSON.parse(texto) as { casos: CasoPrueba[] };
  return archivo.casos;
}

/** Carga el catálogo de clientes del proyecto. */
export async function catalogoClientes(): Promise<Map<string, Cliente>> {
  return cargarClientes(DIR_DATOS);
}

/** Carga el dataset pequeño en un almacén nuevo. */
export async function crearAlmacen(clientes: Map<string, Cliente>): Promise<Almacen> {
  const texto = await readFile(join(DIR_DATOS, "pedidos_pequenos.json"), "utf-8");
  const archivo = JSON.parse(texto) as { pedidos: unknown[] };
  const pedidos = archivo.pedidos.map((bruto) => validarPedido(bruto, clientes));
  return new Almacen(clientes, pedidos);
}

/** Convierte un importe a centavos enteros para comparar sin flotantes. */
export function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Ejecuta un fixture de casos_prueba.json o casos_borde.json. */
export function verificarCaso(caso: CasoPrueba, clientes: Map<string, Cliente>): void {
  if (caso.tipo === "transicion") {
    const entrada = caso.entrada as { estadoActual: string; estadoNuevo: string };
    if (caso.esperado.ok) {
      validarTransicion(entrada.estadoActual, entrada.estadoNuevo);
      expect(entrada.estadoNuevo).toBe(caso.esperado.estado);
    } else {
      try {
        validarTransicion(entrada.estadoActual, entrada.estadoNuevo);
        expect.unreachable("se esperaba un error de transición");
      } catch (error) {
        comprobarError(error as ErrorDominio, caso.esperado.error, caso.esperado.http);
      }
    }
    return;
  }

  if (caso.esperado.ok) {
    const pedido = validarPedido(caso.entrada, clientes);
    const cliente = clientes.get(pedido.clienteId) as Cliente;
    const calculos = calcular(pedido, cliente);
    const esperado = caso.esperado.calculos as NonNullable<CasoPrueba["esperado"]["calculos"]>;

    expect(calculos.porcentajeDescuento).toBe(esperado.porcentajeDescuento);
    expect(centavos(calculos.subtotal)).toBe(centavos(esperado.subtotal));
    expect(centavos(calculos.descuento)).toBe(centavos(esperado.descuento));
    expect(centavos(calculos.impuesto)).toBe(centavos(esperado.impuesto));
    expect(centavos(calculos.costoEnvio)).toBe(centavos(esperado.costoEnvio));
    expect(centavos(calculos.total)).toBe(centavos(esperado.total));
    return;
  }

  try {
    validarPedido(caso.entrada, clientes);
    expect.unreachable("se esperaba un error de validación");
  } catch (error) {
    comprobarError(error as ErrorDominio, caso.esperado.error, caso.esperado.http);
  }
}

function comprobarError(error: ErrorDominio, esperado: ErrorEsperado | undefined, http: number): void {
  expect(error).toBeInstanceOf(ErrorDominio);
  expect(error.codigo).toBe(esperado?.codigo);
  expect(error.message).toBe(esperado?.mensaje);
  expect(error.campo).toBe(esperado?.campo);
  expect(error.http).toBe(http);
}

/** Ejecuta una acción que debe fallar y comprueba el código de error. */
export function esperarError(accion: () => unknown, codigo: string): ErrorDominio {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorDominio);
    const dominio = error as ErrorDominio;
    expect(dominio.codigo).toBe(codigo);
    return dominio;
  }
  throw new Error(`se esperaba el error ${codigo}`);
}

/** Igual que esperarError, pero para promesas. */
export async function esperarErrorAsync(
  accion: () => Promise<unknown>,
  codigo: string,
): Promise<ErrorDominio> {
  try {
    await accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorDominio);
    const dominio = error as ErrorDominio;
    expect(dominio.codigo).toBe(codigo);
    return dominio;
  }
  throw new Error(`se esperaba el error ${codigo}`);
}
