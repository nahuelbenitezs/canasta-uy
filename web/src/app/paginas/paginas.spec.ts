import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Canasta as RespuestaCanasta, Comparacion } from '../api';
import { CanastaStore, CLAVE_CANASTA } from '../canasta-store';
import { DatosService, ProductoNoEncontrado } from '../datos';
import { Canasta } from './canasta';
import { Producto } from './producto';

const ARROZ = {
  id: 3,
  nombre: 'Arroz Blue',
  producto: 'Arroz',
  marca: 'Blue',
  especificacion: '1 kg',
};
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
          ficha: async () => ARROZ,
          filtros: async () => FILTROS,
          comparacion: async () => COMPARACION,
          historial: async () => ({ producto: ARROZ, datos_hasta: '2026-09-30', puntos: [] }),
          tiendas: async () => ({
            actualizado: '2026-11-08',
            ofertas: [
              { cadena: 'Disco', precio: 60, url: 'https://www.disco.com.uy/product/arroz/1' },
            ],
          }),
          canasta,
          canastaOnline: async () => [],
          referenciasRecientes: async () => null,
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

  it('muestra la cadena más barata primero y fecha el período oficial', async () => {
    preparar();
    const fixture = await crear();
    const filas = fixture.nativeElement.querySelectorAll('.ranking li');
    expect(filas).toHaveLength(2);
    expect(filas[0].classList).toContain('ganadora');
    expect(filas[1].classList).not.toContain('ganadora');
    expect(fixture.nativeElement.textContent).toContain('30 de setiembre de 2026');
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
      ficha: async () => {
        throw new ProductoNoEncontrado(3);
      },
    });
    const fixture = await crear();
    expect(fixture.nativeElement.textContent).toContain('No encontramos ese producto');
  });

  it('mantiene los enlaces online si falla la comparación oficial', async () => {
    preparar({
      comparacion: async () => {
        throw new Error('sin conexión');
      },
    });
    const fixture = await crear();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar los precios por cadena');
    expect(fixture.nativeElement.querySelector('.online a')).not.toBeNull();
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
    expect(texto).toContain('1 cadena con datos parciales');
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

  it('ordena por precio los registros recientes y conserva la fecha de cada tienda', async () => {
    const actualizado = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    preparar({
      tiendas: async () => ({
        actualizado,
        ofertas: [
          { cadena: 'Disco', precio: 50, url: 'https://www.disco.com.uy/1' },
          { cadena: 'Devoto', precio: 65, url: 'https://www.devoto.com.uy/1' },
          {
            cadena: 'Géant',
            precio: 30,
            url: 'https://www.geant.com.uy/1',
            actualizado: '2001-01-01',
          },
        ],
      }),
    });
    const fixture = TestBed.createComponent(Producto);
    fixture.componentRef.setInput('id', 3);
    await fixture.whenStable();
    fixture.detectChanges();
    const pagina = fixture.nativeElement as HTMLElement;
    const filas = [...pagina.querySelectorAll('.online li')];
    expect(filas.map((fila) => fila.querySelector('strong')?.textContent)).toEqual([
      'Disco',
      'Devoto',
      'Géant',
    ]);
    expect(filas[0].textContent).toContain('Menor precio reciente');
    expect(filas[2].textContent).toContain('Registro anterior');
    expect(filas[2].querySelector('time')?.dateTime).toBe('2001-01-01');
  });
});
