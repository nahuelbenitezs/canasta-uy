import { LocalMapa } from '../api';

const ESCALA = 2.6;
export const CENTRO_PAIS = { latitud: -32.75, longitud: -56.0 };
export const CENTRO_MONTEVIDEO = { latitud: -34.86, longitud: -56.17 };
const COSENO = Math.cos((CENTRO_PAIS.latitud * Math.PI) / 180);

export interface Punto {
  x: number;
  z: number;
}

export function proyectar(latitud: number, longitud: number): Punto {
  return {
    x: (longitud - CENTRO_PAIS.longitud) * COSENO * ESCALA,
    z: -(latitud - CENTRO_PAIS.latitud) * ESCALA,
  };
}

export function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) {
    return 0;
  }
  const posicion = (ordenados.length - 1) * p;
  const abajo = Math.floor(posicion);
  const arriba = Math.ceil(posicion);
  return ordenados[abajo] + (ordenados[arriba] - ordenados[abajo]) * (posicion - abajo);
}

const conPrecio = (precios: readonly (number | null)[]): number[] =>
  precios.filter((p): p is number => p !== null).sort((a, b) => a - b);

/**
 * Altura relativa de 0 a 1 para cada precio. El rango va del percentil 5 al 95, así un precio mal
 * declarado no aplasta al resto de las columnas. Un local sin precio queda en `null`.
 */
export function alturasRelativas(precios: readonly (number | null)[]): (number | null)[] {
  const ordenados = conPrecio(precios);
  const minimo = percentil(ordenados, 0.05);
  const maximo = percentil(ordenados, 0.95);
  return precios.map((p) => {
    if (p === null) {
      return null;
    }
    if (maximo === minimo) {
      return 0.5;
    }
    return Math.min(1, Math.max(0, (p - minimo) / (maximo - minimo)));
  });
}

/** Marca el 10 % más barato. Si casi todos cobran lo mismo, nadie se destaca. */
export function marcarBaratos(precios: readonly (number | null)[]): boolean[] {
  const ordenados = conPrecio(precios);
  const umbral = percentil(ordenados, 0.1);
  const hayDiferencia = ordenados.length > 0 && umbral < percentil(ordenados, 0.5);
  return precios.map((p) => hayDiferencia && p !== null && p <= umbral);
}

/** Retraso de 0 a 1 para la ola de entrada: nace en Montevideo y recorre el país hacia el norte. */
export function retrasosDeOla(puntos: readonly Punto[]): number[] {
  const origen = proyectar(CENTRO_MONTEVIDEO.latitud, CENTRO_MONTEVIDEO.longitud);
  const distancias = puntos.map((p) => Math.hypot(p.x - origen.x, p.z - origen.z));
  const maxima = Math.max(...distancias, 1);
  return distancias.map((d) => d / maxima);
}

export function masBaratos(locales: readonly LocalMapa[], cantidad: number): LocalMapa[] {
  return locales
    .filter((local) => local.precio !== null)
    .sort((a, b) => (a.precio as number) - (b.precio as number) || a.id - b.id)
    .slice(0, cantidad);
}
