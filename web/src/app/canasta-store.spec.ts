import { TestBed } from '@angular/core/testing';
import { CanastaStore, CLAVE_CANASTA, MAXIMO_CANASTA } from './canasta-store';

function crear(): CanastaStore {
  TestBed.resetTestingModule();
  return TestBed.inject(CanastaStore);
}

describe('CanastaStore', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  it('agrega sin repetir y quita', () => {
    const store = crear();
    store.agregar({ id: 1, nombre: 'Arroz' });
    store.agregar({ id: 1, nombre: 'Arroz' });
    store.agregar({ id: 2, nombre: 'Café' });
    expect(store.ids()).toEqual([1, 2]);
    store.quitar(1);
    expect(store.ids()).toEqual([2]);
  });

  it('recuerda la canasta entre visitas', () => {
    crear().agregar({ id: 7, nombre: 'Yerba' });
    expect(crear().items()).toEqual([{ id: 7, nombre: 'Yerba' }]);
  });

  it('respeta el máximo que acepta la API', () => {
    const store = crear();
    for (let id = 1; id <= MAXIMO_CANASTA + 5; id++) {
      store.agregar({ id, nombre: `P${id}` });
    }
    expect(store.cantidad()).toBe(MAXIMO_CANASTA);
  });

  it.each([
    ['JSON roto', '{no es json'],
    ['otro tipo', '{"id":1}'],
  ])('ignora datos guardados inválidos: %s', (_nombre, guardado) => {
    localStorage.setItem(CLAVE_CANASTA, guardado);
    expect(crear().items()).toEqual([]);
  });

  it('descarta solo los elementos inválidos', () => {
    localStorage.setItem(
      CLAVE_CANASTA,
      JSON.stringify([{ id: 1, nombre: 'Bueno' }, { id: 'x', nombre: 'Malo' }, null]),
    );
    expect(crear().ids()).toEqual([1]);
  });
});
