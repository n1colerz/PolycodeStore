# JavaScript/TypeScript — proyecto-polycode

Implementación del sistema de pedidos con **asincronía (`async/await`, `Promise.all`), orientación a eventos y estilo funcional**. TypeScript en modo estricto sobre la biblioteca estándar de Node.

## Requisitos

- Node.js 20 o superior.
- Ejecutar los comandos desde `proyecto-polycode/js-ts/`.

```bash
npm install
npm run build
npm test
```

## Estructura

```text
js-ts/
├── src/
│   ├── modelos.ts    tipos del dominio, enums, matriz de transiciones
│   ├── errores.ts    catálogo de errores del dominio
│   ├── dinero.ts     aritmética exacta en microcentavos
│   ├── reglas.ts     validación, cálculos y transiciones
│   ├── async.ts      lote con Promise.all
│   ├── almacen.ts    pedidos en memoria
│   ├── ioJson.ts     lectura/escritura de JSON y serializador del contrato
│   ├── api.ts        servidor node:http, routing y CORS
│   └── cli.ts        subcomandos run y serve
└── tests/
    ├── casosComunes.test.ts  5 casos desde ../datos/casos_prueba.json
    ├── casosBorde.test.ts    10 casos desde ../datos/casos_borde.json
    ├── reglas.test.ts        almacén, filtros, orden, transiciones, lote
    ├── api.test.ts           integración HTTP real
    └── cli.test.ts           CLI en proceso
```

## Tests

```bash
npm test
npm run test:watch
```

La suite carga los fixtures compartidos de `../datos/` y no duplica valores esperados. Cubre los 5 casos comunes, los 10 borde, la API completa y el CLI.

## CLI

```bash
# Compila y procesa un lote
npm run build
node dist/cli.js run --entrada ../datos/pedidos_pequenos.json --salida salidas/salida_js.json --datos ../datos

# Escribe el JSON en stdout
node dist/cli.js run --entrada ../datos/pedidos_pequenos.json --datos ../datos

# API en el puerto 8003 (JS_PORT configurable)
node dist/cli.js serve --datos ../datos
```

- `POLY_DATA_DIR` define el directorio de datos si no se pasa `--datos`.
- `JS_PORT` define el puerto si no se pasa `--puerto`.

El formato de `run` es el mismo de `POST /pedidos/lote`: `{resultados, resumen}`, con los resultados en el orden de entrada.

## API

Con `serve` activo en `http://localhost:8003`:

```bash
curl http://localhost:8003/salud
curl "http://localhost:8003/pedidos?estado=recibido&orden=monto"
curl http://localhost:8003/resumen
curl -X PATCH http://localhost:8003/pedidos/PED-0001/estado \
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

- **Asincronía real**: el lote usa `Promise.all` sobre un `map` de promesas; cada entrada hace `await setImmediate()` para ceder el control al event loop. `Promise.all` conserva el orden de entrada, así que la respuesta es determinista.
- **Dinero exacto**: los importes se trabajan en microcentavos (`1 unidad = 1 000 000 micro`) y se redondean a centavos con half-up. Las sumas internas son enteras, sin coma flotante.
- **Tipos estáticos y graduales**: `strict: true` en `tsconfig.json`; las entradas se validan como `unknown` y se estrechan con Guardianas de tipo (`esObjeto`), lo que reproduce exactamente el orden de validaciones de Python y Go.
- **Serializador propio**: `ioJson.ts` implementa el formato JSON del contrato (los importes siempre con decimales, los contadores como enteros) para que la salida sea byte a byte idéntica a la de Python y Go.
- **Sin locks**: Node es monohilo, por lo que el almacén no necesita sincronización; la asincronía se concentra en el lote.
