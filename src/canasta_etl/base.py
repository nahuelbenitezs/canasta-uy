"""Genera la base resumida que consulta la API."""

from __future__ import annotations

from pathlib import Path

import duckdb


def _literal(ruta: Path) -> str:
    return "'" + str(ruta).replace("'", "''") + "'"


def construir_base(limpios: Path, destino: Path) -> dict[str, int]:
    """Resume los precios a una fila por semana y local. Reemplaza la base solo si todo salió bien.

    Se guarda por local, y no por cadena, porque las medianas no se pueden combinar entre sí: la
    API necesita calcularlas con cualquier filtro de zona o cadena.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_name(destino.name + ".tmp")
    temporal.unlink(missing_ok=True)
    try:
        con = duckdb.connect(str(temporal))
        try:
            precios = f"read_parquet({_literal(limpios / 'precios.parquet')})"
            con.execute(
                f"""
                CREATE TABLE precios_semanales AS
                SELECT
                    date_trunc('week', fecha)::DATE AS semana,
                    id_producto,
                    id_establecimiento,
                    en_oferta,
                    round(median(precio), 2)::DOUBLE AS precio,
                    count(*)::SMALLINT AS dias
                FROM {precios}
                GROUP BY ALL
                ORDER BY id_producto, semana, id_establecimiento
                """
            )
            con.execute(
                f"""
                CREATE TABLE establecimientos AS
                SELECT * FROM read_parquet({_literal(limpios / "establecimientos.parquet")})
                WHERE id IN (SELECT id_establecimiento FROM precios_semanales)
                """
            )
            con.execute(
                f"""
                CREATE TABLE productos AS
                SELECT
                    *,
                    lower(strip_accents(concat_ws(' ', nombre, producto, marca))) AS texto_busqueda
                FROM read_parquet({_literal(limpios / "productos.parquet")})
                WHERE id IN (SELECT id_producto FROM precios_semanales)
                """
            )
            con.execute(
                f"""
                CREATE TABLE metadatos AS
                SELECT min(fecha) AS datos_desde, max(fecha) AS datos_hasta FROM {precios}
                """
            )
            filas, locales, productos = con.execute(
                """
                SELECT
                    (SELECT count(*) FROM precios_semanales),
                    (SELECT count(*) FROM establecimientos),
                    (SELECT count(*) FROM productos)
                """
            ).fetchone()
        finally:
            con.close()
        temporal.replace(destino)
    finally:
        temporal.unlink(missing_ok=True)
    return {"filas_semanales": filas, "locales": locales, "productos": productos}
