"""API de solo lectura sobre la base que genera `canasta-etl`."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated, Literal

import duckdb
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi import Path as PathParam
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE_PREDETERMINADA = "data/serving/canasta.duckdb"
ORIGENES_PREDETERMINADOS = "http://localhost:4200"

Tipo = Literal["supermercado", "farmacia", "mayorista", "delivery"]
Cursor = duckdb.DuckDBPyConnection


class Salud(BaseModel):
    estado: str
    datos_desde: date
    datos_hasta: date
    precios_diarios: int
    locales: int
    productos: int


class LocalMapa(BaseModel):
    id: int
    cadena: str | None
    sucursal: str | None
    barrio: str | None
    departamento: str | None
    latitud: float
    longitud: float
    precio: float | None


class Mapa(BaseModel):
    producto: Producto
    desde: date
    datos_hasta: date
    locales: list[LocalMapa]


class Filtros(BaseModel):
    departamentos: list[str]
    barrios: list[str]
    cadenas: list[str]
    tipos: list[str]


class Producto(BaseModel):
    id: int
    nombre: str
    producto: str
    marca: str | None
    especificacion: str | None


class ResultadoBusqueda(BaseModel):
    total: int
    resultados: list[Producto]


class PrecioCadena(BaseModel):
    cadena: str
    precio_mediano: float
    precio_p10: float
    precio_p90: float
    locales: int


class Comparacion(BaseModel):
    producto: Producto
    desde: date
    datos_hasta: date
    resultados: list[PrecioCadena]


class CanastaCadena(BaseModel):
    cadena: str
    total: float
    productos_encontrados: int
    productos_faltantes: list[int]
    completa: bool


class Canasta(BaseModel):
    productos: list[Producto]
    desde: date
    datos_hasta: date
    resultados: list[CanastaCadena]


class PuntoHistorial(BaseModel):
    semana: date
    precio_mediano: float
    locales: int


class Historial(BaseModel):
    producto: Producto
    datos_hasta: date
    puntos: list[PuntoHistorial]


def _obtener_cursor(request: Request) -> Iterator[Cursor]:
    cursor = request.app.state.conexion.cursor()
    try:
        yield cursor
    finally:
        cursor.close()


CursorDep = Annotated[Cursor, Depends(_obtener_cursor)]
IdProducto = Annotated[int, PathParam(ge=1, description="ID del producto")]
TipoQuery = Annotated[Tipo, Query(description="Tipo de local")]
DepartamentoQuery = Annotated[str | None, Query(max_length=100)]
BarrioQuery = Annotated[str | None, Query(max_length=100)]


def _datos_hasta(cursor: Cursor) -> date:
    return cursor.execute("SELECT datos_hasta FROM metadatos").fetchone()[0]


def _inicio_periodo(cursor: Cursor, hasta: date, semanas: int) -> date:
    return cursor.execute(
        "SELECT (date_trunc('week', ?::DATE) - to_weeks(? - 1))::DATE", [hasta, semanas]
    ).fetchone()[0]


def _producto_o_404(cursor: Cursor, id_producto: int) -> Producto:
    fila = cursor.execute(
        "SELECT id, nombre, producto, marca, especificacion FROM productos WHERE id = ?",
        [id_producto],
    ).fetchone()
    if fila is None:
        raise HTTPException(status_code=404, detail="Producto sin precios o inexistente")
    return Producto(**dict(zip(Producto.model_fields, fila, strict=True)))


def _filtro_locales(
    tipo: str, departamento: str | None, barrio: str | None, cadena: str | None = None
) -> tuple[str, list]:
    condiciones, parametros = ["e.tipo = ?"], [tipo]
    for columna, valor in (("departamento", departamento), ("barrio", barrio), ("cadena", cadena)):
        if valor is not None:
            condiciones.append(f"e.{columna} = ?")
            parametros.append(valor)
    return " AND ".join(condiciones), parametros


def crear_app(ruta_base: Path | None = None, origenes: list[str] | None = None) -> FastAPI:
    ruta = ruta_base or Path(os.environ.get("CANASTA_BASE", BASE_PREDETERMINADA))
    permitidos = origenes
    if permitidos is None:
        crudos = os.environ.get("CANASTA_ORIGENES", ORIGENES_PREDETERMINADOS)
        permitidos = [origen.strip() for origen in crudos.split(",") if origen.strip()]

    @asynccontextmanager
    async def ciclo_de_vida(aplicacion: FastAPI) -> AsyncIterator[None]:
        if not ruta.exists():
            raise RuntimeError(f"No existe {ruta}. Generala primero con: canasta-etl --anio 2026")
        aplicacion.state.conexion = duckdb.connect(str(ruta), read_only=True)
        try:
            yield
        finally:
            aplicacion.state.conexion.close()

    aplicacion = FastAPI(
        title="Canasta UY",
        version="0.1.0",
        description=(
            "Precios de Uruguay según los datos abiertos del SIPC (Defensa del Consumidor, "
            "Licencia de Datos Abiertos – Uruguay). Los datos se publican con retraso: revisá "
            "`datos_hasta` en cada respuesta. Los precios son los declarados por los comercios."
        ),
        lifespan=ciclo_de_vida,
    )
    aplicacion.add_middleware(CORSMiddleware, allow_origins=permitidos, allow_methods=["GET"])

    @aplicacion.get("/salud", tags=["estado"])
    def salud(cursor: CursorDep) -> Salud:
        """Indica que la API funciona y qué período cubren los datos."""
        desde, hasta, precios_diarios, locales, productos = cursor.execute(
            """
            SELECT
                datos_desde,
                datos_hasta,
                precios_diarios,
                (SELECT count(*) FROM establecimientos),
                (SELECT count(*) FROM productos)
            FROM metadatos
            """
        ).fetchone()
        return Salud(
            estado="ok",
            datos_desde=desde,
            datos_hasta=hasta,
            precios_diarios=precios_diarios,
            locales=locales,
            productos=productos,
        )

    @aplicacion.get("/v1/filtros", tags=["consulta"])
    def filtros(cursor: CursorDep, departamento: DepartamentoQuery = None) -> Filtros:
        """Valores disponibles para filtrar. Los barrios se listan al indicar un departamento."""

        def valores(columna: str, condicion: str = "true", parametros: list | None = None):
            filas = cursor.execute(
                f"""
                SELECT DISTINCT {columna} FROM establecimientos
                WHERE {columna} IS NOT NULL AND {condicion} ORDER BY 1
                """,
                parametros or [],
            ).fetchall()
            return [fila[0] for fila in filas]

        return Filtros(
            departamentos=valores("departamento"),
            barrios=valores("barrio", "departamento = ?", [departamento]) if departamento else [],
            cadenas=valores("cadena"),
            tipos=valores("tipo"),
        )

    @aplicacion.get("/v1/productos", tags=["consulta"])
    def buscar_productos(
        cursor: CursorDep,
        q: Annotated[str, Query(max_length=100, description="Texto a buscar")] = "",
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> ResultadoBusqueda:
        """Busca productos con precios, sin distinguir mayúsculas ni acentos."""
        terminos = cursor.execute("SELECT lower(strip_accents(?))", [q]).fetchone()[0].split()
        condicion = " AND ".join(["contains(texto_busqueda, ?)"] * len(terminos)) or "true"
        total = cursor.execute(
            f"SELECT count(*) FROM productos WHERE {condicion}", terminos
        ).fetchone()[0]
        filas = cursor.execute(
            f"""
            SELECT id, nombre, producto, marca, especificacion FROM productos
            WHERE {condicion} ORDER BY nombre, id LIMIT ? OFFSET ?
            """,
            [*terminos, limit, offset],
        ).fetchall()
        return ResultadoBusqueda(
            total=total,
            resultados=[
                Producto(**dict(zip(Producto.model_fields, fila, strict=True))) for fila in filas
            ],
        )

    @aplicacion.get("/v1/productos/destacados", tags=["consulta"])
    def productos_destacados(
        cursor: CursorDep,
        limit: Annotated[int, Query(ge=1, le=20)] = 6,
        tipos: Annotated[
            list[str] | None, Query(max_length=20, description="Limita a estos tipos de producto")
        ] = None,
    ) -> list[Producto]:
        """Productos de tipos distintos que más supermercados venden en el período reciente."""
        hasta = _datos_hasta(cursor)
        desde = _inicio_periodo(cursor, hasta, 4)
        filas = cursor.execute(
            """
            WITH cobertura AS (
                SELECT s.id_producto, count(DISTINCT s.id_establecimiento) AS locales
                FROM precios_semanales s
                JOIN establecimientos e ON e.id = s.id_establecimiento
                WHERE NOT s.en_oferta AND s.semana >= ? AND e.tipo = 'supermercado'
                GROUP BY s.id_producto
            )
            SELECT p.id, p.nombre, p.producto, p.marca, p.especificacion
            FROM productos p
            JOIN cobertura c ON c.id_producto = p.id
            WHERE len(?::VARCHAR[]) = 0 OR list_contains(?::VARCHAR[], p.producto)
            QUALIFY row_number() OVER (PARTITION BY p.producto ORDER BY c.locales DESC, p.id) = 1
            ORDER BY c.locales DESC, p.id
            LIMIT ?
            """,
            [desde, tipos or [], tipos or [], limit],
        ).fetchall()
        return [Producto(**dict(zip(Producto.model_fields, fila, strict=True))) for fila in filas]

    @aplicacion.get("/v1/canasta", tags=["consulta"])
    def comparar_canasta(
        cursor: CursorDep,
        productos: Annotated[
            list[int], Query(min_length=1, max_length=50, description="IDs de los productos")
        ],
        tipo: TipoQuery = "supermercado",
        departamento: DepartamentoQuery = None,
        barrio: BarrioQuery = None,
        semanas: Annotated[int, Query(ge=1, le=52, description="Semanas hacia atrás")] = 4,
    ) -> Canasta:
        """Suma el precio habitual de la canasta en cada cadena.

        Primero aparecen las cadenas que tienen todos los productos, de menor a mayor. Las demás
        van después, porque su total no es comparable.
        """
        ids = list(dict.fromkeys(productos))
        detalle = [_producto_o_404(cursor, id_producto) for id_producto in ids]
        hasta = _datos_hasta(cursor)
        desde = _inicio_periodo(cursor, hasta, semanas)
        condicion, parametros = _filtro_locales(tipo, departamento, barrio)
        marcadores = ", ".join("?" * len(ids))
        filas = cursor.execute(
            f"""
            WITH por_local AS (
                SELECT e.cadena, s.id_producto, e.id, median(s.precio) AS precio
                FROM precios_semanales s
                JOIN establecimientos e ON e.id = s.id_establecimiento
                WHERE s.id_producto IN ({marcadores}) AND NOT s.en_oferta AND s.semana >= ?
                  AND e.cadena <> 'Sin cadena' AND {condicion}
                GROUP BY e.cadena, s.id_producto, e.id
            ),
            por_cadena AS (
                SELECT cadena, id_producto, median(precio) AS precio
                FROM por_local GROUP BY cadena, id_producto
            )
            SELECT cadena, round(sum(precio), 2), list(id_producto)
            FROM por_cadena GROUP BY cadena
            """,
            [*ids, desde, *parametros],
        ).fetchall()
        resultados = [
            CanastaCadena(
                cadena=cadena,
                total=total,
                productos_encontrados=len(encontrados),
                productos_faltantes=[i for i in ids if i not in encontrados],
                completa=len(encontrados) == len(ids),
            )
            for cadena, total, encontrados in filas
        ]
        resultados.sort(key=lambda r: (not r.completa, r.total, r.cadena))
        return Canasta(productos=detalle, desde=desde, datos_hasta=hasta, resultados=resultados)

    @aplicacion.get("/v1/productos/{id_producto}", tags=["consulta"])
    def obtener_producto(cursor: CursorDep, id_producto: IdProducto) -> Producto:
        """Devuelve un producto."""
        return _producto_o_404(cursor, id_producto)

    @aplicacion.get("/v1/productos/{id_producto}/mapa", tags=["consulta"])
    def mapa(
        cursor: CursorDep,
        id_producto: IdProducto,
        tipo: TipoQuery = "supermercado",
        semanas: Annotated[int, Query(ge=1, le=52, description="Semanas hacia atrás")] = 4,
    ) -> Mapa:
        """Precio habitual del producto en cada local con ubicación conocida.

        Los locales sin ese producto en el período también se devuelven, con `precio` vacío.
        """
        producto = _producto_o_404(cursor, id_producto)
        hasta = _datos_hasta(cursor)
        desde = _inicio_periodo(cursor, hasta, semanas)
        filas = cursor.execute(
            """
            WITH precios AS (
                SELECT id_establecimiento, median(precio) AS precio
                FROM precios_semanales
                WHERE id_producto = ? AND NOT en_oferta AND semana >= ?
                GROUP BY id_establecimiento
            )
            SELECT e.id, e.cadena, e.sucursal, e.barrio, e.departamento, e.latitud, e.longitud,
                   round(p.precio, 2)
            FROM establecimientos e
            LEFT JOIN precios p ON p.id_establecimiento = e.id
            WHERE e.tipo = ? AND e.latitud IS NOT NULL
            ORDER BY e.id
            """,
            [id_producto, desde, tipo],
        ).fetchall()
        return Mapa(
            producto=producto,
            desde=desde,
            datos_hasta=hasta,
            locales=[
                LocalMapa(**dict(zip(LocalMapa.model_fields, fila, strict=True))) for fila in filas
            ],
        )

    @aplicacion.get("/v1/productos/{id_producto}/comparacion", tags=["consulta"])
    def comparar(
        cursor: CursorDep,
        id_producto: IdProducto,
        tipo: TipoQuery = "supermercado",
        departamento: DepartamentoQuery = None,
        barrio: BarrioQuery = None,
        semanas: Annotated[int, Query(ge=1, le=52, description="Semanas hacia atrás")] = 4,
        incluir_sin_cadena: bool = False,
    ) -> Comparacion:
        """Compara el precio habitual entre cadenas, de menor a mayor.

        Calcula primero la mediana de cada local y después la de la cadena, para que un local con
        más semanas o un precio mal declarado no distorsione el resultado. No incluye ofertas.
        """
        producto = _producto_o_404(cursor, id_producto)
        hasta = _datos_hasta(cursor)
        desde = _inicio_periodo(cursor, hasta, semanas)
        condicion, parametros = _filtro_locales(tipo, departamento, barrio)
        if not incluir_sin_cadena:
            condicion += " AND e.cadena <> 'Sin cadena'"
        filas = cursor.execute(
            f"""
            WITH por_local AS (
                SELECT e.cadena, e.id, median(s.precio) AS precio
                FROM precios_semanales s
                JOIN establecimientos e ON e.id = s.id_establecimiento
                WHERE s.id_producto = ? AND NOT s.en_oferta AND s.semana >= ? AND {condicion}
                GROUP BY e.cadena, e.id
            )
            SELECT
                cadena,
                round(median(precio), 2),
                round(quantile_cont(precio, 0.1), 2),
                round(quantile_cont(precio, 0.9), 2),
                count(*)
            FROM por_local
            GROUP BY cadena
            ORDER BY 2, cadena
            """,
            [id_producto, desde, *parametros],
        ).fetchall()
        return Comparacion(
            producto=producto,
            desde=desde,
            datos_hasta=hasta,
            resultados=[
                PrecioCadena(**dict(zip(PrecioCadena.model_fields, fila, strict=True)))
                for fila in filas
            ],
        )

    @aplicacion.get("/v1/productos/{id_producto}/historial", tags=["consulta"])
    def historial(
        cursor: CursorDep,
        id_producto: IdProducto,
        tipo: TipoQuery = "supermercado",
        departamento: DepartamentoQuery = None,
        barrio: BarrioQuery = None,
        cadena: Annotated[str | None, Query(max_length=100)] = None,
    ) -> Historial:
        """Evolución semanal de la mediana del precio habitual. No incluye ofertas."""
        producto = _producto_o_404(cursor, id_producto)
        condicion, parametros = _filtro_locales(tipo, departamento, barrio, cadena)
        filas = cursor.execute(
            f"""
            SELECT s.semana, round(median(s.precio), 2), count(DISTINCT e.id)
            FROM precios_semanales s
            JOIN establecimientos e ON e.id = s.id_establecimiento
            WHERE s.id_producto = ? AND NOT s.en_oferta AND {condicion}
            GROUP BY s.semana
            ORDER BY s.semana
            """,
            [id_producto, *parametros],
        ).fetchall()
        return Historial(
            producto=producto,
            datos_hasta=_datos_hasta(cursor),
            puntos=[
                PuntoHistorial(**dict(zip(PuntoHistorial.model_fields, fila, strict=True)))
                for fila in filas
            ],
        )

    return aplicacion


def app() -> FastAPI:
    """Punto de entrada para `uvicorn --factory canasta_api.app:app`."""
    return crear_app()
