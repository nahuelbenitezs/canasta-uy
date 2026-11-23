import type { LineaCanasta } from './canasta-store';
import type { OfertaOnline } from './datos';
import { esReciente } from './formato';

export interface CanastaOnline {
  cadena: string;
  total: number;
  faltantes: LineaCanasta[];
  desde: string;
  hasta: string;
}

export function calcularCanastaOnline(
  items: readonly LineaCanasta[],
  productos: Record<string, OfertaOnline[]>,
  actualizado: string,
  ahora = new Date(),
): CanastaOnline[] {
  const porTienda = new Map<string, Map<number, { precio: number; dia: string }>>();
  for (const item of items) {
    for (const oferta of productos[item.id] ?? []) {
      const dia = oferta.actualizado ?? actualizado;
      if (!esReciente(dia, ahora)) continue;
      const tienda = porTienda.get(oferta.cadena) ?? new Map();
      const anterior = tienda.get(item.id);
      if (
        !anterior ||
        dia > anterior.dia ||
        (dia === anterior.dia && oferta.precio < anterior.precio)
      ) {
        tienda.set(item.id, { precio: oferta.precio, dia });
        porTienda.set(oferta.cadena, tienda);
      }
    }
  }
  const filas = [...porTienda].map(([cadena, precios]) => {
    const fechas = [...precios.values()].map(({ dia }) => dia).sort();
    const totalCentavos = items.reduce(
      (total, item) =>
        total + Math.round((precios.get(item.id)?.precio ?? 0) * 100) * item.cantidad,
      0,
    );
    return {
      cadena,
      total: totalCentavos / 100,
      faltantes: items.filter(({ id }) => !precios.has(id)),
      desde: fechas[0],
      hasta: fechas[fechas.length - 1],
    };
  });
  return filas.sort(
    (a, b) =>
      a.faltantes.length - b.faltantes.length ||
      a.total - b.total ||
      a.cadena.localeCompare(b.cadena),
  );
}
