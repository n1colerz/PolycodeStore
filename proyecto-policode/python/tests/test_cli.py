"""Pruebas del CLI `run` (proceso real)."""

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

from ayudas import DIR_DATOS, RAIZ_PYTHON, cargar_json, importe

C1 = next(c for c in cargar_json("casos_prueba.json")["casos"] if c["id"] == "C1")


def _ejecutar(argumentos: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "src.cli", *argumentos],
        cwd=RAIZ_PYTHON,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
    )


def test_run_escribe_archivo_de_salida(tmp_path: Path) -> None:
    entrada = tmp_path / "entrada.json"
    salida = tmp_path / "salida.json"
    pedido = deepcopy(C1["entrada"])
    pedido["id"] = "PED-CLI-01"
    entrada.write_text(
        json.dumps({"pedidos": [pedido]}, ensure_ascii=False), encoding="utf-8"
    )

    resultado = _ejecutar(
        [
            "run",
            "--entrada",
            str(entrada),
            "--salida",
            str(salida),
            "--datos",
            str(DIR_DATOS),
            "--trabajadores",
            "2",
        ]
    )

    assert resultado.returncode == 0, resultado.stderr
    datos = json.loads(salida.read_text(encoding="utf-8"))
    assert datos["resumen"]["exitosos"] == 1
    assert datos["resultados"][0]["pedido"]["id"] == "PED-CLI-01"
    assert importe(datos["resultados"][0]["pedido"]["calculos"]["total"]) == importe(
        "719.20"
    )


def test_run_escribe_stdout_sin_salida(tmp_path: Path) -> None:
    entrada = tmp_path / "entrada.json"
    pedido = deepcopy(C1["entrada"])
    pedido["id"] = "PED-CLI-02"
    entrada.write_text(json.dumps([pedido], ensure_ascii=False), encoding="utf-8")

    resultado = _ejecutar(
        ["run", "--entrada", str(entrada), "--datos", str(DIR_DATOS)]
    )

    assert resultado.returncode == 0, resultado.stderr
    datos = json.loads(resultado.stdout)
    assert datos["resultados"][0]["pedido"]["id"] == "PED-CLI-02"


def test_run_archivo_inexistente_falla(tmp_path: Path) -> None:
    resultado = _ejecutar(
        [
            "run",
            "--entrada",
            str(tmp_path / "no-existe.json"),
            "--datos",
            str(DIR_DATOS),
        ]
    )

    assert resultado.returncode == 1
    assert "Error:" in resultado.stderr


def test_version() -> None:
    resultado = _ejecutar(["--version"])
    assert resultado.returncode == 0
    assert "0.1.0" in resultado.stdout
