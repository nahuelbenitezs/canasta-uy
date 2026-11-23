import json
from datetime import date
from types import SimpleNamespace

import pytest

from canasta_etl import recientes
from canasta_etl.recientes import resumir

HOY = date(2026, 11, 23)
CATALOGO = [{"id": 2, "producto": "Aceite de girasol"}]
ARTICULO = {"articleId": 2, "p10": 85, "p50": 100, "p90": 110, "n": 25}


def test_asocia_por_id_oficial_y_conserva_fecha_de_fuente():
    resumen = resumir({"day": "2026-11-21", "articles": [ARTICULO]}, CATALOGO, HOY)
    assert resumen["actualizado"] == "2026-11-21"
    assert resumen["productos"] == {"2": {"p10": 85, "mediana": 100, "p90": 110, "locales": 25}}


@pytest.mark.parametrize("dia", ["2026-11-15", "2026-11-24"])
def test_rechaza_feeds_viejos_o_futuros(dia):
    with pytest.raises(ValueError, match="fuera de los últimos siete días"):
        resumir({"day": dia, "articles": [ARTICULO]}, CATALOGO, HOY)


@pytest.mark.parametrize("cambio", [{"articleId": 300}, {"p50": 150}, {"n": -1}])
def test_rechaza_articulos_incompatibles_o_con_datos_invalidos(cambio):
    with pytest.raises(ValueError, match="registros válidos"):
        resumir({"day": "2026-11-23", "articles": [ARTICULO | cambio]}, CATALOGO, HOY)


def test_no_retrocede_la_fecha_al_recibir_un_resumen_atrasado(tmp_path, monkeypatch):
    (tmp_path / "catalogo.json").write_text(json.dumps({"productos": CATALOGO}), "utf-8")
    resumen = tmp_path / "recientes.json"
    anterior = resumir({"day": "2026-11-23", "articles": [ARTICULO]}, CATALOGO, HOY)
    resumen.write_text(json.dumps(anterior), "utf-8")
    respuesta = SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"day": "2026-11-22", "articles": [ARTICULO | {"p50": 95}]},
    )
    monkeypatch.setattr(recientes.requests, "get", lambda *args, **kwargs: respuesta)

    assert recientes.actualizar(tmp_path, HOY) == anterior
    assert json.loads(resumen.read_text("utf-8")) == anterior
