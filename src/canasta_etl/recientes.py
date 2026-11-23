"""Publica el resumen nacional del SIPC provisto por la API pública de Cambio Uruguay."""

from __future__ import annotations

import json
import math
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from canasta_etl.json_atomico import escribir_json

FUENTE = "https://api.cambio-uruguay.com/precios/articles"
CABECERAS = {"User-Agent": "CanastaUY/0.1 (+https://github.com/nahuelbenitezs/canasta-uy)"}


def _precio_valido(valor: object) -> bool:
    return type(valor) in (int, float) and math.isfinite(valor) and valor > 0


def resumir(respuesta: dict, catalogo: list[dict], hoy: date) -> dict:
    fecha = date.fromisoformat(respuesta["day"])
    if not 0 <= (hoy - fecha).days <= 7:
        raise ValueError(f"El resumen del {fecha} está fuera de los últimos siete días")

    # El archivo SIPC y la API identifican cada presentación por el mismo código oficial.
    ids = {producto["id"] for producto in catalogo}
    productos = {}
    for articulo in respuesta["articles"]:
        if not isinstance(articulo, dict):
            continue
        codigo = articulo.get("articleId")
        if type(codigo) is not int or codigo not in ids:
            continue

        p10, mediana, p90 = (articulo.get(clave) for clave in ("p10", "p50", "p90"))
        locales = articulo.get("n")
        if not all(_precio_valido(valor) for valor in (p10, mediana, p90)):
            continue
        if not p10 <= mediana <= p90 or type(locales) is not int or locales <= 0:
            continue
        productos[str(codigo)] = {"mediana": mediana, "p10": p10, "p90": p90, "locales": locales}

    if not productos:
        raise ValueError("El resumen no contiene registros válidos para el catálogo")
    return {"actualizado": fecha.isoformat(), "fuente": "cambio-uruguay", "productos": productos}


def actualizar(datos: Path, hoy: date) -> dict:
    catalogo = json.loads((datos / "catalogo.json").read_text(encoding="utf-8"))
    respuesta = requests.get(FUENTE, headers=CABECERAS, timeout=(10, 25))
    respuesta.raise_for_status()
    resumen = resumir(respuesta.json(), catalogo["productos"], hoy)
    archivo = datos / "recientes.json"
    if archivo.exists():
        try:
            anterior = json.loads(archivo.read_text(encoding="utf-8"))
            fecha_anterior = date.fromisoformat(anterior["actualizado"])
            if fecha_anterior > date.fromisoformat(resumen["actualizado"]):
                return anterior
        except (TypeError, ValueError, KeyError):
            print("Se reemplaza el resumen anterior porque está dañado.", file=sys.stderr)

    escribir_json(archivo, resumen)
    return resumen


def main(argv: list[str] | None = None) -> int:
    datos = Path((argv or sys.argv[1:] or ["web/public/datos"])[0])
    try:
        resumen = actualizar(datos, datetime.now(ZoneInfo("America/Montevideo")).date())
    except (OSError, TypeError, ValueError, KeyError, requests.RequestException) as error:
        print(f"No se pudo actualizar la referencia del SIPC: {error}", file=sys.stderr)
        return 1
    print(
        f"Referencia del SIPC del {resumen['actualizado']}: {len(resumen['productos'])} productos."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
