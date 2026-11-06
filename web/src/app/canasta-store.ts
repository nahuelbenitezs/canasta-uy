import { computed, Injectable, signal } from '@angular/core';

export interface ItemCanasta {
  id: number;
  nombre: string;
}

export const CLAVE_CANASTA = 'canasta-uy:v1';
export const MAXIMO_CANASTA = 50;

function esItem(valor: unknown): valor is ItemCanasta {
  const item = valor as ItemCanasta | null;
  return Number.isInteger(item?.id) && typeof item?.nombre === 'string';
}

function leer(): ItemCanasta[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(CLAVE_CANASTA) ?? '[]');
    return Array.isArray(guardado) ? guardado.filter(esItem).slice(0, MAXIMO_CANASTA) : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class CanastaStore {
  private readonly estado = signal<ItemCanasta[]>(leer());

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
    this.guardar([...this.estado(), { id: item.id, nombre: item.nombre }]);
  }

  quitar(id: number): void {
    this.guardar(this.estado().filter((item) => item.id !== id));
  }

  vaciar(): void {
    this.guardar([]);
  }

  private guardar(items: ItemCanasta[]): void {
    this.estado.set(items);
    try {
      localStorage.setItem(CLAVE_CANASTA, JSON.stringify(items));
    } catch {
      // Sin almacenamiento disponible, la canasta dura hasta cerrar la pestaña.
    }
  }
}
