# proyecto-polycode

Sistema académico de gestión de pedidos implementado **tres veces** con las mismas reglas de
negocio, más un frontend web único que consume las tres APIs y las compara.

| Implementación | Paradigma principal | Puerto | Carpeta |
|---|---|---|---|
| Python | OOP + funcional | 8001 (`PY_PORT`) | [`python/`](python/README.md) |
| Go | Concurrencia + compilado | 8002 (`GO_PORT`) | [`go/`](go/README.md) |
| JavaScript/TypeScript | Asincronía + funcional | 8003 (`JS_PORT`) | [`js-ts/`](js-ts/README.md) |

Las tres implementaciones comparten el **mismo contrato** ([`documentos/contratos-api.md`](documentos/contratos-api.md))
y los **mismos fixtures de prueba** ([`datos/casos_prueba.json`](datos/casos_prueba.json) y
[`datos/casos_borde.json`](datos/casos_borde.json)), por lo que sus salidas son equivalentes
(incluso byte a byte en el lote).

## Estado del proyecto

| Fase | Estado | Contenido |
|---|---|---|
| 0 | Completada | Contratos, datos, esquemas y casos de prueba compartidos. |
| 1 | Completada | Python: `src/`, tests con pytest, CLI y API. |
| 2 | Completada | Go: `cmd/`, `internal/`, tests y API. |
| 3 | Completada | JS/TS: `src/`, tests con vitest, CLI y API. |
| 4 | Completada | Frontend comparativo, benchmark, conteo de LOC y datasets. |
| 5 | En curso | Análisis comparativo, manual técnico y evidencias (borradores listos para revisión). |

## Requisitos

- Python 3.10+ · Go 1.24+ · Node.js 20+.
- Solo biblioteca estándar en runtime; `pytest`, `typescript` y `vitest` son dependencias de desarrollo.

## Ejecución (9 comandos)

Desde `proyecto-polycode/`, en **tres terminales** para los backends:

| # | Terminal | Comando |
|---|---|---|
| 1 | Python | `cd python && pip install -r requirements.txt && python -m src.cli serve --datos ../datos` |
| 2 | Go | `cd go && go run ./cmd serve --datos ../datos` |
| 3 | JS/TS | `cd js-ts && npm install && npm run build && node dist/cli.js serve --datos ../datos` |
| 4 | Frontend | `cd proyecto-polycode && python -m http.server 8080` → abrir <http://127.0.0.1:8080/frontend/> |
| 5 | Tests Python | `cd python && pytest -q` |
| 6 | Tests Go | `cd go && go test ./...` |
| 7 | Tests JS/TS | `cd js-ts && npm test` |
| 8 | Benchmark | `python scripts/benchmark.py --repeticiones 5` |
| 9 | LOC + datasets | `python scripts/comparar_loc.py` y `python scripts/generar_datasets.py` |

> Usa `127.0.0.1` y no `localhost`: en Windows `localhost` resuelve primero a `::1` (IPv6) y las
> APIs escuchan en IPv4, de modo que cada petición pagaba ~2 s de espera de la conexión IPv6.

## API

Las tres exponen exactamente los mismos endpoints (`/salud`, `/pedidos`, `/pedidos/{id}`,
`POST /pedidos`, `PATCH /pedidos/{id}/estado`, `/resumen`, `POST /pedidos/lote`) con el mismo
formato de error `{codigo, mensaje, campo?}`.

```bash
curl http://127.0.0.1:8001/salud
curl "http://127.0.0.1:8002/pedidos?estado=recibido&orden=monto"
curl http://127.0.0.1:8003/resumen
```

## Benchmark

`scripts/benchmark.py` mide `POST /pedidos/lote` en las tres APIs para los tres datasets
(10, 100 y 1000 pedidos). Descarta una ejecución de calentamiento, hace `N` repeticiones
(default 5) y reporta media y mediana.

```bash
python scripts/benchmark.py --repeticiones 5              # usa las APIs ya levantadas
python scripts/benchmark.py --urls python=http://127.0.0.1:8001,go=...,js=...
```

Salida: tabla en consola y `benchmark_resultados.json` (el frontend puede leerlo). Última medición
en esta máquina:

| Lenguaje | 10 pedidos | 100 pedidos | 1000 pedidos |
|---|---|---|---|
| Python | 3.61 ms | 16.62 ms | 103.31 ms |
| Go | 1.76 ms | 7.45 ms | 60.02 ms |
| JS/TS | 2.02 ms | 5.48 ms | 38.76 ms |

Los tres lenguajes devuelven **el mismo monto total** en cada dataset (8781.36, 194480.92 y
1936126.78), lo que el propio benchmark comprueba y registra en la sección `coherencia`.

`scripts/comparar_loc.py` cuenta las líneas de código por lenguaje (sin tests, sin comentarios) y
genera `loc_resultados.json`, que el frontend usa para la columna *LOC*.

## Estructura

```text
proyecto-polycode/
├── datos/            catálogos, datasets (10/100/1000), fixtures y JSON Schema
├── python/           implementación Python
├── go/               implementación Go
├── js-ts/            implementación JavaScript/TypeScript
├── frontend/         panel comparativo (HTML + CSS + JS vanilla)
├── scripts/          benchmark.py, comparar_loc.py, generar_datasets.py
├── documentos/       contratos, análisis comparativo, manual técnico, diagramas
└── evidencias/       capturas y videos
```
