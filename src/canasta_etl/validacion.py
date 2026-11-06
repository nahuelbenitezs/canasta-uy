"""Controles sobre los Parquet limpios antes de usarlos."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import duckdb

UMBRAL_PRECIO_RARO = 20
MAX_SIN_CATALOGO = 0.001


@dataclass(frozen=True)
class Control:
    nombre: str
    problemas: int
    grave: bool

    @property
    def aprobado(self) -> bool:
        return self.problemas == 0 or not self.grave


def validar_anio(
    limpios: Path,
    anio: int,
    hoy: date | None = None,
    max_sin_catalogo: float = MAX_SIN_CATALOGO,
) -> list[Control]:
    hoy = hoy or date.today()
    resumen = json.loads((limpios / "resumen.json").read_text("utf-8"))
    sin_catalogo = resumen["filas_sin_catalogo"]
    exceso_sin_catalogo = (
        sin_catalogo if sin_catalogo > resumen["filas_leidas"] * max_sin_catalogo else 0
    )
    con = duckdb.connect()
    try:
        for tabla in ("establecimientos", "productos", "precios"):
            ruta = str(limpios / f"{tabla}.parquet").replace("'", "''")
            con.execute(f"CREATE VIEW {tabla} AS SELECT * FROM read_parquet('{ruta}')")

        def contar(consulta: str, parametros: list | None = None) -> int:
            return con.execute(consulta, parametros or []).fetchone()[0]

        vacias = sum(
            contar(f"SELECT count(*) = 0 FROM {tabla}")
            for tabla in ("establecimientos", "productos", "precios")
        )
        controles = [
            Control("tablas con datos", vacias, True),
            Control(
                f"demasiados precios sin catálogo (más de {max_sin_catalogo:.1%})",
                exceso_sin_catalogo,
                True,
            ),
            Control(
                "ID de precio repetido",
                contar("SELECT count(*) - count(DISTINCT id) FROM precios"),
                True,
            ),
            Control(
                "ID de establecimiento repetido",
                contar("SELECT count(*) - count(DISTINCT id) FROM establecimientos"),
                True,
            ),
            Control(
                "ID de producto repetido",
                contar("SELECT count(*) - count(DISTINCT id) FROM productos"),
                True,
            ),
            Control(
                "precios con establecimiento desconocido",
                contar(
                    "SELECT count(*) FROM precios p ANTI JOIN establecimientos e "
                    "ON p.id_establecimiento = e.id"
                ),
                True,
            ),
            Control(
                "precios con producto desconocido",
                contar(
                    "SELECT count(*) FROM precios p ANTI JOIN productos r ON p.id_producto = r.id"
                ),
                True,
            ),
            Control(
                "precios fuera del año o con fecha futura",
                contar(
                    "SELECT count(*) FROM precios WHERE year(fecha) <> ? OR fecha > ?",
                    [anio, hoy],
                ),
                True,
            ),
            Control(
                "precios menores o iguales a cero",
                contar("SELECT count(*) FROM precios WHERE precio <= 0"),
                True,
            ),
            Control(
                "coordenadas fuera de Uruguay",
                contar(
                    "SELECT count(*) FROM establecimientos WHERE latitud IS NOT NULL AND ("
                    "latitud NOT BETWEEN -35.2 AND -30 OR longitud NOT BETWEEN -58.7 AND -53)"
                ),
                True,
            ),
            Control(
                "texto con caracteres dañados",
                contar(
                    "SELECT (SELECT count(*) FROM establecimientos WHERE contains("
                    "concat_ws('', razon_social, sucursal, direccion, barrio, cadena), '�'))"
                    " + (SELECT count(*) FROM productos WHERE contains(nombre, '�'))"
                ),
                True,
            ),
            Control(
                "establecimientos sin coordenadas (aviso)",
                contar("SELECT count(*) FROM establecimientos WHERE latitud IS NULL"),
                False,
            ),
            Control(
                f"precios {UMBRAL_PRECIO_RARO} veces lejos de la mediana del producto (aviso)",
                contar(
                    f"""
                    WITH medianas AS (
                        SELECT id_producto, median(precio) AS mediana
                        FROM precios GROUP BY id_producto
                    )
                    SELECT count(*) FROM precios p JOIN medianas m USING (id_producto)
                    WHERE p.precio > m.mediana * {UMBRAL_PRECIO_RARO}
                       OR p.precio * {UMBRAL_PRECIO_RARO} < m.mediana
                    """
                ),
                False,
            ),
        ]
    finally:
        con.close()
    return controles
