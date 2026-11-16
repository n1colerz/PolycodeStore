# Análisis comparativo: un sistema de pedidos en Python, Go y JavaScript/TypeScript

**Proyecto:** proyecto-polycode · **Versión:** 1.0 (borrador para revisión humana)
**Fecha:** 14 de noviembre de 2026 · **Fase:** 5 (documentación)

---

## Portada

**Título.** *Un mismo sistema de gestión de pedidos en tres lenguajes: comparación de paradigmas,
tipos, concurrencia y coste de implementación.*

**Subtítulo.** Caso académico con tres implementaciones funcionalmente equivalentes (Python 3.10+,
Go 1.24+ y Node.js 20+ con TypeScript estricto) que comparten contrato, datos y fixtures de prueba,
y un frontend único que mide y compara su comportamiento.

**Autoría.** Equipo proyecto-polycode (sustituir por los nombres reales antes de exportar).

**Artefactos asociados.** `documentos/contratos-api.md` (contrato aprobado),
`datos/casos_prueba.json` y `datos/casos_borde.json` (fixtures compartidos),
`benchmark_resultados.json` y `loc_resultados.json` (medidas).

**Índice.** 1 Introducción · 2 Problema · 3 Reglas de negocio · 4 Justificación de los lenguajes ·
5 Clasificación de los lenguajes · 6 Paradigmas usados · 7 Arquitectura por solución ·
8 Estructuras de datos · 9 Manejo de errores · 10 Sistema de tipos · 11 Ejecución y compilación ·
12 Concurrencia y asincronía · 13 Resultados de pruebas · 14 Ventajas y limitaciones ·
15 Mantenibilidad y escalabilidad · 16 Conclusiones · 17 Referencias.

---

## 1. Introducción

Elegir un lenguaje para un backend suele ser una decisión de tastes y no de datos. Este proyecto
intenta sustentarla con evidencia: un mismo problema de gestión de pedidos —cálculo de importes con
descuentos, impuestos, costes de envío, validaciones estrictas y transiciones de estado—
implementado **tres veces**, con reglas de negocio idénticas hasta el último centavo.

La hipótesis de partida era que la elección del lenguaje se nota en cuatro planos: cuánto código
hace falta, cuánto cuesta en concurrencia, qué errores se detectan antes de ejecutar y cuánto
cuesta mantener el sistema. El proyecto confirma parte de esa intuición y la matiza en el resto.

El trabajo se organizó en seis fases: contrato común (Fase 0), implementación en Python (Fase 1),
Go (Fase 2) y JavaScript/TypeScript (Fase 3), panel comparativo y mediciones (Fase 4) y documentación
(Fase 5). La pieza central del diseño es que **las tres implementaciones no son tres demos
parecidas**: comparten un contrato escrito (`documentos/contratos-api.md`), un catálogo de clientes,
datasets y, sobre todo, los mismos fixtures de prueba, de modo que cualquier divergencia de cálculo
es un fallo detectable automáticamente.

Un resultado secundario resultó más informativo que el esperado: para que las tres salidas fueran
**byte a byte idénticas** hubo que resolver tres detalles de serialización que normalmente se dan
por supuestos (entero frente a coma flotante, orden de las claves y formato de los importes). Esa
lucha por la equivalencia es, en sí, una lección sobre la diferencia entre "mismo resultado" y
"mismo comportamiento observable".

---

## 2. Problema

Una tienda necesita gestionar sus pedidos: registrar compras, calcular lo que debe pagar cada
cliente, consultar y actualizar el estado de los envíos. El dominio es pequeño pero no trivial:

- **Dinero con reglas combinadas.** El total no es solo la suma de los items: hay descuento por
  tipo de cliente, un descuento adicional por monto, un tope máximo, un IVA y un envío que depende
  del propio subtotal. Cualquier error de redondeo se propaga a miles de pedidos.
- **Validación estricta.** Un pedido puede llegar con datos incompletos, enums inválidos o
  cantidades no enteras, y el sistema debe rechazarlos con un mensaje accionable, no con un error
  genérico en producción.
- **Máquina de estados.** Los pedidos avanzan por un grafo (`recibido → en_preparacion → enviado →
  entregado`) y pueden cancelarse; las transiciones inválidas deben rechazarse.
- **Concurrencia.** El proceso por lotes es el camino caliente: una campaña genera cientos o miles
  de pedidos que deben validarse y calcularse en paralelo.
- **Interoperabilidad.** Tres servicios distintos deben exponer exactamente el mismo contrato HTTP,
  porque un frontend (y otros clientes) consumirá los tres.

La pregunta de investigación es: **¿qué diferencia medible introduce el lenguaje cuando el
problema, los datos y el contrato permanecen constantes?** Para responderla se fijaron primero el
contrato y los datos (Fase 0) y solo después se escribió una línea de código.

---

## 3. Reglas de negocio

Idénticas en las tres implementaciones y especificadas en `documentos/contratos-api.md` (§2 y §3).

**Entidades.** Pedido (`id`, `clienteId`, `fechaCreacion` ISO 8601, `estado`, `tipoEnvio`,
`metodoPago`, `prioridad`, `items[]`); Item (`codigoProducto`, `nombre`, `precioUnitario`,
`cantidad`); Cliente (`id`, `nombre`, `email`, `tipo` ∈ {vip, regular}).

**Validaciones obligatorias.** `cantidad` debe ser un entero mayor que 0; el pedido necesita al menos
un item; `clienteId` debe existir en el catálogo; `tipoEnvio` ∈ {estandar, express, retiro};
`metodoPago` ∈ {efectivo, tarjeta, transferencia}; `estado` ∈ {recibido, en_preparacion, enviado,
entregado, cancelado}; `prioridad` ∈ {alta, media, baja}.

**Cálculos.**

```text
subtotal   = R( Σ (precioUnitario × cantidad) )
porcentaje = 10 si el cliente es vip, 0 si es regular
porcentaje = porcentaje + 5 si subtotal >= 1000
porcentaje = min(porcentaje, 20)                   // tope máximo
descuento  = R(subtotal × porcentaje / 100)
base       = R(subtotal − descuento)
impuesto   = R(base × 0.16)                        // IVA 16%
costoEnvio = 0 (retiro) | 50 (estandar y subtotal < 500) | 0 (estandar y subtotal >= 500) | 150 (express)
total      = R(subtotal − descuento + impuesto + costoEnvio)
```

`R(x)` es redondeo **half-up a dos decimales** aplicado en cada paso.

**Transiciones.** `recibido → {en_preparacion, cancelado}`, `en_preparacion → {enviado, cancelado}`,
`enviado → {entregado, cancelado}`; `entregado` y `cancelado` son finales. Cualquier otro par
(incluso el mismo estado) se rechaza con `TRANSICION_INVALIDA`.

**Decisión notable.** Con las reglas literales, un cliente vip con subtotal ≥ 1000 recibe
10 % + 5 % = **15 %**, de modo que el **tope del 20 % nunca se alcanza**. Es una decisión consciente
y documentada: el tope se conserva como defensa del contrato y los tests lo comprueban como
invariante, no como resultado.

**Consultas.** `GET /pedidos` (filtros `clienteId`, `estado` y orden `fecha`|`monto`|`prioridad`),
`POST /pedidos`, `PATCH /pedidos/{id}/estado`, `GET /resumen` y `POST /pedidos/lote`, este último con
procesamiento paralelo y **determinista** (el resultado conserva el orden de entrada).

---

## 4. Justificación de los lenguajes

La elección no busca "el mejor lenguaje", sino **tres lenguajes que responden a la pregunta desde
paradigmas distintos** y que son representativos de familias tecnológicas realmente en uso:

- **Python** aporta la experiencia del scripting de alto nivel: tipado dinámico, comprensiones,
  funciones de orden superior y un modelo de errores basado en excepciones. Es el lenguaje habitual
  para prototipos, automatización y análisis de datos, y su ligereza obliga a escribir con
  poca ceremonia para expresar el dominio.
- **Go** aporta el extremo opuesto en cuanto a concurrencia y distribución: compilación nativa,
  binario estático sin dependencias y una biblioteca estándar con goroutines, canales y `sync`.
  Es el lenguaje de los microservicios y de la infraestructura, donde el coste de arranque y el
  comportamiento bajo carga pesan más que la expresividad de la sintaxis.
- **JavaScript/TypeScript** aporta el modelo asíncrono orientado a eventos y la continuidad entre
  servidor y cliente, con tipado estático opcional y gradual mediante TypeScript.

Los tres criterios de selección fueron: (a) **contraste paradigmático real**, no tres dialectos
del mismo estilo; (b) **representatividad industrial**, para que las conclusiones sirvan fuera del
aula; y (c) **medibilidad**, es decir, poder comparar la misma lógica con los mismos datos y las
mismas reglas.

---

## 5. Clasificación de los lenguajes

| Dimensión | Python | Go | JavaScript / TypeScript |
|---|---|---|---|
| **Nivel de abstracción** | Alto: memoria gestionada, colecciones dinámicas, protocolo de objetos implícito | Medio-alto: memoria gestionada, sin herencia de clases, interfaces implícitas | Alto: memoria gestionada, herencia por prototipos, objetos dinámicos |
| **Forma de ejecución** | Interpretada: CPython compila a bytecode y lo ejecuta en la VM | Compilada *ahead-of-time* a código máquina (binario nativo autónomo) | Interpretada con compilación JIT (V8): el motor compila a código máquina en caliente |
| **Sistema de tipos** | Dinámico, con anotaciones opcionales (gradual en la práctica, sin verificación) | Estático, nominal y fuerte | Gradual: TypeScript es estático en tiempo de compilación y se borra al ejecutar |
| **Fuerza del tipado** | Media-fuerte en los tipos built-in (int ≠ str), débil en la comprobación de entradas | Fuerte | Fuerte en TypeScript, débil en JavaScript puro |
| **Propósito** | Generalista de scripting: automatización, datos, backend, prototypado | Generalista de sistemas: servicios de red, CLI, infraestructura | Generalista web: backend, frontend, tiempo real |
| **Tipo de lenguaje** | Generalista, interpretado, multiparadigma | Generalista, compilado, multiparadigma | Generalista, interpretado (JIT), multiparadigma |
| **Concurrencia** | Hilos con el GIL (sin paralelismo real de CPU) | Goroutines y canales, paralelismo real de CPU | Event loop monohilo; `worker_threads` para CPU |
| **Artefacto de ejecución** | Bytecode `.pyc` + intérprete | Binario nativo | Bytecode + runtime (Node.js) |

### Paradigmas evidenciados con rutas de archivo

| Paradigma | Python | Go | JS/TS |
|---|---|---|---|
| Orientado a objetos | `python/src/modelos.py` (dataclasses), `python/src/almacen.py` (`class Almacen`) | `go/internal/modelos/modelos.go` (structs), `go/internal/almacen/almacen.go` | `js-ts/src/modelos.ts` (interfaces), `js-ts/src/almacen.ts` (`class Almacen`) |
| Funcional | `python/src/reglas.py` (comprensiones, `sorted`, `sum` con generador), `python/src/almacen.py` | `go/internal/reglas/reglas.go` (funciones puras), `go/internal/almacen/almacen.go` (`sort.SliceStable`) | `js-ts/src/async.ts` (`map`, `reduce`), `js-ts/src/almacen.ts` (`filter`, `sort`) |
| Concurrente / asíncrono | `python/src/reglas.py` (`ThreadPoolExecutor`) | `go/internal/concurrencia/lote.go` (goroutines + `WaitGroup` + canal) | `js-ts/src/async.ts` (`Promise.all`, `await setImmediate()`) |
| Manejo de errores por excepciones | `python/src/errores.py` (`ErrorDominio`) | `go/internal/errores/errores.go` (errores tipados, sin excepción en runtime) | `js-ts/src/errores.ts` (`class ErrorDominio extends Error`) |
| Modular / por paquetes | `python/src/` (7 módulos) | `go/internal/` (7 paquetes + `cmd/`) | `js-ts/src/` (9 módulos ESM) |

### Funciones de orden superior, lambdas y comprensiones (requisito del proyecto)

| Lenguaje | Evidencia |
|---|---|
| Python | `python/src/reglas.py`: `sum((item.precioUnitario * item.cantidad for item in pedido.items), Decimal("0"))` (generador), `min(porcentaje, 20)` y comprehension en `almacen.py`; `lambda` en el `map` de `procesar_lote`. |
| Go | `go/internal/reglas/reglas.go`: funciones puras `calcular`, `validarPedido`, `validarTransicion`; `sort.SliceStable` con comparadores closures en `go/internal/almacen/almacen.go`. |
| JS/TS | `js-ts/src/async.ts`: `brutos.map(async (...) => ...)` y `resultados.reduce(...)`; `js-ts/src/almacen.ts`: `filter`, `map` y `sort` con comparadores. |

---

## 6. Paradigmas usados

Los tres lenguajes son multiparadigma, pero cada uno tiene un **estilo por defecto** distinto, y es
precisamente el estilo por defecto el que condiciona cómo se escribe una aplicación corriente.

| | Python | Go | JavaScript / TypeScript |
|---|---|---|---|
| Estilo dominante | Orientado a objetos con núcleo funcional | Imperativo estructurado con soporte de concurrencia | Funcional ligero sobre objetos, con asincronía |
| Objeto / datos | `dataclass` (clase con campos tipados) | `struct` con campos tipados y valor | `interface` + `class` (objetos por prototipos en runtime) |
| Composición | Duck typing, `Protocol` opcional | Interfaces implícitas, composición | Mixins y composición |
| Funciones | Funciones de primer orden, `lambda`, generadores | Funciones de primer orden (sin generadores) | Funciones de primer orden, `arrow function`, `Promise` |
| Concurrencia | Hilos (`ThreadPoolExecutor`) | Goroutines, canales, `sync.WaitGroup` | `Promise`/`async-await`, event loop |
| Metaprogramación | Introspección, decoradores, metaclasses | Genéricos, interfaces, `go:generate` | `Proxy`, decoradores, tipos condicionales |

**Python.** El peso recae en objetos: `python/src/modelos.py` define el dominio como `dataclass`
congeladas (`Pedido`, `ItemPedido`, `Calculos`) y `python/src/almacen.py` encapsula el estado en la
clase `Almacen`. El estilo funcional aparece donde conviene: `python/src/reglas.py` calcula el
subtotal con un generador (`sum(... for item in pedido.items)`), ordena con `sorted` y compara
diccionarios con `min`. Los errores son objetos: `ErrorDominio` transporta `codigo`, `mensaje`,
`campo` y `http`, y la API los traduce sin filtrar trazas.

**Go.** La guía de estilo oficial (Effective Go) recomiendaaqi omitir la herencia y usar composición;
por eso el dominio son `struct` planos (`go/internal/modelos/modelos.go`) y el comportamiento se
agrega con funciones (`go/internal/reglas/reglas.go`). La concurrencia es la pieza central y está
aislada en un paquete: `go/internal/concurrencia/lote.go` resuelve el lote con goroutines, un canal
con búfer y `sync.WaitGroup`, sin que el resto del código sepa que hay paralelismo.

**JavaScript/TypeScript.** El estilo dominante es funcional ligero: `js-ts/src/async.ts` construye
el lote con `brutos.map(async ...)` y `Promise.all`, y resume con `reduce`; `js-ts/src/almacen.ts`
filtra y ordena con `filter`, `map` y `sort`. TypeScript aporta el contrato estático
(`js-ts/tsconfig.json` con `strict: true`), mientras que en runtime siguen existiendo las clases y
la herencia por prototipos: `class Almacen` y `class ErrorDominio extends Error`.

---

## 7. Arquitectura por solución

Las tres implementaciones comparten **la misma arquitectura en capas**, impuesta por el contrato:
dominio sin dependencias de infraestructura, reglas puras por encima, almacén en memoria por encima
y, encima, dos adaptadores (HTTP y CLI). Solo cambia el lenguaje en que se expresa.

```
        HTTP (api / api.ts / api.go)          CLI (cli / cli.ts / cli.go)
                    │                                   │
                    └──────────────┬────────────────────┘
                                   ▼
                            almacen / Almacen
                                   │
                                   ▼
                     reglas / reglas.go / reglas.ts
                     (validación · cálculos · transiciones)
                                   │
                                   ▼
                     modelos / modelos.go / modelos.ts
                     (dominio y constantes)
```

| Capa | Python | Go | JS/TS | LOC aprox. (Py/Go/TS) |
|---|---|---|---|---|
| Dominio y constantes | `src/modelos.py` | `internal/modelos/` | `src/modelos.ts` | 106 / 178 / 177 |
| Reglas de negocio | `src/reglas.py` | `internal/reglas/` | `src/reglas.ts` | 376 / 420 / 302 |
| Dinero exacto | dentro de `reglas.py` | `internal/reglas/dinero.go` | `src/dinero.ts` | — / 52 / 48 |
| Concurrencia del lote | dentro de `reglas.py` | `internal/concurrencia/` | `src/async.ts` | — / 114 / 71 |
| Almacén | `src/almacen.py` | `internal/almacen/` | `src/almacen.ts` | 129 / 196 / 119 |
| Errores | `src/errores.py` | `internal/errores/` | `src/errores.ts` | 34 / 197 / 176 |
| E/S JSON | `src/io_json.py` | `internal/iojson/` | `src/ioJson.ts` | 160 / 204 / 189 |
| API HTTP | `src/api.py` | `internal/api/` | `src/api.ts` | 336 / 318 / 241 |
| CLI | `src/cli.py` | `internal/cli/` + `cmd/` | `src/cli.ts` | 134 / 243 / 206 |

**Flujo de `POST /pedidos/lote`** (idéntico en los tres):

1. El adaptador HTTP lee el cuerpo y exige un objeto JSON (`JSON_INVALIDO` / `CUERPO_INVALIDO`).
2. Extrae la lista `pedidos` (obligatoria, no vacía) y la entrega al motor de lote.
3. El motor lanza una unidad de trabajo por pedido; cada una valida y calcula **sin estado
   compartido** y devuelve un resultado con su índice.
4. Los resultados se recogen en el orden de entrada y se serializan con `{resultados, resumen}`.

La consecuencia práctica es que la lógica de negocio es **portable entre lenguajes**: el mismo
conjunto de reglas, los mismos mensajes de error y el mismo orden de salida, y por eso el proyecto
puede afirmar que las tres implementaciones son equivalentes y no simplemente parecidas.

## 8. Comparación de estructuras de datos

El dominio es el mismo, pero cada lenguaje lo expresa con sus estructuras nativas:

| Concepto | Python | Go | JS/TS |
|---|---|---|---|
| Pedido | `@dataclass(frozen=True)` con campos anotados | `struct` con campos tipados y etiquetas `json` | `interface Pedido` + objeto plano |
| Lista de items | `tuple[ItemPedido, ...]` (inmutable) | `[]Item` (slice) | `ItemPedido[]` (array) |
| Catálogo de clientes | `dict[str, Cliente]` | `map[string]modelos.Cliente` | `Map<string, Cliente>` |
| Índice de pedidos | `dict[str, int]` de posiciones | `map[string]int` | `Map<string, number>` |
| Dinero | `Decimal` (exacto, base 10) | `int64` en centavos + `math/big.Rat` | `number` en microcentavos (entero exacto hasta 2^53) |
| Enums y transiciones | `frozenset` y `dict[str, frozenset[str]]` | slices constantes y `map[string][]string` | `as const` y `Record<Estado, readonly Estado[]>` |
| Errores | clase `ErrorDominio(Exception)` | `struct Dominio` con `Error() string` | `class ErrorDominio extends Error` |
| Concurrencia | `threading.RLock` | `sync.RWMutex` | event loop monohilo (sin locks) |

**Inmutabilidad.** Python declara el dominio con `@dataclass(frozen=True)`, de modo que un pedido
validado no puede mutarse por accidente; Go usa structs por valor (se copian al asignar) y
TypeScript se apoya en `readonly` solo en las interfaces de entrada, porque en runtime los objetos
son mutables. Go y Python resultan más disciplinados por construcción; en TypeScript la
disciplina depende de la convención del equipo.

**La decisión que más condicionó el diseño: el dinero.** Los tres lenguajes manejan la coma
flotante de forma distinta, y una implementación ingenua produce totales que difieren en centavos
entre lenguajes. La solución fue representar el dinero en **unidades enteras exactas** durante todo
el cálculo:

- **Python**: `Decimal` con `ROUND_HALF_UP`, que representa exactamente los literales decimales
  del JSON.
- **Go**: centavos en `int64` para el resultado y `math/big.Rat` para los productos intermedios
  (`go/internal/reglas/dinero.go`).
- **JS/TS**: microcentavos (1 unidad = 1 000 000 micro) en enteros, con redondeo entero explícito
  (`js-ts/src/dinero.ts`).

Con esa representación, los tres-Montan exactamente el mismo valor y el mismo redondeo. Es el
ejemplo más claro del proyecto de por qué "el mismo algoritmo" no basta para garantizar "el mismo
resultado".

**Orden de las claves en el JSON.** Python conserva el orden de inserción de los `dict`; Go lo
conserva en el orden de los campos del `struct`; TypeScript lo conserva en el orden de inserción
del objeto, pero el serializador propio de `js-ts/src/ioJson.ts` tuvo que construirse a medida
para emitir los importes como `250.0` (float en Python) y no como `250` (entero en Go), y para
omitir los campos internos que empiezan por `_`. Sin ese serializador, la salida habría sido
numéricamente equivalente pero no idéntica byte a byte.

---

## 9. Manejo de errores

Cada lenguaje tiene un modelo distinto y los tres terminaron exponiendo **el mismo contrato**:
`{codigo, mensaje, campo?}` con el catálogo cerrado de 22 códigos definido en
`documentos/contratos-api.md` §5.

| | Python | Go | JS/TS |
|---|---|---|---|
| Modelo | Excepciones (`ErrorDominio(Exception)`) con atributos | Errores como valores: `*errores.Dominio` devuelto explícitamente | Excepciones (`class ErrorDominio extends Error`) |
| Flujo de control | `raise` / `try` / `except` | Retorno de error explícito + `if err != nil` | `throw` / `try` / `catch` |
| Traducción a HTTP | El handler captura `ErrorDominio` | Cada rama devuelve el error y el handler lo escribe | El handler captura `ErrorDominio` |
| Riesgo | Excepción no capturada -> 500 con traza | Olvidar comprobar el error -> `nil` panic | Rechazo no capturado -> 500 con traza |

**Dónde está la diferencia real.** En Go no existen excepciones: cada función que puede fallar
devuelve `(valor, error)` y el compilador obliga a Propagarlo (o a ignorarlo explícitamente con
`_`). En Python y JavaScript, el error puede "desaparecer" si nadie captura la excepción: el
lenguaje no avisa. La consecuencia práctica en este proyecto es que **la versión Go tiene menos
superficies de fallo silencioso**, mientras que Python y JS necesitan convenciones (y las tienen:
todo el código de dominio lanza `ErrorDominio` y el handler HTTP lo traduce sin filtrar trazas).

**Validación y orden de comprobaciones.** El contrato fija un orden exacto de validación
(campos obligatorios, tipos, formato de id y fecha, enums, items no vacíos, cliente existente,
detalle de items). Las tres implementaciones lo respetan, y ahí aparece una asimetría interesante:
distinguir "campo ausente", "campo nulo" y "campo de tipo incorrecto" es trivial en Go (valor cero
y `json.RawMessage`) y en TypeScript (`unknown` más guardas de tipo), pero en Python exige tratar
`None` de forma explícita, porque `None` es a la vez "ausente" y "nulo".

**Códigos HTTP derivados.** El mapa es el mismo en los tres: 400 validaciones, 404 cliente o pedido
inexistente, 409 id duplicado o transición inválida, 405 método no permitido, 500 error interno. Los
mensajes son idénticos palabra por palabra, lo que permite comparar respuestas de las tres APIs
automáticamente (se hizo en la verificación de equivalencia).

---

## 10. Sistema de tipos

| | Python | Go | JavaScript / TypeScript |
|---|---|---|---|
| Clasificación | Dinámico | Estático | Gradual (TypeScript) |
| Verificación | En ejecución (y opcionalmente con `mypy`) | En compilación | En compilación (`tsc`) |
| Tipos numéricos | `int` y `float` distintos; `Decimal` aparte | `int`, `int64`, `float64`, `uint`, `big.Int`/`big.Rat` | `number` (IEEE 754) y `bigint` aparte |
| Nulos | `None` | `nil` | `null` / `undefined` |
| Genéricos | Sí, con `typing` (poco usados en el proyecto) | Sí, desde 1.18 (con restricciones) | Sí, con borrado de tipos |
| Uniones | No nativas (`Optional`) | No (interfaces y `any`) | Sí (`|`) |
| Acoplamiento | Dinámico (duck typing) | Implícito por interfaces | Implícito por forma (estructural) |

**Errores que cada lenguaje detecta antes de ejecutar.** Es la ventaja más tangible del tipado
estático, y se comprobará con un ejemplo real del proyecto: renombrar el campo JSON `clienteId` a
`cliente_id` en la respuesta.

- **Go**: el `struct` y la etiqueta `json:"clienteId"` quedan desalineados; el compilador no avisa
  de la etiqueta, pero cualquier llamada que use el campo con el nombre antiguo **no compila**, y
  `go vet` detecta usos inconsistentes.
- **TypeScript**: el error aparece al compilar en cuanto una respuesta tipada deja de coincidir
  con la forma real (`tsc` en modo `strict`).
- **Python**: nada lo detecta hasta que un test o un cliente real recibe una clave que no espera;
  el fallo se manifiesta como un `KeyError` lejos del origen.

**Un caso curioso del propio proyecto.** La clase `Importe` de `js-ts/src/modelos.ts` existe
precisamente porque TypeScript no distingue `number` entero de `number` decimal: sin ese tipo
wrapper, el serializador emitía `0` donde Python emitía `0.0`. El tipado gradual evitó el error
*numérico* (el valor era el mismo) pero no el error de *representación*.

**Gradualidad.** TypeScriptresulta más cómodo en el borde de la API, donde la entrada es `unknown`
y hay que estrechar el tipo: `esObjeto()` en `js-ts/src/reglas.ts` hace de guardia de tipo y produce
exactamente el mismo orden de errores que las comprobaciones de Python y Go. Go, en cambio, obliga a
trabajar con `map[string]json.RawMessage` para el mismo propósito: más verboso, pero imposible de
olvidar una comprobación.

---

## 11. Ejecución y compilación

| | Python | Go | JavaScript / TypeScript |
|---|---|---|---|
| Artefacto | `.pyc` + intérprete CPython | Binario nativo estático | `.js` (salida de `tsc`) + runtime Node con V8 |
| Pipeline | Fuente -> bytecode -> intérprete | Fuente -> compilación AOT -> binario | Fuente TS -> `tsc` -> JS -> JIT de V8 |
| Arranque | Lento (carga el intérprete y los módulos) | Instantáneo (el binario ya está listo) | Rápido, con calentamiento del JIT |
| Distribución | Requiere el intérprete instalado | Un binario, sin dependencias | Requiere Node instalado (o empaquetado) |
| Compilación de tipos | No (opcional, `mypy`) | Obligatoria | Obligatoria en el proyecto (`tsc`) |
| Concurrencia real de CPU | No (GIL) | Sí (goroutines en varios núcleos) | No en el hilo principal (`worker_threads` para CPU) |

**Medida del arranque.** El arranque no se midió de forma automatizada en este proyecto (el
benchmark mide el procesamiento en caliente, no el arranque), pero la diferencia es conocida y
relevante: el binario de Go arranca en milisegundos, mientras que Python y Node necesitan cargar
el intérprete y compilar o interpretar el código antes de atender la primera petición. En un
servicio que se escala a cero o en una función serverless, esa diferencia es dominante; en un
servicio de larga vida, es irrelevante.

**Qué mide el benchmark y qué no.** `scripts/benchmark.py` mide exclusivamente el endpoint
`POST /pedidos/lote` con las APIs ya calentadas (una ejecución de calentamiento se descarta), por
lo que la comparación favorece a lo que importa en este dominio (validación y cálculo) y no al
lenguaje con mejor arranque. Es una decisión explícita, documentada en el propio script.

---

## 12. Concurrencia y asincronía

El endpoint `POST /pedidos/lote` es el camino caliente y el requisito es explícito: procesar en
paralelo y devolver **resultados deterministas**, es decir, el mismo resultado independientemente
del orden en que terminen las tareas.

| | Python | Go | JS/TS |
|---|---|---|---|
| Mecanismo | `ThreadPoolExecutor` | goroutines + canal con búfer + `sync.WaitGroup` | `Promise.all` sobre un `map` de promesas |
| Archivo | `python/src/reglas.py` | `go/internal/concurrencia/lote.go` | `js-ts/src/async.ts` |
| Paralelismo real de CPU | No (GIL) | Sí (una goroutine por núcleo) | No en el hilo principal |
| Determinismo | `executor.map` conserva el orden | cada goroutine escribe en su índice | `Promise.all` conserva el orden |
| Sincronización del almacén | `threading.RLock` | `sync.RWMutex` | innecesaria (monohilo) |
| Ceder el control | el planificador del intérprete | `runtime.Gosched` implícito | `await setImmediate()` |

**Cómo se garantiza el determinismo en cada caso.** Es el punto delicado y la solución es distinta
en cada lenguaje:

- **Python** usa `executor.map`, que devuelve los resultados en el orden de los elementos de
  entrada aunque terminen desordenados. El GIL impide el paralelismo real de CPU, pero el trabajo
  por pedido es diminuto y el cuello de botella real es el análisis del JSON y el coste de la
  conmutación de hilos.
- **Go** lanza una goroutine por pedido y las alimenta de un canal con búfer; cada goroutine
  escribe su resultado en el índice que le corresponde y el `WaitGroup` garantiza que todas
  terminan antes de cerrar el canal. El resultado es idéntico con cualquier planificador.
- **JS/TS** construye una promesa por pedido con `Promise.all`, que por definición entrega los
  resultados en el orden del arreglo original, y cada tarea cede el control con
  `await setImmediate()` para que el event loop pueda intercalar trabajo real.

**Medición (1000 pedidos, media de 5 repeticiones con calentamiento previo).**

| Lenguaje | Tiempo medio | Ventaja | Coste |
|---|---|---|---|
| JavaScript/TypeScript | 38.76 ms | V8 compila el bucle de validación a código máquina; la aritmética del dinero es entera | Un solo hilo: no hay paralelismo real |
| Go | 60.02 ms | Goroutines muy baratas y paralelismo real entre núcleos | El enrutamiento por HTTP y la serialización JSON en `encoding/json` son menos optimistas que V8 |
| Python | 103.31 ms | Expresividad y `Decimal` exacto sin escribir aritmética a mano | GIL, coste de los hilos y `Decimal` en Python |

Las tres cifras incluyen la misma carga: recibir el JSON de ~600 KB, validar, calcular y serializar
la respuesta. Ninguna mide solo el cálculo, que es la parte insignificantemente rápida. La
diferencia observada (2.7× entre el más rápido y el más lento) es real y reproducible, pero depende
de la máquina, del runtime y del tamaño del lote: con 10 pedidos las tres están entre 1.8 y 3.6 ms,
es decir, el coste se vuelve dominante frente a la trabajo.

**Conclusión sobre el requisito.** Los tres lenguajes cumplen el determinismo, pero lo cumples
por motivos distintos: por el orden de las colecciones (Python y JS) o por el diseño explícito
del índice (Go). Go es el único que puede aprovechar varios núcleos; JavaScript es el más rápido
en este dominio porque el trabajo es numérico y el JIT lo optimiza muy bien.

---

## 13. Resultados de pruebas

### 13.1 Suites

| Implementación | Comando | Casos | Framework |
|---|---|---|---|
| Python | `pytest -q` | 51 | pytest |
| Go | `go test ./...` | 41 (con subtests) | testing (stdlib) |
| JS/TS | `npm test` | 25 | vitest |

Las tres suites leen **los mismos fixtures** (`datos/casos_prueba.json` con los 5 casos comunes y
`datos/casos_borde.json` con los 10 casos borde) y los ejecutan contra las reglas de su
implementación. El número de casos reportados difiere porque cada framework cuenta de forma
distinta (pytest cuenta funciones, Go cuenta subtests, vitest agrupa por `describe`), pero la
**cobertura funcional es la misma**.

Contenido de cada suite:

| Bloque | Qué comprueba |
|---|---|
| Casos comunes | Cálculo válido (total exacto), cantidad <= 0, pedido sin items, VIP con subtotal >= 1000 (tope del 20 %) y transición de estado inválida |
| Casos borde | Envío "retiro", redondeos del IVA (499.99 y 999.99), umbral exacto de 1000, cantidad fraccionaria, cliente inexistente, enum inválido, transición válida, precio 0 |
| Unidad | Resumen, filtros, los tres órdenes, id duplicado, transiciones, matriz completa de estados, lote conservando el orden |
| Integración HTTP | Los siete endpoints, CORS, 404/405/409/400, preflight, cuerpo no válido |
| CLI | `run` con archivo y con stdout, error de E/S, argumentos inválidos, versión |

### 13.2 Equivalencia verificada

Además de las suites propias, se comparó **el comportamiento de las tres implementaciones entre
sí**, con el mismo dataset y las mismas peticiones:

```text
CLI python: rc=0   CLI go: rc=0   CLI js: rc=0
CLI go idéntico a python (bytes): True
CLI js idéntico a python (bytes): True
API /salud | /pedidos | ?estado | ?orden=monto|prioridad|fecha | ?clienteId | /pedidos/{id} | /resumen | /pedidos/inexistente | /pedidos/lote: idéntico
API error b'{"id":' → JSON_INVALIDO en los tres
API error b'[]'    → CUERPO_INVALIDO en los tres
RESULTADO EQUIVALENCIA TRES LENGUAJES: OK
```

### 13.3 Rendimiento (media de 5 repeticiones, calentamiento descartado)

| Lenguaje | 10 pedidos | 100 pedidos | 1000 pedidos |
|---|---|---|---|
| Python | 3.61 ms | 16.62 ms | 103.31 ms |
| Go | 1.76 ms | 7.45 ms | 60.02 ms |
| JavaScript/TypeScript | 2.02 ms | 5.48 ms | 38.76 ms |

Los tres devuelven **el mismo monto total** en cada dataset (8781.36, 194480.92 y 1936126.78), y
el propio benchmark lo comprueba y lo registra en la sección `coherencia` de
`benchmark_resultados.json`.

### 13.4 Tamaño del código

| Lenguaje | Ficheros | Líneas totales | Comentarios | LOC |
|---|---|---|---|---|
| Python | 8 | 1278 | 38 | 1037 |
| Go | 9 (+ `cmd/`) | 1873 | 125 | 1520 |
| JS/TS | 9 | 1529 | 71 | 1271 |

Python es el más compacto: la misma lógica cabe en un 32 % menos de líneas que Go. La diferencia
se explica en parte por el ruido propio de cada ecosistema (el CLI de Go y el de TypeScript tienen
código de argumentos más verboso) y en parte por el estilo de las validaciones: en Go y TypeScript
hay que distinguir explícitamente "campo ausente", "nulo" y "tipo incorrecto", mientras que en
Python la comprobación es más breve.

---

## 14. Ventajas y limitaciones

### 14.1 Python

**Ventajas**
- Sintaxis expresiva: las reglas de negocio se leen casi como el enunciado del requisito.
- El tipado dinámico permite iterar rápido sobre el dominio sin ceremonies de tipos.
- Las excepciones jerárquicas hacen que el flujo de error se exprese sin ensuciar el camino feliz.
- `Decimal` resuelve el dinero exacto sin código adicional.
- Ecosistema amplio para datos, automatización y prototipado.

**Limitaciones**
- El GIL impide el paralelismo real de CPU: el lote de 1000 pedidos fue el más lento (103 ms).
- Arranque lento y coste de memoria del intérprete.
- El tipado dinámico traslada los errores al momento de ejecución: un campo mal escrito solo falla
  cuando alguien lo lee.
- `Decimal` es comparatively lento frente a la aritmética entera.

### 14.2 Go

**Ventajas**
- Concurrencia real con primitivas de la biblioteca estándar: goroutines, canales y `WaitGroup`.
- El compilador obliga a gestionar los errores: no hay excepciones que se escapen sin querer.
- Binario estático, arranque instantáneo y despliegue sin dependencias.
- El tipado estático fuerte detecta en compilación los errores de forma de los datos.

**Limitaciones**
- El sistema de tipos es menos expresivo: sin uniones de tipos ni tipos sumideros.
- Sin herencia de clases ni operadores de sobrecarga: se models con composición y
  `embedding`, lo que puede resultar más verboso.
- `encoding/json` es correcto pero menos optimizado que el motor de V8 en rutas de serialización
  intensivas (60 ms frente a 39 ms con 1000 pedidos).
- El recolector de basura introduce pausas y complica el perfilado fino.

### 14.3 JavaScript / TypeScript

**Ventajas**
- El modelo asíncrono (`async`/`await`, `Promise.all`) expresa el paralelismo de forma secuencial
  y legible, sin callbacks anidados.
- Un mismo lenguaje para el servidor y el cliente: el frontend del proyecto comparte vocabulario
  con los backends.
- TypeScript aporta tipado estático en tiempo de compilación conLQ ergonomía gradual.
- El más rápido en este dominio (39 ms con 1000 pedidos), por el JIT de V8 y porque la aritmética
  del dinero es entera.

**Limitaciones**
- El event loop es monohilo: el paralelismo real exige `worker_threads` o procesos.
- Los tipos se borran al compilar: no protegen en tiempo de ejecución.
- `number` es IEEE 754: obliga aarithmetica entera o a una biblioteca decimal (aquí, microcentavos).
- El sistema de tipos gradual exige disciplina: el propio proyecto necesitó una clase `Importe`
  para distinguir importes de contadores en la serialización.

### 14.4 Cuadro resumen

| Criterio | Python | Go | JS/TS |
|---|---|---|---|
| Expresividad para el dominio | Muy alta | Media | Media-alta |
| Detección de errores antes de ejecutar | Baja | Alta | Alta (compilación) |
| Concurrencia real de CPU | No | Sí | No (hilo principal) |
| Velocidad medida (1000 pedidos) | 103.31 ms | 60.02 ms | 38.76 ms |
| Arranque del proceso | Lento | Instantáneo | Rápido |
| Tamaño del código (LOC) | 1037 | 1520 | 1271 |
| Verbosidad del código | Baja | Media | Media |
| Ecosistema y comunidad | Muy amplio | Amplio | Muy amplio |

---

## 15. Mantenibilidad y escalabilidad

### 15.1 Mantenibilidad

El proyecto se diseñó para que **cambiar una regla signifique cambiar tres sitios** (una
implementación por lenguaje) y para que ninguna de las tres pueda divergir sin que los tests lo
detecten:

- **Un contrato escrito y versionado** (`documentos/contratos-api.md`) y un JSON Schema por
  entidad (`datos/esquemas/`).
- **Fixtures compartidos**: los 5 casos comunes y los 10 casos borde se leen desde
  `datos/`, nunca se duplican en el código de test. Añadir un caso de negocio lo añade a los tres
  lenguajes a la vez.
- **Módulos con responsabilidad única** y sin dependencias circulares: dominio → reglas → almacén →
  adaptadores. En Go además lo exige `internal/`; en TypeScript, los `import` explícitos; en
  Python, el empaquetado de `src/`.
- **Errores como catálogo cerrado**: 22 códigos documentados, con mensajes idénticos en los tres
  lenguajes. Un mensaje nuevo es un cambio consciente en el contrato, no una variante accidental.
- **Documentación generada a partir de la realidad**: el análisis y el manual técnico citan
  archivos y cifras medidos, no Suposiciones.

Coste de mantenimiento observado: **Go es el más caro** (1520 LOC, 46 % más que Python) por el
esqueleto de la concurrencia explícita y por el manejo de errores explícito; **Python es el más
barato** en volumen de código; **TypeScript** queda en medio, con el coste añadido de mantener
`tsconfig` estricto y el serializador propio.

### 15.2 Escalabilidad

- **Horizontal.** El almacén es **en memoria y por proceso**: cada réplica de la API tiene su
  propio estado. Es la decisión correcta para una demo y para separar la lógica de negocio de la
  persistencia (el contrato no obliga a ningún almacén concreto), pero **no sirve para un
  despliegue con varias réplicas**: un `POST /pedidos` en una réplica no se ve en otra. La
  evolución natural es sustituir el almacén en memoria por uno compartido (PostgreSQL, Redis) sin
  tocar las reglas, porque la frontera ya está definida.
- **Vertical.** Go es el único que aprovecha varios núcleos en el lote; Python depende del GIL y
  JavaScript del event loop. En ambos casos, escalar el trabajo es tarea de la infraestructura
  (más réplicas) y no del código.
- **El lote es stateless a propósito.** `POST /pedidos/lote` no escribe en el almacén: eso permite
  repetir la misma petición N veces para medir (el benchmark lo hace) y evita que un lote massive
  contamine el estado. Consecuencia: no es idempotente respecto al almacén, por diseño.
- **Coste de la operación de lote.** Con 1000 pedidos el cuerpo JSON es de unos 600 KB; no hay
  límite de tamaño en el contrato. Un despliegue real debería paginar o aceptar un flujo
  (NDJSON, asíncrono) en lugar de un único JSON gigante.
- **Observabilidad.** El proyecto no incluye trazas ni métricas; el contrato ya expone `GET /salud`
  como punto de enganche para un sonda de vida, que es el mínimo imprescindible.

---

## 16. Conclusiones

1. **El contrato manda.** El mayor retorno del proyecto no fue elegir un lenguaje, sino escribir
   antes el contrato, los datos y los casos de prueba. Con eso, las tres implementaciones son
   intercambiables y sus diferencias se pueden medir en lugar de|width debatirse.
2. **La equivalencia es más exigente de lo que parece.** Conseguir salidas byte a byte idénticas
   obligó a tres decisiones no evidentes: representar el dinero en enteros exactos, fijar el orden
   de las claves y distinguir importes de contadores en la serialización. "Mismo resultado" y
   "mismo comportamiento observable" no son lo mismo.
3. **El dinero es el dominio donde los lenguajes se separan.** Ninguna de las tres elecciones
   tipográficas se pagaron solas: `Decimal` en Python, centavos más `big.Rat` en Go y
   microcentavos enteros en JavaScript. Quien use `float` a secas obtendrá totales que no cuadran
   entre servicios.
4. **El paralelismo es donde se ve la diferencia de paradigma.** Goroutines y canales dan paralelismo
   real con pocas líneas; `Promise.all` da concurrencia legible sobre un solo hilo; los hilos de
   Python con GIL dan concurrencia sin paralelismo. Los tres cumplen el determinismo, pero por
   mecanismos distintos.
5. **El tipado estático paga.** Go y TypeScript detectaron en compilación errores que en Python
   solo aparecen al ejecutar. También tienen un coste: más LOC, más ceremonia y, en el caso de
   Go, un modelo de errores explícito que hay que respetar.
6. **La ventaja de Python es la velocidad de desarrollo, no la de ejecución.** 1037 LOC frente a
   1520 y 1271, y el menor tiempo hasta el primer prototipo, a cambio del peor tiempo medido.
7. **JavaScript/TypeScript fue el más rápido en este dominio**, algo que contradice la idea
   intuitiva de que un lenguaje "de scripting" es lento: el JIT de V8, la aritmética entera y un
   modelo asíncrono bien usado son más que suficientes para procesar lotes de pedidos.
8. **La decisión final debería depender del contexto.** Para un servicio que arranca y para, con
   carga concurrente y despliegue simple, Go es el más cómodo; para un equipo con perfil de
   scripting y datos, Python es el más rápido; para un producto donde el backend comparte
   lenguaje con el frontend, TypeScript es el que menos contexto introduce.

---

## 17. Referencias

- Python Software Foundation. *Python Documentation* — módulos `decimal`, `threading`,
  `http.server`, `unittest`. <https://docs.python.org/3/>
- The Go Authors. *The Go Programming Language Specification* y *Effective Go*.
  <https://go.dev/ref/spec> · <https://go.dev/doc/effective_go>
- The Go Authors. *Go Standard Library* — `net/http`, `encoding/json`, `sync`, `math/big`.
  <https://pkg.go.dev>
- Microsoft. *TypeScript Handbook* — sistema de tipos, narrowing, `strict`.
  <https://www.typescriptlang.org/docs/handbook/intro.html>
- MDN Web Docs. *JavaScript Guide* — `Promise`, `async`/`await`, iterables y `Array.prototype`.
  <https://developer.mozilla.org/docs/Web/JavaScript/Guide>
- OpenJS Foundation. *Node.js Documentation* — `node:http`, `node:util` (`parseArgs`),
  `node:timers/promises`. <https://nodejs.org/docs/latest/api/>
- Vitest. *Documentation*. <https://vitest.dev/>
- pytest. *Documentation*. <https://docs.pytest.org/>
- Documentos internos del proyecto: `documentos/contratos-api.md` (contrato aprobado),
  `documentos/manual-tecnico.md` (manual de extensión y operación), `benchmark_resultados.json` y
  `loc_resultados.json` (medidas de esta máquina).

> **Nota para la exportación final:** este documento es un borrador técnico; antes de exportarlo a
> PDF conviene completar la portada con los datos reales del equipo y las referencias académicas
> (normas de estilo, textos de apoio) que la institución requiera.

---

*Fin del borrador · proyecto-polycode · 14 de noviembre de 2026*

