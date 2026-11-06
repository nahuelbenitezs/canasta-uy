import { PuntoHistorial } from '../api';

const MS_SEMANA = 7 * 24 * 60 * 60 * 1000;

export interface Margenes {
  arriba: number;
  derecha: number;
  abajo: number;
  izquierda: number;
}

export interface PuntoDibujado extends PuntoHistorial {
  x: number;
  y: number;
}

export interface Trazado {
  puntos: PuntoDibujado[];
  /** Un tramo por cada período continuo: un hueco en los datos corta la línea. */
  tramos: string[];
  marcasY: { valor: number; y: number }[];
  marcasX: { semana: string; x: number }[];
}

const tiempo = (semana: string): number => Date.parse(`${semana}T00:00:00Z`);

export function pasoRedondo(rango: number, marcas: number): number {
  if (rango <= 0) {
    return 1;
  }
  const crudo = rango / Math.max(1, marcas);
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const relativo = crudo / magnitud;
  const redondo = relativo <= 1 ? 1 : relativo <= 2 ? 2 : relativo <= 5 ? 5 : 10;
  return redondo * magnitud;
}

export function trazar(
  puntos: readonly PuntoHistorial[],
  ancho: number,
  alto: number,
  margenes: Margenes,
): Trazado {
  if (puntos.length === 0) {
    return { puntos: [], tramos: [], marcasY: [], marcasX: [] };
  }
  const interiorAncho = Math.max(1, ancho - margenes.izquierda - margenes.derecha);
  const interiorAlto = Math.max(1, alto - margenes.arriba - margenes.abajo);
  const precios = puntos.map((p) => p.precio_mediano);
  const minimoDato = Math.min(...precios);
  const maximoDato = Math.max(...precios);
  const paso = pasoRedondo(maximoDato - minimoDato || maximoDato * 0.1 || 1, 4);
  const minimo = Math.floor(minimoDato / paso) * paso - (minimoDato === maximoDato ? paso : 0);
  const maximo = Math.ceil(maximoDato / paso) * paso + (minimoDato === maximoDato ? paso : 0);
  const inicio = tiempo(puntos[0].semana);
  const duracion = Math.max(1, tiempo(puntos[puntos.length - 1].semana) - inicio);

  const escalaX = (semana: string): number =>
    margenes.izquierda +
    (puntos.length === 1 ? interiorAncho / 2 : ((tiempo(semana) - inicio) / duracion) * interiorAncho);
  const escalaY = (valor: number): number =>
    margenes.arriba + (1 - (valor - minimo) / (maximo - minimo)) * interiorAlto;

  const dibujados = puntos.map((p) => ({
    ...p,
    x: escalaX(p.semana),
    y: escalaY(p.precio_mediano),
  }));

  const tramos: string[] = [];
  let actual = '';
  dibujados.forEach((p, i) => {
    const hueco = i > 0 && tiempo(p.semana) - tiempo(dibujados[i - 1].semana) > MS_SEMANA;
    if (i === 0 || hueco) {
      if (actual) {
        tramos.push(actual);
      }
      actual = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    } else {
      actual += `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
  });
  tramos.push(actual);

  const marcasY: Trazado['marcasY'] = [];
  for (let valor = minimo; valor <= maximo + paso / 1000; valor += paso) {
    const redondeado = Number(valor.toFixed(4));
    marcasY.push({ valor: redondeado, y: escalaY(redondeado) });
  }

  const cantidadX = Math.max(2, Math.min(6, Math.floor(interiorAncho / 110)));
  const marcasX = Array.from({ length: cantidadX }, (_, i) => {
    const punto = dibujados[Math.round((i * (dibujados.length - 1)) / (cantidadX - 1))];
    return { semana: punto.semana, x: punto.x };
  }).filter((marca, i, todas) => i === 0 || marca.semana !== todas[i - 1].semana);

  return { puntos: dibujados, tramos, marcasY, marcasX };
}

export function masCercano(puntos: readonly PuntoDibujado[], x: number): PuntoDibujado | null {
  let mejor: PuntoDibujado | null = null;
  for (const punto of puntos) {
    if (mejor === null || Math.abs(punto.x - x) < Math.abs(mejor.x - x)) {
      mejor = punto;
    }
  }
  return mejor;
}
