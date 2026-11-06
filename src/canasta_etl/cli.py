"""Comando para descargar, limpiar y validar los datos."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from canasta_etl.descarga import descargar_anio
from canasta_etl.limpieza import limpiar_anio
from canasta_etl.validacion import validar_anio


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--anio", type=int, action="append", required=True, help="Año a procesar")
    parser.add_argument("--datos", type=Path, default=Path("data"), help="Carpeta de datos")
    parser.add_argument("--sin-descarga", action="store_true", help="Usa los CSV ya descargados")
    args = parser.parse_args(argv)

    todo_bien = True
    for anio in args.anio:
        crudos = args.datos / "raw" / str(anio)
        limpios = args.datos / "clean" / str(anio)
        if not args.sin_descarga:
            print(f"[{anio}] Descargando...", flush=True)
            descargar_anio(anio, crudos)
        print(f"[{anio}] Limpiando...", flush=True)
        for clave, valor in limpiar_anio(crudos, limpios).items():
            print(f"  {clave}: {valor:,}")
        print(f"[{anio}] Validando...", flush=True)
        for control in validar_anio(limpios, anio):
            estado = "OK " if control.problemas == 0 else ("ERR" if control.grave else "AVISO")
            print(f"  {estado} {control.nombre}: {control.problemas:,}")
            todo_bien = todo_bien and control.aprobado
    return 0 if todo_bien else 1


if __name__ == "__main__":
    sys.exit(main())
