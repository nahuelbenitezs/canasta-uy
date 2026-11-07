import pytest

from canasta_etl.tiendas import cantidad, elegir_url, es_razonable, extraer_precio

YERBA = {
    "id": 1,
    "nombre": "Yerba mate común Baldo Paquete 1 kg.",
    "producto": "Yerba mate común",
    "marca": "Baldo",
    "especificacion": "Paquete 1 kg.",
}
BASE = "https://www.disco.com.uy/product"


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Paquete 1 kg.", ("g", 1000)),
        ("yerba baldo x 1000 g", ("g", 1000)),
        ("Envase 900 cc", ("ml", 900)),
        ("x 1,5 l", ("ml", 1500)),
        ("Sin medida", None),
    ],
)
def test_normaliza_cantidades(texto, esperado):
    assert cantidad(texto) == esperado


def test_elige_misma_marca_tipo_y_cantidad():
    urls = [
        f"{BASE}/yerba-canarias-1-kg/1",
        f"{BASE}/yerba-baldo-500-g/2",
        f"{BASE}/yerba-baldo-x-1-kg/3",
        f"{BASE}/fideos-baldo-1-kg/4",
    ]
    assert elegir_url(YERBA, urls) == f"{BASE}/yerba-baldo-x-1-kg/3"


def test_ante_la_duda_no_elige():
    urls = [f"{BASE}/yerba-baldo-1-kg/1", f"{BASE}/yerba-baldo-suave-1-kg/2"]
    assert elegir_url(YERBA, urls) is None


def test_sin_marca_no_elige():
    assert elegir_url({**YERBA, "marca": "Sin marca"}, [f"{BASE}/yerba-1-kg/1"]) is None


def test_extrae_precio_y_descarta_cero():
    assert extraer_precio('{"sku":"100","name":"x","price":289.00}') == 289
    assert extraer_precio('{"sku":"100","price":0}') is None
    assert extraer_precio("<html></html>") is None


def test_descarta_precios_fuera_de_rango():
    assert es_razonable(200, 190)
    assert not es_razonable(20000, 190)
    assert not es_razonable(5, 190)
    assert es_razonable(200, None)


def test_descarta_variantes_y_productos_muy_distintos():
    aceite = {
        "id": 2,
        "nombre": "Aceite de girasol Óptimo Envase 900 cc",
        "producto": "Aceite de girasol",
        "marca": "Óptimo",
        "especificacion": "Envase 900 cc",
    }
    assert elegir_url(aceite, [f"{BASE}/aceite-girasol-optimo-maiz-900-ml/1"]) is None
    assert elegir_url(YERBA, [f"{BASE}/yerba-baldo-tradicion-premium-seleccion-1-kg/1"]) is None
    assert elegir_url(aceite, [f"{BASE}/aceite-girasol-optimo-900-ml/2"]) is not None
