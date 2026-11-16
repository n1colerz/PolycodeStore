/**
 * Errores del dominio y del catálogo HTTP.
 * Los mensajes son idénticos a los de Python y Go (contrato §5).
 */

export class ErrorDominio extends Error {
  codigo: string;
  campo?: string;
  http: number;

  constructor(codigo: string, mensaje: string, campo?: string, http = 400) {
    super(mensaje);
    this.name = "ErrorDominio";
    this.codigo = codigo;
    this.campo = campo;
    this.http = http;
  }

  /** Representación exacta del contrato de error. */
  aObjeto(): { codigo: string; mensaje: string; campo?: string } {
    const error: { codigo: string; mensaje: string; campo?: string } = {
      codigo: this.codigo,
      mensaje: this.message,
    };
    if (this.campo !== undefined) {
      error.campo = this.campo;
    }
    return error;
  }
}

/** Fallo fatal de lectura o escritura de datos (no se expone al cliente). */
export class ErrorDatos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDatos";
  }
}

export function campoRequerido(campo: string): ErrorDominio {
  return new ErrorDominio("CAMPO_REQUERIDO", `El campo '${campo}' es obligatorio.`, campo, 400);
}

export function tipoInvalido(campo: string): ErrorDominio {
  return new ErrorDominio("TIPO_INVALIDO", `El campo '${campo}' tiene un tipo inválido.`, campo, 400);
}

export function idInvalido(): ErrorDominio {
  return new ErrorDominio(
    "ID_INVALIDO",
    "El id debe cumplir el patrón ^[A-Za-z0-9_-]{3,40}$.",
    "id",
    400,
  );
}

export function fechaInvalida(): ErrorDominio {
  return new ErrorDominio(
    "FECHA_INVALIDA",
    "La fechaCreacion debe estar en formato ISO 8601 con zona horaria.",
    "fechaCreacion",
    400,
  );
}

export function tipoEnvioInvalido(): ErrorDominio {
  return new ErrorDominio(
    "TIPO_ENVIO_INVALIDO",
    "El tipoEnvio debe ser uno de: estandar, express, retiro.",
    "tipoEnvio",
    400,
  );
}

export function metodoPagoInvalido(): ErrorDominio {
  return new ErrorDominio(
    "METODO_PAGO_INVALIDO",
    "El metodoPago debe ser uno de: efectivo, tarjeta, transferencia.",
    "metodoPago",
    400,
  );
}

export function estadoInvalido(): ErrorDominio {
  return new ErrorDominio(
    "ESTADO_INVALIDO",
    "El estado debe ser uno de: recibido, en_preparacion, enviado, entregado, cancelado.",
    "estado",
    400,
  );
}

export function prioridadInvalida(): ErrorDominio {
  return new ErrorDominio("PRIORIDAD_INVALIDA", "La prioridad debe ser una de: alta, media, baja.", "prioridad", 400);
}

export function pedidoSinItems(): ErrorDominio {
  return new ErrorDominio("PEDIDO_SIN_ITEMS", "El pedido debe tener al menos un item.", "items", 400);
}

export function clienteNoEncontrado(clienteId: string): ErrorDominio {
  return new ErrorDominio(
    "CLIENTE_NO_ENCONTRADO",
    `El cliente '${clienteId}' no existe en el catálogo.`,
    "clienteId",
    404,
  );
}

export function precioInvalido(campo: string): ErrorDominio {
  return new ErrorDominio(
    "PRECIO_INVALIDO",
    "El precioUnitario debe ser un número mayor o igual que 0.",
    campo,
    400,
  );
}

export function cantidadInvalida(campo: string): ErrorDominio {
  return new ErrorDominio("CANTIDAD_INVALIDA", "La cantidad debe ser un entero mayor que 0.", campo, 400);
}

export function pedidoDuplicado(id: string): ErrorDominio {
  return new ErrorDominio("PEDIDO_DUPLICADO", `Ya existe un pedido con el id '${id}'.`, "id", 409);
}

export function pedidoNoEncontrado(id: string): ErrorDominio {
  return new ErrorDominio("PEDIDO_NO_ENCONTRADO", `El pedido '${id}' no existe.`, "id", 404);
}

export function transicionInvalida(actual: string, nuevo: string): ErrorDominio {
  return new ErrorDominio(
    "TRANSICION_INVALIDA",
    `Transición de estado no permitida: '${actual}' → '${nuevo}'.`,
    "estado",
    409,
  );
}

export function ordenInvalido(): ErrorDominio {
  return new ErrorDominio(
    "ORDEN_INVALIDO",
    "El parámetro orden debe ser uno de: fecha, monto, prioridad.",
    "orden",
    400,
  );
}

export function loteVacio(): ErrorDominio {
  return new ErrorDominio("LOTE_VACIO", "La lista de pedidos no puede estar vacía.", "pedidos", 400);
}

export function jsonInvalido(): ErrorDominio {
  return new ErrorDominio("JSON_INVALIDO", "El cuerpo de la solicitud no es un JSON válido.", undefined, 400);
}

export function cuerpoInvalido(campo?: string): ErrorDominio {
  return new ErrorDominio("CUERPO_INVALIDO", "El cuerpo debe ser un objeto JSON.", campo, 400);
}

export function rutaNoEncontrada(ruta: string): ErrorDominio {
  return new ErrorDominio("RUTA_NO_ENCONTRADA", `La ruta '${ruta}' no existe.`, undefined, 404);
}

export function metodoNoPermitido(metodo: string, ruta: string): ErrorDominio {
  return new ErrorDominio(
    "METODO_NO_PERMITIDO",
    `El método '${metodo}' no está permitido para '${ruta}'.`,
    undefined,
    405,
  );
}

export function errorInterno(): ErrorDominio {
  return new ErrorDominio("ERROR_INTERNO", "Error interno del servidor.", undefined, 500);
}
