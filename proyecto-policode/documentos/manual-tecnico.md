# Manual técnico — proyecto-polycode

Guía operativa y de extensión del proyecto. Para el comparativo de lenguajes ver
[`analisis-comparativo.md`](analisis-comparativo.md); para el contrato completo ver
[`contratos-api.md`](contratos-api.md).

---

## 1. Requisitos

| Componente | Versión mínima | Instalación |
|---|---|---|
| Python | 3.10 | `pip install -r python/requirements.txt` (solo `pytest`, en desarrollo) |
| Go | 1.24 | sin dependencias externas |
| Node.js | 20 | `npm install` en `js-ts/` (solo dependencias de desarrollo) |
| Python (servidor estático del frontend) | 3.10 | `python -m http.server` |

Ninguna implementación usa librerías de terceros en runtime: todo el código del producto usa la
biblioteca estándar de su lenguaje.

## 2. Puesta en marcha

Tres terminales para los backends y una para el frontend:

```bash
# 1) Python en http://127.0.0.1:8001
cd python && pip install -r requirements.txt && python -m src.cli serve --datos ../datos

# 2) Go en http://127.0.0.1:8002
cd go && go run ./cmd serve --datos ../datos

# 3) JavaScript/TypeScript en http://127.0.0.1:8003
cd js-ts && npm install && npm run build && node dist/cli.js serve --datos ../datos

# 4) Frontend en http://127.0.0.1:8080/frontend/
cd proyecto-polycode && python -m http.server 8080
```

> Use `127.0.0.1` en lugar de `localhost`: en Windows, `localhost` resuelve primero a `::1` (IPv6) y
> las APIs escuchan en IPv4, de modo que cada petición paga el tiempo de espera de la conexión IPv6
> (unos 2 segundos). El frontend y `scripts/benchmark.py` ya usan `127.0.0.1` por defecto.

### Variables de entorno

| Variable | Usada por | Valor por defecto | Significado |
|---|---|---|---|
| `PY_PORT` | Python | `8001` | Puerto de la API |
| `GO_PORT` | Go | `8002` | Puerto de la API |
| `JS_PORT` | JS/TS | `8003` | Puerto de la API |
| `POLY_DATA_DIR` | las tres | `datos` | Directorio con `clientes.json`, `productos.json` y `pedidos_pequenos.json` |
| `POLY_WORKERS` | Python | CPU+4 (máx. 32) | Hilos del lote |
| `POLY_LOG` | Python | desactivado | Con `1` activa el log de peticiones HTTP |

Los argumentos de línea de comandos tienen prioridad sobre las variables de entorno
(`--puerto`, `--datos`, `--trabajadores`).

## 3. Suites de pruebas

| Suite | Comando | Qué cubre |
|---|---|---|
| Python | `cd python && pytest -q` | 5 casos comunes, 10 borde, reglas, API HTTP y CLI |
| Go | `cd go && go test ./...` | misma cobertura con `testing` de la stdlib (41 subtests) |
| JS/TS | `cd js-ts && npm test` | misma cobertura con vitest (25 tests) |
| Verificación de equivalencia | ver §7 | compara las tres implementaciones entre sí |

Las tres suites leen **los mismos fixtures** de `datos/`; nunca duplican valores esperados en el
código de test. Un caso nuevo se añade una sola vez en `datos/casos_prueba.json` (común) o
`datos/casos_borde.json` (borde) y queda cubierto en los tres lenguajes.

Herramientas útiles:

```bash
cd python && pytest -q -k borde          # un subconjunto
cd go && go test ./tests/ -v -count=1    # verboso, sin caché
cd js-ts && npm run test:watch           # modo interactivo
```

## 4. Estructura del repositorio

```text
proyecto-polycode/
├── datos/          catálogos, datasets, fixtures compartidos y JSON Schema
├── python/src      modelos · reglas · almacen · io_json · api · cli · errores
├── go/cmd          main
├── go/internal     modelos · reglas · concurrencia · almacen · iojson · api · cli · errores
├── js-ts/src       modelos · reglas · dinero · async · almacen · ioJson · api · cli · errores
├── frontend/       index.html · app.js · styles.css · datasets.js · catalogos.js
├── scripts/        benchmark.py · comparar_loc.py · generar_datasets.py
├── documentos/     contratos-api.md · analisis-comparativo.md · manual-tecnico.md · diagramas/
└── evidencias/     capturas/ · videos/
```

Cada implementación tiene el **mismo esqueleto**: `modelos` → `reglas` → `almacen` → `api`/`cli`.
Cuando se toca una capa en un lenguaje, hay que tocarla en los otros dos.

## 5. Cómo extender el sistema

### 5.1 Agregar un endpoint nuevo

1. **Escribir el contrato primero.** Añadir el endpoint a `documentos/contratos-api.md` (§4.2
   tabla de endpoints y §4.x ejemplo de request/response) y, si introduce un cuerpo nuevo, un
   esquema en `datos/esquemas/`.
2. **Definir el recurso.** Si el endpoint devuelve una entidad nueva, añadir sus tipos en
   `modelos` (Python `modelos.py`, Go `internal/modelos/modelos.go`, TS `modelos.ts`).
3. **Implementar la lógica** en `reglas` (si es de negocio) o en `almacen` (si es de consulta).
4. **Exponer el endpoint** en el enrutador de cada implementación:
   - Python: `python/src/api.py`, método `_despachar`/`_enrutar`.
   - Go: `go/internal/api/api.go`, función `enrutar`.
   - JS/TS: `js-ts/src/api.ts`, función `manejar`.
5. **Añadir las pruebas** en `python/tests/test_api.py`, `go/tests/api_test.go` y
   `js-ts/tests/api.test.ts` con las mismas aserciones (mismo estado HTTP, mismo cuerpo).
6. **Actualizar** `documentos/contratos-api.md` y, si aplica, el frontend (`frontend/app.js`).

### 5.2 Agregar o cambiar una regla de negocio

1. Modificar la regla en las **tres** implementaciones (`reglas`): es el punto donde más fácil es
   que se desincronicen.
2. Si cambia un resultado, actualizar los valores esperados en `datos/casos_prueba.json` y/o
   `datos/casos_borde.json`.
3. Ejecutar las tres suites y la verificación de equivalencia (§7).
4. Si cambia un importe del resumen, revisar también `datos/pedidos_pequenos.json` y las cifras
   citadas en el README y en el análisis comparativo.

> Regla de oro: **nunca** se edita un test para que pase si el cambio es de negocio; se editan
> primero los fixtures compartidos y luego se propaga.

### 5.3 Agregar un campo al modelo

1. `datos/esquemas/*.schema.json`: actualizar el esquema.
2. `modelos` de los tres lenguajes (campo + etiqueta JSON).
3. `reglas` de los tres (validación y normalización).
4. Fixtures: añadir el campo a `datos/casos_prueba.json` si forma parte de un caso.
5. Tests: añadir la aserción en las tres suites.
6. Si el campo es visible en el frontend, actualizar `frontend/app.js` y `frontend/index.html`.

### 5.4 Agregar clientes, productos o datasets

- **Clientes y productos**: editar `datos/clientes.json` / `datos/productos.json` (respetar los
  patrones `^CLI-[0-9]{3}$` y `^PROD-[0-9]{3}$`). Tras editarlos, regenerar la copia del frontend:
  `python scripts/generar_datasets.py`.
- **Datasets mediano y grande**: los genera `python scripts/generar_datasets.py` de forma
  determinista (PRNG mulberry32 con semilla fija). El script escribe `datos/pedidos_medios.json`,
  `datos/pedidos_grandes.json` y `frontend/catalogos.js`.
  El algoritmo está reimplementado en `frontend/datasets.js` para que el navegador pueda generar
  el mismo lote cuando se abre el HTML con `file://`; si se cambia uno, hay que cambiar el otro.

### 5.5 Agregar un caso de prueba

1. Añadir el caso a `datos/casos_prueba.json` (común) o `datos/casos_borde.json` (borde) con
   `id`, `tipo` (`calculo` o `transicion`), `entrada` y `esperado` (`http`, `ok` y, según el caso,
   `calculos` o `error`).
2. Los tests de los tres lenguajes los recogen automáticamente:
   `python/tests/test_casos_comunes.py`, `go/tests/casos_comunes_test.go`,
   `js-ts/tests/casosComunes.test.ts`.
3. Comprobar que el caso falla en algún lenguaje antes de corregirlo: si pasa en los tres a la
   primera, probablemente el fixture no está midiendo lo que se cree.

## 6. CLI

```text
<impl> run --entrada <archivo|-> [--salida <archivo|->] [--datos <dir>] [--trabajadores <n>]
<impl> serve [--datos <dir>] [--host <host>] [--puerto <n>]
```

| Aspecto | Python | Go | JS/TS |
|---|---|---|---|
| Invocación | `python -m src.cli ...` | `go run ./cmd ...` | `node dist/cli.js ...` |
| Formato de salida | `{resultados, resumen}` | `{resultados, resumen}` | `{resultados, resumen}` |
| Códigos de salida | 0 correcto · 1 error de datos · 2 uso incorrecto | iguales | iguales |

`run` lee `{pedidos: [...]}` o un array, escribe el resultado en el archivo indicado (o en stdout) y
**no** modifica el almacén: es el modo que usa el benchmark.

## 7. Verificación de equivalencia

Además de las suites, conviene comprobar que las tres implementaciones se comportan igual. La
comprobación feita en el proyecto comparó:

1. La salida del CLI sobre el mismo dataset, **byte a byte**.
2. Las respuestas HTTP de 11 rutas, los errores del lote y dos cuerpos inválidos.
3. El monto total devuelto por el benchmark para cada dataset.

Para reproducirla manualmente: levantar las tres APIs y ejecutar `python scripts/benchmark.py`, que
comprueba y registra la coherencia de montos en la sección `coherencia` de
`benchmark_resultados.json`. Para una comprobación completa de bytes, comparar la salida de
`run` de los tres lenguajes sobre el mismo archivo.

## 8. Benchmark y métricas

```bash
python scripts/benchmark.py --repeticiones 5          # usa las APIs ya levantadas
python scripts/benchmark.py --datasets pequeno,grande  # solo algunos datasets
python scripts/comparar_loc.py                        # LOC por lenguaje
python scripts/generar_datasets.py                    # regenera datasets y catalogos.js
```

- El benchmark **descarta una ejecución de calentamiento** y reporta media, mediana, mínimo y
  máximo en milisegundos; escribe `benchmark_resultados.json`.
- `comparar_loc.py` cuenta líneas físicas no vacías y sin comentarios, excluye los tests y cuenta
  los docstrings de Python como comentarios; escribe `loc_resultados.json`.
- El frontend lee `loc_resultados.json` para la columna LOC y puede leer
  `benchmark_resultados.json` como histórico.

## 9. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El frontend tarda ~2 s en cada petición | `localhost` resolviendo a `::1` | usar `127.0.0.1` en `CONFIG.apis` (frontend) o `--urls` (benchmark) |
| `Address already in use` | otro proceso en el puerto | cambiar `--puerto` / `PY_PORT`, `GO_PORT`, `JS_PORT` |
| `CORS` en el navegador | el frontend se sirve desde otro origen y la API no responde con cabeceras | las tres APIs envían `Access-Control-Allow-Origin: *`; comprobar que la petición va a `127.0.0.1` y no a un proxy |
| El frontend no encuentra `../datos/` | se abrió con `file://` | el frontend genera el lote en el navegador; para leer los archivos canónicos, servir por HTTP (`python -m http.server`) |
| La columna LOC aparece como `—` | falta `loc_resultados.json` o el frontend se abrió con `file://` | ejecutar `python scripts/comparar_loc.py` y servir por HTTP |
| `go: cannot find main module` | se ejecutó `go build` fuera de `go/` | ejecutar el comando desde `proyecto-polycode/go` |
| `go: command not found` | Go no está instalado | instalar Go 1.24+ y añadirlo al PATH |
| `npm warn install-scripts` y `vitest` falla | npm 11 bloqueó el postinstall de `esbuild` | `npm install-scripts approve esbuild` y volver a instalar |
| `tsc` informa de errores de tipos | el código cambió sin recompilar | `npm run build` antes de `node dist/cli.js` |
| Los datasets no coinciden con los del benchmark | se regeneraron con otro generador | regenerar con `python scripts/generar_datasets.py` y no editar los JSON a mano |
| Un pedido sale con 2 decimales de más | se usó `float`/`double` en el cálculo | usar el módulo de dinero de cada lenguaje (`Decimal`, centavos + `big.Rat`, microcentavos) |

## 10. Convenciones del proyecto

- **Idioma**: todo el código, los comentarios, los mensajes de error y la documentación están en
  español; los valores del dominio (`recibido`, `en_preparacion`, `express`, `vip`…) son literales
  del contrato y no se traducen.
- **Nombres**: los identificadores del dominio conservan el nombre del contrato (`clienteId`,
  `tipoEnvio`, `porcentajeDescuento`); los auxiliares técnicos usan inglés o nombres neutros.
- **Comentarios**: solo donde aportan (por qué, no qué); los docstrings describen el contrato.
- **Formato**: Python con `black`-like (líneas ≤ 100), Go con `gofmt`, TypeScript con 2 espacios.
- **Dependencias**: en runtime, solo biblioteca estándar. Cualquier dependencia nueva debe
  justificarse en el análisis comparativo.
- **Commits**: uno por fase, con mensaje convencional (`feat(python): …`, `feat(go): …`).

## 11. Cierre de una fase

1. `pytest -q`, `go test ./...` y `npm test` en verde.
2. Verificación de equivalencia (§7) sin diferencias.
3. `python scripts/comparar_loc.py` y `python scripts/benchmark.py` actualizados.
4. Documentación actualizada (README, contrato, manual, análisis).
5. `git commit` con el mensaje convencional de la fase y sin incluir artefactos temporales
   (`node_modules/`, `dist/`, `__pycache__/`, `salidas/` ya están en `.gitignore`).
