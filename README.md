# Canasta UY

Comparador de precios de Uruguay. Buscá un producto, mirá los precios recientes en tiendas online y compará cuánto cuesta tu lista con las cantidades que necesitás. El mapa, la comparación por zona y la evolución de cada producto usan los datos abiertos del
[Sistema de Información de Precios al Consumidor](https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026)
(SIPC).

**[Ver la web](https://nahuelbenitezs.github.io/canasta-uy/)**

## De dónde salen los precios

- **Tiendas online.** GitHub Actions consulta diariamente los sitios públicos de Disco, Devoto y Géant para los productos que identifica por marca y presentación. Cada precio conserva su fecha de consulta. La búsqueda y la canasta usan precios de hasta siete días de antigüedad. Disponibilidad, descuentos y envío dependen de la tienda y la zona de entrega.
- **Referencia nacional reciente.** La [API pública de Cambio Uruguay](https://api.cambio-uruguay.com/api-docs) resume los precios que recoge el SIPC. La ficha muestra la mediana, el rango central y la cantidad de locales incluidos en el resumen, con su fecha. Las fechas de declaración de cada comercio pueden ser anteriores a la del resumen.
- **Histórico por local.** El archivo descargable de Defensa del Consumidor se publica por tandas. La web muestra el último día cubierto y usa esas declaraciones para calcular precios habituales y mostrar su evolución. Consultá el [comparador oficial del SIPC](https://www.precios.uy/sipc2Web/) para ver las declaraciones más recientes por sucursal.

## Ver la web localmente

Para probar con una copia de los últimos datos compilados, descargá la rama `gh-pages` y extraé su carpeta `datos` en `web/public`:

```powershell
git fetch origin gh-pages
git archive --output=canasta-datos.tar FETCH_HEAD datos
tar -xf canasta-datos.tar -C web/public
Remove-Item -LiteralPath canasta-datos.tar
```

Después, arrancá la web:

```powershell
cd web
npm ci
npm start
```

La web queda en <http://localhost:4200>. Para los tests: `npx ng test --watch=false` dentro de `web`.

Está hecha con Angular, Three.js para el mapa y Motion para las animaciones. Las decisiones de producto y de diseño están en [PRODUCT.md](PRODUCT.md) y [DESIGN.md](DESIGN.md).

## Cómo se publica

La web es estática y vive en GitHub Pages. `canasta-etl` exporta un catálogo y un archivo de precios históricos por producto a `web/public/datos`. Los otros procesos generan `tiendas.json` y `recientes.json` en la misma carpeta. El navegador calcula las comparaciones sin un servidor propio. La API FastAPI consulta el histórico en DuckDB por separado.

El flujo [Actualizar datos](.github/workflows/datos.yml) revisa las fuentes y vuelve a publicar cada día. También se puede ejecutar a mano desde **Actions → Actualizar datos → Run workflow**.

Para publicar, desde Git Bash y con los datos ya cargados:

```bash
scripts/publicar.sh
```

## Cargar los datos

Requiere Python 3.11 o superior. Los ejemplos son para PowerShell.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\canasta-etl --anio 2026
.\.venv\Scripts\python -m canasta_etl.tiendas web/public/datos
.\.venv\Scripts\python -m canasta_etl.recientes web/public/datos
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

- **La cobertura es parcial.** El catálogo oficial incluye 379 presentaciones, y las tiendas online cubren una parte de ellas. Un total parcial suma únicamente los productos con precios recientes, e indica cuáles faltan.
- **Los precios los declaran los comercios:** por ejemplo, unas curitas de mediana $56 aparecen a $2.539,56. Se conservan y la validación avisa; las fases siguientes tienen que usar medidas robustas, como la mediana.
- **Solo se probó con 2026:** los archivos de otros años pueden tener diferencias, y la base de la API usa únicamente el año más reciente que se procese.

## Nota de origen de los datos

- **Proveedor:** Defensa del Consumidor.
- **Conjunto de datos:** [Sistema de Información de Precios al Consumidor 2026](https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026).
- **Licencia:** [Licencia de Datos Abiertos – Uruguay](https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/documentos/publicaciones/licencia_de_datos_abiertos_0.pdf).
- **Modificaciones:** los datos se transforman como se describe en [Qué corrige la limpieza](#qué-corrige-la-limpieza). Además, se agrega a cada local un tipo (supermercado, farmacia, mayorista o delivery) y se descartan las filas inválidas, repetidas o sin catálogo.

Este repositorio no incluye los datos: el comando los descarga desde la fuente. La silueta de Uruguay del mapa viene de Natural Earth, de dominio público.
