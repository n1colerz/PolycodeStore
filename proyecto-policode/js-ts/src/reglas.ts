/**
 * Reglas de negocio: validación, cálculos y transiciones.
 * Réplica exacta de `python/src/reglas.py` y `go/internal/reglas`.
 */

import { centavosDesdeMicro, microDesdeNumero, numeroDesdeCentavos } from "./dinero.js";
import {
  cantidadInvalida,
  campoRequerido,
  clienteNoEncontrado,
  cuerpoInvalido,
  estadoInvalido,
  fechaInvalida,
  idInvalido,
  metodoPagoInvalido,
  pedidoSinItems,
  precioInvalido,
  prioridadInvalida,
  tipoEnvioInvalido,
  tipoInvalido,
  transicionInvalida,
} from "./errores.js";
import {
  Calculos,
  Cliente,
  ESTADOS,
  Estado,
  Importe,
  ItemPedido,
  METODOS_PAGO,
  MetodoPago,
  Pedido,
  PedidoProcesado,
  PRIORIDADES,
  Prioridad,
  TIPOS_ENVIO,
  TRANSICIONES,
  TipoEnvio,
} from "./modelos.js";

const PATRON_ID = /^[A-Za-z0-9_-]{3,40}$/;
const PATRON_FECHA = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Comprueba que un valor es un objeto JSON (no array ni null). */
export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Un campo obligatorio está presente si existe y no es null. */
function presente(datos: Record<string, unknown>, campo: string): boolean {
  return Object.prototype.hasOwnProperty.call(datos, campo) && datos[campo] !== null;
}

function textoOpcional(
  datos: Record<string, unknown>,
  campo: string,
  defecto: string,
): string {
  if (!presente(datos, campo)) {
    return defecto;
  }
  const valor = datos[campo];
  if (typeof valor !== "string") {
    throw tipoInvalido(campo);
  }
  return valor;
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Valida ISO 8601 con zona horaria y devuelve el instante en milisegundos. */
export function instanteDeFecha(valor: string): number {
  const coincidencia = PATRON_FECHA.exec(valor);
  if (!coincidencia) {
    throw fechaInvalida();
  }

  const [, fecha, hora, fraccion = "", zona] = coincidencia;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [horas, minutos, segundos] = hora.split(":").map(Number);

  if (
    mes < 1 ||
    mes > 12 ||
    dia < 1 ||
    dia > diasDelMes(anio, mes) ||
    horas > 23 ||
    minutos > 59 ||
    segundos > 59
  ) {
    throw fechaInvalida();
  }

  const desfase =
    zona === "Z"
      ? 0
      : (zona[0] === "-" ? -1 : 1) *
        (Number(zona.slice(1, 3)) * 60 + Number(zona.slice(4, 6)));
  const milisegundos = fraccion ? Number((fraccion + "000").slice(0, 3)) : 0;

  return Date.UTC(anio, mes - 1, dia, horas, minutos, segundos, milisegundos) - desfase * 60_000;
}

function validarItem(bruto: unknown, indice: number): ItemPedido {
  if (!esObjeto(bruto)) {
    throw tipoInvalido(`items[${indice}]`);
  }

  for (const campo of ["codigoProducto", "nombre", "precioUnitario", "cantidad"]) {
    if (!presente(bruto, campo)) {
      throw campoRequerido(`items[${indice}].${campo}`);
    }
  }

  const codigoProducto = bruto["codigoProducto"];
  if (typeof codigoProducto !== "string" || codigoProducto === "") {
    throw campoRequerido(`items[${indice}].codigoProducto`);
  }
  const nombre = bruto["nombre"];
  if (typeof nombre !== "string" || nombre === "") {
    throw campoRequerido(`items[${indice}].nombre`);
  }

  const precio = bruto["precioUnitario"];
  if (typeof precio !== "number" || !Number.isFinite(precio)) {
    throw tipoInvalido(`items[${indice}].precioUnitario`);
  }
  const micro = microDesdeNumero(precio);
  if (micro === null) {
    throw tipoInvalido(`items[${indice}].precioUnitario`);
  }
  if (micro < 0) {
    throw precioInvalido(`items[${indice}].precioUnitario`);
  }

  const cantidad = bruto["cantidad"];
  if (typeof cantidad !== "number" || !Number.isFinite(cantidad)) {
    throw tipoInvalido(`items[${indice}].cantidad`);
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw cantidadInvalida(`items[${indice}].cantidad`);
  }

  return {
    codigoProducto,
    nombre,
    precioUnitario: precio,
    cantidad,
    precioMicro: micro,
  };
}

/** Valida una entrada cruda y devuelve el pedido de dominio. */
export function validarPedido(datos: unknown, clientes: Map<string, Cliente>): Pedido {
  if (!esObjeto(datos)) {
    throw cuerpoInvalido();
  }

  for (const campo of ["id", "clienteId", "fechaCreacion", "tipoEnvio", "metodoPago", "items"]) {
    if (!presente(datos, campo)) {
      throw campoRequerido(campo);
    }
  }
  for (const campo of ["id", "clienteId", "fechaCreacion", "tipoEnvio", "metodoPago"]) {
    if (typeof datos[campo] !== "string") {
      throw tipoInvalido(campo);
    }
  }
  if (!Array.isArray(datos["items"])) {
    throw tipoInvalido("items");
  }

  const estado = textoOpcional(datos, "estado", "recibido");
  const prioridad = textoOpcional(datos, "prioridad", "media");

  const id = datos["id"] as string;
  if (!PATRON_ID.test(id)) {
    throw idInvalido();
  }

  const fechaCreacion = datos["fechaCreacion"] as string;
  const fechaInstante = instanteDeFecha(fechaCreacion);

  const tipoEnvio = datos["tipoEnvio"] as string;
  if (!TIPOS_ENVIO.includes(tipoEnvio as TipoEnvio)) {
    throw tipoEnvioInvalido();
  }
  const metodoPago = datos["metodoPago"] as string;
  if (!METODOS_PAGO.includes(metodoPago as MetodoPago)) {
    throw metodoPagoInvalido();
  }
  if (!ESTADOS.includes(estado as Estado)) {
    throw estadoInvalido();
  }
  if (!PRIORIDADES.includes(prioridad as Prioridad)) {
    throw prioridadInvalida();
  }

  const itemsCrudos = datos["items"] as unknown[];
  if (itemsCrudos.length === 0) {
    throw pedidoSinItems();
  }

  const clienteId = datos["clienteId"] as string;
  if (!clientes.has(clienteId)) {
    throw clienteNoEncontrado(clienteId);
  }

  const items = itemsCrudos.map((bruto, indice) => validarItem(bruto, indice));

  return {
    id,
    clienteId,
    fechaCreacion,
    estado: estado as Estado,
    tipoEnvio: tipoEnvio as TipoEnvio,
    metodoPago: metodoPago as MetodoPago,
    prioridad: prioridad as Prioridad,
    items,
    fechaInstante,
  };
}

/** Aplica las fórmulas del contrato con aritmética exacta en centavos. */
export function calcular(pedido: Pedido, cliente: Cliente): Calculos {
  let micro = 0;
  for (const item of pedido.items) {
    micro += item.precioMicro * item.cantidad;
  }
  const subtotalCentavos = centavosDesdeMicro(micro);

  let porcentaje = cliente.tipo === "vip" ? 10 : 0;
  if (subtotalCentavos >= 100_000) {
    porcentaje += 5;
  }
  if (porcentaje > 20) {
    porcentaje = 20;
  }

  const descuentoCentavos = Math.floor((subtotalCentavos * porcentaje + 50) / 100);
  const baseCentavos = subtotalCentavos - descuentoCentavos;
  const impuestoCentavos = Math.floor((baseCentavos * 16 + 50) / 100);

  let envioCentavos = 0;
  if (pedido.tipoEnvio === "estandar") {
    envioCentavos = subtotalCentavos < 50_000 ? 5_000 : 0;
  } else if (pedido.tipoEnvio === "express") {
    envioCentavos = 15_000;
  }

  const totalCentavos = subtotalCentavos - descuentoCentavos + impuestoCentavos + envioCentavos;

  return {
    subtotal: numeroDesdeCentavos(subtotalCentavos),
    porcentajeDescuento: porcentaje,
    descuento: numeroDesdeCentavos(descuentoCentavos),
    impuesto: numeroDesdeCentavos(impuestoCentavos),
    costoEnvio: numeroDesdeCentavos(envioCentavos),
    total: numeroDesdeCentavos(totalCentavos),
    _totalCentavos: totalCentavos,
  };
}

/** Devuelve el pedido normalizado con sus cálculos. */
export function pedidoProcesado(pedido: Pedido, calculos: Calculos): PedidoProcesado {
  return {
    id: pedido.id,
    clienteId: pedido.clienteId,
    fechaCreacion: pedido.fechaCreacion,
    estado: pedido.estado,
    tipoEnvio: pedido.tipoEnvio,
    metodoPago: pedido.metodoPago,
    prioridad: pedido.prioridad,
    items: pedido.items.map((item) => ({
      codigoProducto: item.codigoProducto,
      nombre: item.nombre,
      precioUnitario: new Importe(item.precioUnitario),
      cantidad: item.cantidad,
    })),
    calculos: {
      subtotal: new Importe(calculos.subtotal),
      porcentajeDescuento: calculos.porcentajeDescuento,
      descuento: new Importe(calculos.descuento),
      impuesto: new Importe(calculos.impuesto),
      costoEnvio: new Importe(calculos.costoEnvio),
      total: new Importe(calculos.total),
      _totalCentavos: calculos._totalCentavos,
    },
  };
}

/** Valida el enum y la matriz de transiciones. */
export function validarTransicion(estadoActual: string, estadoNuevo: string): void {
  if (!ESTADOS.includes(estadoActual as Estado) || !ESTADOS.includes(estadoNuevo as Estado)) {
    throw estadoInvalido();
  }
  if (!TRANSICIONES[estadoActual as Estado].includes(estadoNuevo as Estado)) {
    throw transicionInvalida(estadoActual, estadoNuevo);
  }
}
