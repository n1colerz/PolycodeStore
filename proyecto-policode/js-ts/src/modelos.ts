/** Tipos de dominio y constantes compartidas del contrato. */

export const ESTADOS = ["recibido", "en_preparacion", "enviado", "entregado", "cancelado"] as const;
export type Estado = (typeof ESTADOS)[number];

export const TIPOS_ENVIO = ["estandar", "express", "retiro"] as const;
export type TipoEnvio = (typeof TIPOS_ENVIO)[number];

export const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const PRIORIDADES = ["alta", "media", "baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export type TipoCliente = "vip" | "regular";

/** Transiciones permitidas: recibido → en_preparacion → enviado → entregado. */
export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  recibido: ["en_preparacion", "cancelado"],
  en_preparacion: ["enviado", "cancelado"],
  enviado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export const ORDEN_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export const VERSION = "0.1.0";

export interface Cliente {
  id: string;
  nombre: string;
  email: string;
  tipo: TipoCliente;
}

export interface Producto {
  codigo: string;
  nombre: string;
  precioUnitario: number;
  categoria: string;
}

/** Importe monetario: se serializa siempre con decimales (250.0). */
export class Importe {
  readonly valor: number;

  constructor(valor: number) {
    this.valor = valor;
  }
}

/** Item del pedido. `precioMicro` es el valor decimal exacto (microcentavos). */
export interface ItemPedido {
  codigoProducto: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  precioMicro: number;
}

/** Pedido validado, antes de calcular importes. */
export interface Pedido {
  id: string;
  clienteId: string;
  fechaCreacion: string;
  estado: Estado;
  tipoEnvio: TipoEnvio;
  metodoPago: MetodoPago;
  prioridad: Prioridad;
  items: ItemPedido[];
  /** Instante de la fecha de creación, en milisegundos epoch. */
  fechaInstante: number;
}

/** Importes ya redondeados a dos decimales. */
export interface Calculos {
  subtotal: number;
  porcentajeDescuento: number;
  descuento: number;
  impuesto: number;
  costoEnvio: number;
  total: number;
  /** Campo interno (no se serializa): total en centavos, para sumas exactas. */
  _totalCentavos: number;
}

/** Item del pedido en la respuesta de la API. */
export interface ItemRespuesta {
  codigoProducto: string;
  nombre: string;
  precioUnitario: Importe;
  cantidad: number;
}

/** Cálculos en la respuesta de la API (importes como Importe). */
export interface CalculosRespuesta {
  subtotal: Importe;
  porcentajeDescuento: number;
  descuento: Importe;
  impuesto: Importe;
  costoEnvio: Importe;
  total: Importe;
  /** Campo interno (no se serializa): total en centavos, para sumas exactas. */
  _totalCentavos: number;
}

/** Pedido normalizado con sus cálculos (respuesta de la API). */
export interface PedidoProcesado {
  id: string;
  clienteId: string;
  fechaCreacion: string;
  estado: Estado;
  tipoEnvio: TipoEnvio;
  metodoPago: MetodoPago;
  prioridad: Prioridad;
  items: ItemRespuesta[];
  calculos: CalculosRespuesta;
}

export interface ErrorAPI {
  codigo: string;
  mensaje: string;
  campo?: string;
}

export interface ConteoEstado {
  recibido: number;
  en_preparacion: number;
  enviado: number;
  entregado: number;
  cancelado: number;
}

export interface ConteoPrioridad {
  alta: number;
  media: number;
  baja: number;
}

export interface Resumen {
  totalPedidos: number;
  montoTotal: Importe;
  porEstado: ConteoEstado;
  porPrioridad: ConteoPrioridad;
}

export interface ListaPedidos {
  pedidos: PedidoProcesado[];
  total: number;
}

export interface ResultadoLote {
  indice: number;
  ok: boolean;
  pedido?: PedidoProcesado;
  error?: ErrorAPI;
}

export interface ResumenLote {
  total: number;
  exitosos: number;
  fallidos: number;
  montoTotal: Importe;
}

export interface Lote {
  resultados: ResultadoLote[];
  resumen: ResumenLote;
}

export interface Salud {
  lenguaje: string;
  estado: string;
  version: string;
  pedidosEnMemoria: number;
}
