# Evidencias

Material de apoyo para la defensa del proyecto. Lo rellena la persona responsable (el contenido
es visual y depende del entorno de grabación).

## `capturas/`

Capturas de pantalla del frontend con las tres APIs levantadas. Sugerencias:

| Archivo | Qué debe mostrar |
|---|---|
| `01-lista-pedidos.png` | Vista **Pedidos** con filtros aplicados y la tabla de las tres APIs operativas (insignias verdes en la cabecera). |
| `02-formulario-nuevo-pedido.png` | Vista **Nuevo pedido** con un item y la validación del cliente. |
| `03-errores-tres-apis.png` | El mismo pedido con un dato inválido enviado a las tres APIs: las tres tarjetas muestran el mismo `{codigo, mensaje, campo}`. |
| `04-comparativa.png` | Vista **Comparativa** después de pulsar «Comparar»: tabla con tiempos, montos, LOC y paradigmas, y el gráfico de barras. |
| `05-benchmark-consola.png` | Salida de `python scripts/benchmark.py --repeticiones 5` con la tabla de tiempos y la sección de coherencia. |
| `06-loc-consola.png` | Salida de `python scripts/comparar_loc.py`. |

Cómo capturarlas:

```bash
# 1) Levantar las tres APIs y el servidor estático (ver README.md)
# 2) Abrir http://127.0.0.1:8080/frontend/ y tomar las capturas
# 3) Guardar los PNG en esta carpeta con los nombres indicados
```

## `videos/`

Grabaciones breves (2–4 minutos) sugeridas:

1. **Demostración funcional**: crear un pedido desde el frontend y ver las tres APIs responder con el
   mismo total; provocar un error y ver las tres tarjetas con el mismo mensaje.
2. **Comparativa**: ejecutar «Comparar» con los tres datasets y explicar la lectura del gráfico.
3. **Equivalencia**: ejecutar el CLI de los tres lenguajes sobre el mismo archivo y comparar las
   salidas byte a byte (`diff` de los JSON generados).
4. **Tests**: ejecución de `pytest`, `go test` y `npm test` con las suites en verde.

Convenciones: PNG sin metadatos personales, voz narrative si el video lleva audio y resolución
mínima 1280×720.
