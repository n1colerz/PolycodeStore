/**
 * Construcción de los datasets para el panel comparativo.
 *
 * Si el frontend se sirve por HTTP se leen los archivos canónicos de
 * ../datos/. Si se abre con file:// el navegador no puede leerlos, así que
 * se generan en el cliente con el mismo algoritmo determinista que
 * scripts/generar_datasets.py (PRNG mulberry32).
 */
window.POLY_DATASETS = (function () {
  const SEMILLA = 20261114;
  const CANTIDADES = { pequeno: 10, mediano: 100, grande: 1000 };
  const PREFIJOS = { pequeno: "P", mediano: "M", grande: "G" };
  const ARCHIVOS = {
    pequeno: "pedidos_pequenos.json",
    mediano: "pedidos_medios.json",
    grande: "pedidos_grandes.json",
  };
  const ESTADOS = ["recibido", "en_preparacion", "enviado", "entregado", "cancelado"];
  const TIPOS_ENVIO = ["estandar", "express", "retiro"];
  const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia"];
  const PRIORIDADES = ["alta", "media", "baja"];

  /** PRNG determinista de 32 bits, idéntico al mulberry32 de Python. */
  function mulberry32(semilla) {
    let estado = semilla >>> 0;
    return function siguiente() {
      estado = (estado + 0x6d2b79f5) >>> 0;
      let t = estado;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Genera la lista de pedidos de un tamaño. */
  function generar(termino, clientes, productos) {
    const siguiente = mulberry32(SEMILLA);
    const prefijo = PREFIJOS[termino];
    const inicio = Date.UTC(2026, 0, 1, 8, 0, 0);
    const pedidos = [];

    for (let indice = 0; indice < CANTIDADES[termino]; indice += 1) {
      const cliente = clientes[Math.floor(siguiente() * clientes.length)];
      const estado = ESTADOS[Math.floor(siguiente() * ESTADOS.length)];
      const tipoEnvio = TIPOS_ENVIO[Math.floor(siguiente() * TIPOS_ENVIO.length)];
      const metodoPago = METODOS_PAGO[Math.floor(siguiente() * METODOS_PAGO.length)];
      const prioridad = PRIORIDADES[Math.floor(siguiente() * PRIORIDADES.length)];
      const cantidadItems = 1 + Math.floor(siguiente() * 3);

      const items = [];
      for (let i = 0; i < cantidadItems; i += 1) {
        const producto = productos[Math.floor(siguiente() * productos.length)];
        const cantidad = 1 + Math.floor(siguiente() * 4);
        items.push({
          codigoProducto: producto.codigo,
          nombre: producto.nombre,
          precioUnitario: producto.precioUnitario,
          cantidad: cantidad,
        });
      }

      const fecha = new Date(inicio + indice * 7 * 60000).toISOString().replace(".000", "");
      pedidos.push({
        id: `PED-${prefijo}-${String(indice + 1).padStart(4, "0")}`,
        clienteId: cliente.id,
        fechaCreacion: fecha,
        estado: estado,
        tipoEnvio: tipoEnvio,
        metodoPago: metodoPago,
        prioridad: prioridad,
        items: items,
      });
    }
    return pedidos;
  }

  /**
   * Devuelve {pedidos, origen} para el tamaño pedido.
   * origen: "archivo" si leyó ../datos/, "generado" si lo construyó en el navegador.
   */
  async function cargar(termino) {
    const archivo = `../datos/${ARCHIVOS[termino]}`;
    try {
      const respuesta = await fetch(archivo, { cache: "no-store" });
      if (respuesta.ok) {
        const datos = await respuesta.json();
        if (Array.isArray(datos.pedidos) && datos.pedidos.length > 0) {
          return { pedidos: datos.pedidos, origen: "archivo" };
        }
      }
    } catch (error) {
      // file:// bloquea la lectura: se genera el lote en el navegador.
    }
    const catalogos = window.POLY_CATALOGOS || { clientes: [], productos: [] };
    return {
      pedidos: generar(termino, catalogos.clientes, catalogos.productos),
      origen: "generado",
    };
  }

  return { cargar: cargar, generar: generar, CANTIDADES: CANTIDADES };
})();
