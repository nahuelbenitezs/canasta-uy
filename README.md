# Canasta UY

Observatorio de precios de Uruguay, hecho con los datos abiertos del
[Sistema de Información de Precios al Consumidor](https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026)
(SIPC). Permite comparar cadenas, ver cómo evoluciona cada producto y medir si una oferta es real.

> **Estado:** fase 1 de 5, la carga de datos. La API y la web en Angular todavía no existen.

## Cargar los datos

Requiere Python 3.11 o superior. Los ejemplos son para PowerShell.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\canasta-etl --anio 2026
.\.venv\Scripts\python -m pytest
```

El comando baja solo lo que cambió, escribe los resultados en `data/clean/<año>/` y termina con
error si falla un control. El archivo de precios de 2026 pesa unos 1,5 GB.

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
- **Solo se probó con 2026:** los archivos de otros años pueden tener diferencias.

## Nota de origen de los datos

- **Proveedor:** Defensa del Consumidor.
- **Conjunto de datos:** [Sistema de Información de Precios al Consumidor 2026](https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026).
- **Licencia:** [Licencia de Datos Abiertos – Uruguay](https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/documentos/publicaciones/licencia_de_datos_abiertos_0.pdf).
- **Modificaciones:** los datos se transforman como se describe en [Qué corrige la limpieza](#qué-corrige-la-limpieza). Además, se agrega a cada local un tipo (supermercado, farmacia, mayorista o delivery) y se descartan las filas inválidas, repetidas o sin catálogo.

Este repositorio no incluye los datos: el comando los descarga desde la fuente.
