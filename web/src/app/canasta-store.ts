import { computed, Injectable, signal } from '@angular/core';

export interface ItemCanasta {
  id: number;
  nombre: string;
}

export interface LineaCanasta extends ItemCanasta {
  cantidad: number;
}

export const CLAVE_CANASTA = 'canasta-uy:v1';
export const MAXIMO_CANASTA = 50;
export const MAXIMA_CANTIDAD = 99;

function esItem(valor: unknown): valor is ItemCanasta & { cantidad?: unknown } {
  const item = valor as ItemCanasta | null;
  return Number.isInteger(item?.id) && typeof item?.nombre === 'string';
}

function cantidadValida(cantidad: unknown): cantidad is number {
  return (
    typeof cantidad === 'number' &&
    Number.isInteger(cantidad) &&
    cantidad >= 1 &&
    cantidad <= MAXIMA_CANTIDAD
  );
}

function leer(): LineaCanasta[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(CLAVE_CANASTA) ?? '[]');
    if (!Array.isArray(guardado)) return [];
    const items = new Map<number, LineaCanasta>();
    for (const item of guardado.filter(esItem)) {
      if (items.has(item.id)) continue;
      const cantidad = cantidadValida(item.cantidad) ? item.cantidad : 1;
      items.set(item.id, { id: item.id, nombre: item.nombre, cantidad });
      if (items.size === MAXIMO_CANASTA) break;
    }
    return [...items.values()];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class CanastaStore {
  private readonly estado = signal<LineaCanasta[]>(leer());

  readonly items = this.estado.asReadonly();
  readonly cantidad = computed(() => this.estado().length);
  readonly ids = computed(() => this.estado().map((item) => item.id));

  contiene(id: number): boolean {
    return this.estado().some((item) => item.id === id);
  }

  agregar(item: ItemCanasta): void {
    if (this.contiene(item.id) || this.cantidad() >= MAXIMO_CANASTA) {
      return;
    }
    this.guardar([...this.estado(), { id: item.id, nombre: item.nombre, cantidad: 1 }]);
  }

  cambiarCantidad(id: number, cantidad: number): void {
    if (!cantidadValida(cantidad)) return;
    this.guardar(this.estado().map((item) => (item.id === id ? { ...item, cantidad } : item)));
  }

  quitar(id: number): void {
    this.guardar(this.estado().filter((item) => item.id !== id));
  }

  vaciar(): void {
    this.guardar([]);
  }

  private guardar(items: LineaCanasta[]): void {
    this.estado.set(items);
    try {
      localStorage.setItem(CLAVE_CANASTA, JSON.stringify(items));
    } catch {
      // Sin almacenamiento disponible, la canasta dura hasta cerrar la pestaña.
    }
  }
}
