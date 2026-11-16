# Universidad Autónoma del Estado de Hidalgo

## Lenguajes de Programación

**Maestra:** Cornejo Velázquez Mónica  
**Actividad:** Proyecto Final  
**Aplicación:** PolycodeStore

### Integrantes

- Barrera López Alejandro
- Angeles Juarez Valentin
- Daniela Nicole Juarez Resendiz
- Hugo Said Cruz

---

## Resumen de participación por integrante

| Integrante | Fases | Implementaciones y archivos principales |
|---|---|---|
| **Barrera López Alejandro** | 0, 1, 2, 3, 4, 5 y 6 | Contrato y datos compartidos; Python: `modelos.py`, `reglas.py`, `errores.py`, `almacen.py`; Go: `internal/api/`, `internal/cli/`, `cmd/main.go`, pruebas y `go.mod`; JavaScript/TypeScript: `src/async.ts`, `src/almacen.ts`, `src/ioJson.ts`; equivalencia entre implementaciones; clasificación, paradigmas, arquitectura, estructuras de datos, errores y tipos; revisión y cierre. |
| **Angeles Juarez Valentin** | 0, 1, 2, 3, 4, 5 y 6 | Contrato y datos compartidos; Python: `io_json.py`, `api.py`, `cli.py`, pruebas y `requirements.txt`; Go: `internal/modelos/`, `internal/reglas/`, `dinero.go`, `internal/errores/`; JavaScript/TypeScript: frontend base e integración de resultados; benchmark final y métricas; ejecución, concurrencia, pruebas, ventajas y mantenibilidad; revisión y cierre. |
| **Daniela Nicole Juarez Resendiz** | 0, 1, 2, 3, 4, 5 y 6 | Contrato y datos compartidos; Python: generador de datasets y catálogos del frontend; Go: esqueleto de benchmark, equivalencia y documentación; JavaScript/TypeScript: modelos, reglas, dinero y errores; frontend comparativo; manual técnico, contrato, diagramas, evidencias y README; revisión y cierre. |
| **Hugo Said Cruz** | 0, 1, 2, 3, 4, 5 y 6 | Estructura inicial, `.gitignore` y README raíz; contrato y datos compartidos; Python: documentación inicial y revisión cruzada; Go: concurrencia, almacenamiento e I/O JSON; JavaScript/TypeScript: API, CLI y configuración de pruebas; análisis de benchmark; documento final y PDF; revisión y cierre. |

## Responsabilidades detalladas por fase

Los mensajes de commit de esta sección son ejemplos convencionales representativos de la contribución descrita; no constituyen una afirmación de que esos mensajes hayan sido registrados literalmente en el historial del repositorio.

| Fase | Integrante | Archivos/Módulos | Responsabilidad | Commits representativos |
|---|---|---|---|---|
| **Fase 0 – Contrato y datos compartidos** | Hugo Said Cruz | Estructura inicial del repositorio, `.gitignore`, `README.md` raíz, carpetas base | Preparar la estructura común del proyecto y la documentación inicial del repositorio. | `chore: crear estructura inicial del repositorio`<br>`docs: agregar README raíz del proyecto` |
| **Fase 0 – Contrato y datos compartidos** | Todos | `contratos-api.md`, `datos/esquemas/`, `clientes.json`, `productos.json`, `casos_prueba.json`, `casos_borde.json` | Revisar en conjunto el contrato, establecer los esquemas y preparar los datos y casos comunes para las tres implementaciones. | `docs: definir contrato común de la API`<br>`test: agregar datos y casos de prueba compartidos` |
| **Fase 1 – Implementación Python** | Barrera López Alejandro | `modelos.py`, `reglas.py`, `errores.py`, módulo de dinero con `Decimal`, `almacen.py` | Implementar modelos, reglas de negocio, errores, manejo de dinero decimal y almacenamiento de Python. | `feat(python): implementar modelos y reglas de negocio`<br>`feat(python): agregar dinero con Decimal y almacenamiento` |
| **Fase 1 – Implementación Python** | Angeles Juarez Valentin | `io_json.py`, `api.py`, `cli.py`, pruebas con pytest, `requirements.txt` | Implementar entrada/salida JSON, API y CLI; agregar pruebas automatizadas y declarar dependencias. | `feat(python): implementar API y CLI`<br>`test(python): agregar pruebas automatizadas con pytest` |
| **Fase 1 – Implementación Python** | Daniela Nicole Juarez Resendiz | `scripts/generar_datasets.py`, `frontend/datasets.js`, `frontend/catalogos.js` | Generar datasets y preparar los datos y catálogos utilizados por el frontend. | `feat(python): generar datasets para benchmarks`<br>`feat(frontend): agregar datasets y catálogos` |
| **Fase 1 – Implementación Python** | Hugo Said Cruz | `manual-tecnico.md` §1-2, README de Python | Redactar la documentación inicial de Python y realizar revisión cruzada de la implementación. | `docs: documentar introducción técnica de Python`<br>`docs(python): agregar README de implementación` |
| **Fase 2 – Implementación Go** | Angeles Juarez Valentin | `internal/modelos/`, `internal/reglas/`, `dinero.go`, `internal/errores/` | Implementar modelos, reglas, representación monetaria en centavos con `big.Rat` y errores de Go. | `feat(go): implementar modelos y reglas de negocio`<br>`feat(go): manejar dinero con centavos y big.Rat` |
| **Fase 2 – Implementación Go** | Hugo Said Cruz | `internal/concurrencia/lote.go`, `internal/almacen/`, `internal/iojson/` | Implementar procesamiento concurrente con goroutines, `WaitGroup` y canal; agregar almacenamiento e I/O JSON. | `feat(go): procesar lotes con goroutines y canales`<br>`feat(go): agregar almacenamiento e IO JSON` |
| **Fase 2 – Implementación Go** | Barrera López Alejandro | `internal/api/`, `internal/cli/`, `cmd/main.go`, pruebas de Go, `go.mod` | Implementar API, CLI y punto de entrada; configurar el módulo y las pruebas de Go. | `feat(go): implementar API y CLI`<br>`test(go): cubrir casos de negocio y errores` |
| **Fase 2 – Implementación Go** | Daniela Nicole Juarez Resendiz | `benchmark.py` (esqueleto), documentación de Go en `manual-tecnico.md` | Preparar el esqueleto de benchmark, verificar equivalencia entre Go y Python y documentar la implementación de Go. | `test(go): verificar equivalencia con Python`<br>`docs(go): documentar implementación y concurrencia` |
| **Fase 3 – Implementación JS/TypeScript** | Daniela Nicole Juarez Resendiz | `src/modelos.ts`, `src/reglas.ts`, `src/dinero.ts`, `src/errores.ts` | Implementar modelos, reglas de negocio, dinero en microcentavos y manejo de errores. | `feat(typescript): implementar modelos y reglas`<br>`feat(typescript): agregar dinero en microcentavos` |
| **Fase 3 – Implementación JS/TypeScript** | Barrera López Alejandro | `src/async.ts`, `src/almacen.ts`, `src/ioJson.ts` | Implementar asincronía con `Promise.all` y `setImmediate`, almacenamiento y serializador JSON propio. | `feat(typescript): procesar operaciones de forma asíncrona`<br>`feat(typescript): agregar almacenamiento y serializador JSON` |
| **Fase 3 – Implementación JS/TypeScript** | Hugo Said Cruz | `src/api.ts`, `src/cli.ts`, pruebas con Vitest, `package.json`, `tsconfig.json`, `vitest.config.ts` | Implementar API y CLI; configurar el proyecto y sus pruebas automatizadas con Vitest. | `feat(typescript): implementar API y CLI`<br>`test(typescript): configurar Vitest y pruebas` |
| **Fase 3 – Implementación JS/TypeScript** | Angeles Juarez Valentin | `frontend/index.html`, `app.js`, `styles.css`, integración de `benchmark_resultados.json` y `loc_resultados.json` | Crear la estructura y los estilos del frontend, e integrar los resultados de benchmark y métricas LOC. | `feat(frontend): integrar resultados de benchmark y LOC`<br>`feat(frontend): agregar estructura y estilos comparativos` |
| **Fase 4 – Benchmark, métricas y frontend** | Angeles Juarez Valentin | `scripts/benchmark.py`, `comparar_loc.py`, `benchmark_resultados.json`, `loc_resultados.json` | Finalizar la ejecución del benchmark y la comparación de líneas de código; generar los resultados correspondientes. | `feat(benchmark): finalizar medición de rendimiento`<br>`feat(metrics): generar comparación de líneas de código` |
| **Fase 4 – Benchmark, métricas y frontend** | Daniela Nicole Juarez Resendiz | Frontend comparativo | Desarrollar tablas y gráficas comparativas, presentar tiempos y LOC, y describir ventajas y limitaciones. | `feat(frontend): mostrar comparación de tiempos y LOC`<br>`feat(frontend): agregar ventajas y limitaciones` |
| **Fase 4 – Benchmark, métricas y frontend** | Barrera López Alejandro | CLI, 11 rutas HTTP, errores y pruebas de equivalencia | Verificar la equivalencia completa entre implementaciones (CLI byte a byte, 11 rutas HTTP y errores) y corregir discrepancias. | `test: verificar equivalencia de CLI y rutas HTTP`<br>`fix: corregir discrepancias entre implementaciones` |
| **Fase 4 – Benchmark, métricas y frontend** | Hugo Said Cruz | `analisis-comparativo.md` §13 | Documentar metodología, benchmark y resultados comparativos. | `docs: documentar benchmark y resultados comparativos` |
| **Fase 5 – Documentación final y evidencias** | Hugo Said Cruz | Documento final, portada, introducción, problema, reglas de negocio, justificación de lenguajes, conclusiones y referencias; PDF | Redactar las secciones asignadas del documento final y exportarlo a PDF. | `docs: completar secciones iniciales y conclusiones`<br>`docs: exportar documento final a PDF` |
| **Fase 5 – Documentación final y evidencias** | Barrera López Alejandro | Documento final: clasificación de lenguajes, paradigmas, arquitectura, estructuras de datos, manejo de errores y sistema de tipos | Documentar los fundamentos de los lenguajes y las decisiones técnicas de la aplicación. | `docs: describir lenguajes, paradigmas y arquitectura`<br>`docs: documentar tipos, estructuras y errores` |
| **Fase 5 – Documentación final y evidencias** | Angeles Juarez Valentin | Documento final: ejecución y compilación, concurrencia y asincronía, resultados de pruebas, ventajas y limitaciones, mantenibilidad y escalabilidad | Describir cómo ejecutar y compilar el proyecto y analizar pruebas y características de mantenimiento. | `docs: documentar ejecución, compilación y concurrencia`<br>`docs: analizar pruebas y mantenibilidad` |
| **Fase 5 – Documentación final y evidencias** | Daniela Nicole Juarez Resendiz | `manual-tecnico.md`, `contratos-api.md`, `diagramas.md`, `capturas/`, `videos/`, README raíz | Completar el manual y el contrato; preparar diagramas, evidencias y README raíz. | `docs: completar manual técnico y contrato de API`<br>`docs: agregar diagramas y evidencias del proyecto` |
| **Fase 6 – Cierre** | Todos | Repositorio y entregables finales | Realizar revisión cruzada, corregir errores, preparar commits finales y verificar el repositorio público y el PDF en `documentos/`. | `fix: corregir observaciones de revisión final`<br>`chore: verificar entregables y cerrar proyecto` |

## Justificación de la distribución

La distribución se organizó por fases y responsabilidades técnicas, manteniendo una participación de los cuatro integrantes en las tres implementaciones: Python, Go y JavaScript/TypeScript. En cada lenguaje se repartieron tareas de modelos y reglas, manejo de datos, interfaces de ejecución, pruebas, integración o documentación, de modo que cada integrante contribuyera al desarrollo multilenguaje y no únicamente a un componente aislado.

La carga se distribuyó de forma equitativa al asignar a cada integrante responsabilidades concretas en las implementaciones y en las etapas posteriores de integración, comparación, validación o documentación. Las tareas compartidas —como la revisión del contrato y de los datos comunes, la verificación final y el cierre— permitieron mantener criterios consistentes entre los módulos. Esta organización también facilitó la revisión cruzada y la comprobación de equivalencia funcional entre las versiones.

## Evidencias de commits

Los mensajes siguientes son ejemplos de evidencia en estilo convencional, organizados por integrante y fase. Deben entenderse como propuestas representativas de los cambios descritos y no como referencias a identificadores o mensajes comprobados en el historial de Git.

| Integrante | Fase | Ejemplos de mensajes de commit |
|---|---|---|
| Barrera López Alejandro | Fase 1 – Python | `feat(python): implementar modelos y reglas de negocio`<br>`feat(python): agregar almacenamiento y manejo monetario` |
| Barrera López Alejandro | Fase 2 – Go | `feat(go): implementar API y CLI`<br>`test(go): agregar pruebas de equivalencia` |
| Barrera López Alejandro | Fase 3 – JavaScript/TypeScript | `feat(typescript): agregar almacenamiento y serializador JSON`<br>`feat(typescript): implementar procesamiento asíncrono` |
| Barrera López Alejandro | Fase 4 – Verificación | `test: verificar CLI byte a byte y rutas HTTP`<br>`fix: corregir discrepancias entre lenguajes` |
| Barrera López Alejandro | Fase 5 – Documentación | `docs: describir arquitectura y paradigmas`<br>`docs: documentar sistema de tipos y manejo de errores` |
| Angeles Juarez Valentin | Fase 1 – Python | `feat(python): implementar API y CLI`<br>`test(python): agregar pruebas con pytest` |
| Angeles Juarez Valentin | Fase 2 – Go | `feat(go): implementar modelos y reglas`<br>`feat(go): representar dinero con centavos y big.Rat` |
| Angeles Juarez Valentin | Fase 3 – JavaScript/TypeScript | `feat(frontend): integrar resultados de benchmark y LOC` |
| Angeles Juarez Valentin | Fase 4 – Benchmark y métricas | `feat(benchmark): finalizar medición de rendimiento`<br>`feat(metrics): generar resultados de LOC` |
| Angeles Juarez Valentin | Fase 5 – Documentación | `docs: documentar ejecución y compilación`<br>`docs: analizar pruebas y escalabilidad` |
| Daniela Nicole Juarez Resendiz | Fase 1 – Python | `feat(python): generar datasets de prueba`<br>`feat(frontend): agregar datasets y catálogos` |
| Daniela Nicole Juarez Resendiz | Fase 2 – Go | `test(go): verificar equivalencia con Python`<br>`docs(go): documentar implementación` |
| Daniela Nicole Juarez Resendiz | Fase 3 – JavaScript/TypeScript | `feat(typescript): implementar modelos y reglas`<br>`feat(typescript): manejar dinero en microcentavos` |
| Daniela Nicole Juarez Resendiz | Fase 4 – Frontend comparativo | `feat(frontend): agregar tablas y gráficas comparativas`<br>`feat(frontend): presentar ventajas y limitaciones` |
| Daniela Nicole Juarez Resendiz | Fase 5 – Documentación y evidencias | `docs: completar manual técnico y contrato de API`<br>`docs: agregar diagramas y evidencias` |
| Hugo Said Cruz | Fase 0 – Estructura | `chore: crear estructura inicial del repositorio`<br>`docs: agregar README raíz` |
| Hugo Said Cruz | Fase 1 – Python | `docs(python): documentar implementación inicial` |
| Hugo Said Cruz | Fase 2 – Go | `feat(go): implementar concurrencia por lotes`<br>`feat(go): agregar almacenamiento e IO JSON` |
| Hugo Said Cruz | Fase 3 – JavaScript/TypeScript | `feat(typescript): implementar API y CLI`<br>`test(typescript): configurar pruebas con Vitest` |
| Hugo Said Cruz | Fase 4 – Análisis | `docs: documentar benchmark y resultados` |
| Hugo Said Cruz | Fase 5 – Documento final | `docs: completar introducción, problema y conclusiones`<br>`docs: exportar proyecto final a PDF` |
| Todos | Fases 0 y 6 – Trabajo compartido | `docs: revisar contrato y datos compartidos`<br>`fix: atender observaciones de revisión cruzada`<br>`chore: verificar entregables finales` |
