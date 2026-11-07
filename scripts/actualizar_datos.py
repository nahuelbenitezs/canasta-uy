"""Recarga los datos oficiales solo si cambiaron; si no, reutiliza los ya publicados."""

import json
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

from canasta_etl.cli import main as cargar
from canasta_etl.descarga import resolver_recursos

DATOS = Path("web/public/datos")


def reutilizar_publicados() -> str | None:
    """Copia los datos de gh-pages y devuelve la versión de la fuente que usaron."""
    with tempfile.TemporaryDirectory() as temporal:
        pedido = ["git", "clone", "-q", "--depth", "1", "-b", "gh-pages", ".", temporal]
        subprocess.run(pedido, check=True)
        origen = Path(temporal) / "datos"
        if not (origen / "fuente.json").exists():
            return None
        shutil.rmtree(DATOS, ignore_errors=True)
        shutil.copytree(origen, DATOS)
    return json.loads((DATOS / "fuente.json").read_text("utf-8"))["modificado"]


def main() -> int:
    anio = date.today().year
    actual = next(r for r in resolver_recursos(anio) if r.archivo == "precios.csv").modificado
    if reutilizar_publicados() == actual:
        print(f"Datos oficiales sin cambios ({actual}).")
        return 0
    print(f"Hay datos oficiales nuevos ({actual}).", flush=True)
    codigo = cargar(["--anio", str(anio)])
    if codigo == 0:
        (DATOS / "fuente.json").write_text(json.dumps({"modificado": actual}), "utf-8")
    return codigo


if __name__ == "__main__":
    sys.exit(main())
