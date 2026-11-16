# Frontend comparativo — proyecto-polycode

Frontend único (HTML + CSS + JavaScript vanilla, sin frameworks ni librerías) que consume **las tres APIs** y muestra la comparación: resultados, tiempos, líneas de código y ventajas/limitaciones.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura y las tres vistas (pedidos, nuevo pedido, comparativa). |
| `app.js` | Lógica: consultas, formulario, medición con `performance.now()` y gráfico. |
| `styles.css` | Estilos propios. |
| `catalogos.js` | Copia de `datos/clientes.json` y `datos/productos.json` (generada por `scripts/generar_datasets.py`). |
| `datasets.js` | Constructor de datasets: lee `../datos/` o genera el lote en el navegador. |

## Cómo usarlo

1. Levanta las tres APIs (puertos 8001, 8002 y 8003):

   ```bash
   cd python && python -m src.cli serve --datos ../datos
   cd go     && go run ./cmd serve --datos ../datos
   cd js-ts  && node dist/cli.js serve --datos ../datos
   ```

2. Sirve el frontend (recomendado, para que pueda leer `../datos/` y `../loc_resultados.json`):

   ```bash
   cd proyecto-polycode
   python -m http.server 8080
   # abrir http://localhost:8080/frontend/
   ```

   También funciona abriendo `frontend/index.html` directamente (`file://`): en ese caso el
   navegador no puede leer `../datos/`, así que el lote se genera en el cliente con el mismo
   algoritmo determinista (`scripts/generar_datasets.py`), y la columna LOC queda sin dato.

## Configuración de las APIs

Al principio de `app.js`:

```js
const CONFIG = {
  apis: {
    python: "http://127.0.0.1:8001",
    go: "http://127.0.0.1:8002",
    js: "http://127.0.0.1:8003",
  },
};
```

> Se usa `127.0.0.1` y no `localhost` a propósito: en Windows, `localhost` resuelve primero a
> `::1` (IPv6) y las APIs escuchan en IPv4, de modo que cada petición pagaba el tiempo de espera
> de la conexión IPv6 (unos 2 s).

También se puede sobrescribir sin tocar el archivo:

- `window.POLY_CONFIG = { apis: { python: "http://localhost:9001" } };` antes de cargar `app.js`.
- Parámetros de la URL: `index.html?python=http://localhost:9001&go=...`.

## Vistas

1. **Pedidos** — filtros por API, cliente, estado y orden (`fecha`, `monto`, `prioridad`); tabla con
   subtotal, descuento, IVA, envío y total.
2. **Nuevo pedido** — formulario con items dynamics. Valida en el cliente (id, al menos un item,
   cantidad entera positiva) y después envía **el mismo pedido a las tres APIs**: cada tarjeta
   muestra el total calculado o el error `{codigo, mensaje, campo}` recibido.
3. **Comparativa** — selector de dataset (10, 100 o 1000 pedidos) y número de repeticiones. Envía
   el mismo lote a las tres APIs con `POST /pedidos/lote`, mide con `performance.now()` y muestra:
   - tabla con lenguaje, tiempo medio, mediana, pedidos, monto total, LOC y paradigma;
   - gráfico de barras dibujado en `canvas` sin librerías;
   - tarjetas con ventajas y limitaciones de cada lenguaje.

## Datos externos que consume

- `../datos/pedidos_{pequenos,medios,grandes}.json` — datasets del panel comparativo.
- `../loc_resultados.json` — líneas de código por lenguaje (generado por `scripts/comparar_loc.py`);
  si no existe, la columna LOC muestra `—`.
- `../benchmark_resultados.json` — histórico del benchmark (opcional, no es necesario para la vista).
