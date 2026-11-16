"""Los 10 casos borde definidos en datos/casos_borde.json."""

import pytest

from ayudas import cargar_json, verificar_caso

CASOS = cargar_json("casos_borde.json")["casos"]


def test_hay_diez_casos_borde() -> None:
    assert len(CASOS) == 10


@pytest.mark.parametrize("caso", CASOS, ids=[caso["id"] for caso in CASOS])
def test_caso_borde(caso: dict, clientes: dict) -> None:
    verificar_caso(caso, clientes)
