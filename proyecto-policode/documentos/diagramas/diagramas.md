# Diagramas del proyecto

Diagramas en sintaxis Mermaid (se renderizan en GitHub, VS Code o cualquier visor Mermaid).
Todos describen el comportamiento **común** a las tres implementaciones; lo que cambia entre
lenguajes es la sintaxis, no la estructura.

## 1. Capas de una implementación

```mermaid
flowchart TD
    HTTP["Adaptador HTTP<br/>api.py · api.go · api.ts"]
    CLI["Adaptador CLI<br/>cli.py · cli.go · cli.ts"]
    ALM[("Almacén en memoria<br/>Almacen")]
    REG["Reglas de negocio<br/>validación · cálculos · transiciones"]
    DOM["Dominio<br/>Pedido · Item · Cliente · Calculos"]
    JSON["E/S de datos<br/>clientes.json · productos.json · datasets"]

    HTTP --> ALM
    CLI --> REG
    HTTP --> REG
    ALM --> REG
    REG --> DOM
    ALM --> DOM
    REG --> JSON
    ALM --> JSON
```

## 2. Procesamiento de `POST /pedidos/lote`

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente
    participant H as API HTTP
    participant L as Motor de lote
    participant W1 as Trabajador 1
    participant W2 as Trabajador 2

    C->>H: POST /pedidos/lote {pedidos:[...]}
    H->>H: validar cuerpo (JSON_INVALIDO / CUERPO_INVALIDO)
    H->>L: procesarLote(pedidos)
    par una goroutine/thread/tarea por pedido
        L->>W1: validar + calcular
        W1-->>L: resultado[índice]
    and
        L->>W2: validar + calcular
        W2-->>L: resultado[índice]
    end
    Note over L: resultados ordenados por índice<br/>(determinista)
    L-->>H: {resultados, resumen}
    H-->>C: 200 application/json
```

## 3. Vista comparativa del frontend

```mermaid
flowchart LR
    U[Usuario] -->|elige dataset| F[frontend/app.js]
    F -->|POST /pedidos/lote| PY["API Python :8001"]
    F -->|POST /pedidos/lote| GO["API Go :8002"]
    F -->|POST /pedidos/lote| JS["API JS :8003"]
    PY -->|performance.now()| T[Tiempos por lenguaje]
    GO --> T
    JS --> T
    T --> TAB["Tabla: tiempo · pedidos · monto · LOC · paradigma"]
    T --> G["Gráfico de barras (canvas)"]
    LOC[("loc_resultados.json")] --> TAB
    TAB --> U
    G --> U
```

## 4. Estados de un pedido

```mermaid
stateDiagram-v2
    [*] --> recibido
    recibido --> en_preparacion
    en_preparacion --> enviado
    enviado --> entregado
    recibido --> cancelado
    en_preparacion --> cancelado
    enviado --> cancelado
    entregado --> [*]
    cancelado --> [*]
```

Cualquier otra transición (incluido repetir el mismo estado) se rechaza con `TRANSICION_INVALIDA`.
