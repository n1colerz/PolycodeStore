/**
 * Frontend comparativo de proyecto-polycode.
 * JavaScript vanilla, sin frameworks ni librerías externas.
 */
(function () {
  "use strict";

  /** Direcciones de las tres APIs: se pueden sobrescribir en app.js o con ?api=clave=url. */
  const CONFIG = {
    apis: {
      python: "http://127.0.0.1:8001",
      go: "http://127.0.0.1:8002",
      js: "http://127.0.0.1:8003",
    },
  };

  const LENGUAJES = [
    {
      clave: "python",
      nombre: "Python",
      color: "#3776ab",
      paradigma: "OOP + funcional",
      ventajas: [
        "Sintaxis expresiva y legible: el mismo negocio cabe en pocas líneas.",
        "Tipado dinámico con anotaciones opcionales: rápido de escribir y de refactorizar.",
        "Excepciones jerárquicas y un ecosistema enorme para datos y automatización.",
      ],
      limitaciones: [
        "El GIL limita el paralelismo real de CPU: el lote usa hilos, no procesos.",
        "Arranque lento y creación de un intérprete por proceso.",
        "El tipado dinámico deja errores para el momento de ejecución.",
      ],
    },
    {
      clave: "go",
      nombre: "Go",
      color: "#00add8",
      paradigma: "Concurrencia + compilado",
      ventajas: [
        "Goroutines, canales y WaitGroup: concurrencia real con pocas líneas.",
        "Compilación a binario nativo: arranque instantáneo y despliegue trivial.",
        "Tipado estático fuerte con errores de compilación, no de ejecución.",
      ],
      limitaciones: [
        "Genéricos y sistema de tipos menos expresivos que TypeScript.",
        "Sin metropolitanas ni operadores de sobrecarga: más verboso para modelar.",
        "El recolector de basura y el planificador complican el perfilado de goroutines.",
      ],
    },
    {
      clave: "js",
      nombre: "JavaScript/TypeScript",
      color: "#f7df1e",
      paradigma: "Asincronía + funcional",
      ventajas: [
        "async/await y Promise.all: el paralelismo se lee como código secuencial.",
        "Un solo lenguaje para el backend y el frontend.",
        "TypeScript aporta tipado estático opcional sobre un ecosistema enorme.",
      ],
      limitaciones: [
        "El event loop es monohilo: el paralelismo real exige worker_threads.",
        "Los tipos se borran al compilar: no protegen en tiempo de ejecución.",
        "Los números son IEEE 754: el dinero exige aritmética entera o decimal.",
      ],
    },
  ];

  const estado = {
    clientes: [],
    productos: [],
    loc: {},
    catalogos: { clientes: [], productos: [] },
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  // ----------------------------------------------------------------- utils

  function formatearMoneda(valor) {
    return Number(valor || 0).toFixed(2);
  }

  function claveLenguaje(clave) {
    return LENGUAJES.find((lenguaje) => lenguaje.clave === clave) || LENGUAJES[0];
  }

  function aplicarConfiguracion() {
    const externa = window.POLY_CONFIG || {};
    if (externa.apis) {
      Object.keys(externa.apis).forEach((clave) => {
        if (CONFIG.apis[clave] !== undefined) {
          CONFIG.apis[clave] = externa.apis[clave];
        }
      });
    }
    const parametros = new URLSearchParams(window.location.search);
    parametros.forEach((valor, clave) => {
      if (CONFIG.apis[clave] !== undefined) {
        CONFIG.apis[clave] = valor.replace(/\/$/, "");
      }
    });
  }

  async function pedirJSON(url, opciones) {
    const respuesta = await fetch(url, opciones);
    let cuerpo = null;
    const texto = await respuesta.text();
    if (texto) {
      try {
        cuerpo = JSON.parse(texto);
      } catch (error) {
        cuerpo = { codigo: "RESPUESTA_INVALIDA", mensaje: texto.slice(0, 200) };
      }
    }
    return { estado: respuesta.status, cuerpo: cuerpo };
  }

  // ----------------------------------------------------------------- vistas

  function activarVista(nombre) {
    $$(".pestana").forEach((pestana) => {
      pestana.classList.toggle("activa", pestana.dataset.vista === nombre);
    });
    $$(".vista").forEach((vista) => {
      vista.classList.toggle("activa", vista.id === `vista-${nombre}`);
    });
    if (nombre === "comparativa") {
      dibujarGrafico([]);
    }
  }

  // ------------------------------------------------------- estado de las API

  async function comprobarApis() {
    const contenedor = $("#estado-apis");
    contenedor.innerHTML = "";
    for (const lenguaje of LENGUAJES) {
      const insignia = document.createElement("span");
      insignia.className = "insignia";
      insignia.textContent = `${lenguaje.nombre}: comprobando…`;
      contenedor.appendChild(insignia);

      try {
        const { estado: codigo, cuerpo } = await pedirJSON(`${CONFIG.apis[lenguaje.clave]}/salud`);
        if (codigo === 200 && cuerpo && cuerpo.estado === "ok") {
          insignia.classList.add("ok");
          insignia.textContent = `${lenguaje.nombre}: ${cuerpo.version} (${cuerpo.pedidosEnMemoria} pedidos)`;
        } else {
          insignia.classList.add("error");
          insignia.textContent = `${lenguaje.nombre}: no disponible`;
        }
      } catch (error) {
        insignia.classList.add("error");
        insignia.textContent = `${lenguaje.nombre}: sin conexión`;
      }
    }
  }

  // ------------------------------------------------------ vista 1: pedidos

  function poblarSelectClientes(select, incluirTodos) {
    select.innerHTML = "";
    if (incluirTodos) {
      const opcion = document.createElement("option");
      opcion.value = "";
      opcion.textContent = "Todos los clientes";
      select.appendChild(opcion);
    }
    estado.catalogo.clientes.forEach((cliente) => {
      const opcion = document.createElement("option");
      opcion.value = cliente.id;
      opcion.textContent = `${cliente.id} · ${cliente.nombre} (${cliente.tipo})`;
      select.appendChild(opcion);
    });
  }

  function poblarSelectProductos(select) {
    select.innerHTML = "";
    estado.catalogo.productos.forEach((producto) => {
      const opcion = document.createElement("option");
      opcion.value = producto.codigo;
      opcion.textContent = `${producto.codigo} · ${producto.nombre} (${formatearMoneda(producto.precioUnitario)})`;
      select.appendChild(opcion);
    });
  }

  function filtrarConsulta() {
    const parametros = new URLSearchParams();
    const cliente = $("#filtro-cliente").value;
    const estadoPedido = $("#filtro-estado").value;
    const orden = $("#filtro-orden").value;
    if (cliente) parametros.set("clienteId", cliente);
    if (estadoPedido) parametros.set("estado", estadoPedido);
    if (orden) parametros.set("orden", orden);
    return parametros.toString();
  }

  async function consultarPedidos() {
    const mensaje = $("#estado-pedidos");
    const lenguaje = claveLenguaje($("#filtro-api").value);
    const url = `${CONFIG.apis[lenguaje.clave]}/pedidos?${filtrarConsulta()}`;
    mensaje.className = "estado";
    mensaje.textContent = `Consultando ${lenguaje.nombre}…`;

    try {
      const { estado: codigo, cuerpo } = await pedirJSON(url);
      const cuerpoTabla = $("#tabla-pedidos tbody");
      cuerpoTabla.innerHTML = "";
      if (codigo !== 200 || !cuerpo || !cuerpo.pedidos) {
        mensaje.classList.add("error");
        mensaje.textContent = cuerpo && cuerpo.mensaje
          ? `Error ${cuerpo.codigo}: ${cuerpo.mensaje}`
          : `Error ${codigo} consultando ${lenguaje.nombre}`;
        return;
      }
      cuerpo.pedidos.forEach((pedido) => {
        const fila = document.createElement("tr");
        const celdas = [
          pedido.id,
          pedido.clienteId,
          pedido.fechaCreacion.replace("T", " ").replace("Z", ""),
          pedido.estado,
          pedido.tipoEnvio,
          pedido.metodoPago,
          pedido.prioridad,
          formatearMoneda(pedido.calculos.subtotal),
          `${formatearMoneda(pedido.calculos.descuento)} (${pedido.calculos.porcentajeDescuento}%)`,
          formatearMoneda(pedido.calculos.impuesto),
          formatearMoneda(pedido.calculos.costoEnvio),
          formatearMoneda(pedido.calculos.total),
        ];
      celdas.forEach((valor, indice) => {
          const celda = document.createElement("td");
          celda.textContent = valor;
          if (indice >= 7) celda.classList.add("derecha");
          fila.appendChild(celda);
        });
        cuerpoTabla.appendChild(fila);
      });
      mensaje.classList.add("ok");
      mensaje.textContent = `${cuerpo.total} pedidos desde ${lenguaje.nombre}`;
    } catch (error) {
      mensaje.classList.add("error");
      mensaje.textContent = `No se pudo contactar con ${lenguaje.nombre}: ${error.message}`;
    }
  }

  // ---------------------------------------------------- vista 2: nuevo pedido

  function agregarItem() {
    const contenedor = $("#lista-items");
    const fila = document.createElement("div");
    fila.className = "item";

    const selectorProducto = document.createElement("select");
    poblarSelectProductos(selectorProducto);

    const etiquetaCantidad = document.createElement("label");
    etiquetaCantidad.textContent = "Cantidad";
    const entradaCantidad = document.createElement("input");
    entradaCantidad.type = "number";
    entradaCantidad.min = "1";
    entradaCantidad.step = "1";
    entradaCantidad.value = "1";
    etiquetaCantidad.appendChild(entradaCantidad);

    const botonQuitar = document.createElement("button");
    botonQuitar.type = "button";
    botonQuitar.textContent = "Quitar";
    botonQuitar.addEventListener("click", () => fila.remove());

    fila.appendChild(selectorProducto);
    fila.appendChild(etiquetaCantidad);
    fila.appendChild(botonQuitar);
    contenedor.appendChild(fila);
  }

  function leerItems() {
    return $$("#lista-items .item").map((fila) => {
      const selector = fila.querySelector("select");
      const cantidad = Number(fila.querySelector('input[type="number"]').value);
      const producto = estado.catalogo.productos.find((item) => item.codigo === selector.value);
      return {
        producto: producto,
        cantidad: cantidad,
        campo: `items[${fila.dataset.indice || 0}]`,
      };
    });
  }

  function validarFormulario() {
    const id = $("#campo-id").value.trim();
    if (!id) {
      return "El id del pedido es obligatorio.";
    }
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) {
      return "El id debe cumplir el patrón ^[A-Za-z0-9_-]{3,40}$.";
    }
    const items = leerItems();
    if (items.length === 0) {
      return "El pedido debe tener al menos un item.";
    }
    for (const item of items) {
      if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
        return "La cantidad de cada item debe ser un entero mayor que 0.";
      }
      if (!item.producto) {
        return "Cada item necesita un producto del catálogo.";
      }
    }
    return null;
  }

  function construirPedido() {
    const items = leerItems().map((item) => ({
      codigoProducto: item.producto.codigo,
      nombre: item.producto.nombre,
      precioUnitario: item.producto.precioUnitario,
      cantidad: item.cantidad,
    }));
    return {
      id: $("#campo-id").value.trim(),
      clienteId: $("#campo-cliente").value,
      fechaCreacion: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      estado: "recibido",
      tipoEnvio: $("#campo-envio").value,
      metodoPago: $("#campo-pago").value,
      prioridad: $("#campo-prioridad").value,
      items: items,
    };
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    const mensaje = $("#estado-formulario");
    const contenedor = $("#resultados-nuevo");
    contenedor.innerHTML = "";

    const error = validarFormulario();
    if (error) {
      mensaje.className = "estado error";
      mensaje.textContent = error;
      return;
    }

    const pedido = construirPedido();
    mensaje.className = "estado";
    mensaje.textContent = "Enviando a las tres APIs…";

    const envios = LENGUAJES.map(async (lenguaje) => {
      const inicio = performance.now();
      try {
        const { estado: codigo, cuerpo } = await pedirJSON(
          `${CONFIG.apis[lenguaje.clave]}/pedidos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pedido),
          },
        );
        return {
          lenguaje: lenguaje,
          codigo: codigo,
          cuerpo: cuerpo,
          ms: performance.now() - inicio,
        };
      } catch (error) {
        return {
          lenguaje: lenguaje,
          codigo: 0,
          cuerpo: { codigo: "SIN_CONEXION", mensaje: error.message },
          ms: performance.now() - inicio,
        };
      }
    });

    const respuestas = await Promise.all(envios);
    let huboError = false;
    respuestas.forEach((respuesta) => {
      if (respuesta.codigo >= 400) {
        huboError = true;
      }
    });

    contenedor.innerHTML = "";
    respuestas.forEach((respuesta) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta resultado";
      tarjeta.style.borderTopColor = respuesta.lenguaje.color;

      const titulo = document.createElement("h3");
      titulo.textContent = respuesta.lenguaje.nombre;
      tarjeta.appendChild(titulo);

      const tiempo = document.createElement("p");
      tiempo.className = "muted";
      tiempo.textContent = `HTTP ${respuesta.codigo} · ${respuesta.ms.toFixed(1)} ms`;
      tarjeta.appendChild(tiempo);

      if (respuesta.codigo === 201 && respuesta.cuerpo) {
        const total = document.createElement("p");
        total.className = "destacado";
        total.textContent = `Total ${formatearMoneda(respuesta.cuerpo.calculos.total)}`;
        tarjeta.appendChild(total);
        const detalle = document.createElement("p");
        detalle.className = "muted";
        detalle.textContent = `Subtotal ${formatearMoneda(respuesta.cuerpo.calculos.subtotal)} · descuento ${
          respuesta.cuerpo.calculos.porcentajeDescuento
        }% · IVA ${formatearMoneda(respuesta.cuerpo.calculos.impuesto)}`;
        tarjeta.appendChild(detalle);
      } else {
        const cuerpo = respuesta.cuerpo || {};
        const codigo = document.createElement("p");
        codigo.className = "destacado error";
        codigo.textContent = cuerpo.codigo || `HTTP ${respuesta.codigo}`;
        tarjeta.appendChild(codigo);
        const texto = document.createElement("p");
        texto.textContent = cuerpo.mensaje || "Sin mensaje";
        tarjeta.appendChild(texto);
        if (cuerpo.campo) {
          const campo = document.createElement("p");
          campo.className = "muted";
          campo.textContent = `campo: ${cuerpo.campo}`;
          tarjeta.appendChild(campo);
        }
      }
      contenedor.appendChild(tarjeta);
    });

    mensaje.className = huboError ? "estado error" : "estado ok";
    mensaje.textContent = huboError
      ? "Las tres APIs respondieron; revisa los errores mostrados."
      : "Las tres APIs aceptaron el pedido con el mismo total.";
  }

  // ------------------------------------------------ vista 3: comparativa

  async function cargarLoc() {
    try {
      const respuesta = await fetch("../loc_resultados.json", { cache: "no-store" });
      if (respuesta.ok) {
        const datos = await respuesta.json();
        (datos.lenguajes || []).forEach((entrada) => {
          estado.loc[entrada.lenguaje] = entrada.loc;
        });
      }
    } catch (error) {
      // Sin archivo de LOC: la columna queda con guion.
    }
  }

  function dibujarGrafico(filas) {
    const lienzo = $("#grafico");
    const contexto = lienzo.getContext("2d");
    const ancho = lienzo.width;
    const alto = lienzo.height;
    contexto.clearRect(0, 0, ancho, alto);

    if (!filas.length) {
      contexto.fillStyle = "#7b8794";
      contexto.font = "14px system-ui, sans-serif";
      contexto.fillText("Pulsa «Comparar» para medir las tres APIs", 20, 40);
      return;
    }

    const maximo = Math.max(...filas.map((fila) => fila.mediaMs)) * 1.15 || 1;
    const margenInferior = 36;
    const margenSuperior = 20;
    const alturaUtil = alto - margenInferior - margenSuperior;
    const anchoBarra = 110;
    const separacion = (ancho - filas.length * anchoBarra) / (filas.length + 1);

    filas.forEach((fila, indice) => {
      const x = separacion * (indice + 1) + anchoBarra * indice;
      const altura = (fila.mediaMs / maximo) * alturaUtil;
      const y = margenSuperior + alturaUtil - altura;

      contexto.fillStyle = fila.color;
      contexto.fillRect(x, y, anchoBarra, altura);

      contexto.fillStyle = "#1f2933";
      contexto.font = "bold 13px system-ui, sans-serif";
      contexto.fillText(`${fila.mediaMs.toFixed(2)} ms`, x + 6, y - 8);

      contexto.font = "13px system-ui, sans-serif";
      contexto.fillText(fila.nombre, x + 6, alto - 14);
    });

    contexto.strokeStyle = "#cbd2d9";
    contexto.beginPath();
    contexto.moveTo(10, margenSuperior + alturaUtil);
    contexto.lineTo(ancho - 10, margenSuperior + alturaUtil);
    contexto.stroke();
  }

  function pintarTarjetasLenguajes() {
    const contenedor = $("#tarjetas-lenguajes");
    contenedor.innerHTML = "";
    LENGUAJES.forEach((lenguaje) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta";
      tarjeta.style.borderTopColor = lenguaje.color;

      const titulo = document.createElement("h3");
      titulo.textContent = `${lenguaje.nombre} · ${lenguaje.paradigma}`;
      tarjeta.appendChild(titulo);

      const listaVentajas = document.createElement("ul");
      lenguaje.ventajas.forEach((texto) => {
        const elemento = document.createElement("li");
        elemento.textContent = texto;
        listaVentajas.appendChild(elemento);
      });
      const tituloVentajas = document.createElement("h4");
      tituloVentajas.textContent = "Ventajas";
      tarjeta.appendChild(tituloVentajas);
      tarjeta.appendChild(listaVentajas);

      const tituloLimitaciones = document.createElement("h4");
      tituloLimitaciones.textContent = "Limitaciones";
      tarjeta.appendChild(tituloLimitaciones);
      const listaLimitaciones = document.createElement("ul");
      listaLimitaciones.className = "limitaciones";
      lenguaje.limitaciones.forEach((texto) => {
        const elemento = document.createElement("li");
        elemento.textContent = texto;
        listaLimitaciones.appendChild(elemento);
      });
      tarjeta.appendChild(listaLimitaciones);

      contenedor.appendChild(tarjeta);
    });
  }

  async function comparar() {
    const mensaje = $("#estado-comparativa");
    const boton = $("#boton-comparar");
    const termino = $("#select-dataset").value;
    const repeticiones = Math.max(1, Number($("#input-repeticiones").value) || 1);

    boton.disabled = true;
    mensaje.className = "estado";
    mensaje.textContent = "Cargando dataset…";

    let lote;
    let origen;
    try {
      const cargado = await window.POLY_DATASETS.cargar(termino);
      lote = cargado.pedidos;
      origen = cargado.origen;
    } catch (error) {
      mensaje.classList.add("error");
      mensaje.textContent = `No se pudo cargar el dataset: ${error.message}`;
      boton.disabled = false;
      return;
    }

    const cuerpo = JSON.stringify({ pedidos: lote });
    mensaje.textContent = `Midiendo ${lote.length} pedidos × ${repeticiones} repeticiones…`;

    const filas = [];
    for (const lenguaje of LENGUAJES) {
      const tiempos = [];
      let ultimo = null;
      let error = null;
      for (let repeticion = 0; repeticion < repeticiones; repeticion += 1) {
        const inicio = performance.now();
        try {
          const { estado: codigo, cuerpo: respuesta } = await pedirJSON(
            `${CONFIG.apis[lenguaje.clave]}/pedidos/lote`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: cuerpo,
            },
          );
          const transcurrido = performance.now() - inicio;
          if (codigo !== 200 || !respuesta || !respuesta.resumen) {
            error = `HTTP ${codigo}`;
            break;
          }
          ultimo = respuesta;
          if (repeticion > 0) {
            tiempos.push(transcurrido);
          }
        } catch (fallo) {
          error = fallo.message;
          break;
        }
      }

      if (error || !ultimo) {
        filas.push({
          clave: lenguaje.clave,
          nombre: lenguaje.nombre,
          color: lenguaje.color,
          mediaMs: 0,
          medianaMs: 0,
          pedidos: lote.length,
          monto: "—",
          error: error || "sin respuesta",
        });
        continue;
      }

      const ordenados = [...tiempos].sort((a, b) => a - b);
      const mediana = ordenados.length
        ? ordenados[Math.floor(ordenados.length / 2)]
        : 0;
      const media = tiempos.reduce((suma, valor) => suma + valor, 0) / (tiempos.length || 1);
      filas.push({
        clave: lenguaje.clave,
        nombre: lenguaje.nombre,
        color: lenguaje.color,
        mediaMs: media,
        medianaMs: mediana,
        pedidos: lote.length,
        monto: formatearMoneda(ultimo.resumen.montoTotal),
        error: null,
      });
    }

    const cuerpoTabla = $("#tabla-comparativa tbody");
    cuerpoTabla.innerHTML = "";
    filas.forEach((fila) => {
      const filaHTML = document.createElement("tr");
      const celdas = [
        fila.nombre,
        fila.error ? "—" : fila.mediaMs.toFixed(3),
        fila.error ? "—" : fila.medianaMs.toFixed(3),
        String(fila.pedidos),
        fila.monto,
        estado.loc[fila.clave] !== undefined ? String(estado.loc[fila.clave]) : "—",
        claveLenguaje(fila.clave).paradigma,
      ];
      celdas.forEach((valor, indice) => {
        const celda = document.createElement("td");
        celda.textContent = valor;
        if (indice >= 1 && indice <= 5) celda.classList.add("derecha");
        filaHTML.appendChild(celda);
      });
      cuerpoTabla.appendChild(filaHTML);
    });

    dibujarGrafico(filas);

    const montos = filas.map((fila) => fila.monto).filter((monto) => monto !== "—");
    const coherente = montos.length > 1 && new Set(montos).size === 1;
    mensaje.className = coherente ? "estado ok" : "estado error";
    mensaje.textContent = coherente
      ? `Dataset ${termino} (${origen === "archivo" ? "leído de ../datos" : "generado en el navegador"}): las tres APIs devuelven el mismo monto total ${montos[0]}.`
      : `Dataset ${termino}: revisa las respuestas de cada API.`;

    boton.disabled = false;
  }

  // ------------------------------------------------------------------ inicio

  async function iniciar() {
    aplicarConfiguracion();
    estado.catalogo = window.POLY_CATALOGOS || { clientes: [], productos: [] };

    const selectorApi = $("#filtro-api");
    LENGUAJES.forEach((lenguaje) => {
      const opcion = document.createElement("option");
      opcion.value = lenguaje.clave;
      opcion.textContent = `${lenguaje.nombre} (${CONFIG.apis[lenguaje.clave]})`;
      selectorApi.appendChild(opcion);
    });

    poblarSelectClientes($("#filtro-cliente"), true);
    poblarSelectClientes($("#campo-cliente"), false);
    poblarSelectProductos(document.createElement("select"));
    agregarItem();

    $$(".pestana").forEach((pestana) => {
      pestana.addEventListener("click", () => activarVista(pestana.dataset.vista));
    });
    $("#boton-consultar").addEventListener("click", consultarPedidos);
    $("#boton-agregar-item").addEventListener("click", agregarItem);
    $("#formulario-pedido").addEventListener("submit", enviarFormulario);
    $("#boton-comparar").addEventListener("click", comparar);

    pintarTarjetasLenguajes();
    await cargarLoc();
    comprobarApis();
    consultarPedidos();
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
