"""Busca el precio online de cada producto en tiendas con páginas públicas de producto.

Respeta `robots.txt`, va de a un pedido por vez y solo publica coincidencias seguras: mismo tipo,
marca y cantidad. Si una tienda bloquea o cambia, se omite sin frenar el resto.
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import requests

TIENDAS = {
    "Disco": "https://www.disco.com.uy",
    "Devoto": "https://www.devoto.com.uy",
    "Géant": "https://www.geant.com.uy",
}
CABECERAS = {"User-Agent": "CanastaUY/0.1 (+https://github.com/nahuelbenitezs/canasta-uy)"}
PAUSA_S = 1.0
UNIDADES = {
    "kg": ("g", 1000), "kgs": ("g", 1000), "g": ("g", 1), "gr": ("g", 1), "grs": ("g", 1),
    "l": ("ml", 1000), "lt": ("ml", 1000), "lts": ("ml", 1000), "litro": ("ml", 1000),
    "litros": ("ml", 1000), "ml": ("ml", 1), "cc": ("ml", 1), "cm3": ("ml", 1),
    "un": ("u", 1), "unidades": ("u", 1), "u": ("u", 1),
}  # fmt: skip
CANTIDAD = re.compile(
    r"(\d+(?:[.,]\d+)?)[\s-]*(kgs?|grs?|g|lts?|litros?|l|ml|cc|cm3|unidades|un|u)\b"
)
PRECIO = re.compile(r'"sku"\s*:\s*"[^"]+".{0,4000}?"price"\s*:\s*"?(\d+(?:\.\d+)?)', re.S)
RELACION_MAXIMA = 3
MAX_PALABRAS_DE_MAS = 1
# Palabras que indican otro producto aunque coincidan tipo, marca y cantidad.
VARIANTES = {"maiz", "soja", "girasol", "oliva", "light", "diet", "zero", "integral", "descremada"}


def normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto)
    limpio = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9.,]+", " ", limpio).strip()


def cantidad(texto: str) -> tuple[str, float] | None:
    hallada = CANTIDAD.search(normalizar(texto).replace(" x ", " "))
    if not hallada:
        return None
    unidad, factor = UNIDADES[hallada.group(2)]
    return unidad, round(float(hallada.group(1).replace(",", ".")) * factor, 3)


def _palabras(texto: str | None) -> set[str]:
    return {p.strip(".,") for p in normalizar(texto or "").split() if len(p.strip(".,")) > 2}


def _slug(url: str) -> str:
    partes = urlsplit(url).path.strip("/").split("/")
    return partes[1] if len(partes) >= 3 else ""


def elegir_url(producto: dict, urls: list[str]) -> str | None:
    """Devuelve la única página con el mismo tipo, marca y cantidad; ante una duda, ninguna."""
    medida = cantidad(producto.get("especificacion") or producto["nombre"])
    marca = _palabras(producto.get("marca")) - {"sin"}
    tipo = normalizar(producto["producto"]).split()
    if not medida or not marca or not tipo:
        return None
    extras = _palabras(producto["producto"])
    nombre = _palabras(producto["nombre"]) | extras | marca
    candidatas: list[tuple[int, str]] = []
    for url in urls:
        texto = normalizar(_slug(url).replace("-", " "))
        palabras = set(texto.split())
        coincide = tipo[0] in palabras and marca <= palabras and cantidad(texto) == medida
        if not coincide:
            continue
        sobrantes = {p for p in palabras if len(p) > 2 and not p[0].isdigit()} - nombre
        if len(sobrantes) > MAX_PALABRAS_DE_MAS or sobrantes & VARIANTES:
            continue
        candidatas.append((len(extras & palabras), url))
    if not candidatas:
        return None
    candidatas.sort(reverse=True)
    if len(candidatas) > 1 and candidatas[0][0] == candidatas[1][0]:
        return None
    return candidatas[0][1]


def extraer_precio(html: str) -> float | None:
    hallado = PRECIO.search(html)
    precio = float(hallado.group(1)) if hallado else 0.0
    return precio if precio > 0 else None


def es_razonable(precio: float, referencia: float | None) -> bool:
    return (
        referencia is None or referencia / RELACION_MAXIMA <= precio <= referencia * RELACION_MAXIMA
    )


def _urls_de_tienda(base: str, sesion: requests.Session) -> tuple[list[str], RobotFileParser]:
    robots = RobotFileParser()
    robots.parse(sesion.get(f"{base}/robots.txt", headers=CABECERAS, timeout=30).text.splitlines())
    indice = sesion.get(f"{base}/sitemap.xml", headers=CABECERAS, timeout=30)
    indice.raise_for_status()
    urls: list[str] = []
    for mapa in re.findall(r"<loc>\s*([^<\s]+)", indice.text):
        time.sleep(PAUSA_S)
        pagina = sesion.get(mapa, headers=CABECERAS, timeout=60)
        pagina.raise_for_status()
        urls += [u for u in re.findall(r"<loc>\s*([^<\s]+)", pagina.text) if "/product/" in u]
    return urls, robots


def buscar_precios(
    productos: list[dict],
    referencias: dict[int, float],
    sesion: requests.Session | None = None,
) -> dict[str, list[dict]]:
    sesion = sesion or requests.Session()
    resultado: dict[str, list[dict]] = {}
    for cadena, base in TIENDAS.items():
        try:
            urls, robots = _urls_de_tienda(base, sesion)
        except requests.RequestException as error:
            print(f"{cadena}: se omite ({error})", file=sys.stderr)
            continue
        hallados = 0
        for producto in productos:
            url = elegir_url(producto, urls)
            if not url or not robots.can_fetch(CABECERAS["User-Agent"], url):
                continue
            time.sleep(PAUSA_S)
            try:
                respuesta = sesion.get(url, headers=CABECERAS, timeout=30)
                respuesta.raise_for_status()
            except requests.RequestException:
                continue
            precio = extraer_precio(respuesta.text)
            if precio and es_razonable(precio, referencias.get(producto["id"])):
                resultado.setdefault(str(producto["id"]), []).append(
                    {"cadena": cadena, "precio": precio, "url": url}
                )
                hallados += 1
        print(f"{cadena}: {hallados} productos de {len(urls)} páginas")
    return resultado


def _referencia(matriz: dict) -> float | None:
    valores = sorted(p for fila in matriz["precios"] for p in fila[-4:] if p is not None)
    return valores[len(valores) // 2] if valores else None


def main(argv: list[str] | None = None) -> int:
    datos = Path((argv or sys.argv[1:] or ["web/public/datos"])[0])
    catalogo = json.loads((datos / "catalogo.json").read_text("utf-8"))
    referencias = {}
    for producto in catalogo["productos"]:
        matriz = json.loads((datos / "precios" / f"{producto['id']}.json").read_text("utf-8"))
        referencias[producto["id"]] = _referencia(matriz)
    precios = buscar_precios(catalogo["productos"], referencias)
    salida = {"actualizado": date.today().isoformat(), "productos": precios}
    (datos / "tiendas.json").write_text(
        json.dumps(salida, ensure_ascii=False, separators=(",", ":")), "utf-8"
    )
    print(f"Productos con precio online: {len(precios)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
