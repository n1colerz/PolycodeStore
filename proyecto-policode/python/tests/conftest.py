"""Configuración de pytest: rutas e imports del proyecto."""

import sys
from pathlib import Path

import pytest

RAIZ_PYTHON = Path(__file__).resolve().parents[1]
for ruta in (RAIZ_PYTHON, RAIZ_PYTHON / "tests"):
    if str(ruta) not in sys.path:
        sys.path.insert(0, str(ruta))

from ayudas import DIR_DATOS  # noqa: E402
from src.io_json import cargar_clientes  # noqa: E402


@pytest.fixture(scope="session")
def clientes() -> dict:
    return cargar_clientes(DIR_DATOS)
