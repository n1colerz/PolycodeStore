/** Almacén en memoria de pedidos. Node es monohilo: no hacen falta locks. */

import { numeroDesdeCentavos } from "./dinero.js";
import { ErrorDatos, pedidoDuplicado, pedidoNoEncontrado } from "./errores.js";
import { calcular, pedidoProcesado, validarTransicion } from "./reglas.js";
import { Cliente, Importe, ORDEN_PRIORIDAD, Pedido, PedidoProcesado, Resumen } from "./modelos.js";

/** Comparación por punto de código, igual que en Python y Go. */
function compararTexto(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export class Almacen {
  private readonly pedidos: Pedido[] = [];
  private readonly posiciones = new Map<string, number>();

  constructor(
    private readonly clientes: Map<string, Cliente>,
    pedidos: Pedido[] = [],
  ) {
    for (const pedido of pedidos) {
      if (this.posiciones.has(pedido.id)) {
        throw new ErrorDatos(`El pedido '${pedido.id}' está duplicado en el dataset.`);
      }
      this.posiciones.set(pedido.id, this.pedidos.length);
      this.pedidos.push(pedido);
    }
  }

  get catalogo(): Map<string, Cliente> {
    return this.clientes;
  }

  total(): number {
    return this.pedidos.length;
  }

  private calcularDe(pedido: Pedido) {
    return calcular(pedido, this.clientes.get(pedido.clienteId) as Cliente);
  }

  /** Filtra y ordena los pedidos, ya calculados. */
  listar(clienteId?: string, estado?: string, orden?: string): PedidoProcesado[] {
    let filtrados = this.pedidos.filter(
      (pedido) =>
        (clienteId === undefined || pedido.clienteId === clienteId) &&
        (estado === undefined || pedido.estado === estado),
    );

    if (orden === "fecha") {
      filtrados = [...filtrados].sort(
        (a, b) => a.fechaInstante - b.fechaInstante || compararTexto(a.id, b.id),
      );
    } else if (orden === "monto") {
      const montos = new Map(
        filtrados.map((pedido) => [pedido.id, this.calcularDe(pedido)._totalCentavos]),
      );
      filtrados = [...filtrados].sort(
        (a, b) => (montos.get(b.id) as number) - (montos.get(a.id) as number) || compararTexto(a.id, b.id),
      );
    } else if (orden === "prioridad") {
      filtrados = [...filtrados].sort(
        (a, b) =>
          ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
          a.fechaInstante - b.fechaInstante ||
          compararTexto(a.id, b.id),
      );
    }

    return filtrados.map((pedido) => pedidoProcesado(pedido, this.calcularDe(pedido)));
  }

  obtener(id: string): Pedido | undefined {
    return this.pedidos[this.posiciones.get(id) as number];
  }

  agregar(pedido: Pedido): void {
    if (this.posiciones.has(pedido.id)) {
      throw pedidoDuplicado(pedido.id);
    }
    this.posiciones.set(pedido.id, this.pedidos.length);
    this.pedidos.push(pedido);
  }

  actualizarEstado(id: string, estadoNuevo: string): Pedido {
    const indice = this.posiciones.get(id);
    if (indice === undefined) {
      throw pedidoNoEncontrado(id);
    }
    const pedido = this.pedidos[indice];
    validarTransicion(pedido.estado, estadoNuevo);
    const actualizado: Pedido = { ...pedido, estado: estadoNuevo as Pedido["estado"] };
    this.pedidos[indice] = actualizado;
    return actualizado;
  }

  resumen(): Resumen {
    const porEstado = { recibido: 0, en_preparacion: 0, enviado: 0, entregado: 0, cancelado: 0 };
    const porPrioridad = { alta: 0, media: 0, baja: 0 };
    let centavos = 0;

    for (const pedido of this.pedidos) {
      porEstado[pedido.estado] += 1;
      porPrioridad[pedido.prioridad] += 1;
      if (pedido.estado !== "cancelado") {
        centavos += this.calcularDe(pedido)._totalCentavos;
      }
    }

    return {
      totalPedidos: this.pedidos.length,
      montoTotal: new Importe(numeroDesdeCentavos(centavos)),
      porEstado,
      porPrioridad,
    };
  }
}
