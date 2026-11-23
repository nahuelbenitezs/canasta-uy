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
const FECHA_MONTEVIDEO = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Montevideo',
  calendar: 'iso8601',
});
const MS_DIA = 24 * 60 * 60 * 1000;

/** Vigente para la comparación si se consultó en los últimos siete días de Uruguay. */
export function esReciente(iso: string, ahora = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const dia = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== iso) return false;
  const partes = FECHA_MONTEVIDEO.formatToParts(ahora);
  const [anio, mes, fecha] = ['year', 'month', 'day'].map((tipo) =>
    Number(partes.find((parte) => parte.type === tipo)?.value),
  );
  const antiguedad = (Date.UTC(anio, mes - 1, fecha) - dia.getTime()) / MS_DIA;
  return antiguedad >= 0 && antiguedad <= 7;
}

export const precio = (valor: number): string =>
  (Number.isInteger(valor) ? PESOS_ENTEROS : PESOS_CON_CENTESIMOS).format(valor);
export const entero = (valor: number): string => ENTERO.format(valor);
export const fecha = (iso: string): string => FECHA.format(new Date(`${iso}T00:00:00Z`));
export const fechaCorta = (iso: string): string => FECHA_CORTA.format(new Date(`${iso}T00:00:00Z`));
export const locales = (n: number): string => (n === 1 ? '1 local' : `${entero(n)} locales`);
