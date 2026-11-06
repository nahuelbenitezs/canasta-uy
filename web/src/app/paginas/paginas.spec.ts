import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CanastaStore, CLAVE_CANASTA } from '../canasta-store';
import { Canasta } from './canasta';
import { Producto } from './producto';

const ARROZ = { id: 3, nombre: 'Arroz Blue', producto: 'Arroz', marca: 'Blue', especificacion: '1 kg' };

function preparar(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(HttpTestingController);
}

async function responder(
  http: HttpTestingController,
  coincide: (url: string) => boolean,
  cuerpo: object,
): Promise<void> {
  TestBed.tick();
  for (const pedido of http.match((r) => coincide(r.urlWithParams))) {
    pedido.flush(cuerpo);
  }
  await TestBed.inject(CanastaStore);
  TestBed.tick();
}

describe('página de producto', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  async function crear(http: HttpTestingController) {
    const fixture = TestBed.createComponent(Producto);
    fixture.componentRef.setInput('id', 3);
    fixture.detectChanges();
    await responder(http, (u) => u.startsWith('/v1/filtros'), {
      departamentos: ['Montevideo'],
      barrios: [],
      cadenas: ['Disco'],
      tipos: [],
    });
    await responder(http, (u) => u.includes('/historial'), {
      producto: ARROZ,
      datos_hasta: '2026-09-30',
      puntos: [],
    });
    return fixture;
  }

  it('muestra la cadena más barata primero y aclara que no es el precio de hoy', async () => {
    const http = preparar();
    const fixture = await crear(http);
    await responder(http, (u) => u.includes('/comparacion'), {
      producto: ARROZ,
      desde: '2026-09-07',
      datos_hasta: '2026-09-30',
      resultados: [
        { cadena: 'Ta-Ta', precio_mediano: 40, precio_p10: 38, precio_p90: 42, locales: 9 },
        { cadena: 'Disco', precio_mediano: 55, precio_p10: 50, precio_p90: 60, locales: 3 },
      ],
    });
    fixture.detectChanges();
    const filas = fixture.nativeElement.querySelectorAll('.ranking li');
    expect(filas).toHaveLength(2);
    expect(filas[0].classList).toContain('ganadora');
    expect(filas[1].classList).not.toContain('ganadora');
    expect(fixture.nativeElement.textContent).toContain('no el precio de hoy');
  });

  it('agrega y quita de la canasta', async () => {
    const http = preparar();
    const fixture = await crear(http);
    await responder(http, (u) => u.includes('/comparacion'), {
      producto: ARROZ,
      desde: '2026-09-07',
      datos_hasta: '2026-09-30',
      resultados: [],
    });
    fixture.detectChanges();
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
    const http = preparar();
    const fixture = await crear(http);
    TestBed.tick();
    http
      .expectOne((r) => r.url.includes('/comparacion'))
      .flush({ detail: 'x' }, { status: 404, statusText: 'Not Found' });
    TestBed.tick();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No encontramos ese producto');
  });
});

describe('página de canasta', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  it('invita a buscar cuando está vacía, sin llamar a la API de canasta', async () => {
    const http = preparar();
    const fixture = TestBed.createComponent(Canasta);
    fixture.detectChanges();
    TestBed.tick();
    expect(http.match((r) => r.url.includes('/v1/canasta'))).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Buscar productos');
  });

  it('separa las cadenas que no tienen todos los productos', async () => {
    const http = preparar();
    TestBed.inject(CanastaStore).agregar({ id: 3, nombre: 'Arroz Blue' });
    const fixture = TestBed.createComponent(Canasta);
    fixture.detectChanges();
    await responder(http, (u) => u.startsWith('/v1/canasta'), {
      productos: [ARROZ],
      desde: '2026-09-07',
      datos_hasta: '2026-09-30',
      resultados: [
        { cadena: 'A', total: 100, productos_encontrados: 1, productos_faltantes: [], completa: true },
        { cadena: 'B', total: 130, productos_encontrados: 1, productos_faltantes: [], completa: true },
        { cadena: 'C', total: 20, productos_encontrados: 0, productos_faltantes: [3], completa: false },
      ],
    });
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelectorAll('.totales li')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.ganadora').textContent).toContain('A');
    expect(texto).toContain('1 cadenas no tienen todos los productos');
    expect(texto).toContain('$');
  });
});
