"""Convierte los CSV crudos del SIPC en archivos Parquet limpios."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb

# Límites de Uruguay. Los rangos de latitud y longitud no se superponen, así que alcanzan para
# saber qué es cada valor aunque el archivo los traiga invertidos o sin el signo negativo.
LAT_MIN, LAT_MAX = 30.0, 35.2
LON_MIN, LON_MAX = 53.0, 58.7

TIPOS_POR_CADENA = {
    "Farmashop": "farmacia",
    "FarmaGlobal": "farmacia",
    "Macromercado Mayorista": "mayorista",
    "Central Mayorista": "mayorista",
    "PedidosYa": "delivery",
}


def _literal(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def _a_utf8(origen: Path, destino: Path) -> None:
    """Los catálogos vienen en Windows-1252: traen guiones (0x96) que Latin-1 no admite."""
    destino.write_text(origen.read_bytes().decode("cp1252"), encoding="utf-8", newline="")


def _limpiar_establecimientos(con: duckdb.DuckDBPyConnection, csv: Path, salida: Path) -> None:
    casos_tipo = " ".join(
        f"WHEN {_literal(cadena)} THEN {_literal(tipo)}"
        for cadena, tipo in TIPOS_POR_CADENA.items()
    )
    con.execute(
        f"""
        COPY (
            WITH crudo AS MATERIALIZED (
                SELECT *,
                    abs(try_cast(replace("long", ',', '.') AS DOUBLE)) AS a,
                    abs(try_cast(replace("lat", ',', '.') AS DOUBLE)) AS b,
                    regexp_replace(trim(cadena), '\\s+', ' ', 'g') AS cadena_recortada
                FROM read_csv({_literal(str(csv))}, delim=';', header=true, all_varchar=true,
                              nullstr=['NULL', ''])
            ),
            normal AS (
                SELECT *,
                    CASE WHEN cadena_recortada IN ('Geant', 'Géant') THEN 'Géant'
                         WHEN cadena_recortada = 'Sin Cadena' THEN 'Sin cadena'
                         ELSE cadena_recortada END AS cadena_limpia,
                    a BETWEEN {LAT_MIN} AND {LAT_MAX} AND b BETWEEN {LON_MIN} AND {LON_MAX}
                        AS invertida,
                    b BETWEEN {LAT_MIN} AND {LAT_MAX} AND a BETWEEN {LON_MIN} AND {LON_MAX}
                        AS correcta
                FROM crudo
            )
            SELECT
                cast("id.establecimientos" AS INTEGER) AS id,
                trim("razon.social") AS razon_social,
                trim("nombre.sucursal") AS sucursal,
                trim(direccion) AS direccion,
                trim(barrio) AS barrio,
                trim(ciudad) AS ciudad,
                trim(depto) AS departamento,
                cadena_limpia AS cadena,
                CASE cadena_limpia {casos_tipo} ELSE 'supermercado' END AS tipo,
                try_cast(cajas AS INTEGER) AS cajas,
                try_cast(replace("superficie (m2)", ',', '.') AS DOUBLE) AS superficie_m2,
                CASE WHEN invertida THEN -a WHEN correcta THEN -b END AS latitud,
                CASE WHEN invertida THEN -b WHEN correcta THEN -a END AS longitud
            FROM normal
        ) TO {_literal(str(salida))} (FORMAT parquet, COMPRESSION zstd)
        """
    )


def _limpiar_productos(con: duckdb.DuckDBPyConnection, csv: Path, salida: Path) -> None:
    con.execute(
        f"""
        COPY (
            SELECT
                cast("id.producto" AS INTEGER) AS id,
                trim(producto) AS producto,
                trim(marca) AS marca,
                trim(especificacion) AS especificacion,
                trim(nombre) AS nombre
            FROM read_csv({_literal(str(csv))}, delim=';', header=true, all_varchar=true,
                          nullstr=['NULL', ''])
        ) TO {_literal(str(salida))} (FORMAT parquet, COMPRESSION zstd)
        """
    )


def _limpiar_precios(
    con: duckdb.DuckDBPyConnection, csv: Path, establecimientos: Path, productos: Path, salida: Path
) -> dict[str, int]:
    """Deja solo precios minoristas válidos y una fila por sucursal, producto, día y tipo.

    Un precio sin su producto o sucursal en el catálogo no se puede mostrar, así que se descarta
    y se cuenta. La validación falla si esos descartes dejan de ser una excepción.
    """
    # DuckDB lleva los try_cast directos al lector de CSV, que falla en vez de devolver NULL.
    # El CTE materializado impide esa optimización y deja contar los valores inválidos.
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE crudo AS
        WITH texto AS MATERIALIZED (
            SELECT * FROM read_csv({_literal(str(csv))}, delim=',', quote='"', header=true,
                                   all_varchar=true, nullstr='\\N', allow_quoted_nulls=true)
        )
        SELECT
            try_cast("ID_PrecioDiario" AS BIGINT) AS id,
            try_cast("Declaracion" AS TIMESTAMP) AS declarado_en,
            try_cast("Fecha" AS DATE) AS fecha,
            try_cast("Oferta" AS INTEGER) AS oferta,
            try_cast("Precio" AS DECIMAL(12, 2)) AS precio,
            "Publico" AS publico,
            "Feria_id" AS feria,
            try_cast("Establecimiento" AS INTEGER) AS id_establecimiento,
            try_cast("Presentacion_Producto" AS INTEGER) AS id_producto
        FROM texto
        """
    )
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE clasificado AS
        SELECT *,
            CASE
                WHEN id IS NULL OR fecha IS NULL OR oferta IS NULL OR oferta NOT IN (0, 1)
                    OR precio IS NULL OR precio <= 0
                    OR id_establecimiento IS NULL OR id_producto IS NULL THEN 'invalida'
                WHEN publico IS NOT NULL OR feria IS NOT NULL THEN 'no_minorista'
                WHEN id_establecimiento NOT IN (
                        SELECT id FROM read_parquet({_literal(str(establecimientos))}))
                    OR id_producto NOT IN (
                        SELECT id FROM read_parquet({_literal(str(productos))})) THEN 'sin_catalogo'
            END AS descarte
        FROM crudo
        """
    )
    leidas, invalidas, no_minoristas, sin_catalogo = con.execute(
        """
        SELECT
            count(*),
            count(*) FILTER (WHERE descarte = 'invalida'),
            count(*) FILTER (WHERE descarte = 'no_minorista'),
            count(*) FILTER (WHERE descarte = 'sin_catalogo')
        FROM clasificado
        """
    ).fetchone()
    con.execute(
        f"""
        COPY (
            SELECT id, declarado_en, fecha, oferta = 1 AS en_oferta, precio,
                   id_establecimiento, id_producto
            FROM clasificado
            WHERE descarte IS NULL
            QUALIFY row_number() OVER (
                PARTITION BY fecha, id_establecimiento, id_producto, oferta
                ORDER BY declarado_en DESC NULLS LAST, id DESC
            ) = 1
            ORDER BY fecha, id_producto, id_establecimiento
        ) TO {_literal(str(salida))} (FORMAT parquet, COMPRESSION zstd)
        """
    )
    guardadas = con.execute(
        f"SELECT count(*) FROM read_parquet({_literal(str(salida))})"
    ).fetchone()[0]
    con.execute("DROP TABLE clasificado")
    con.execute("DROP TABLE crudo")
    return {
        "filas_leidas": leidas,
        "filas_invalidas": invalidas,
        "filas_no_minoristas": no_minoristas,
        "filas_sin_catalogo": sin_catalogo,
        "filas_repetidas": leidas - guardadas - invalidas - no_minoristas - sin_catalogo,
        "filas_guardadas": guardadas,
    }


def limpiar_anio(crudos: Path, limpios: Path) -> dict[str, int]:
    """Procesa los tres CSV de un año. El resultado aparece solo si todo terminó bien."""
    limpios.mkdir(parents=True, exist_ok=True)
    temporales = {
        nombre: limpios / f"{nombre}.tmp.parquet"
        for nombre in ("establecimientos", "productos", "precios")
    }
    establecimientos_utf8 = limpios / "establecimientos.tmp.csv"
    productos_utf8 = limpios / "productos.tmp.csv"
    try:
        _a_utf8(crudos / "establecimientos.csv", establecimientos_utf8)
        _a_utf8(crudos / "productos.csv", productos_utf8)
        con = duckdb.connect()
        try:
            con.execute(f"SET temp_directory = {_literal(str(limpios / 'tmp_duckdb'))}")
            _limpiar_establecimientos(con, establecimientos_utf8, temporales["establecimientos"])
            _limpiar_productos(con, productos_utf8, temporales["productos"])
            resumen = _limpiar_precios(
                con,
                crudos / "precios.csv",
                temporales["establecimientos"],
                temporales["productos"],
                temporales["precios"],
            )
        finally:
            con.close()
        for nombre, temporal in temporales.items():
            temporal.replace(limpios / f"{nombre}.parquet")
    finally:
        for temporal in (*temporales.values(), establecimientos_utf8, productos_utf8):
            temporal.unlink(missing_ok=True)
    (limpios / "resumen.json").write_text(json.dumps(resumen, indent=2), "utf-8")
    return resumen
