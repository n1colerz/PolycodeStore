# Manual técnico — proyecto-polycode
## 1. Requisitos

| Componente | Versión mínima | Instalación |
|---|---|---|
| Python | 3.10 | `pip install -r python/requirements.txt` (solo `pytest`, en desarrollo) |
| Go | 1.24 | sin dependencias externas |
| Node.js | 20 | `npm install` en `js-ts/` (solo dependencias de desarrollo) |
| Python (servidor estático del frontend) | 3.10 | `python -m http.server` |

## 2. Correer

Tres terminales para los backends y una para el frontend:

```bash
# 1) Python en http://127.0.0.1:8001
cd python && pip install -r requirements.txt && python -m src.cli serve --datos ../datos