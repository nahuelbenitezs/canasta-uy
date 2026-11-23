import { esReciente } from './formato';
import { calcularCanastaOnline } from './precios-online';

const AHORA = new Date('2026-11-24T01:30:00Z'); // 23 de noviembre en Uruguay.

it('usa el día de Uruguay, incluyendo siete días atrás y rechazando fechas inválidas', () => {
  expect(esReciente('2026-11-16', AHORA)).toBe(true);
  expect(esReciente('2026-11-15', AHORA)).toBe(false);
  expect(esReciente('2026-11-24', AHORA)).toBe(false);
  expect(esReciente('2026-02-30', AHORA)).toBe(false);
});

it('suma cantidades, respeta las fechas por tienda y deja incompletos al final', () => {
  const arroz = { id: 1, nombre: 'Arroz', cantidad: 2 };
  const yerba = { id: 2, nombre: 'Yerba', cantidad: 1 };
  const oferta = (cadena: string, precio: number, actualizado?: string) => ({
    cadena,
    precio,
    url: 'https://example.com',
    actualizado,
  });
  const filas = calcularCanastaOnline(
    [arroz, yerba],
    {
      1: [oferta('A', 36.17), oferta('B', 30), oferta('A', 30, '2026-11-18')],
      2: [oferta('A', 60, '2026-11-22'), oferta('B', 25, '2026-11-15')],
    },
    '2026-11-23',
    AHORA,
  );
  expect(filas).toEqual([
    { cadena: 'A', total: 132.34, faltantes: [], desde: '2026-11-22', hasta: '2026-11-23' },
    { cadena: 'B', total: 60, faltantes: [yerba], desde: '2026-11-23', hasta: '2026-11-23' },
  ]);
});
