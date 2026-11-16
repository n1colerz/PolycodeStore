"""Los 5 casos comunes definidos en datos/casos_prueba.json."""

import pytest

from ayudas import cargar_json, verificar_caso

CASOS = cargar_json("casos_prueba.json")["casos"]


def test_hay_cinco_casos_comunes() -> None:
    assert len(CASOS) == 5


@pytest.mark.parametrize("caso", CASOS, ids=[caso["id"] for caso in CASOS])
def test_caso_comun(caso: dict, clientes: dict) -> None:
    verificar_caso(caso, clientes)
