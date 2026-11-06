"""Descarga los CSV del SIPC desde el Catálogo Nacional de Datos Abiertos."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import requests

API = "https://catalogodatos.gub.uy/api/3/action/package_show"
CONJUNTO = "defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-{anio}"
CABECERAS = {"User-Agent": "CanastaUY-ETL/0.1"}
TAMANIO_BLOQUE = 1024 * 1024


@dataclass(frozen=True)
class Recurso:
    archivo: str
    url: str
    modificado: str
    tamanio: int | None


def _archivo_del_recurso(nombre: str) -> str | None:
    nombre = nombre.strip().lower()
    if "metadatos" in nombre:
        return None
    if nombre.startswith("establecimiento"):
        return "establecimientos.csv"
    if nombre.startswith("producto"):
        return "productos.csv"
    if nombre.startswith("precios"):
        return "precios.csv"
    return None


def resolver_recursos(anio: int, sesion: requests.Session | None = None) -> list[Recurso]:
    """Consulta el catálogo y devuelve los tres CSV de datos de ese año."""
    sesion = sesion or requests.Session()
    respuesta = sesion.get(
        API, params={"id": CONJUNTO.format(anio=anio)}, headers=CABECERAS, timeout=60
    )
    respuesta.raise_for_status()
    recursos = []
    for crudo in respuesta.json()["result"]["resources"]:
        if str(crudo.get("format", "")).upper() != "CSV":
            continue
        archivo = _archivo_del_recurso(str(crudo.get("name", "")))
        if archivo is None:
            continue
        tamanio = crudo.get("size")
        recursos.append(
            Recurso(
                archivo=archivo,
                url=crudo["url"],
                modificado=crudo.get("last_modified") or crudo.get("metadata_modified") or "",
                tamanio=int(tamanio) if tamanio else None,
            )
        )
    faltantes = {"establecimientos.csv", "productos.csv", "precios.csv"} - {
        r.archivo for r in recursos
    }
    if faltantes:
        raise RuntimeError(f"El catálogo de {anio} no incluye: {sorted(faltantes)}")
    return recursos


def _descargar(recurso: Recurso, destino: Path, sesion: requests.Session) -> None:
    parcial = destino.with_name(destino.name + ".part")
    recibidos = 0
    try:
        with sesion.get(recurso.url, stream=True, headers=CABECERAS, timeout=120) as respuesta:
            respuesta.raise_for_status()
            with parcial.open("wb") as salida:
                for bloque in respuesta.iter_content(TAMANIO_BLOQUE):
                    salida.write(bloque)
                    recibidos += len(bloque)
        if recurso.tamanio is not None and recibidos != recurso.tamanio:
            raise RuntimeError(
                f"{recurso.archivo}: se esperaban {recurso.tamanio} bytes y llegaron {recibidos}"
            )
        parcial.replace(destino)
    finally:
        parcial.unlink(missing_ok=True)


def descargar_anio(anio: int, directorio: Path, sesion: requests.Session | None = None) -> bool:
    """Baja lo que cambió desde la última vez. Devuelve True si hubo archivos nuevos."""
    sesion = sesion or requests.Session()
    directorio.mkdir(parents=True, exist_ok=True)
    ruta_manifiesto = directorio / "manifiesto.json"
    manifiesto = json.loads(ruta_manifiesto.read_text("utf-8")) if ruta_manifiesto.exists() else {}
    hubo_cambios = False
    for recurso in resolver_recursos(anio, sesion):
        destino = directorio / recurso.archivo
        if destino.exists() and manifiesto.get(recurso.archivo) == recurso.modificado:
            continue
        _descargar(recurso, destino, sesion)
        manifiesto[recurso.archivo] = recurso.modificado
        ruta_manifiesto.write_text(json.dumps(manifiesto, indent=2), "utf-8")
        hubo_cambios = True
    return hubo_cambios
