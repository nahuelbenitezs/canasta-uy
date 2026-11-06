import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Canasta as RespuestaCanasta, Filtros, parametros } from '../api';
import { CanastaStore } from '../canasta-store';
import { fecha, precio } from '../formato';

@Component({
  selector: 'app-canasta',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './canasta.css',
  template: `
    <div class="contenedor pagina">
      <h1>Mi canasta</h1>

      @if (store.cantidad() === 0) {
        <div class="vacia">
          <p>Agregá productos desde su página y te mostramos qué cadena te sale más barata.</p>
          <a class="boton" routerLink="/">Buscar productos</a>
        </div>
      } @else {
        <div class="disposicion">
          <section aria-labelledby="titulo-productos">
            <h2 id="titulo-productos" class="seccion-titulo">
              {{ store.cantidad() === 1 ? '1 producto' : store.cantidad() + ' productos' }}
            </h2>
            <ul class="productos">
              @for (item of store.items(); track item.id) {
                <li>
                  <a [routerLink]="['/producto', item.id]">{{ item.nombre }}</a>
                  <button
                    type="button"
                    class="quitar"
                    [attr.aria-label]="'Quitar ' + item.nombre"
                    (click)="store.quitar(item.id)"
                  >
                    Quitar
                  </button>
                </li>
              }
            </ul>
            <button type="button" class="boton boton--claro" (click)="store.vaciar()">
              Vaciar canasta
            </button>
          </section>

          <section aria-labelledby="titulo-total">
            <h2 id="titulo-total" class="seccion-titulo">Dónde te sale más barata</h2>
            <div class="filtros">
              <label class="campo">
                Departamento
                <select (change)="cambiarDepartamento($any($event.target).value)">
                  <option value="">Todo el país</option>
                  @if (filtros.hasValue()) {
                    @for (opcion of filtros.value().departamentos; track opcion) {
                      <option [value]="opcion" [selected]="opcion === departamento()">{{ opcion }}</option>
                    }
                  }
                </select>
              </label>
              <label class="campo">
                Barrio o zona
                <select [disabled]="!departamento()" (change)="barrio.set($any($event.target).value || null)">
                  <option value="">Todos</option>
                  @if (departamento() && filtros.hasValue()) {
                    @for (opcion of filtros.value().barrios; track opcion) {
                      <option [value]="opcion" [selected]="opcion === barrio()">{{ opcion }}</option>
                    }
                  }
                </select>
              </label>
            </div>

            @if (resultado.error()) {
              <p class="aviso aire" role="alert">
                No pudimos calcular la canasta. Revisá tu conexión y recargá la página.
              </p>
            } @else if (resultado.hasValue()) {
              <ol class="totales" aria-live="polite">
                @for (fila of completas(); track fila.cadena; let i = $index) {
                  <li [class.ganadora]="i === 0 && completas().length > 1">
                    <strong>{{ fila.cadena }}</strong>
                    <b>{{ formatoPrecio(fila.total) }}</b>
                    @if (i === 0 && completas().length > 1) {
                      <span class="ayuda">Más barata por {{ formatoPrecio(ahorro()) }} frente a la más cara</span>
                    }
                  </li>
                } @empty {
                  <li class="aviso">
                    Ninguna cadena tiene todos estos productos en esa zona. Probá con otra zona o
                    quitá algún producto.
                  </li>
                }
              </ol>
              @if (incompletas().length > 0) {
                <details>
                  <summary>{{ incompletas().length }} cadenas no tienen todos los productos</summary>
                  <ul class="incompletas">
                    @for (fila of incompletas(); track fila.cadena) {
                      <li>
                        {{ fila.cadena }}: {{ fila.productos_encontrados }} de
                        {{ store.cantidad() }} productos, {{ formatoPrecio(fila.total) }}
                      </li>
                    }
                  </ul>
                </details>
              }
              <p class="ayuda aire">
                Suma del precio habitual, sin ofertas, entre el
                {{ formatoFecha(resultado.value().desde) }} y el
                {{ formatoFecha(resultado.value().datos_hasta) }}. No es el precio de hoy.
              </p>
            } @else {
              <span class="esqueleto aire" style="height: 14rem"></span>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class Canasta {
  protected readonly store = inject(CanastaStore);
  protected readonly departamento = signal<string | null>(null);
  protected readonly barrio = signal<string | null>(null);
  protected readonly formatoPrecio = precio;
  protected readonly formatoFecha = fecha;

  protected readonly filtros = httpResource<Filtros>(() => ({
    url: '/v1/filtros',
    params: parametros({ departamento: this.departamento() }),
  }));
  protected readonly resultado = httpResource<RespuestaCanasta>(() =>
    this.store.cantidad() === 0
      ? undefined
      : {
          url: '/v1/canasta',
          params: parametros({
            productos: this.store.ids(),
            departamento: this.departamento(),
            barrio: this.barrio(),
          }),
        },
  );

  private readonly filas = computed(() =>
    this.resultado.hasValue() ? this.resultado.value().resultados : [],
  );
  protected readonly completas = computed(() => this.filas().filter((fila) => fila.completa));
  protected readonly incompletas = computed(() => this.filas().filter((fila) => !fila.completa));
  protected readonly ahorro = computed(() => {
    const totales = this.completas().map((fila) => fila.total);
    return totales.length > 1 ? Math.max(...totales) - Math.min(...totales) : 0;
  });

  protected cambiarDepartamento(valor: string): void {
    this.departamento.set(valor || null);
    this.barrio.set(null);
  }
}
