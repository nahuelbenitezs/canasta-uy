import json
from pathlib import Path

import pytest
from test_api import escribir_crudos

from canasta_etl.base import construir_base
from canasta_etl.exportar import exportar_datos
from canasta_etl.limpieza import limpiar_anio


@pytest.fixture
def base(tmp_path: Path) -> Path:
    escribir_crudos(tmp_path / "raw")
    limpiar_anio(tmp_path / "raw", tmp_path / "clean")
    ruta = tmp_path / "canasta.duckdb"
    construir_base(tmp_path / "clean", ruta)
    return ruta


def test_exporta_catalogo_y_matrices_sin_ofertas(base: Path, tmp_path: Path):
    destino = tmp_path / "datos"
    assert exportar_datos(base, destino) == {"archivos_de_precios": 2}
    catalogo = json.loads((destino / "catalogo.json").read_text("utf-8"))
    assert catalogo["salud"]["datos_hasta"] == "2026-09-30"
    assert [p["id"] for p in catalogo["destacados"]] == [10]
    assert {local["id"]: local["tipo"] for local in catalogo["locales"]}[5] == "farmacia"
    matriz = json.loads((destino / "precios" / "10.json").read_text("utf-8"))
    assert matriz["semanas"] == ["2026-08-03", "2026-09-07", "2026-09-28"]
    assert matriz["locales"] == [1, 2, 3, 4, 5, 6]
    assert matriz["precios"][0] == [None, 95.0, 100.0]  # sin la oferta de 60


def test_reemplaza_una_exportacion_anterior(base: Path, tmp_path: Path):
    destino = tmp_path / "datos"
    exportar_datos(base, destino)
    sobrante = destino / "precios" / "999.json"
    sobrante.write_text("{}", "utf-8")
    exportar_datos(base, destino)
    assert not sobrante.exists()


def test_no_borra_una_carpeta_ajena(base: Path, tmp_path: Path):
    destino = tmp_path / "importante"
    destino.mkdir()
    (destino / "archivo.txt").write_text("no tocar", "utf-8")
    with pytest.raises(ValueError, match="no se reemplaza"):
        exportar_datos(base, destino)
    assert (destino / "archivo.txt").read_text("utf-8") == "no tocar"


def test_un_error_conserva_la_exportacion_anterior(base: Path, tmp_path: Path):
    destino = tmp_path / "datos"
    exportar_datos(base, destino)
    with pytest.raises(Exception):  # noqa: B017
        exportar_datos(tmp_path / "no-existe" / "base.duckdb", destino)
    assert (destino / "catalogo.json").exists()
    assert not (tmp_path / "datos.tmp").exists()
