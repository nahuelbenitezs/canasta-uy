# Diseño de Canasta UY

## Idea

Un afiche de ofertas de supermercado convertido en un mapa de datos. La portada es amarillo cartel de punta a punta, con Uruguay en relieve y una columna por local. Al bajar, el mapa queda fijo y un relato de tres pasos lo mueve; después, los más baratos salen impresos en un ticket de caja. Las pantallas de consulta usan el mismo lenguaje con más calma, sobre papel.

## Color

| Token | Valor | Uso |
|---|---|---|
| `--cartel` | `#ffd21f` | Portada, destacados y texto sobre tinta |
| `--tinta` | `#14140f` | Texto, botones, barras y columnas |
| `--papel` | `#fbfaf4` | Fondo de las pantallas de consulta |
| `--papel-hondo` | `#f1efe4` | Avisos y esqueletos de carga |
| `--linea` | `#d6d3c4` | Separadores |
| `--tinta-suave` | `#4d4c42` | Texto secundario |
| `--barato` | `#b3140f` | Solo lo más barato; nunca adorno ni error |

Solo modo claro: se usa de día, muchas veces en el súper y con el celular a pleno sol.

## Tipografía

Archivo variable, servida desde el proyecto. Títulos en peso 800 a 900 y ancho 112 a 118 %, como un cartel. IBM Plex Mono solo en los tickets. Todos los números son tabulares.

## Forma

Radio de 10 px en campos, botones y paneles; los filtros rápidos son píldoras. Las barras y columnas salen de una base recta.

## Movimiento

- **Momento principal:** las columnas brotan en ola desde Montevideo hacia el norte, una sola vez.
- **Título:** cada palabra sube desde atrás de su línea, una vez.
- **Relato al bajar:** cada paso gira la cámara, va a Montevideo o atenúa todo menos lo más barato.
- **Ticket:** se imprime por saltos desde su ranura al aparecer y al cambiar de producto.
- **Secciones:** entran con un desplazamiento corto la primera vez que se ven.
- **Cambio de producto:** las columnas pasan a sus nuevas alturas con un resorte, porque es el mismo mapa con otro dato.
- **Cambio de zona:** la cámara viaja a Montevideo.
- **Consulta:** las barras crecen y la línea del historial se dibuja una vez.
- **Movimiento reducido:** todo aparece directamente, sin ola, resorte, vaivén ni impresión; el relato cambia el mapa sin transición.

## Datos en pantalla

- La altura va del percentil 5 al 95 y lo aclara la leyenda. Las barras de comparación parten de cero.
- La línea se corta si faltan semanas: nunca une un hueco.
- Cada dato trae su período, y el mapa y el historial tienen su versión en texto.
