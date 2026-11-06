# Canasta UY

Observatorio de precios de Uruguay, hecho con los datos abiertos del
[Sistema de Información de Precios al Consumidor](https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026)
(SIPC). Abre con un mapa 3D de Uruguay donde cada columna es un supermercado real, y permite comparar cadenas, ver cómo evoluciona cada producto y armar una canasta.

> **Estado:** fase 3 de 5. La carga de datos, la API y la web funcionan localmente, pero todavía no están publicadas. Medir si una oferta es real llega en la fase 4.

## Ver la web

Con los datos ya cargados, en dos terminales:

```powershell
.\.venv\Scripts\uvicorn --factory canasta_api.app:app --port 8000
```

```powershell
cd web
npm install
npm start
```

La web queda en <http://localhost:4200>. Para los tests: `npx ng test --watch=false` dentro de `web`.

Está hecha con Angular, Three.js para el mapa y Motion para las animaciones. Las decisiones de producto y de diseño están en [PRODUCT.md](PRODUCT.md) y [DESIGN.md](DESIGN.md).

## Cargar los datos

Requiere Python 3.11 o superior. Los ejemplos son para PowerShell.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\canasta-etl --anio 2026
.\.venv\Scripts\python -m pytest
```

El comando baja solo lo que cambió, escribe los resultados en `data/clean/<año>/` y termina con
error si falla un control. El archivo de precios de 2026 pesa unos 1,5 GB. Si todo está bien,
genera `data/serving/canasta.duckdb`, la base resumida de 14 MB que usa la API.

## Usar la API

```powershell
.\.venv\Scripts\uvicorn --factory canasta_api.app:app --port 8000
```

La documentación interactiva queda en <http://localhost:8000/docs>.

| Ruta | Para qué sirve |
|---|---|
| `GET /salud` | Estado de la API y período que cubren los datos |
| `GET /v1/filtros` | Departamentos, barrios, cadenas y tipos de local |
| `GET /v1/productos?q=arroz` | Buscar productos, sin distinguir mayúsculas ni acentos |
| `GET /v1/productos/{id}` | Ver un producto |
| `GET /v1/productos/{id}/comparacion` | Comparar el precio habitual entre cadenas, por zona y período |
| `GET /v1/productos/{id}/historial` | Ver la evolución semanal del precio habitual |
| `GET /v1/productos/{id}/mapa` | Obtener el precio del producto en cada local con ubicación |
| `GET /v1/productos/destacados` | Listar productos de tipos distintos con más cobertura |
| `GET /v1/canasta?productos=1&productos=2` | Sumar una canasta por cadena |

Variables opcionales: `CANASTA_BASE` (ruta de la base) y `CANASTA_ORIGENES` (orígenes permitidos,
separados por comas; por defecto, `http://localhost:4200`).

**Cómo se calculan los precios:** se toma la mediana semanal de cada local, luego la de cada local
en el período y al final la de la cadena. Así, un precio mal declarado o un local con más semanas
no distorsiona el resultado. El precio habitual no incluye ofertas, y la comparación deja afuera a
los comercios sin cadena salvo que se pida `incluir_sin_cadena=true`.

## Qué corrige la limpieza

| Problema en los archivos originales | Qué se hace |
|---|---|
| Las columnas `long` y `lat` vienen invertidas y con coma decimal | Se identifica cada valor por los límites de Uruguay |
| Algunas latitudes no tienen signo negativo | Se corrigen con la misma regla |
| Hay coordenadas dañadas, como `-3,34E+15` | Quedan vacías, sin adivinar el valor |
| Los catálogos están en Windows-1252, no en UTF-8 | Se convierten antes de leerlos |
| Una misma cadena aparece escrita de varias formas (`Geant` y `Géant`) | Se unifica el nombre |
| Hay varias declaraciones de un mismo precio en un día | Se conserva la última |
| Hay precios cuyo producto no figura en el catálogo | Se descartan, se cuentan, y el proceso falla si superan el 0,1 % |

## Resultado con los datos de 2026

Datos del 1 de enero al 30 de setiembre:

| Filas | Cantidad |
|---|---:|
| Leídas | 20.340.368 |
| Repetidas | 116.571 |
| Sin catálogo | 189 |
| Guardadas | 20.223.608 |

## Limitaciones conocidas

- **Los datos no son del día:** se publican con retraso, así que sirven para ver tendencias y no para saber el precio de hoy.
- **La cobertura es parcial:** el catálogo tiene 379 presentaciones de productos, no todo lo que vende un supermercado.
- **Los precios los declaran los comercios:** por ejemplo, unas curitas de mediana $56 aparecen a $2.539,56. Se conservan y la validación avisa; las fases siguientes tienen que usar medidas robustas, como la mediana.
- **Solo se probó con 2026:** los archivos de otros años pueden tener diferencias, y la base de la API usa únicamente el año más reciente que se procese.

## Nota de origen de los datos

- **Proveedor:** Defensa del Consumidor.
- **Conjunto de datos:** [Sistema de Información de Precios al Consumidor 2026](https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026).
- **Licencia:** [Licencia de Datos Abiertos – Uruguay](https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/documentos/publicaciones/licencia_de_datos_abiertos_0.pdf).
- **Modificaciones:** los datos se transforman como se describe en [Qué corrige la limpieza](#qué-corrige-la-limpieza). Además, se agrega a cada local un tipo (supermercado, farmacia, mayorista o delivery) y se descartan las filas inválidas, repetidas o sin catálogo.

Este repositorio no incluye los datos: el comando los descarga desde la fuente. La silueta de Uruguay del mapa viene de Natural Earth, de dominio público.
