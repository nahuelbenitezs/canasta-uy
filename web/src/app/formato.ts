const pesos = (decimales: number) =>
  new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
const PESOS_ENTEROS = pesos(0);
const PESOS_CON_CENTESIMOS = pesos(2);
const ENTERO = new Intl.NumberFormat('es-UY');
const FECHA = new Intl.DateTimeFormat('es-UY', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const FECHA_CORTA = new Intl.DateTimeFormat('es-UY', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const precio = (valor: number): string =>
  (Number.isInteger(valor) ? PESOS_ENTEROS : PESOS_CON_CENTESIMOS).format(valor);
export const entero = (valor: number): string => ENTERO.format(valor);
export const fecha = (iso: string): string => FECHA.format(new Date(`${iso}T00:00:00Z`));
export const fechaCorta = (iso: string): string =>
  FECHA_CORTA.format(new Date(`${iso}T00:00:00Z`));
export const locales = (n: number): string => (n === 1 ? '1 local' : `${entero(n)} locales`);
