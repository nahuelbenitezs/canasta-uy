import json
import tempfile
from pathlib import Path


def escribir_json(ruta: Path, datos: object) -> None:
    archivo = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=ruta.parent, delete=False)
    temporal = Path(archivo.name)
    try:
        with archivo:
            json.dump(datos, archivo, ensure_ascii=False, separators=(",", ":"))
        temporal.replace(ruta)
    finally:
        temporal.unlink(missing_ok=True)
