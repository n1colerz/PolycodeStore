# Go — proyecto-polycode

Implementación del sistema de pedidos con **concurrencia real, tipado estático y binario compilado**. Solo biblioteca estándar de Go.

## Requisitos

- Go 1.24 o superior.
- Ejecutar los comandos desde `proyecto-polycode/go/`.

```bash
go version
go test ./...
```

## Estructura

```text
go/
├── cmd/main.go                 punto de entrada (run / serve)
├── internal/
│   ├── modelos/    tipos del dominio, enums, matriz de transiciones
│   ├── reglas/     validación, cálculos con big.Rat, transiciones
│   ├── concurrencia/ lote con goroutines + WaitGroup + channel
│   ├── almacen/    pedidos en memoria con sync.RWMutex
│   ├── iojson/     lectura/escritura de JSON y catálogos
│   ├── api/        servidor net/http, routing y CORS
│   ├── errores/    catálogo de errores del dominio
│   └── cli/        implementación de los subcomandos
└── tests/          suite go test (mismos fixtures que Python)
```

## Tests

```bash
go test ./...
go test ./tests/ -v
```

La suite carga los fixtures compartidos de `../datos/` (`casos_prueba.json` con los 5 casos comunes y `casos_borde.json` con los 10 borde) y cubre además almacén, filtros, orden, transiciones, API HTTP y CLI.

## CLI

```bash
# Procesa un lote y escribe el resultado
go run ./cmd run --entrada ../datos/pedidos_pequenos.json --salida salidas/salida_go.json --datos ../datos --trabajadores 4

# Escribe el JSON en stdout
go run ./cmd run --entrada ../datos/pedidos_pequenos.json --datos ../datos

# API en el puerto 8002 (GO_PORT configurable)
go run ./cmd serve --datos ../datos

# Binario compilado
go build -o bin/polystore ./cmd
./bin/polystore serve --datos ../datos
```

- `POLY_DATA_DIR` define el directorio de datos si no se pasa `--datos`.
- `GO_PORT` define el puerto si no se pasa `--puerto`.
- `POLY_WORKERS` ajusta las goroutines del lote (default: CPU+4, máximo 32).

El formato de `run` es el mismo de `POST /pedidos/lote`: `{resultados, resumen}`, con los resultados en el orden de entrada.

## API

Con `serve` activo en `http://localhost:8002`:

```bash
curl http://localhost:8002/salud
curl "http://localhost:8002/pedidos?estado=recibido&orden=monto"
curl http://localhost:8002/resumen
curl -X PATCH http://localhost:8002/pedidos/PED-0001/estado \
  -H "Content-Type: application/json" -d '{"estado":"en_preparacion"}'
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

Contrato completo: `../documentos/contratos-api.md`.

## Decisiones de implementación

- **Dinero exacto**: los importes se manejan en centavos (`int64`) y los productos intermedios en `math/big.Rat`, con redondeo half-up a 2 decimales en cada paso. Sin coma flotante en las cuentas.
- **Concurrencia del lote**: una goroutine por pedido, `sync.WaitGroup` para sincronizar y un canal con búfer para recolectar los resultados. Cada goroutine escribe en su índice, así que la respuesta conserva el orden de entrada y es determinista. El lote no toca el almacén.
- **Almacén** con `sync.RWMutex`: lecturas concurrentes (`Listar`, `Resumen`) y escrituras atómicas (`Agregar`, `ActualizarEstado`).
- **Errores tipados**: `errores.Dominio` con código, mensaje, campo y status HTTP; el catálogo coincide palabra por palabra con Python.
- **Tipado estático**: `Pedido`, `Item`, `Calculos` y `ErrorAPI` son structs con etiquetas JSON; el orden de las claves en la respuesta es explícito.
- **Validación sobre `json.RawMessage`**: permite distinguir campo ausente, `null` y tipo incorrecto, y devolver exactamente el mismo error que Python.
