import { LocalMapa } from '../api';
import {
  alturasRelativas,
  CENTRO_MONTEVIDEO,
  marcarBaratos,
  masBaratos,
  percentil,
  proyectar,
  retrasosDeOla,
} from './mapa-geometria';

const local = (id: number, precio: number | null): LocalMapa => ({
  id,
  cadena: 'C',
  sucursal: 'S',
  barrio: null,
  departamento: null,
  latitud: -34,
  longitud: -56,
  precio,
});

describe('geometría del mapa', () => {
  it('ubica el norte lejos y hacia el fondo', () => {
    expect(proyectar(-30.5, -56).z).toBeLessThan(proyectar(-34.9, -56).z);
    expect(proyectar(-33, -53.5).x).toBeGreaterThan(proyectar(-33, -58).x);
  });

  it('interpola percentiles', () => {
    expect(percentil([10, 20], 0.5)).toBe(15);
    expect(percentil([], 0.5)).toBe(0);
  });

  it('un precio mal declarado no aplasta al resto de las columnas', () => {
    const precios = [...Array.from({ length: 40 }, (_, i) => 50 + i), 5000];
    const alturas = alturasRelativas(precios) as number[];
    expect(alturas[40]).toBe(1);
    expect(alturas[20]).toBeGreaterThan(0.4);
    expect(alturas[20]).toBeLessThan(0.65);
  });

  it('deja sin altura a los locales sin precio y centra si todos cobran igual', () => {
    expect(alturasRelativas([null, 30, 30])).toEqual([null, 0.5, 0.5]);
    expect(alturasRelativas([null])).toEqual([null]);
  });

  it('marca el 10 % más barato', () => {
    const baratos = marcarBaratos(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(baratos.filter(Boolean)).toHaveLength(2);
    expect(baratos[0]).toBe(true);
    expect(baratos[19]).toBe(false);
  });

  it('no destaca a nadie si casi todos cobran lo mismo', () => {
    expect(marcarBaratos([35, 35, 35, 35, 90]).some(Boolean)).toBe(false);
    expect(marcarBaratos([null, null]).some(Boolean)).toBe(false);
  });

  it('la ola empieza en Montevideo', () => {
    const puntos = [
      proyectar(CENTRO_MONTEVIDEO.latitud, CENTRO_MONTEVIDEO.longitud),
      proyectar(-30.4, -56.5),
    ];
    expect(retrasosDeOla(puntos)).toEqual([0, 1]);
  });

  it('lista los más baratos e ignora los locales sin precio', () => {
    const lista = masBaratos([local(1, 50), local(2, null), local(3, 30), local(4, 30)], 2);
    expect(lista.map((l) => l.id)).toEqual([3, 4]);
  });
});
