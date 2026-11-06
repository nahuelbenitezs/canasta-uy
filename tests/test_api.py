from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from canasta_api.app import crear_app
from canasta_etl.base import construir_base
from canasta_etl.cli import main
from canasta_etl.limpieza import limpiar_anio

ENCABEZADO_LOCALES = (
    "id.establecimientos;razon.social;nombre.sucursal;direccion;ccz;barrio;cajas;cadena;"
    "long;lat;ciudad;depto;id.depto;localidad;superficie (m2)\n"
)


def local(id_: int, cadena: str, barrio: str, depto: str = "Montevideo") -> str:
    return f"{id_};R {id_};S {id_};Calle;1;{barrio};1;{cadena};-34,9;-56,1;C;{depto};1;1;10\n"


LOCALES = ENCABEZADO_LOCALES + "".join(
    [
        local(1, "Disco", "Pocitos"),
        local(2, "Disco", "Centro"),
        local(3, "Disco", "Malvín"),
        local(4, "Ta - Ta", "Las Piedras", "Canelones"),
        local(5, "Farmashop", "Centro"),
        local(6, "Sin Cadena", "Centro"),
        local(7, "Devoto", "Carrasco"),  # sus únicos precios son de otro producto viejo
    ]
)

PRODUCTOS = (
    "id.producto;producto;marca;especificacion;nombre\n"
    "10;Azúcar;Bella Unión;Paquete 1 kg;Azúcar Bella Unión Paquete 1 kg\n"
    "11;Café;Saint;Frasco 170 g;Café Saint Frasco 170 g\n"
    "12;Té;Hornimans;Caja;Té Hornimans Caja\n"  # sin precios
)

ENCABEZADO_PRECIOS = (
    '"ID_PrecioDiario","Declaracion","Fecha","Fecha_anterior","Oferta","Precio",'
    '"PrecioAnterior","Publico","Establecimiento","Feria_id","Presentacion_Producto"\n'
)
FILAS_PRECIOS = [
    # fecha, oferta, precio, local, producto
    ("2026-08-03", 0, 900, 4, 10),  # fuera de las últimas 4 semanas
    ("2026-09-07", 0, 95, 1, 10),
    ("2026-09-28", 0, 100, 1, 10),
    ("2026-09-30", 0, 100, 1, 10),
    ("2026-09-28", 1, 60, 1, 10),  # oferta: no cuenta como precio habitual
    ("2026-09-28", 0, 110, 2, 10),
    ("2026-09-28", 0, 5000, 3, 10),  # precio mal declarado
    ("2026-09-28", 0, 90, 4, 10),
    ("2026-09-28", 0, 50, 5, 10),  # farmacia
    ("2026-09-28", 0, 70, 6, 10),  # sin cadena
    ("2026-08-03", 0, 300, 7, 11),
]


def precios_csv() -> str:
    return ENCABEZADO_PRECIOS + "".join(
        f'{i},{fecha} 04:00:00,{fecha},"\\N",{oferta},{precio},"\\N","\\N",'
        f'{id_local},"\\N",{prod}\n'
        for i, (fecha, oferta, precio, id_local, prod) in enumerate(FILAS_PRECIOS, start=1)
    )


def escribir_crudos(carpeta: Path) -> None:
    carpeta.mkdir(parents=True)
    (carpeta / "establecimientos.csv").write_bytes(LOCALES.encode("cp1252"))
    (carpeta / "productos.csv").write_bytes(PRODUCTOS.encode("cp1252"))
    (carpeta / "precios.csv").write_text(precios_csv(), encoding="utf-8")


@pytest.fixture
def ruta_base(tmp_path: Path) -> Path:
    escribir_crudos(tmp_path / "raw")
    limpiar_anio(tmp_path / "raw", tmp_path / "clean")
    destino = tmp_path / "serving" / "canasta.duckdb"
    construir_base(tmp_path / "clean", destino)
    return destino


@pytest.fixture
def cliente(ruta_base: Path):
    with TestClient(crear_app(ruta_base, ["http://localhost:4200"])) as c:
        yield c


def cadenas(respuesta) -> dict[str, float]:
    return {r["cadena"]: r["precio_mediano"] for r in respuesta.json()["resultados"]}


def test_salud_informa_el_periodo(cliente: TestClient):
    assert cliente.get("/salud").json() == {
        "estado": "ok",
        "datos_desde": "2026-08-03",
        "datos_hasta": "2026-09-30",
    }


@pytest.mark.parametrize("texto", ["azucar", "AZÚCAR", "bella azucar", "union 1 kg"])
def test_busqueda_ignora_acentos_mayusculas_y_orden(cliente: TestClient, texto: str):
    resultado = cliente.get("/v1/productos", params={"q": texto}).json()
    assert resultado["total"] == 1
    assert resultado["resultados"][0]["id"] == 10


def test_busqueda_sin_texto_lista_solo_productos_con_precios(cliente: TestClient):
    resultado = cliente.get("/v1/productos").json()
    assert resultado["total"] == 2
    assert [p["id"] for p in resultado["resultados"]] == [10, 11]


def test_busqueda_pagina_sin_cambiar_el_total(cliente: TestClient):
    resultado = cliente.get("/v1/productos", params={"limit": 1, "offset": 1}).json()
    assert resultado["total"] == 2
    assert [p["id"] for p in resultado["resultados"]] == [11]


@pytest.mark.parametrize("texto", ["%", "_", "'; DROP TABLE productos; --"])
def test_busqueda_trata_el_texto_como_literal(cliente: TestClient, ruta_base: Path, texto: str):
    assert cliente.get("/v1/productos", params={"q": texto}).json()["total"] == 0
    assert cliente.get("/v1/productos").json()["total"] == 2


@pytest.mark.parametrize("ruta", ["", "/comparacion", "/historial"])
def test_producto_inexistente_o_sin_precios_da_404(cliente: TestClient, ruta: str):
    assert cliente.get(f"/v1/productos/12{ruta}").status_code == 404
    assert cliente.get(f"/v1/productos/999{ruta}").status_code == 404


def test_comparacion_ordena_y_resiste_un_precio_mal_declarado(cliente: TestClient):
    respuesta = cliente.get("/v1/productos/10/comparacion")
    cuerpo = respuesta.json()
    assert [r["cadena"] for r in cuerpo["resultados"]] == ["Ta - Ta", "Disco"]
    disco = cuerpo["resultados"][1]
    assert disco["precio_mediano"] == 110  # mediana de 97,5, 110 y 5000
    assert disco["locales"] == 3
    assert cuerpo["desde"] == "2026-09-07"
    assert cuerpo["datos_hasta"] == "2026-09-30"


def test_comparacion_excluye_ofertas(cliente: TestClient):
    resultado = cliente.get("/v1/productos/10/comparacion", params={"barrio": "Pocitos"})
    assert cadenas(resultado) == {"Disco": 97.5}  # el 60 en oferta no se considera


def test_comparacion_respeta_la_ventana_de_semanas(cliente: TestClient):
    assert cadenas(cliente.get("/v1/productos/10/comparacion"))["Ta - Ta"] == 90
    amplia = cliente.get("/v1/productos/10/comparacion", params={"semanas": 52})
    assert cadenas(amplia)["Ta - Ta"] == 495


def test_comparacion_de_una_semana_empieza_el_lunes_de_la_ultima(cliente: TestClient):
    cuerpo = cliente.get("/v1/productos/10/comparacion", params={"semanas": 1}).json()
    assert cuerpo["desde"] == "2026-09-28"


def test_comparacion_filtra_por_zona_y_tipo(cliente: TestClient):
    canelones = cliente.get("/v1/productos/10/comparacion", params={"departamento": "Canelones"})
    assert cadenas(canelones) == {"Ta - Ta": 90}
    farmacias = cliente.get("/v1/productos/10/comparacion", params={"tipo": "farmacia"})
    assert cadenas(farmacias) == {"Farmashop": 50}


def test_comparacion_sin_cadena_es_opcional(cliente: TestClient):
    assert "Sin cadena" not in cadenas(cliente.get("/v1/productos/10/comparacion"))
    con_ella = cliente.get("/v1/productos/10/comparacion", params={"incluir_sin_cadena": True})
    assert cadenas(con_ella)["Sin cadena"] == 70


def test_comparacion_sin_datos_recientes_queda_vacia(cliente: TestClient):
    cuerpo = cliente.get("/v1/productos/11/comparacion")
    assert cuerpo.status_code == 200
    assert cuerpo.json()["resultados"] == []


def test_historial_por_cadena_excluye_ofertas_y_ordena(cliente: TestClient):
    cuerpo = cliente.get("/v1/productos/10/historial", params={"cadena": "Disco"}).json()
    assert cuerpo["datos_hasta"] == "2026-09-30"
    assert cuerpo["puntos"] == [
        {"semana": "2026-09-07", "precio_mediano": 95, "locales": 1},
        {"semana": "2026-09-28", "precio_mediano": 110, "locales": 3},
    ]


def test_historial_de_cadena_desconocida_queda_vacio(cliente: TestClient):
    cuerpo = cliente.get("/v1/productos/10/historial", params={"cadena": "No existe"})
    assert cuerpo.json()["puntos"] == []


def test_filtros_lista_valores_y_barrios_por_departamento(cliente: TestClient):
    filtros = cliente.get("/v1/filtros").json()
    assert filtros["departamentos"] == ["Canelones", "Montevideo"]
    assert filtros["barrios"] == []
    assert "Disco" in filtros["cadenas"]
    assert filtros["tipos"] == ["farmacia", "supermercado"]
    de_canelones = cliente.get("/v1/filtros", params={"departamento": "Canelones"}).json()
    assert de_canelones["barrios"] == ["Las Piedras"]


@pytest.mark.parametrize(
    "ruta",
    [
        "/v1/productos/10/comparacion?semanas=0",
        "/v1/productos/10/comparacion?semanas=53",
        "/v1/productos/10/comparacion?tipo=otro",
        "/v1/productos/0",
        "/v1/productos?limit=101",
        f"/v1/productos?q={'a' * 101}",
    ],
)
def test_rechaza_parametros_invalidos(cliente: TestClient, ruta: str):
    assert cliente.get(ruta).status_code == 422


def test_es_de_solo_lectura(cliente: TestClient):
    assert cliente.post("/v1/productos").status_code == 405
    assert cliente.delete("/v1/productos/10").status_code == 405


def test_cors_permite_solo_los_origenes_configurados(cliente: TestClient):
    permitido = cliente.get("/salud", headers={"Origin": "http://localhost:4200"})
    assert permitido.headers["access-control-allow-origin"] == "http://localhost:4200"
    ajeno = cliente.get("/salud", headers={"Origin": "https://ajeno.example"})
    assert "access-control-allow-origin" not in ajeno.headers


def test_documentacion_disponible(cliente: TestClient):
    assert cliente.get("/docs").status_code == 200
    rutas = cliente.get("/openapi.json").json()["paths"]
    assert "/v1/productos/{id_producto}/comparacion" in rutas


def test_avisa_si_falta_la_base(tmp_path: Path):
    with pytest.raises(RuntimeError, match="canasta-etl"):
        with TestClient(crear_app(tmp_path / "no-existe.duckdb", [])):
            pass


def test_un_error_al_generar_no_pisa_la_base_anterior(ruta_base: Path, tmp_path: Path):
    antes = duckdb.connect(str(ruta_base), read_only=True)
    filas = antes.execute("SELECT count(*) FROM productos").fetchone()[0]
    antes.close()
    with pytest.raises(duckdb.Error):
        construir_base(tmp_path / "carpeta-vacia", ruta_base)
    despues = duckdb.connect(str(ruta_base), read_only=True)
    assert despues.execute("SELECT count(*) FROM productos").fetchone()[0] == filas
    despues.close()
    assert not list(ruta_base.parent.glob("*.tmp"))


def test_cli_genera_la_base_si_la_validacion_aprueba(tmp_path: Path):
    escribir_crudos(tmp_path / "raw" / "2026")
    codigo = main(["--anio", "2026", "--datos", str(tmp_path), "--sin-descarga"])
    assert codigo == 0
    assert (tmp_path / "serving" / "canasta.duckdb").exists()


def test_cli_no_genera_la_base_si_la_validacion_falla(tmp_path: Path, crudos: Path):
    datos = tmp_path / "datos"
    (datos / "raw").mkdir(parents=True)
    crudos.rename(datos / "raw" / "2026")  # estos datos superan el límite de precios sin catálogo
    codigo = main(["--anio", "2026", "--datos", str(datos), "--sin-descarga"])
    assert codigo == 1
    assert not (datos / "serving" / "canasta.duckdb").exists()
