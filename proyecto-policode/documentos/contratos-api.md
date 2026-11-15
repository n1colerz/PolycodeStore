# Contratos de `proyecto-polycode` — Fase 0

**Estado:** aprobado por el usuario el 2026-11-14. Fase 0 cerrada.
**Alcance:** fija datos, esquemas, reglas, API HTTP, CLI, errores y casos de prueba comunes para que las tres implementaciones (Python, Go, JS/TS) sean funcionalmente equivalentes.

Los archivos de esta fase son la fuente de verdad compartida:

| Archivo | Contenido |
|---|---|
| `datos/clientes.json` | Catálogo de 10 clientes (vip/regular). |
| `datos/productos.json` | Catálogo de 12 productos de referencia. |
| `datos/pedidos_pequenos.json` | Dataset pequeño: 10 pedidos, 2 por cada estado. |
| `datos/casos_prueba.json` | Los 5 casos comunes idénticos para los 3 lenguajes. |
| `datos/casos_borde.json` | 10 casos borde compartidos. |
| `datos/esquemas/*.schema.json` | JSON Schema (draft 2020-12) del contrato. |

---

## 1. Decisiones de contrato

Las decisiones de la tabla están **aprobadas**. La columna “Motivo” conserva la justificación original.

| ID | Decisión | Motivo |
|---|---|---|
| D1 | **Redondeo monetario half-up a 2 decimales** en cada paso: subtotal, descuento, base imponible, impuesto y total. Los importes se transportan como números JSON; la presentación con 2 decimales es responsabilidad del cliente. | Evita diferencias de coma flotante entre lenguajes. |
| D2 | **`id` obligatorio** en toda entrada; el servidor no genera identificadores. Patrón `^[A-Za-z0-9_-]{3,40}$`; duplicado en `POST /pedidos` → 409. | Hace deterministas el lote y los tests; los datasets ya traen id. **Aprobada** (2026-11-14). |
| D3 | **`POST /pedidos/lote` es stateless**: valida y calcula, pero **no persiste** ni consulta duplicados contra el almacén. | Permite repetir el benchmark N veces con el mismo dataset sin acumular 409. |
| D4 | `estado` y `prioridad` son opcionales en la entrada; por defecto `recibido` y `media`. | Comodidad para el formulario del frontend. |
| D5 | Orden: `fecha` ascendente (cronológico), `monto` descendente (mayor primero), `prioridad` de `alta` a `baja`. Desempate final por `id` ascendente. Sin `orden`, se conserva el orden de registro. | Hace determinista el listado. |
| D6 | Filtros `clienteId`, `estado` y `orden` son combinables. Un `clienteId` sin pedidos devuelve `200` con lista vacía; un `estado` u `orden` inválido devuelve `400`. | Semántica estándar de colección. |
| D7 | `GET /resumen`: `totalPedidos` y los conteos incluyen todos los pedidos; **`montoTotal` excluye los `cancelado`** (ventas netas). | “Resumen de ventas”. **Aprobada**: 7262.56 en el dataset pequeño. |
| D8 | CORS abierto (`Access-Control-Allow-Origin: *`), sin autenticación, solo JSON UTF-8. | Frontend servido desde otro origen/puerto. Proyecto académico sin credenciales. |
| D9 | Catálogo de errores **cerrado**: `codigo`, `mensaje` y `campo` exactos e idénticos en los 3 lenguajes. | Permite comparar respuestas byte a byte (salvo orden de claves). |
| D10 | Persistencia **en memoria** por proceso. Al arrancar se cargan clientes, productos y `pedidos_pequenos.json`. `POST`/`PATCH` mutan el almacén; reiniciar lo restaura. El lote no muta. | Demo reproducible y sin estado oculto en disco. |
| D11 | Índices **0-based** en `campo` (`items[0].cantidad`) y en `indice` de los resultados de lote. | Coherente con arrays/JSON y con JS. |
| D12 | **No se valida `codigoProducto` contra `productos.json`.** El precio del item es un snapshot del payload. El catálogo es referencia para el frontend y los datasets. | No es una regla solicitada; validarlo cambiaría el contrato. |
| D13 | `precioUnitario >= 0` (se permite 0). Valores negativos → 400 `PRECIO_INVALIDO`. **Aprobada** (regla técnica propuesta, no estaba en el enunciado). | Evita totales negativos por error de captura. |
| D14 | `PATCH` al mismo estado (`recibido → recibido`) es **inválido** → 409. | Las transiciones permitidas no incluyen estados idempotentes. |
| D15 | Se agregan `GET /salud` y `GET /pedidos/{id}`. El segundo da sentido al header `Location` del `POST`. | Diagnóstico del frontend y navegación por id. |
| D16 | `fechaCreacion` se valida como ISO 8601 con zona horaria, pero se **conserva el string original** en la respuesta (no se normaliza). El orden se calcula por instante. | Evita diferencias de formato entre lenguajes. |
| D17 | Los campos desconocidos en la entrada se **ignoran** y no se devuelven. La salida siempre se normaliza. | Compatibilidad hacia adelante. |
| D18 | `cantidad` debe tener **valor entero**: `2` y `2.0` son válidos; `2.5` no. Los booleanos no son números. | JSON no distingue entero de flotante; se fija una semántica única. |

---

## 2. Modelo de datos

### 2.1 Cliente (`datos/clientes.json`)

```json
{
  "version": 1,
  "clientes": [
    { "id": "CLI-001", "nombre": "Ana Torres", "email": "ana.torres@example.com", "tipo": "vip" },
    { "id": "CLI-002", "nombre": "Bruno Díaz", "email": "bruno.diaz@example.com", "tipo": "regular" }
  ]
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `id` | string | `^CLI-[0-9]{3}$`, único |
| `nombre` | string | no vacío |
| `email` | string | formato de correo (dato ficticio `example.com`) |
| `tipo` | string | `vip` \| `regular` |

Esquema: `datos/esquemas/cliente.schema.json`.

### 2.2 Producto (`datos/productos.json`)

```json
{
  "version": 1,
  "productos": [
    { "codigo": "PROD-001", "nombre": "Teclado mecánico", "precioUnitario": 250.00, "categoria": "periféricos" }
  ]
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `codigo` | string | `^PROD-[0-9]{3}$`, único |
| `nombre` | string | no vacío |
| `precioUnitario` | number | `>= 0`, 2 decimales |
| `categoria` | string | no vacía |

Esquema: `datos/esquemas/producto.schema.json`.

### 2.3 Item de pedido

```json
{
  "codigoProducto": "PROD-001",
  "nombre": "Teclado mecánico",
  "precioUnitario": 250.00,
  "cantidad": 2
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `codigoProducto` | string | no vacío; no se valida contra el catálogo (D12) |
| `nombre` | string | no vacío |
| `precioUnitario` | number | `>= 0` (D13) |
| `cantidad` | integer | `>= 1`, valor entero (D18) |

### 2.4 Pedido (entrada)

```json
{
  "id": "PED-0001",
  "clienteId": "CLI-001",
  "fechaCreacion": "2026-11-01T09:15:00Z",
  "estado": "recibido",
  "tipoEnvio": "express",
  "metodoPago": "tarjeta",
  "prioridad": "alta",
  "items": [
    { "codigoProducto": "PROD-001", "nombre": "Teclado mecánico", "precioUnitario": 250.00, "cantidad": 2 }
  ]
}
```

| Campo | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `id` | string | sí | `^[A-Za-z0-9_-]{3,40}$` |
| `clienteId` | string | sí | debe existir en `clientes.json` |
| `fechaCreacion` | string | sí | ISO 8601 con `Z` o `±hh:mm` |
| `estado` | string | no (default `recibido`) | `recibido`, `en_preparacion`, `enviado`, `entregado`, `cancelado` |
| `tipoEnvio` | string | sí | `estandar`, `express`, `retiro` |
| `metodoPago` | string | sí | `efectivo`, `tarjeta`, `transferencia` |
| `prioridad` | string | no (default `media`) | `alta`, `media`, `baja` |
| `items` | array | sí | al menos 1 item |

Esquema: `datos/esquemas/pedido.schema.json`.

### 2.5 Cálculos (solo salida)

```json
{
  "subtotal": 820.00,
  "porcentajeDescuento": 10,
  "descuento": 82.00,
  "impuesto": 118.08,
  "costoEnvio": 150.00,
  "total": 1006.08
}
```

`porcentajeDescuento` es el porcentaje efectivo aplicado después de sumar y aplicar el tope (entero entre 0 y 20). Los demás importes están redondeados a 2 decimales (D1).

### 2.6 Pedido procesado (salida)

Es el pedido normalizado más `calculos`, con `estado` y `prioridad` siempre presentes:

```json
{
  "id": "PED-0001",
  "clienteId": "CLI-001",
  "fechaCreacion": "2026-11-01T09:15:00Z",
  "estado": "recibido",
  "tipoEnvio": "express",
  "metodoPago": "tarjeta",
  "prioridad": "alta",
  "items": [
    { "codigoProducto": "PROD-001", "nombre": "Teclado mecánico", "precioUnitario": 250.00, "cantidad": 2 },
    { "codigoProducto": "PROD-012", "nombre": "Disco SSD 1TB", "precioUnitario": 320.00, "cantidad": 1 }
  ],
  "calculos": {
    "subtotal": 820.00,
    "porcentajeDescuento": 10,
    "descuento": 82.00,
    "impuesto": 118.08,
    "costoEnvio": 150.00,
    "total": 1006.08
  }
}
```

Esquema: `datos/esquemas/pedido_procesado.schema.json`.

### 2.7 Error

```json
{ "codigo": "CANTIDAD_INVALIDA", "mensaje": "La cantidad debe ser un entero mayor que 0.", "campo": "items[0].cantidad" }
```

`campo` es opcional y solo aparece cuando el error está asociado a un dato. Esquema: `datos/esquemas/error.schema.json`.

### 2.8 Resumen de ventas

```json
{
  "totalPedidos": 10,
  "montoTotal": 7262.56,
  "porEstado": { "recibido": 2, "en_preparacion": 2, "enviado": 2, "entregado": 2, "cancelado": 2 },
  "porPrioridad": { "alta": 4, "media": 3, "baja": 3 }
}
```

Todas las claves de `porEstado` y `porPrioridad` están siempre presentes (valor 0 si no hay pedidos). Esquema: `datos/esquemas/resumen.schema.json`.

### 2.9 Lote

Solicitud:

```json
{ "pedidos": [ { "id": "PED-C1", "...": "..." }, { "id": "PED-C2", "...": "..." } ] }
```

Respuesta:

```json
{
  "resultados": [
    { "indice": 0, "ok": true, "pedido": { "id": "PED-C1", "...": "...", "calculos": { "...": "..." } } },
    { "indice": 1, "ok": false, "error": { "codigo": "CANTIDAD_INVALIDA", "mensaje": "La cantidad debe ser un entero mayor que 0.", "campo": "items[0].cantidad" } }
  ],
  "resumen": { "total": 2, "exitosos": 1, "fallidos": 1, "montoTotal": 719.20 }
}
```

`resultados` **siempre** está en el orden de entrada (`indice` 0..n-1). Esquema: `datos/esquemas/lote.schema.json`.

---

## 3. Reglas de negocio normativas

### 3.1 Validaciones (en este orden)

1. El cuerpo debe ser JSON válido y un objeto → `JSON_INVALIDO` / `CUERPO_INVALIDO`.
2. Campos obligatorios y tipos básicos → `CAMPO_REQUERIDO` / `TIPO_INVALIDO`.
3. Formato de `id` → `ID_INVALIDO`; formato de `fechaCreacion` → `FECHA_INVALIDA`.
4. Enums `tipoEnvio`, `metodoPago`, `estado`, `prioridad` → error específico.
5. `items` no vacío → `PEDIDO_SIN_ITEMS`.
6. `clienteId` existe → `CLIENTE_NO_ENCONTRADO`.
7. Cada item, en orden: `codigoProducto`, `nombre`, `precioUnitario >= 0`, `cantidad` entera `> 0`.
8. Solo en `POST /pedidos`: `id` no duplicado en el almacén → `PEDIDO_DUPLICADO`.

El primer error encontrado es el que se responde. En lote, la validación es independiente por entrada.

### 3.2 Cálculos

```text
subtotal  = R( Σ (precioUnitario_i × cantidad_i) )

porcentaje = 10 si cliente.tipo = "vip", si no 0
porcentaje = porcentaje + 5 si subtotal >= 1000
porcentaje = min(porcentaje, 20)                    // tope máximo

descuento = R(subtotal × porcentaje / 100)
base      = R(subtotal − descuento)
impuesto  = R(base × 0.16)                          // IVA 16%

costoEnvio = 0       si tipoEnvio = "retiro"
           = 50      si tipoEnvio = "estandar" y subtotal < 500
           = 0       si tipoEnvio = "estandar" y subtotal >= 500
           = 150     si tipoEnvio = "express"

total = R(subtotal − descuento + impuesto + costoEnvio)
```

`R(x)` = redondeo half-up a 2 decimales (D1). El umbral de 1000 y el de 500 usan el subtotal ya redondeado. `metodoPago` no altera los cálculos.

**Decisión aprobada (2026-11-14):** con las reglas literales, VIP (10 %) + subtotal ≥ 1000 (5 %) = **15 %**, por lo que el tope de 20 % nunca se alcanza. Se mantiene C4 en 15 %; el tope queda como defensa del contrato. No se modifica ninguna tasa.

### 3.3 Transiciones de estado

| Estado actual | Estados permitidos |
|---|---|
| `recibido` | `en_preparacion`, `cancelado` |
| `en_preparacion` | `enviado`, `cancelado` |
| `enviado` | `entregado`, `cancelado` |
| `entregado` | — |
| `cancelado` | — |

Cualquier otro par (incluido el mismo estado) → 409 `TRANSICION_INVALIDA`. Un `estado` que no pertenece al enum → 400 `ESTADO_INVALIDO`.

---

## 4. API HTTP

### 4.1 Convenciones

| Aspecto | Contrato |
|---|---|
| Puertos | Python `PY_PORT` (default `8001`), Go `GO_PORT` (`8002`), JS/TS `JS_PORT` (`8003`). |
| Datos | `POLY_DATA_DIR` (default `datos`, relativo al directorio de ejecución). Debe contener `clientes.json`, `productos.json` y `pedidos_pequenos.json`. |
| Formato | `Content-Type: application/json; charset=utf-8`. Cuerpos UTF-8 sin BOM. |
| CORS | En **todas** las respuestas: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Max-Age: 86400`. |
| Preflight | `OPTIONS` sobre cualquier ruta → `204` sin cuerpo, con cabeceras CORS. |
| Autenticación | Ninguna (D8). No hay credenciales ni secretos en el repositorio. |
| Ids | Obligatorios, string, patrón `^[A-Za-z0-9_-]{3,40}$` (D2). |
| Fechas | ISO 8601 con zona; se conserva el string de entrada (D16). |
| Índices | 0-based en `campo` e `indice` (D11). |
| Campos extra | Se ignoran en la entrada y no se devuelven (D17). |
| Estado | En memoria por proceso; se reinicia al reiniciar (D10). |

Base de cada API: `http://localhost:<puerto>`.

### 4.2 Tabla de endpoints

| Método | Ruta | Descripción | Éxito | Errores posibles |
|---|---|---|---|---|
| `GET` | `/salud` | Estado del servicio. | `200` `{lenguaje, estado, version, pedidosEnMemoria}` | `500` |
| `GET` | `/pedidos` | Lista con filtros y orden. | `200` `{pedidos, total}` | `400` (`ESTADO_INVALIDO`, `ORDEN_INVALIDO`) |
| `GET` | `/pedidos/{id}` | Obtiene un pedido. | `200` `PedidoProcesado` | `404` `PEDIDO_NO_ENCONTRADO` |
| `POST` | `/pedidos` | Registra y calcula un pedido. | `201` `PedidoProcesado` + `Location` | `400`, `404` `CLIENTE_NO_ENCONTRADO`, `409` `PEDIDO_DUPLICADO` |
| `PATCH` | `/pedidos/{id}/estado` | Cambia el estado. | `200` `PedidoProcesado` | `400` `ESTADO_INVALIDO`, `404`, `409` `TRANSICION_INVALIDA` |
| `GET` | `/resumen` | Resumen de ventas. | `200` `ResumenVentas` | `500` |
| `POST` | `/pedidos/lote` | Procesa una lista en paralelo (stateless). | `200` `{resultados, resumen}` | `400` (`CUERPO_INVALIDO`, `CAMPO_REQUERIDO`, `TIPO_INVALIDO`, `LOTE_VACIO`) |
| `OPTIONS` | cualquiera | Preflight CORS. | `204` | — |

Cualquier otra ruta → `404 RUTA_NO_ENCONTRADA`. Método no soportado en una ruta existente → `405 METODO_NO_PERMITIDO`.

### 4.3 `GET /salud`

```http
GET /salud
```

```json
{ "lenguaje": "python", "estado": "ok", "version": "0.1.0", "pedidosEnMemoria": 10 }
```

`lenguaje` ∈ `python`, `go`, `js`. No se incluye hora para mantener la respuesta determinista.

### 4.4 `GET /pedidos`

Parámetros de consulta (todos opcionales):

| Parámetro | Tipo | Regla |
|---|---|---|
| `clienteId` | string | filtra por cliente; desconocido → lista vacía (D6) |
| `estado` | enum | `recibido`, `en_preparacion`, `enviado`, `entregado`, `cancelado` |
| `orden` | enum | `fecha` (asc), `monto` (desc), `prioridad` (`alta`→`baja`) (D5) |

Ejemplos:

```http
GET /pedidos
GET /pedidos?clienteId=CLI-001
GET /pedidos?estado=recibido
GET /pedidos?orden=monto
GET /pedidos?clienteId=CLI-001&estado=recibido&orden=fecha
```

Respuesta `200`:

```json
{
  "pedidos": [
    {
      "id": "PED-0001",
      "clienteId": "CLI-001",
      "fechaCreacion": "2026-11-01T09:15:00Z",
      "estado": "recibido",
      "tipoEnvio": "express",
      "metodoPago": "tarjeta",
      "prioridad": "alta",
      "items": [
        { "codigoProducto": "PROD-001", "nombre": "Teclado mecánico", "precioUnitario": 250.00, "cantidad": 2 },
        { "codigoProducto": "PROD-012", "nombre": "Disco SSD 1TB", "precioUnitario": 320.00, "cantidad": 1 }
      ],
      "calculos": {
        "subtotal": 820.00,
        "porcentajeDescuento": 10,
        "descuento": 82.00,
        "impuesto": 118.08,
        "costoEnvio": 150.00,
        "total": 1006.08
      }
    }
  ],
  "total": 1
}
```

`total` es la cantidad de pedidos devueltos después de filtrar. Sin coincidencias: `{ "pedidos": [], "total": 0 }`.

### 4.5 `GET /pedidos/{id}`

```http
GET /pedidos/PED-0001
```

`200` con el `PedidoProcesado` completo. Si no existe:

```json
{ "codigo": "PEDIDO_NO_ENCONTRADO", "mensaje": "El pedido 'PED-0001' no existe.", "campo": "id" }
```

### 4.6 `POST /pedidos`

```http
POST /pedidos
Content-Type: application/json
```

```json
{
  "id": "PED-0101",
  "clienteId": "CLI-001",
  "fechaCreacion": "2026-11-14T10:00:00Z",
  "estado": "recibido",
  "tipoEnvio": "express",
  "metodoPago": "tarjeta",
  "prioridad": "alta",
  "items": [
    { "codigoProducto": "PROD-002", "nombre": "Monitor 27\"", "precioUnitario": 600.00, "cantidad": 2 }
  ]
}
```

Respuesta `201`:

```http
Location: /pedidos/PED-0101
```

```json
{
  "id": "PED-0101",
  "clienteId": "CLI-001",
  "fechaCreacion": "2026-11-14T10:00:00Z",
  "estado": "recibido",
  "tipoEnvio": "express",
  "metodoPago": "tarjeta",
  "prioridad": "alta",
  "items": [
    { "codigoProducto": "PROD-002", "nombre": "Monitor 27\"", "precioUnitario": 600.00, "cantidad": 2 }
  ],
  "calculos": {
    "subtotal": 1200.00,
    "porcentajeDescuento": 15,
    "descuento": 180.00,
    "impuesto": 163.20,
    "costoEnvio": 150.00,
    "total": 1333.20
  }
}
```

Errores: validación (`400`), cliente inexistente (`404`), id duplicado (`409`). El pedido se agrega al almacén en memoria solo si es válido.

### 4.7 `PATCH /pedidos/{id}/estado`

```http
PATCH /pedidos/PED-0001/estado
Content-Type: application/json
```

```json
{ "estado": "en_preparacion" }
```

Respuesta `200`: el `PedidoProcesado` con el nuevo `estado` y los mismos `calculos`.

Errores:

- `404 PEDIDO_NO_ENCONTRADO` si el pedido no está en el almacén.
- `400 ESTADO_INVALIDO` si el valor no pertenece al enum.
- `409 TRANSICION_INVALIDA` si el par no está permitido (incluye mismo estado, D14).

```json
{ "codigo": "TRANSICION_INVALIDA", "mensaje": "Transición de estado no permitida: 'entregado' → 'en_preparacion'.", "campo": "estado" }
```

`PATCH` exitoso muta el almacén; no se persiste en disco (D10).

### 4.8 `GET /resumen`

```http
GET /resumen
```

```json
{
  "totalPedidos": 10,
  "montoTotal": 7262.56,
  "porEstado": { "recibido": 2, "en_preparacion": 2, "enviado": 2, "entregado": 2, "cancelado": 2 },
  "porPrioridad": { "alta": 4, "media": 3, "baja": 3 }
}
```

`montoTotal` excluye `cancelado` (D7). Con el dataset pequeño, incluirlos daría `8781.36`. Los conteos sí incluyen todos.

### 4.9 `POST /pedidos/lote`

```http
POST /pedidos/lote
Content-Type: application/json
```

```json
{
  "pedidos": [
    {
      "id": "PED-C1",
      "clienteId": "CLI-002",
      "fechaCreacion": "2026-11-10T10:00:00Z",
      "estado": "recibido",
      "tipoEnvio": "estandar",
      "metodoPago": "tarjeta",
      "prioridad": "media",
      "items": [
        { "codigoProducto": "PROD-001", "nombre": "Teclado mecánico", "precioUnitario": 250.00, "cantidad": 2 },
        { "codigoProducto": "PROD-004", "nombre": "Mouse inalámbrico", "precioUnitario": 120.00, "cantidad": 1 }
      ]
    },
    {
      "id": "PED-C2",
      "clienteId": "CLI-002",
      "fechaCreacion": "2026-11-10T10:05:00Z",
      "estado": "recibido",
      "tipoEnvio": "retiro",
      "metodoPago": "efectivo",
      "prioridad": "baja",
      "items": [
        { "codigoProducto": "PROD-010", "nombre": "Lámpara LED", "precioUnitario": 60.00, "cantidad": 0 }
      ]
    }
  ]
}
```

Respuesta `200`:

```json
{
  "resultados": [
    {
      "indice": 0,
      "ok": true,
      "pedido": {
        "id": "PED-C1",
        "clienteId": "CLI-002",
        "fechaCreacion": "2026-11-10T10:00:00Z",
        "estado": "recibido",
        "tipoEnvio": "estandar",
        "metodoPago": "tarjeta",
        "prioridad": "media",
        "items": [
          { "codigoProducto": "PROD-001", "nombre": "Teclado mecánico", "precioUnitario": 250.00, "cantidad": 2 },
          { "codigoProducto": "PROD-004", "nombre": "Mouse inalámbrico", "precioUnitario": 120.00, "cantidad": 1 }
        ],
        "calculos": {
          "subtotal": 620.00,
          "porcentajeDescuento": 0,
          "descuento": 0.00,
          "impuesto": 99.20,
          "costoEnvio": 0.00,
          "total": 719.20
        }
      }
    },
    {
      "indice": 1,
      "ok": false,
      "error": {
        "codigo": "CANTIDAD_INVALIDA",
        "mensaje": "La cantidad debe ser un entero mayor que 0.",
        "campo": "items[0].cantidad"
      }
    }
  ],
  "resumen": { "total": 2, "exitosos": 1, "fallidos": 1, "montoTotal": 719.20 }
}
```

Reglas del lote:

- Cuerpo debe ser objeto con `pedidos` array no vacío; si no → `400` (`CUERPO_INVALIDO`, `CAMPO_REQUERIDO`, `TIPO_INVALIDO`, `LOTE_VACIO`).
- Cada entrada se valida y calcula de forma independiente, en paralelo.
- **No persiste** ni consulta duplicados contra el almacén (D3). Los ids pueden repetirse entre ejecuciones.
- `resultados` se devuelve ordenado por `indice`, sin importar el orden de finalización → salida determinista.
- `resumen.montoTotal = R(Σ total_i)` de los resultados exitosos, sumados en orden de índice.
- Un lote con todos los ítems fallidos sigue siendo `200`.
- Los errores por entrada usan el mismo catálogo que el resto de la API.
- Una entrada que no sea objeto produce `CUERPO_INVALIDO` con `campo: "pedidos[i]"`.

### 4.10 CORS

Todas las respuestas (incluidos errores) llevan las cabeceras de D8. `OPTIONS` responde `204` sin cuerpo. El frontend puede abrirse con `file://` o servirse con `python -m http.server`.

---

## 5. Catálogo de errores

Formato estándar: `{ "codigo": "...", "mensaje": "...", "campo": "..." }`. `campo` se omite cuando el error no está asociado a un dato. Los `mensaje` son **exactos** y deben ser idénticos en los 3 lenguajes (D9).

| Código | HTTP | Mensaje exacto | `campo` |
|---|---|---|---|
| `CAMPO_REQUERIDO` | 400 | `El campo '{campo}' es obligatorio.` | sí |
| `TIPO_INVALIDO` | 400 | `El campo '{campo}' tiene un tipo inválido.` | sí |
| `ID_INVALIDO` | 400 | `El id debe cumplir el patrón ^[A-Za-z0-9_-]{3,40}$.` | `id` |
| `FECHA_INVALIDA` | 400 | `La fechaCreacion debe estar en formato ISO 8601 con zona horaria.` | `fechaCreacion` |
| `TIPO_ENVIO_INVALIDO` | 400 | `El tipoEnvio debe ser uno de: estandar, express, retiro.` | `tipoEnvio` |
| `METODO_PAGO_INVALIDO` | 400 | `El metodoPago debe ser uno de: efectivo, tarjeta, transferencia.` | `metodoPago` |
| `ESTADO_INVALIDO` | 400 | `El estado debe ser uno de: recibido, en_preparacion, enviado, entregado, cancelado.` | `estado` |
| `PRIORIDAD_INVALIDA` | 400 | `La prioridad debe ser una de: alta, media, baja.` | `prioridad` |
| `PEDIDO_SIN_ITEMS` | 400 | `El pedido debe tener al menos un item.` | `items` |
| `CLIENTE_NO_ENCONTRADO` | 404 | `El cliente '{clienteId}' no existe en el catálogo.` | `clienteId` |
| `PRECIO_INVALIDO` | 400 | `El precioUnitario debe ser un número mayor o igual que 0.` | `items[i].precioUnitario` |
| `CANTIDAD_INVALIDA` | 400 | `La cantidad debe ser un entero mayor que 0.` | `items[i].cantidad` |
| `PEDIDO_DUPLICADO` | 409 | `Ya existe un pedido con el id '{id}'.` | `id` |
| `PEDIDO_NO_ENCONTRADO` | 404 | `El pedido '{id}' no existe.` | `id` |
| `TRANSICION_INVALIDA` | 409 | `Transición de estado no permitida: '{actual}' → '{nuevo}'.` | `estado` |
| `ORDEN_INVALIDO` | 400 | `El parámetro orden debe ser uno de: fecha, monto, prioridad.` | `orden` |
| `LOTE_VACIO` | 400 | `La lista de pedidos no puede estar vacía.` | `pedidos` |
| `JSON_INVALIDO` | 400 | `El cuerpo de la solicitud no es un JSON válido.` | — |
| `CUERPO_INVALIDO` | 400 | `El cuerpo debe ser un objeto JSON.` | — o `pedidos[i]` |
| `RUTA_NO_ENCONTRADA` | 404 | `La ruta '{ruta}' no existe.` | — |
| `METODO_NO_PERMITIDO` | 405 | `El método '{metodo}' no está permitido para '{ruta}'.` | — |
| `ERROR_INTERNO` | 500 | `Error interno del servidor.` | — |

Notas:

- `'{campo}'` en `CAMPO_REQUERIDO` / `TIPO_INVALIDO` usa la ruta del dato (`clienteId`, `items`, `items[0].nombre`).
- Un `id` o `clienteId` que no sea string produce `TIPO_INVALIDO`; si falta, `CAMPO_REQUERIDO`.
- `fechaCreacion` debe ser un string ISO 8601 **parseable** (no basta el regex).
- En lote, los errores de una entrada se devuelven dentro de `resultados[i].error` y no cambian el HTTP `200`.
- Los errores de ruta/método no llevan `campo`.

Ejemplos:

```json
{ "codigo": "PEDIDO_SIN_ITEMS", "mensaje": "El pedido debe tener al menos un item.", "campo": "items" }
```

```json
{ "codigo": "CLIENTE_NO_ENCONTRADO", "mensaje": "El cliente 'CLI-999' no existe en el catálogo.", "campo": "clienteId" }
```

```json
{ "codigo": "PEDIDO_DUPLICADO", "mensaje": "Ya existe un pedido con el id 'PED-0001'.", "campo": "id" }
```

---

## 6. Contrato de CLI

Cada implementación expone dos subcomandos. La forma concreta de invocarlos cambia por lenguaje (se documentará en cada README), pero la semántica es idéntica.

### 6.1 `run`

```text
cli run --entrada <archivo|-> [--salida <archivo|->] [--datos <directorio>]
```

- `--entrada`: archivo JSON con `{ "pedidos": [...] }` o un array de pedidos. `-` lee de stdin.
- `--salida`: archivo JSON de resultado; `-` o ausente escribe en stdout.
- `--datos`: directorio con `clientes.json` (default: `POLY_DATA_DIR` o `datos`). `productos.json` no se usa para validar (D12).
- Procesa el lote con la misma lógica y el mismo formato de salida que `POST /pedidos/lote` (`{resultados, resumen}`).
- Los errores por pedido **no** abortan el proceso: se reflejan en `resultados[i].error`.
- Escribe JSON en stdout/archivo y mensajes humanos en stderr.
- Códigos de salida: `0` si se generó la salida; `1` si el archivo no se puede leer o el JSON de entrada es inválido; `2` si los argumentos son incorrectos.

### 6.2 `serve`

```text
cli serve [--datos <directorio>] [--puerto <n>]
```

- Levanta la API HTTP de la sección 4.
- Precedencia del puerto: `--puerto` > variable de entorno (`PY_PORT`, `GO_PORT`, `JS_PORT`) > default.
- Carga clientes, productos y `pedidos_pequenos.json` al arrancar (D10).
- Si faltan archivos o son inválidos, muestra un error claro en stderr y sale con código `1`.
- `--ayuda` / `-h` muestra el uso y sale con `0`.

---

## 7. Casos de prueba comunes

La fuente ejecutable es `datos/casos_prueba.json`. Cada lenguaje debe cargar ese mismo archivo y comparar contra `esperado` (no duplicar los valores en el código de test). Los importes se comparan después del redondeo monetario a 2 decimales; el error se compara por `codigo`, `campo` y `mensaje` exactos.

### Caso C1 — Pedido válido estándar

Entrada: `CLI-002` (regular), `estandar`, items `PROD-001 × 2` (250.00) y `PROD-004 × 1` (120.00).

```text
subtotal  = 250.00 × 2 + 120.00 × 1 = 500.00 + 120.00 = 620.00
porcentaje = 0 (regular; 620.00 < 1000 → sin +5%)
descuento = 620.00 × 0 / 100 = 0.00
base      = 620.00 − 0.00 = 620.00
impuesto  = 620.00 × 0.16 = 99.20
costoEnvio = 0.00 (estandar y 620.00 >= 500)
total     = 620.00 − 0.00 + 99.20 + 0.00 = 719.20
```

Esperado: `subtotal 620.00`, `porcentajeDescuento 0`, `descuento 0.00`, `impuesto 99.20`, `costoEnvio 0.00`, `total 719.20`. HTTP `201`.

### Caso C2 — Cantidad ≤ 0

Entrada: item `PROD-010` con `cantidad: 0`.

```text
validación de items → cantidad 0 no es > 0
```

Esperado: HTTP `400`, `CANTIDAD_INVALIDA`, `campo: items[0].cantidad`, mensaje `La cantidad debe ser un entero mayor que 0.` No se calcula nada.

### Caso C3 — Pedido sin items

Entrada: `items: []`.

```text
validación de items → lista vacía
```

Esperado: HTTP `400`, `PEDIDO_SIN_ITEMS`, `campo: items`, mensaje `El pedido debe tener al menos un item.`

### Caso C4 — Cliente VIP con subtotal ≥ 1000

Entrada: `CLI-001` (vip), `express`, item `PROD-002 × 2` (600.00).

```text
subtotal  = 600.00 × 2 = 1200.00
porcentaje = 10 (vip) + 5 (subtotal >= 1000) = 15; min(15, 20) = 15
descuento = 1200.00 × 15 / 100 = 180.00
base      = 1200.00 − 180.00 = 1020.00
impuesto  = 1020.00 × 0.16 = 163.20
costoEnvio = 150.00 (express)
total     = 1200.00 − 180.00 + 163.20 + 150.00 = 1333.20
```

Esperado (contrato propuesto): `porcentajeDescuento 15`, `descuento 180.00`, `impuesto 163.20`, `costoEnvio 150.00`, `total 1333.20`. HTTP `201`.

**Variante descartada:** si el requisito “descuento tope 20%” se interpretara como que C4 debe dar exactamente 20 %, el cálculo sería:

```text
descuento = 1200.00 × 20 / 100 = 240.00
base      = 960.00
impuesto  = 153.60
total     = 1200.00 − 240.00 + 153.60 + 150.00 = 1263.60
```

Eso exigiría cambiar una regla (con 10 % + 5 % nunca se llega a 20 %). **No se aplica:** la decisión aprobada mantiene el 15 % y C4 = 1333.20.

### Caso C5 — Transición inválida

Entrada: `estadoActual: "entregado"`, `estadoNuevo: "en_preparacion"`.

```text
transiciones de "entregado" → ninguna
```

Esperado: HTTP `409`, `TRANSICION_INVALIDA`, `campo: estado`, mensaje `Transición de estado no permitida: 'entregado' → 'en_preparacion'.`

### Resumen de los 5 casos

| ID | Escenario | subtotal | % desc. | descuento | IVA | envío | total | HTTP |
|---|---|---|---|---|---|---|---|---|
| C1 | Válido estándar | 620.00 | 0 | 0.00 | 99.20 | 0.00 | **719.20** | 201 |
| C2 | Cantidad 0 | — | — | — | — | — | — | 400 |
| C3 | Sin items | — | — | — | — | — | — | 400 |
| C4 | VIP ≥ 1000 | 1200.00 | 15 | 180.00 | 163.20 | 150.00 | **1333.20** | 201 |
| C5 | Transición inválida | — | — | — | — | — | — | 409 |

---

## 8. Casos borde compartidos

Fuente ejecutable: `datos/casos_borde.json`.

| ID | Escenario | Cálculo | HTTP | Resultado |
|---|---|---|---|---|
| B01 | Retiro con subtotal 480 | IVA `480 × .16 = 76.80`; envío 0 | 201 | total **556.80** |
| B02 | Estándar 499.99; redondeo de IVA | `499.99 × .16 = 79.9984 → 80.00`; envío 50 | 201 | total **629.99** |
| B03 | VIP 999.99; redondeo de descuento | `999.99 × .10 = 99.999 → 100.00`; base 899.99; IVA `143.9984 → 144.00`; envío 150 | 201 | total **1193.99** |
| B04 | Cantidad 1.5 | no entero | 400 | `CANTIDAD_INVALIDA` |
| B05 | Cliente `CLI-999` | no existe | 404 | `CLIENTE_NO_ENCONTRADO` |
| B06 | `tipoEnvio: "drone"` | fuera del enum | 400 | `TIPO_ENVIO_INVALIDO` |
| B07 | `recibido → en_preparacion` | transición permitida | 200 | `estado: en_preparacion` |
| B08 | Regular, subtotal exactamente 1000 | 5 % = 50; IVA 152.00 | 201 | total **1102.00** |
| B09 | VIP, subtotal exactamente 1000 | 10 % + 5 % = 15 % = 150; IVA 136.00 | 201 | total **986.00** |
| B10 | Precio 0, cantidad 5, retiro | todo 0 | 201 | total **0.00** |

B02 y B03 fijan el redondeo half-up (`.9984 → .00` y `.999 → .00`); sin esa regla, las tres implementaciones podrían diferir en un centavo. B08 y B09 fijan el umbral exacto (`>= 1000`, no `>`).

---

## 9. Invariantes de equivalencia

Para considerar que las tres implementaciones son equivalentes:

1. Los 5 casos comunes y los 10 borde producen los mismos `calculos` y los mismos `{codigo, mensaje, campo}` que los fixtures.
2. El orden de `GET /pedidos` coincide para cada combinación de filtros/orden.
3. `POST /pedidos/lote` devuelve `resultados` en el orden de entrada, con los mismos índices y montos, independientemente del orden de finalización.
4. `GET /resumen` devuelve exactamente las mismas claves y valores (incluidas las claves con 0).
5. Los estados HTTP de éxito/error coinciden para cada caso.
6. Los importes se comparan con redondeo half-up a 2 decimales; no se compara la representación binaria de los flotantes.
7. Los mensajes de error son idénticos, incluidos acentos y signos (`→`, comillas simples).

---

## 10. Contrato provisional del benchmark (Fase 4)

El script `scripts/benchmark.py` medirá los tres servidores ya levantados (valida `/salud` antes de empezar). Para cada lenguaje y dataset:

- Envía el dataset completo a `POST /pedidos/lote`.
- Hace 1 ejecución de calentamiento que se descarta.
- Hace `N` repeticiones (default 5), midiendo con reloj monótono del cliente.
- Reporta media, mediana, mínimo y máximo en milisegundos.
- Escribe JSON y una tabla en consola.

Formato propuesto de `benchmark_resultados.json`:

```json
{
  "generadoEn": "2026-11-14T12:00:00Z",
  "repeticiones": 5,
  "calentamiento": 1,
  "resultados": [
    {
      "lenguaje": "python",
      "dataset": "pequeno",
      "pedidos": 10,
      "tiemposMs": [1.23, 1.19, 1.25, 1.21, 1.22],
      "mediaMs": 1.22,
      "medianaMs": 1.22,
      "minMs": 1.19,
      "maxMs": 1.25,
      "exitosos": 10,
      "fallidos": 0,
      "montoTotal": 8781.36
    }
  ]
}
```

Notas:

- `montoTotal` del lote suma todos los resultados exitosos, incluidos los cancelados (es una métrica de procesamiento, no el resumen de ventas de D7).
- Los tiempos son orientativos y dependen del equipo; el frontend mostrará también su propia medición con `performance.now()`.
- Los datasets `pedidos_medios.json` (≈100) y `pedidos_grandes.json` (≈1000) se generarán de forma determinista en la Fase 4, reutilizando clientes y productos.

## 11. Contrato provisional de conteo de LOC (Fase 4)

`scripts/comparar_loc.py` contará líneas físicas de código por lenguaje, excluyendo tests, dependencias y artefactos:

- Python: `python/src/**/*.py`.
- Go: `go/**/*.go` excluyendo `*_test.go` y `go/tests/`.
- JS/TS: `js-ts/src/**/*.{js,ts}` excluyendo `*.test.*`, `*.spec.*` y `js-ts/tests/`.
- Se excluyen líneas en blanco y líneas que son solo comentario (`#`, `//`, `/* ... */` cuando aplica).
- El frontend no cuenta para el LOC de los backends.

Salida propuesta de `loc_resultados.json`:

```json
{
  "criterio": "líneas físicas no vacías, sin comentarios, sin tests",
  "lenguajes": [
    { "lenguaje": "python", "archivos": 6, "lineas": 0, "loc": 0 },
    { "lenguaje": "go", "archivos": 6, "lineas": 0, "loc": 0 },
    { "lenguaje": "js", "archivos": 6, "lineas": 0, "loc": 0 }
  ]
}
```

El frontend puede leer este archivo para la columna `LOC` del panel comparativo; si no existe, muestra `—`.

---

## 12. Decisiones aprobadas (2026-11-14)

El usuario revisó las secciones 1 a 9 y aprobó todas las propuestas por defecto:

| # | Tema | Resolución aprobada |
|---|---|---|
| 1 | **Descuento VIP ≥ 1000** | 10 % + 5 % = **15 %**; el tope de 20 % queda en el contrato pero no se alcanza. C4 = 1333.20, B09 = 986.00. |
| 2 | **`id` en la entrada** | Obligatorio; el servidor no genera ids. |
| 3 | **`montoTotal` del resumen** | Excluye `cancelado` → 7262.56 en el dataset pequeño. |
| 4 | **`precioUnitario` negativo** | Se rechaza con `PRECIO_INVALIDO`; se permite 0. |
| 5 | **Orden por fecha** | Ascendente (cronológico). |

La Fase 1 (Python) implementa exactamente estas resoluciones. Los fixtures `datos/casos_prueba.json` y `datos/casos_borde.json` son la fuente de verdad de los tests.

## 13. Qué **no** incluye esta fase

- Lógica de negocio, servidores, CLIs ni tests (Fases 1–3).
- Frontend, benchmark y conteo de LOC (Fase 4).
- Documentación final, diagramas y evidencias (Fase 5).
- `pedidos_medios.json` y `pedidos_grandes.json` (Fase 4, deterministas).




