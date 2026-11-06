import { PuntoHistorial } from '../api';
import { masCercano, pasoRedondo, trazar } from './historial-geometria';

const MARGENES = { arriba: 10, derecha: 10, abajo: 20, izquierda: 50 };
const punto = (semana: string, precio_mediano: number): PuntoHistorial => ({
  semana,
  precio_mediano,
  locales: 3,
});

describe('trazado del historial', () => {
  it('une semanas seguidas en un solo tramo', () => {
    const { tramos } = trazar(
      [punto('2026-01-05', 10), punto('2026-01-12', 20), punto('2026-01-19', 15)],
      600,
      300,
      MARGENES,
    );
    expect(tramos).toHaveLength(1);
  });

  it('corta la línea cuando faltan semanas, sin inventar datos', () => {
    const { tramos } = trazar(
      [punto('2026-01-05', 10), punto('2026-01-12', 20), punto('2026-03-02', 15)],
      600,
      300,
      MARGENES,
    );
    expect(tramos).toHaveLength(2);
  });

  it('el precio más alto queda más arriba y todo dentro de los márgenes', () => {
    const { puntos } = trazar([punto('2026-01-05', 10), punto('2026-01-12', 20)], 600, 300, MARGENES);
    expect(puntos[1].y).toBeLessThan(puntos[0].y);
    expect(puntos[0].x).toBe(50);
    expect(puntos[1].x).toBe(590);
    for (const p of puntos) {
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(280);
    }
  });

  it('funciona con un solo punto o con precio constante', () => {
    const uno = trazar([punto('2026-01-05', 35)], 600, 300, MARGENES);
    expect(Number.isFinite(uno.puntos[0].y)).toBe(true);
    expect(uno.marcasY.length).toBeGreaterThan(1);
    expect(trazar([], 600, 300, MARGENES).tramos).toEqual([]);
  });

  it('elige pasos redondos', () => {
    expect(pasoRedondo(100, 4)).toBe(50);
    expect(pasoRedondo(7, 4)).toBe(2);
    expect(pasoRedondo(0, 4)).toBe(1);
  });

  it('encuentra el punto más cercano al cursor', () => {
    const { puntos } = trazar([punto('2026-01-05', 10), punto('2026-01-12', 20)], 600, 300, MARGENES);
    expect(masCercano(puntos, 560)?.semana).toBe('2026-01-12');
    expect(masCercano([], 10)).toBeNull();
  });
});
