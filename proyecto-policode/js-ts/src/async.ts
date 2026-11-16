/**
 * Procesamiento concurrente de lotes con `Promise.all`.
 * Cada pedido se valida y calcula de forma independiente; el resultado se
 * recoge en el orden de entrada, así que la salida es determinista.
 */

import { setImmediate } from "node:timers/promises";

import { numeroDesdeCentavos } from "./dinero.js";
import { cuerpoInvalido, ErrorDominio, loteVacio } from "./errores.js";
import { calcular, esObjeto, pedidoProcesado, validarPedido } from "./reglas.js";
import { Cliente, Importe, Lote, ResultadoLote } from "./modelos.js";

/** Procesa un lote en paralelo conservando el orden de entrada. */
export async function procesarLote(
  brutos: unknown[],
  clientes: Map<string, Cliente>,
): Promise<Lote> {
  if (brutos.length === 0) {
    throw loteVacio();
  }

  // Promise.all mantiene el orden del arreglo de entrada, pase lo que pase.
  const resultados = await Promise.all(
    brutos.map((bruto, indice) => procesarEntrada(indice, bruto, clientes)),
  );

  const exitosos = resultados.filter((resultado) => resultado.ok).length;
  const totalCentavos = resultados.reduce(
    (suma, resultado) => suma + (resultado.ok ? (resultado.pedido?.calculos._totalCentavos ?? 0) : 0),
    0,
  );

  return {
    resultados,
    resumen: {
      total: resultados.length,
      exitosos,
      fallidos: resultados.length - exitosos,
      montoTotal: new Importe(numeroDesdeCentavos(totalCentavos)),
    },
  };
}

/** Procesa una entrada del lote sin tocar estado compartido. */
async function procesarEntrada(
  indice: number,
  bruto: unknown,
  clientes: Map<string, Cliente>,
): Promise<ResultadoLote> {
  // Cede el control al event loop: el lote se resuelve de forma asíncrona.
  await setImmediate();

  try {
    if (!esObjeto(bruto)) {
      throw cuerpoInvalido(`pedidos[${indice}]`);
    }
    const pedido = validarPedido(bruto, clientes);
    const cliente = clientes.get(pedido.clienteId) as Cliente;
    return { indice, ok: true, pedido: pedidoProcesado(pedido, calcular(pedido, cliente)) };
  } catch (error) {
    if (error instanceof ErrorDominio) {
      return { indice, ok: false, error: error.aObjeto() };
    }
    return {
      indice,
      ok: false,
      error: { codigo: "ERROR_INTERNO", mensaje: "Error interno del servidor." },
    };
  }
}
