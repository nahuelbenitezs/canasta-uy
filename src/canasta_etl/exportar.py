"""Exporta la base resumida a archivos JSON para publicar la web sin servidor."""

from __future__ import annotations

import json
import shutil
from itertools import groupby
from pathlib import Path

import duckdb


def _escribir(ruta: Path, datos: object) -> None:
    ruta.write_text(
        json.dumps(datos, ensure_ascii=False, separators=(",", ":"), default=str), "utf-8"
    )


def _filas(con: duckdb.DuckDBPyConnection, consulta: str) -> list[dict]:
    cursor = con.execute(consulta)
    columnas = [columna[0] for columna in cursor.description]
    return [dict(zip(columnas, fila, strict=True)) for fila in cursor.fetchall()]


def _matrices(con: duckdb.DuckDBPyConnection, carpeta: Path) -> int:
    """Escribe un archivo por producto con el precio habitual de cada local por semana."""
    filas = con.execute(
        """
        SELECT id_producto, semana, id_establecimiento, precio
        FROM precios_semanales
        WHERE NOT en_oferta
        ORDER BY id_producto, id_establecimiento, semana
        """
    ).fetchall()
    cantidad = 0
    for id_producto, grupo in groupby(filas, key=lambda fila: fila[0]):
        registros = list(grupo)
        semanas = sorted({fila[1] for fila in registros})
        indice = {semana: i for i, semana in enumerate(semanas)}
        locales: list[int] = []
        precios: list[list[float | None]] = []
        for id_local, del_local in groupby(registros, key=lambda fila: fila[2]):
            fila_precios: list[float | None] = [None] * len(semanas)
            for _, semana, _, precio in del_local:
                fila_precios[indice[semana]] = precio
            locales.append(id_local)
            precios.append(fila_precios)
        _escribir(
            carpeta / f"{id_producto}.json",
            {"semanas": semanas, "locales": locales, "precios": precios},
        )
        cantidad += 1
    return cantidad


def exportar_datos(base: Path, destino: Path) -> dict[str, int]:
    """Reemplaza `destino` con los datos nuevos, solo si todo se generó bien."""
    if destino.exists() and any(destino.iterdir()) and not (destino / "catalogo.json").exists():
        raise ValueError(f"{destino} no parece una exportación anterior: no se reemplaza")
    temporal = destino.with_name(destino.name + ".tmp")
    if temporal.exists():
        shutil.rmtree(temporal)
    (temporal / "precios").mkdir(parents=True)
    try:
        con = duckdb.connect(str(base), read_only=True)
        try:
            desde, hasta, precios_diarios = con.execute(
                "SELECT datos_desde, datos_hasta, precios_diarios FROM metadatos"
            ).fetchone()
            locales = _filas(
                con,
                """
                SELECT id, cadena, sucursal, barrio, departamento, tipo, latitud, longitud
                FROM establecimientos ORDER BY id
                """,
            )
            productos = _filas(
                con,
                """
                SELECT id, nombre, producto, marca, especificacion
                FROM productos ORDER BY nombre, id
                """,
            )
            destacados = _filas(
                con,
                """
                WITH cobertura AS (
                    SELECT s.id_producto, count(DISTINCT s.id_establecimiento) AS cantidad
                    FROM precios_semanales s
                    JOIN establecimientos e ON e.id = s.id_establecimiento
                    WHERE NOT s.en_oferta AND e.tipo = 'supermercado' AND s.semana >= (
                        SELECT (date_trunc('week', datos_hasta) - to_weeks(3))::DATE
                        FROM metadatos
                    )
                    GROUP BY s.id_producto
                )
                SELECT p.id, p.nombre, p.producto, p.marca, p.especificacion
                FROM productos p
                JOIN cobertura c ON c.id_producto = p.id
                QUALIFY row_number() OVER (
                    PARTITION BY p.producto ORDER BY c.cantidad DESC, p.id
                ) = 1
                ORDER BY c.cantidad DESC, p.id
                """,
            )
            _escribir(
                temporal / "catalogo.json",
                {
                    "salud": {
                        "estado": "ok",
                        "datos_desde": desde,
                        "datos_hasta": hasta,
                        "precios_diarios": precios_diarios,
                        "locales": len(locales),
                        "productos": len(productos),
                    },
                    "locales": locales,
                    "productos": productos,
                    "destacados": destacados,
                },
            )
            matrices = _matrices(con, temporal / "precios")
        finally:
            con.close()
        if destino.exists():
            shutil.rmtree(destino)
        temporal.replace(destino)
    finally:
        if temporal.exists():
            shutil.rmtree(temporal)
    return {"archivos_de_precios": matrices}
