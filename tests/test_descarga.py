import json
from pathlib import Path

import pytest

from canasta_etl.descarga import descargar_anio, resolver_recursos


class Respuesta:
    def __init__(self, cuerpo: bytes = b"", datos: dict | None = None, error: bool = False):
        self.cuerpo, self.datos, self.error = cuerpo, datos, error

    def raise_for_status(self):
        if self.error:
            raise RuntimeError("HTTP 500")

    def json(self):
        return self.datos

    def iter_content(self, _tamanio):
        yield self.cuerpo

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def recurso(nombre: str, url: str, modificado: str = "2026-01-01", tamanio=None, formato="CSV"):
    return {
        "name": nombre,
        "url": url,
        "format": formato,
        "last_modified": modificado,
        "size": tamanio,
    }


class Sesion:
    def __init__(self, recursos: list[dict], cuerpos: dict[str, bytes] | None = None):
        self.recursos, self.cuerpos = recursos, cuerpos or {}
        self.descargas: list[str] = []

    def get(self, url, **_):
        if "package_show" in url:
            return Respuesta(datos={"result": {"resources": self.recursos}})
        self.descargas.append(url)
        return Respuesta(self.cuerpos.get(url, b"contenido"))


def catalogo(modificado: str = "2026-01-01", tamanio_precios=None) -> list[dict]:
    return [
        recurso("Establecimiento", "http://x/e.csv", modificado),
        recurso("Productos", "http://x/p.csv", modificado),
        recurso("Metadatos productos", "http://x/mp.csv", modificado),
        recurso("Metadatos de precios", "http://x/mpr.csv", modificado),
        recurso("Precios 2026", "http://x/pr.csv", modificado, tamanio_precios),
        recurso("Nota metodológica", "http://x/n.odt", modificado, formato="ODT"),
    ]


def test_elige_solo_los_tres_csv_de_datos():
    archivos = {r.archivo: r.url for r in resolver_recursos(2026, Sesion(catalogo()))}
    assert archivos == {
        "establecimientos.csv": "http://x/e.csv",
        "productos.csv": "http://x/p.csv",
        "precios.csv": "http://x/pr.csv",
    }


def test_falla_si_el_catalogo_cambia_de_forma():
    with pytest.raises(RuntimeError, match="precios.csv"):
        resolver_recursos(2026, Sesion(catalogo()[:2]))


def test_no_vuelve_a_bajar_lo_que_no_cambio(tmp_path: Path):
    sesion = Sesion(catalogo())
    assert descargar_anio(2026, tmp_path, sesion) is True
    assert len(sesion.descargas) == 3
    assert descargar_anio(2026, tmp_path, sesion) is False
    assert len(sesion.descargas) == 3


def test_baja_de_nuevo_si_cambio_la_fecha(tmp_path: Path):
    descargar_anio(2026, tmp_path, Sesion(catalogo()))
    sesion = Sesion(catalogo("2026-02-01"))
    assert descargar_anio(2026, tmp_path, sesion) is True
    assert len(sesion.descargas) == 3
    assert (
        json.loads((tmp_path / "manifiesto.json").read_text("utf-8"))["precios.csv"] == "2026-02-01"
    )


def test_descarga_incompleta_no_reemplaza_el_archivo(tmp_path: Path):
    descargar_anio(2026, tmp_path, Sesion(catalogo(), {"http://x/pr.csv": b"viejo"}))
    sesion = Sesion(catalogo("2026-02-01", tamanio_precios=999), {"http://x/pr.csv": b"corto"})
    with pytest.raises(RuntimeError, match="999 bytes"):
        descargar_anio(2026, tmp_path, sesion)
    assert (tmp_path / "precios.csv").read_bytes() == b"viejo"
    assert not list(tmp_path.glob("*.part"))
    assert (
        json.loads((tmp_path / "manifiesto.json").read_text("utf-8"))["precios.csv"] == "2026-01-01"
    )
