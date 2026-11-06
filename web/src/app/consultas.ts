import type {
  Canasta,
  CanastaCadena,
  Comparacion,
  Filtros,
  Historial,
  LocalMapa,
  Mapa,
  PrecioCadena,
  Producto,
  PuntoHistorial,
  ResultadoBusqueda,
  Salud,
} from './api';

export interface LocalDatos extends Omit<LocalMapa, 'precio' | 'latitud' | 'longitud'> {
  tipo: string;
  latitud: number | null;
  longitud: number | null;
}

export interface Catalogo {
  salud: Salud;
  locales: LocalDatos[];
  productos: Producto[];
  destacados: Producto[];
}

export interface MatrizPrecios {
  semanas: string[];
  locales: number[];
  precios: (number | null)[][];
}

export interface FiltroZona {
  tipo?: string;
  departamento?: string | null;
  barrio?: string | null;
  cadena?: string | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;

function percentil(valores: readonly number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const posicion = (ordenados.length - 1) * p;
  const abajo = Math.floor(posicion);
  const arriba = Math.ceil(posicion);
  return ordenados[abajo] + (ordenados[arriba] - ordenados[abajo]) * (posicion - abajo);
}

const mediana = (valores: readonly number[]): number => percentil(valores, 0.5);
const redondear = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;
const comparar = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Lunes de la semana de `hasta`, retrocediendo las semanas pedidas. */
export function inicioPeriodo(hasta: string, semanas: number): string {
  const fecha = new Date(`${hasta}T00:00:00Z`);
  const desdeLunes = (fecha.getUTCDay() + 6) % 7;
  const inicio = fecha.getTime() - (desdeLunes + (semanas - 1) * 7) * MS_DIA;
  return new Date(inicio).toISOString().slice(0, 10);
}

function coincide(local: LocalDatos, filtro: FiltroZona): boolean {
  return (
    local.tipo === (filtro.tipo ?? 'supermercado') &&
    (!filtro.departamento || local.departamento === filtro.departamento) &&
    (!filtro.barrio || local.barrio === filtro.barrio) &&
    (!filtro.cadena || local.cadena === filtro.cadena)
  );
}

/** Mediana del precio de cada local desde una fecha; los locales sin datos no aparecen. */
function preciosPorLocal(matriz: MatrizPrecios, desde: string): Map<number, number> {
  const resultado = new Map<number, number>();
  matriz.locales.forEach((id, fila) => {
    const valores = matriz.precios[fila].filter(
      (precio, columna): precio is number => precio !== null && matriz.semanas[columna] >= desde,
    );
    if (valores.length > 0) {
      resultado.set(id, mediana(valores));
    }
  });
  return resultado;
}

function preciosPorCadena(
  catalogo: Catalogo,
  matriz: MatrizPrecios,
  desde: string,
  filtro: FiltroZona,
  incluirSinCadena = false,
): Map<string, number[]> {
  const precios = preciosPorLocal(matriz, desde);
  const porCadena = new Map<string, number[]>();
  for (const local of catalogo.locales) {
    const precio = precios.get(local.id);
    if (
      precio === undefined ||
      local.cadena === null ||
      !coincide(local, filtro) ||
      (!incluirSinCadena && local.cadena === 'Sin cadena')
    ) {
      continue;
    }
    porCadena.set(local.cadena, [...(porCadena.get(local.cadena) ?? []), precio]);
  }
  return porCadena;
}

export function comparar_cadenas(
  catalogo: Catalogo,
  matriz: MatrizPrecios,
  producto: Producto,
  filtro: FiltroZona,
  semanas: number,
): Comparacion {
  const hasta = catalogo.salud.datos_hasta;
  const desde = inicioPeriodo(hasta, semanas);
  const resultados: PrecioCadena[] = [...preciosPorCadena(catalogo, matriz, desde, filtro)].map(
    ([cadena, precios]) => ({
      cadena,
      precio_mediano: redondear(mediana(precios)),
      precio_p10: redondear(percentil(precios, 0.1)),
      precio_p90: redondear(percentil(precios, 0.9)),
      locales: precios.length,
    }),
  );
  resultados.sort((a, b) => a.precio_mediano - b.precio_mediano || comparar(a.cadena, b.cadena));
  return { producto, desde, datos_hasta: hasta, resultados };
}

export function calcular_historial(
  catalogo: Catalogo,
  matriz: MatrizPrecios,
  producto: Producto,
  filtro: FiltroZona,
): Historial {
  const validos = new Set(catalogo.locales.filter((l) => coincide(l, filtro)).map((l) => l.id));
  const puntos: PuntoHistorial[] = [];
  matriz.semanas.forEach((semana, columna) => {
    const precios: number[] = [];
    matriz.locales.forEach((id, fila) => {
      const precio = matriz.precios[fila][columna];
      if (precio !== null && validos.has(id)) {
        precios.push(precio);
      }
    });
    if (precios.length > 0) {
      puntos.push({
        semana,
        precio_mediano: redondear(mediana(precios)),
        locales: precios.length,
      });
    }
  });
  return { producto, datos_hasta: catalogo.salud.datos_hasta, puntos };
}

export function calcular_mapa(
  catalogo: Catalogo,
  matriz: MatrizPrecios,
  producto: Producto,
  semanas = 4,
): Mapa {
  const hasta = catalogo.salud.datos_hasta;
  const desde = inicioPeriodo(hasta, semanas);
  const precios = preciosPorLocal(matriz, desde);
  const locales: LocalMapa[] = [];
  for (const local of catalogo.locales) {
    if (local.tipo === 'supermercado' && local.latitud !== null && local.longitud !== null) {
      const precio = precios.get(local.id);
      locales.push({
        id: local.id,
        cadena: local.cadena,
        sucursal: local.sucursal,
        barrio: local.barrio,
        departamento: local.departamento,
        latitud: local.latitud,
        longitud: local.longitud,
        precio: precio === undefined ? null : redondear(precio),
      });
    }
  }
  return { producto, desde, datos_hasta: hasta, locales };
}

export function calcular_canasta(
  catalogo: Catalogo,
  matrices: readonly { producto: Producto; matriz: MatrizPrecios }[],
  filtro: FiltroZona,
  semanas = 4,
): Canasta {
  const hasta = catalogo.salud.datos_hasta;
  const desde = inicioPeriodo(hasta, semanas);
  const acumulado = new Map<string, { total: number; encontrados: Set<number> }>();
  for (const { producto, matriz } of matrices) {
    for (const [cadena, precios] of preciosPorCadena(catalogo, matriz, desde, filtro)) {
      const fila = acumulado.get(cadena) ?? { total: 0, encontrados: new Set<number>() };
      fila.total += mediana(precios);
      fila.encontrados.add(producto.id);
      acumulado.set(cadena, fila);
    }
  }
  const ids = matrices.map(({ producto }) => producto.id);
  const resultados: CanastaCadena[] = [...acumulado].map(([cadena, { total, encontrados }]) => ({
    cadena,
    total: redondear(total),
    productos_encontrados: encontrados.size,
    productos_faltantes: ids.filter((id) => !encontrados.has(id)),
    completa: encontrados.size === ids.length,
  }));
  resultados.sort(
    (a, b) =>
      Number(!a.completa) - Number(!b.completa) ||
      a.total - b.total ||
      comparar(a.cadena, b.cadena),
  );
  return { productos: matrices.map((m) => m.producto), desde, datos_hasta: hasta, resultados };
}

export function buscar_productos(catalogo: Catalogo, texto: string, limite: number): ResultadoBusqueda {
  const terminos = normalizar(texto).split(/\s+/).filter(Boolean);
  const hallados = catalogo.productos.filter((producto) => {
    const contenido = normalizar(
      [producto.nombre, producto.producto, producto.marca].filter(Boolean).join(' '),
    );
    return terminos.every((termino) => contenido.includes(termino));
  });
  return { total: hallados.length, resultados: hallados.slice(0, limite) };
}

const distintos = (valores: readonly (string | null)[]): string[] =>
  [...new Set(valores.filter((v): v is string => v !== null))].sort(comparar);

export function calcular_filtros(catalogo: Catalogo, departamento: string | null): Filtros {
  return {
    departamentos: distintos(catalogo.locales.map((l) => l.departamento)),
    barrios: departamento
      ? distintos(
          catalogo.locales.filter((l) => l.departamento === departamento).map((l) => l.barrio),
        )
      : [],
    cadenas: distintos(catalogo.locales.map((l) => l.cadena)),
    tipos: distintos(catalogo.locales.map((l) => l.tipo)),
  };
}
