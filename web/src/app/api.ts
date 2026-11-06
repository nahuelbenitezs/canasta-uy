export interface Producto {
  id: number;
  nombre: string;
  producto: string;
  marca: string | null;
  especificacion: string | null;
}

export interface ResultadoBusqueda {
  total: number;
  resultados: Producto[];
}

export interface Salud {
  estado: string;
  datos_desde: string;
  datos_hasta: string;
  precios_diarios: number;
  locales: number;
  productos: number;
}

export interface Filtros {
  departamentos: string[];
  barrios: string[];
  cadenas: string[];
  tipos: string[];
}

export interface LocalMapa {
  id: number;
  cadena: string | null;
  sucursal: string | null;
  barrio: string | null;
  departamento: string | null;
  latitud: number;
  longitud: number;
  precio: number | null;
}

export interface Mapa {
  producto: Producto;
  desde: string;
  datos_hasta: string;
  locales: LocalMapa[];
}

export interface PrecioCadena {
  cadena: string;
  precio_mediano: number;
  precio_p10: number;
  precio_p90: number;
  locales: number;
}

export interface Comparacion {
  producto: Producto;
  desde: string;
  datos_hasta: string;
  resultados: PrecioCadena[];
}

export interface PuntoHistorial {
  semana: string;
  precio_mediano: number;
  locales: number;
}

export interface Historial {
  producto: Producto;
  datos_hasta: string;
  puntos: PuntoHistorial[];
}

export interface CanastaCadena {
  cadena: string;
  total: number;
  productos_encontrados: number;
  productos_faltantes: number[];
  completa: boolean;
}

export interface Canasta {
  productos: Producto[];
  desde: string;
  datos_hasta: string;
  resultados: CanastaCadena[];
}

type Parametro = string | number | boolean | readonly (string | number)[] | null | undefined;

/** Quita los filtros vacíos para no mandarlos a la API. */
export function parametros(
  valores: Record<string, Parametro>,
): Record<string, string | number | boolean | readonly (string | number)[]> {
  const limpio: Record<string, string | number | boolean | readonly (string | number)[]> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== null && valor !== undefined && valor !== '') {
      limpio[clave] = valor;
    }
  }
  return limpio;
}
