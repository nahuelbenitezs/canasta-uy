import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Canasta as RespuestaCanasta, Comparacion } from '../api';
import { CanastaStore, CLAVE_CANASTA } from '../canasta-store';
import { DatosService, ProductoNoEncontrado } from '../datos';
import { Canasta } from './canasta';
import { Producto } from './producto';

const ARROZ = { id: 3, nombre: 'Arroz Blue', producto: 'Arroz', marca: 'Blue', especificacion: '1 kg' };
const FILTROS = { departamentos: ['Montevideo'], barrios: [], cadenas: ['Disco'], tipos: [] };
const COMPARACION: Comparacion = {
  producto: ARROZ,
  desde: '2026-09-07',
  datos_hasta: '2026-09-30',
  resultados: [
    { cadena: 'Ta-Ta', precio_mediano: 40, precio_p10: 38, precio_p90: 42, locales: 9 },
    { cadena: 'Disco', precio_mediano: 55, precio_p10: 50, precio_p90: 60, locales: 3 },
  ],
};
const CANASTA: RespuestaCanasta = {
  productos: [ARROZ],
  desde: '2026-09-07',
  datos_hasta: '2026-09-30',
  resultados: [
    { cadena: 'A', total: 100, productos_encontrados: 1, productos_faltantes: [], completa: true },
    { cadena: 'B', total: 130, productos_encontrados: 1, productos_faltantes: [], completa: true },
    { cadena: 'C', total: 20, productos_encontrados: 0, productos_faltantes: [3], completa: false },
  ],
};

function preparar(datos: Partial<Record<keyof DatosService, unknown>> = {}) {
  const canasta = vi.fn(async () => CANASTA);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DatosService,
        useValue: {
          filtros: async () => FILTROS,
          comparacion: async () => COMPARACION,
          historial: async () => ({ producto: ARROZ, datos_hasta: '2026-09-30', puntos: [] }),
          tiendas: async () => ({
            actualizado: "2026-11-08",
            ofertas: [{ cadena: "Disco", precio: 60, url: "https://www.disco.com.uy/product/arroz/1" }],
          }),
          canasta,
          ...datos,
        },
      },
    ],
  });
  return { canasta };
}

describe('página de producto', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  async function crear() {
    const fixture = TestBed.createComponent(Producto);
    fixture.componentRef.setInput('id', 3);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra la cadena más barata primero y aclara que no es el precio de hoy', async () => {
    preparar();
    const fixture = await crear();
    const filas = fixture.nativeElement.querySelectorAll('.ranking li');
    expect(filas).toHaveLength(2);
    expect(filas[0].classList).toContain('ganadora');
    expect(filas[1].classList).not.toContain('ganadora');
    expect(fixture.nativeElement.textContent).toContain('no el precio de hoy');
  });

  it('agrega y quita de la canasta', async () => {
    preparar();
    const fixture = await crear();
    const store = TestBed.inject(CanastaStore);
    const boton = fixture.nativeElement.querySelector('.cabecera button') as HTMLButtonElement;
    boton.click();
    expect(store.ids()).toEqual([3]);
    fixture.detectChanges();
    expect(boton.textContent).toContain('Quitar');
    boton.click();
    expect(store.ids()).toEqual([]);
  });

  it('explica cuando el producto no existe', async () => {
    preparar({
      comparacion: async () => {
        throw new ProductoNoEncontrado(3);
      },
    });
    const fixture = await crear();
    expect(fixture.nativeElement.textContent).toContain('No encontramos ese producto');
  });

  it('avisa si falla la carga de datos', async () => {
    preparar({
      comparacion: async () => {
        throw new Error('sin conexión');
      },
    });
    const fixture = await crear();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar los precios');
  });
});

describe('página de canasta', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  it('invita a buscar cuando está vacía, sin calcular la canasta', async () => {
    const { canasta } = preparar();
    const fixture = TestBed.createComponent(Canasta);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(canasta).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Buscar productos');
  });

  it('separa las cadenas que no tienen todos los productos', async () => {
    preparar();
    TestBed.inject(CanastaStore).agregar({ id: 3, nombre: 'Arroz Blue' });
    const fixture = TestBed.createComponent(Canasta);
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelectorAll('.totales li')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.ganadora').textContent).toContain('A');
    expect(texto).toContain('1 cadenas no tienen todos los productos');
  });
});

describe('precio online', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  it('enlaza a la tienda en una pestaña nueva', async () => {
    preparar();
    const fixture = TestBed.createComponent(Producto);
    fixture.componentRef.setInput('id', 3);
    await fixture.whenStable();
    fixture.detectChanges();
    const enlace = fixture.nativeElement.querySelector('.online a') as HTMLAnchorElement;
    expect(enlace.href).toBe('https://www.disco.com.uy/product/arroz/1');
    expect(enlace.target).toBe('_blank');
    expect(enlace.rel).toContain('noopener');
  });
});
