from datetime import date
from pathlib import Path

import duckdb
import pytest

from canasta_etl.limpieza import limpiar_anio
from canasta_etl.validacion import validar_anio

HOY = date(2026, 6, 1)


@pytest.fixture
def limpios(crudos: Path, tmp_path: Path) -> Path:
    salida = tmp_path / "clean"
    limpiar_anio(crudos, salida)
    return salida


def por_nombre(limpios: Path, anio: int = 2026, hoy: date = HOY) -> dict:
    # Con tan pocas filas de ejemplo, las dos sin catálogo superan cualquier porcentaje realista.
    return {c.nombre: c for c in validar_anio(limpios, anio, hoy, max_sin_catalogo=1.0)}


def reescribir(ruta: Path, consulta: str) -> None:
    duckdb.sql(f"COPY ({consulta}) TO '{ruta}.nuevo' (FORMAT parquet)")
    Path(f"{ruta}.nuevo").replace(ruta)


def test_datos_correctos_aprueban(limpios: Path):
    controles = por_nombre(limpios)
    assert all(c.aprobado for c in controles.values())
    assert controles["establecimientos sin coordenadas (aviso)"].problemas == 2


def test_falla_si_hay_demasiados_precios_sin_catalogo(limpios: Path):
    controles = validar_anio(limpios, 2026, HOY)
    control = next(c for c in controles if "sin catálogo" in c.nombre)
    assert (control.problemas, control.aprobado) == (2, False)


def test_detecta_establecimiento_desconocido(limpios: Path):
    ruta = limpios / "establecimientos.parquet"
    reescribir(ruta, f"SELECT * FROM read_parquet('{ruta}') WHERE id <> 2")
    control = por_nombre(limpios)["precios con establecimiento desconocido"]
    assert (control.problemas, control.aprobado) == (1, False)


def test_detecta_producto_desconocido(limpios: Path):
    ruta = limpios / "productos.parquet"
    reescribir(ruta, f"SELECT * FROM read_parquet('{ruta}') WHERE id <> 11")
    assert not por_nombre(limpios)["precios con producto desconocido"].aprobado


def test_detecta_fecha_de_otro_anio_o_futura(limpios: Path):
    assert not por_nombre(limpios, anio=2025)["precios fuera del año o con fecha futura"].aprobado
    futuro = por_nombre(limpios, hoy=date(2026, 1, 2))
    assert futuro["precios fuera del año o con fecha futura"].problemas == 1


def test_detecta_coordenadas_fuera_de_uruguay(limpios: Path):
    ruta = limpios / "establecimientos.parquet"
    reescribir(ruta, f"SELECT * REPLACE (-10.0 AS latitud) FROM read_parquet('{ruta}')")
    assert not por_nombre(limpios)["coordenadas fuera de Uruguay"].aprobado


def test_detecta_texto_dañado(limpios: Path):
    ruta = limpios / "productos.parquet"
    reescribir(ruta, f"SELECT * REPLACE ('Az�car' AS nombre) FROM read_parquet('{ruta}')")
    assert not por_nombre(limpios)["texto con caracteres dañados"].aprobado


def test_precio_raro_es_aviso_y_no_bloquea(limpios: Path):
    ruta = limpios / "precios.parquet"
    reescribir(
        ruta,
        f"""
        SELECT * FROM read_parquet('{ruta}')
        UNION ALL SELECT 900 + i, TIMESTAMP '2026-02-01', DATE '2026-02-01', false, 100.00, 1, 11
                  FROM range(5) t(i)
        UNION ALL SELECT 999, TIMESTAMP '2026-02-02', DATE '2026-02-02', false, 9000.00, 1, 11
        """,
    )
    control = por_nombre(limpios)["precios 20 veces lejos de la mediana del producto (aviso)"]
    assert control.problemas == 1
    assert control.aprobado
