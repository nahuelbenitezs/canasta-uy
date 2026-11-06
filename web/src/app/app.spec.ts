import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { CLAVE_CANASTA } from './canasta-store';

describe('App', () => {
  beforeEach(() => localStorage.removeItem(CLAVE_CANASTA));

  it('cita la fuente y la licencia que exige la nota de origen', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const pie = fixture.nativeElement.querySelector('footer').textContent as string;
    expect(pie).toContain('Defensa del Consumidor');
    expect(pie).toContain('Licencia de Datos Abiertos');
    expect(pie).toContain('Sistema de Información de Precios al Consumidor');
    expect(pie).toContain('limpiados y resumidos');
  });
});
