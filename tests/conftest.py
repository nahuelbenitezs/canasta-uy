from pathlib import Path

import pytest

ESTABLECIMIENTOS = """\
id.establecimientos;razon.social;nombre.sucursal;direccion;ccz;barrio;cajas;cadena;long;lat;ciudad;depto;id.depto;localidad;superficie (m2)
1;Compañía S.A.;Sucursal Ñandú;Conciliación 1;1;Peñarol;2;Disco;-34,8765;-56,1897;Montevideo;Montevideo;1;1020;280
2;B S.A.;Sin signo;Calle 2;1;Centro;1;Planeta ;34,8867;-56,1850;Montevideo;Montevideo;1;1020;NULL
3;C S.A.;Sin coords;Calle 3;1;Centro;1;Géant;NULL;NULL;Montevideo;Montevideo;1;1020;100
4;D S.A.;Basura;Calle 4;1;Centro;1;Geant;-3,34E+15;-5,65E+16;Montevideo;Montevideo;1;1020;100
5;E S.A.;Farmacia;Calle 5;1;Centro;1;Farmashop;-34,90;-56,16;Montevideo;Montevideo;1;1020;100
6;F S.A.;Orden correcto;Calle 6;1;Centro;x;Sin Cadena;-56,16;-34,90;Montevideo;Montevideo;1;1020;100
"""

PRODUCTOS = """\
id.producto;producto;marca;especificacion;nombre
10;Azúcar;Bella Unión;Paquete 1 kg;Azúcar Bella Unión Paquete 1 kg
11;Café;Sin marca;Frasco170 g;Café Sin marca Frasco170 g
12;Bolígrafo;Bic;Azul – negro;Bolígrafo Bic Azul – negro
"""

ENCABEZADO_PRECIOS = (
    '"ID_PrecioDiario","Declaracion","Fecha","Fecha_anterior","Oferta","Precio",'
    '"PrecioAnterior","Publico","Establecimiento","Feria_id","Presentacion_Producto"\n'
)

PRECIOS = (
    ENCABEZADO_PRECIOS
    + (
        '100,2026-01-01 04:00:00,2026-01-01,"\\N",0,50.5,"\\N","\\N",1,"\\N",10\n'
        '101,2026-01-01 09:00:00,2026-01-01,"\\N",0,52,"\\N","\\N",1,"\\N",10\n'  # corrige a la 100
        '102,2026-01-01 04:00:00,2026-01-01,"\\N",1,40,"\\N","\\N",1,"\\N",10\n'  # oferta el mismo día
        '103,2026-01-02 04:00:00,2026-01-02,"\\N",0,0,"\\N","\\N",1,"\\N",10\n'  # precio cero
        '104,2026-01-02 04:00:00,2026-01-02,"\\N",0,abc,"\\N","\\N",1,"\\N",10\n'  # precio inválido
        '105,2026-01-02 04:00:00,2026-01-02,"\\N",0,300,"\\N","\\N",1,7,11\n'  # precio de feria
        '106,2026-01-02 04:00:00,2026-01-02,"\\N",0,200,"\\N","Celíacos",1,"\\N",11\n'  # otro público
        '107,2026-01-03 04:00:00,2026-01-03,2026-01-01,0,210,205,"\\N",2,"\\N",11\n'
        '108,2026-01-03 04:00:00,2026-01-03,"\\N",0,99,"\\N","\\N",1,"\\N",999\n'  # producto sin catálogo
        '109,2026-01-03 04:00:00,2026-01-03,"\\N",0,99,"\\N","\\N",888,"\\N",10\n'  # sucursal sin catálogo
    )
)


@pytest.fixture
def crudos(tmp_path: Path) -> Path:
    """CSV como los del catálogo: catálogos en Windows-1252 y precios con nulos \\N entre comillas."""
    carpeta = tmp_path / "raw"
    carpeta.mkdir()
    (carpeta / "establecimientos.csv").write_bytes(ESTABLECIMIENTOS.encode("cp1252"))
    (carpeta / "productos.csv").write_bytes(PRODUCTOS.encode("cp1252"))
    (carpeta / "precios.csv").write_text(PRECIOS, encoding="utf-8")
    return carpeta
