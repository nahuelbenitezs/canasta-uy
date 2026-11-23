import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CanastaStore, MAXIMA_CANTIDAD } from '../canasta-store';
import { DatosService } from '../datos';
import { fecha, fechaCorta, precio } from '../formato';

@Component({
  selector: 'app-canasta',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './canasta.css',
  template: `
    <div class="contenedor pagina">
      <h1 class="banda">Mi canasta</h1>

      @if (store.cantidad() === 0) {
        <div class="vacia">
          <p>Agregá productos a tu lista y compará cuánto cuesta comprarlos juntos.</p>
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
                  <div class="item-acciones">
                    <div
                      class="cantidad"
                      role="group"
                      [attr.aria-label]="'Cantidad de ' + item.nombre"
                    >
                      <button
                        type="button"
                        [disabled]="item.cantidad === 1"
                        [attr.aria-label]="'Restar una unidad de ' + item.nombre"
                        (click)="store.cambiarCantidad(item.id, item.cantidad - 1)"
                      >
                        −
                      </button>
                      <output>{{ item.cantidad }}</output>
                      <button
                        type="button"
                        [disabled]="item.cantidad === maximaCantidad"
                        [attr.aria-label]="'Sumar una unidad de ' + item.nombre"
                        (click)="store.cambiarCantidad(item.id, item.cantidad + 1)"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      class="quitar"
                      [attr.aria-label]="'Quitar ' + item.nombre"
                      (click)="store.quitar(item.id)"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              }
            </ul>
            <div class="acciones-lista">
              <a class="boton boton--claro" routerLink="/">Buscar más productos</a>
              <button type="button" class="quitar" (click)="store.vaciar()">Vaciar canasta</button>
            </div>
          </section>

          <div class="comparaciones">
            <section aria-labelledby="titulo-online">
              <h2 id="titulo-online" class="seccion-titulo">Precios online de tu canasta</h2>
              @if (online.error()) {
                <p class="aviso" role="alert">No pudimos calcular el total online.</p>
              } @else if (online.hasValue()) {
                <div aria-live="polite">
                  @if (online.value().length === 0) {
                    <p class="aviso">
                      Ningún producto de tu canasta tiene precios online consultados en los últimos
                      7 días.
                    </p>
                  } @else {
                    @if (onlineCompletas().length > 0) {
                      <ol class="totales totales-online ticket">
                        @for (fila of onlineCompletas(); track fila.cadena) {
                          <li [class.ganadora]="mejorOnline() === fila.total">
                            <strong>{{ fila.cadena }}</strong>
                            <b>{{ formatoPrecio(fila.total) }}</b>
                            <span class="ayuda fecha-online">
                              @if (fila.desde === fila.hasta) {
                                Consultado el {{ formatoFecha(fila.hasta) }}
                              } @else {
                                Consultado del {{ formatoFechaCorta(fila.desde) }} al
                                {{ formatoFecha(fila.hasta) }}
                              }
                            </span>
                          </li>
                        }
                      </ol>
                    } @else {
                      <p class="aviso">
                        Las tiendas consultadas solo tienen precio reciente para parte de tu
                        canasta.
                      </p>
                    }
                    @if (onlineIncompletas().length > 0) {
                      <details class="parciales" [open]="onlineCompletas().length === 0">
                        <summary>Ver totales parciales</summary>
                        <ul class="totales totales-online parciales-lista">
                          @for (fila of onlineIncompletas(); track fila.cadena) {
                            <li>
                              <strong
                                >{{ fila.cadena }} ·
                                {{ store.cantidad() - fila.faltantes.length }} de
                                {{ store.cantidad() }} productos</strong
                              >
                              <b>{{ formatoPrecio(fila.total) }}</b>
                              <span class="ayuda fecha-online">
                                @if (fila.desde === fila.hasta) {
                                  Consultado el {{ formatoFecha(fila.hasta) }}
                                } @else {
                                  Consultado del {{ formatoFechaCorta(fila.desde) }} al
                                  {{ formatoFecha(fila.hasta) }}
                                }
                              </span>
                              <span class="ayuda fecha-online">
                                Faltan precios para
                                @for (item of fila.faltantes; track item.id; let ultimo = $last) {
                                  {{ item.nombre }}{{ ultimo ? '.' : ', ' }}
                                }
                              </span>
                            </li>
                          }
                        </ul>
                      </details>
                    }
                    <p class="ayuda aire">
                      Totales sin envío, con precios consultados en los últimos 7 días. La
                      disponibilidad y el importe final pueden variar en la tienda.
                    </p>
                  }
                </div>
              } @else {
                <span class="esqueleto" style="height: 8rem"></span>
              }
            </section>

            <details class="historico" [open]="online.hasValue() && online.value().length === 0">
              <summary>Comparar precios históricos por zona</summary>
              <div class="filtros">
                <label class="campo">
                  Departamento
                  <select (change)="cambiarDepartamento($any($event.target).value)">
                    <option value="">Todo el país</option>
                    @if (filtros.hasValue()) {
                      @for (opcion of filtros.value().departamentos; track opcion) {
                        <option [value]="opcion" [selected]="opcion === departamento()">
                          {{ opcion }}
                        </option>
                      }
                    }
                  </select>
                </label>
                <label class="campo">
                  Barrio o zona
                  <select
                    [disabled]="!departamento()"
                    (change)="barrio.set($any($event.target).value || null)"
                  >
                    <option value="">Todos</option>
                    @if (departamento() && filtros.hasValue()) {
                      @for (opcion of filtros.value().barrios; track opcion) {
                        <option [value]="opcion" [selected]="opcion === barrio()">
                          {{ opcion }}
                        </option>
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
                <ol class="totales ticket" aria-live="polite">
                  @for (fila of completas(); track fila.cadena; let i = $index) {
                    <li [class.ganadora]="i === 0 && ahorro() > 0">
                      <strong>{{ fila.cadena }}</strong>
                      <b>{{ formatoPrecio(fila.total) }}</b>
                      @if (i === 0 && ahorro() > 0) {
                        <span class="ayuda"
                          >Más barata por {{ formatoPrecio(ahorro()) }} frente a la más cara</span
                        >
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
                    <summary>
                      {{ incompletas().length }}
                      {{
                        incompletas().length === 1
                          ? 'cadena con datos parciales'
                          : 'cadenas con datos parciales'
                      }}
                    </summary>
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
                  Estimación con precios habituales del SIPC, sin ofertas, del
                  {{ formatoFecha(resultado.value().desde) }} al
                  {{ formatoFecha(resultado.value().datos_hasta) }}.
                </p>
              } @else {
                <span class="esqueleto aire" style="height: 14rem"></span>
              }
            </details>
          </div>
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
  protected readonly formatoFechaCorta = fechaCorta;
  protected readonly maximaCantidad = MAXIMA_CANTIDAD;

  private readonly datos = inject(DatosService);
  protected readonly filtros = resource({
    params: () => ({ departamento: this.departamento() }),
    loader: ({ params }) => this.datos.filtros(params.departamento),
  });
  protected readonly resultado = resource({
    params: () =>
      this.store.cantidad() === 0
        ? undefined
        : { items: this.store.items(), departamento: this.departamento(), barrio: this.barrio() },
    loader: ({ params: { items, ...zona } }) =>
      this.datos.canasta(
        items.map(({ id }) => id),
        zona,
        new Map(items.map(({ id, cantidad }) => [id, cantidad])),
      ),
  });
  protected readonly online = resource({
    params: () => (this.store.cantidad() ? this.store.items() : undefined),
    loader: ({ params }) => this.datos.canastaOnline(params),
  });
  private readonly filasOnline = computed(() =>
    this.online.hasValue() ? this.online.value() : [],
  );
  protected readonly onlineCompletas = computed(() =>
    this.filasOnline().filter((fila) => !fila.faltantes.length),
  );
  protected readonly onlineIncompletas = computed(() =>
    this.filasOnline().filter((fila) => fila.faltantes.length),
  );
  protected readonly mejorOnline = computed(() => {
    const completas = this.onlineCompletas();
    return completas.length > 1 && completas[0].total < completas[completas.length - 1].total
      ? completas[0].total
      : null;
  });

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
