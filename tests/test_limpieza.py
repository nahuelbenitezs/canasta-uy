from decimal import Decimal
from pathlib import Path

import duckdb
import pytest

from canasta_etl.limpieza import limpiar_anio


@pytest.fixture
def limpios(crudos: Path, tmp_path: Path) -> Path:
    salida = tmp_path / "clean"
    limpiar_anio(crudos, salida)
    return salida


def filas(ruta: Path, columnas: str, orden: str = "id") -> list[tuple]:
    return duckdb.sql(f"SELECT {columnas} FROM read_parquet('{ruta}') ORDER BY {orden}").fetchall()


def test_coordenadas_invertidas_sin_signo_o_correctas(limpios: Path):
    coordenadas = dict(
        (id_, (lat, lon))
        for id_, lat, lon in filas(limpios / "establecimientos.parquet", "id, latitud, longitud")
    )
    assert coordenadas[1] == (-34.8765, -56.1897)  # el archivo las trae invertidas
    assert coordenadas[2] == (-34.8867, -56.185)  # latitud sin signo negativo
    assert coordenadas[6] == (-34.90, -56.16)  # orden correcto, no se tocan


@pytest.mark.parametrize("id_sin_coordenadas", [3, 4])
def test_coordenadas_nulas_o_dañadas_quedan_vacias(limpios: Path, id_sin_coordenadas: int):
    coordenadas = {
        id_: (lat, lon)
        for id_, lat, lon in filas(limpios / "establecimientos.parquet", "id, latitud, longitud")
    }
    assert coordenadas[id_sin_coordenadas] == (None, None)


def test_catalogos_conservan_acentos(limpios: Path):
    razon, sucursal, barrio = filas(
        limpios / "establecimientos.parquet", "razon_social, sucursal, barrio"
    )[0]
    assert (razon, sucursal, barrio) == ("Compañía S.A.", "Sucursal Ñandú", "Peñarol")
    assert filas(limpios / "productos.parquet", "marca")[0] == ("Bella Unión",)
    assert filas(limpios / "productos.parquet", "especificacion")[2] == ("Azul – negro",)


def test_separa_unidades_pegadas_en_productos(limpios: Path):
    assert filas(limpios / "productos.parquet", "nombre, especificacion")[1] == (
        "Café Sin marca Frasco 170 g",
        "Frasco 170 g",
    )


def test_cadenas_normalizadas_y_tipo(limpios: Path):
    resultado = dict(filas(limpios / "establecimientos.parquet", "id, cadena"))
    assert resultado[2] == "Planeta"
    assert resultado[3] == resultado[4] == "Géant"
    assert resultado[6] == "Sin cadena"
    tipos = dict(filas(limpios / "establecimientos.parquet", "id, tipo"))
    assert tipos[1] == "supermercado"
    assert tipos[5] == "farmacia"


def test_cantidad_de_cajas_invalida_queda_vacia(limpios: Path):
    cajas = dict(filas(limpios / "establecimientos.parquet", "id, cajas"))
    assert cajas[1] == 2
    assert cajas[6] is None


def test_precios_conserva_lo_valido_y_la_ultima_declaracion(limpios: Path):
    assert filas(
        limpios / "precios.parquet",
        "id, en_oferta, precio, id_establecimiento, id_producto",
    ) == [
        (101, False, Decimal("52.00"), 1, 10),  # la declaración de las 9 reemplaza a la de las 4
        (102, True, Decimal("40.00"), 1, 10),  # la oferta convive con el precio normal del día
        (107, False, Decimal("210.00"), 2, 11),
    ]


def test_resumen_explica_todas_las_filas(crudos: Path, tmp_path: Path):
    resumen = limpiar_anio(crudos, tmp_path / "clean")
    assert resumen == {
        "filas_leidas": 10,
        "filas_invalidas": 2,
        "filas_no_minoristas": 2,
        "filas_sin_catalogo": 2,
        "filas_repetidas": 1,
        "filas_guardadas": 3,
    }


def test_un_error_no_pisa_el_resultado_anterior(crudos: Path, tmp_path: Path):
    salida = tmp_path / "clean"
    limpiar_anio(crudos, salida)
    antes = (salida / "precios.parquet").read_bytes()
    (crudos / "precios.csv").unlink()
    with pytest.raises(duckdb.Error):
        limpiar_anio(crudos, salida)
    assert (salida / "precios.parquet").read_bytes() == antes
    assert not list(salida.glob("*.tmp.parquet"))
