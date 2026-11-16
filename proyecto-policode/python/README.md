# Python — proyecto-polycode

Implementación del sistema de pedidos con **OOP + funcional + manejo de excepciones idiomático**. Solo usa la biblioteca estándar en runtime; `pytest` es la única dependencia de tests.

## Requisitos

- Python 3.10 o superior.
- Ejecutar los comandos desde `proyecto-polycode/python/`.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

## Estructura

```text
python/
├── src/
│   ├── modelos.py    dataclasses y constantes del dominio
│   ├── reglas.py     validación, cálculos, transiciones y lote concurrente
│   ├── almacen.py    pedidos en memoria protegidos por RLock
│   ├── io_json.py    lectura/escritura de JSON y catálogos
│   ├── api.py        ThreadingHTTPServer + routing + CORS
│   ├── cli.py        subcomandos run y serve
│   └── errores.py    ErrorDominio y ErrorDatos
└── tests/
    ├── test_casos_comunes.py  5 casos desde ../datos/casos_prueba.json
    ├── test_casos_borde.py    10 casos desde ../datos/casos_borde.json
    ├── test_reglas.py         almacén, filtros, orden, transiciones, lote
    ├── test_api.py            integración HTTP real
    └── test_cli.py            proceso real del CLI
```

## Tests

```bash
pytest -q
```

La suite carga los fixtures compartidos de `../datos/`, no duplica valores esperados. Cubre los 5 casos comunes, los 10 borde, la API completa y el CLI.

## CLI

```bash
# Procesa un lote y escribe el resultado
python -m src.cli run --entrada ../datos/pedidos_pequenos.json --salida salidas/salida_python.json --datos ../datos

# Escribe el JSON en stdout
python -m src.cli run --entrada ../datos/pedidos_pequenos.json --datos ../datos

# API en el puerto 8001 (PY_PORT configurable)
python -m src.cli serve --datos ../datos
```

- `POLY_DATA_DIR` define el directorio de datos si no se pasa `--datos`.
- `PY_PORT` define el puerto si no se pasa `--puerto`.
- `POLY_WORKERS` ajusta los hilos del lote (default: CPU+4, máximo 32).

El formato de `run` es el mismo de `POST /pedidos/lote`: `{resultados, resumen}`, con los resultados en el orden de entrada.

## API

Con `serve` activo en `http://localhost:8001`:

```bash
curl http://localhost:8001/salud
curl "http://localhost:8001/pedidos?estado=recibido&orden=monto"
curl http://localhost:8001/resumen
curl -X POST http://localhost:8001/pedidos \
  -H "Content-Type: application/json" \
  -d @pedido.json
```

| Método | Ruta |
|---|---|
| `GET` | `/salud` |
| `GET` | `/pedidos?clienteId=&estado=&orden=` |
| `GET` | `/pedidos/{id}` |
| `POST` | `/pedidos` |
| `PATCH` | `/pedidos/{id}/estado` |
| `GET` | `/resumen` |
| `POST` | `/pedidos/lote` |

Contrato completo (errores, ejemplos, códigos HTTP): `../documentos/contratos-api.md`.

## Decisiones de implementación

- **Dinero con `Decimal`** y redondeo `ROUND_HALF_UP` a 2 decimales en cada paso; se serializa como número JSON.
- **Concurrencia del lote** con `concurrent.futures.ThreadPoolExecutor`. `executor.map` conserva el orden de entrada, así que la respuesta es determinista aunque las tareas terminen en otro orden. El lote no toca el almacén.
- **Almacén** en memoria con `RLock`; las escrituras (`POST`, `PATCH`) son atómicas.
- **Errores** con `ErrorDominio` (código, mensaje, campo, HTTP); la API los traduce sin filtrar trazas internas.
- **Funcional evidenciado**: comprensiones en `reglas.py` y `almacen.py`, `lambda` en `procesar_lote`, y orden superior (`map`, `sorted`, `sum` con generador).
- **Tipos**: `dataclasses` inmutables para el dominio; `Decimal` para importes; `datetime` con zona para ordenar.
