import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CanastaStore } from '../canasta-store';
import { DatosService } from '../datos';
import { fecha, locales, precio } from '../formato';
import { HistorialPrecios } from '../historial/historial-precios';
import { Revela } from '../revela';

@Component({
  selector: 'app-producto',
  imports: [HistorialPrecios, Revela, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './producto.css',
  template: `
    <div class="contenedor pagina">
      <a class="volver" routerLink="/">Volver al mapa</a>

      @if (comparacion.error()) {
        @if (noExiste()) {
          <h1>No encontramos ese producto</h1>
          <p>Puede que no tenga precios en el período disponible.</p>
        } @else {
          <p class="aviso" role="alert">
            No pudimos cargar los precios. Revisá tu conexión y recargá la página.
          </p>
        }
      } @else {
        <header class="cabecera banda">
          @if (comparacion.hasValue()) {
            <h1>{{ comparacion.value().producto.nombre }}</h1>
            <button
              type="button"
              class="boton"
              [class.boton--claro]="enCanasta()"
              (click)="alternarCanasta()"
            >
              {{ enCanasta() ? 'Quitar de mi canasta' : 'Agregar a mi canasta' }}
            </button>
          } @else {
            <span class="esqueleto" style="height: 4rem; width: min(100%, 36rem)"></span>
          }
        </header>

        <section aria-labelledby="titulo-comparacion">
          <h2 id="titulo-comparacion" class="seccion-titulo">Qué cadena lo vende más barato</h2>
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
              <select
                [disabled]="!departamento()"
                (change)="barrio.set($any($event.target).value || null)"
              >
                <option value="">Todos</option>
                @if (departamento() && filtros.hasValue()) {
                  @for (opcion of filtros.value().barrios; track opcion) {
                    <option [value]="opcion" [selected]="opcion === barrio()">{{ opcion }}</option>
                  }
                }
              </select>
            </label>
            <label class="campo">
              Período
              <select (change)="semanas.set(+$any($event.target).value)">
                <option value="4">Último mes</option>
                <option value="13">Últimos 3 meses</option>
                <option value="26">Últimos 6 meses</option>
              </select>
            </label>
          </div>

          @if (comparacion.isLoading() && !comparacion.hasValue()) {
            <span class="esqueleto" style="height: 16rem; margin-top: 1.5rem"></span>
          } @else if (comparacion.hasValue()) {
            <ol class="ranking" aria-live="polite">
              @for (fila of comparacion.value().resultados; track fila.cadena; let i = $index) {
                <li [style.--i]="i" [class.ganadora]="i === 0 && comparacion.value().resultados.length > 1">
                  <div class="ranking__fila">
                    <strong>{{ fila.cadena }}</strong>
                    <b>{{ formatoPrecio(fila.precio_mediano) }}</b>
                  </div>
                  <span class="barra" [style.--ancho]="fila.precio_mediano / maximo()"></span>
                  <span class="ayuda">
                    {{ formatoLocales(fila.locales) }}@if (fila.precio_p10 !== fila.precio_p90) {, de
                    {{ formatoPrecio(fila.precio_p10) }} a {{ formatoPrecio(fila.precio_p90) }}}
                  </span>
                </li>
              } @empty {
                <li class="aviso">
                  No hay precios de este producto con esos filtros. Probá con otra zona o un período
                  más largo.
                </li>
              }
            </ol>
            <p class="ayuda">
              Precio habitual, sin ofertas, entre el {{ formatoFecha(comparacion.value().desde) }} y
              el {{ formatoFecha(comparacion.value().datos_hasta) }}. Es lo que declaran los
              comercios, no el precio de hoy.
            </p>
          }
        </section>

        @if (online.hasValue() && online.value().ofertas.length > 0) {
          <section aria-labelledby="titulo-online" appRevela>
            <h2 id="titulo-online" class="seccion-titulo">Comprarlo online</h2>
            <ul class="online">
              @for (oferta of online.value().ofertas; track oferta.url) {
                <li>
                  <strong>{{ oferta.cadena }}</strong>
                  <b>{{ formatoPrecio(oferta.precio) }}</b>
                  <a
                    class="boton"
                    [href]="oferta.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'Ver en la tienda de ' + oferta.cadena"
                    >Ver en la tienda</a
                  >
                </li>
              }
            </ul>
            <p class="ayuda">
              Precio de la web de cada cadena, revisado el {{ formatoFecha(online.value().actualizado) }}.
              Puede cambiar según la zona de entrega. Unimos los productos automáticamente, así que confirmá la marca y el tamaño en la tienda.
            </p>
          </section>
        }

        <section aria-labelledby="titulo-historial" class="historial" appRevela>
          <h2 id="titulo-historial" class="seccion-titulo">Cómo cambió el precio</h2>
          <label class="campo selector-cadena">
            Cadena
            <select (change)="cadena.set($any($event.target).value || null)">
              <option value="">Todas</option>
              @if (filtros.hasValue()) {
                @for (opcion of filtros.value().cadenas; track opcion) {
                  <option [value]="opcion" [selected]="opcion === cadena()">{{ opcion }}</option>
                }
              }
            </select>
          </label>
          @if (historial.error()) {
            <p class="aviso" role="alert">No pudimos cargar el historial.</p>
          } @else if (historial.hasValue()) {
            @if (historial.value().puntos.length > 0) {
              <app-historial-precios [puntos]="historial.value().puntos" />
            } @else {
              <p class="aviso">No hay historial con esos filtros.</p>
            }
          } @else {
            <span class="esqueleto" style="height: 18rem"></span>
          }
        </section>
      }
    </div>
  `,
})
export class Producto {
  readonly id = input.required({ transform: numberAttribute });

  protected readonly canasta = inject(CanastaStore);
  protected readonly departamento = signal<string | null>(null);
  protected readonly barrio = signal<string | null>(null);
  protected readonly semanas = signal(4);
  protected readonly cadena = signal<string | null>(null);
  protected readonly formatoPrecio = precio;
  protected readonly formatoFecha = fecha;
  protected readonly formatoLocales = locales;

  private readonly datos = inject(DatosService);
  protected readonly filtros = resource({
    params: () => ({ departamento: this.departamento() }),
    loader: ({ params }) => this.datos.filtros(params.departamento),
  });
  protected readonly comparacion = resource({
    params: () => ({
      id: this.id(),
      departamento: this.departamento(),
      barrio: this.barrio(),
      semanas: this.semanas(),
    }),
    loader: ({ params: { id, semanas, ...zona } }) => this.datos.comparacion(id, zona, semanas),
  });
  protected readonly online = resource({
    params: () => this.id(),
    loader: ({ params }) => this.datos.tiendas(params),
  });
  protected readonly historial = resource({
    params: () => ({
      id: this.id(),
      departamento: this.departamento(),
      barrio: this.barrio(),
      cadena: this.cadena(),
    }),
    loader: ({ params: { id, ...filtro } }) => this.datos.historial(id, filtro),
  });

  protected readonly noExiste = computed(
    () => (this.comparacion.error() as { status?: number } | undefined)?.status === 404,
  );
  protected readonly maximo = computed(() =>
    this.comparacion.hasValue()
      ? Math.max(...this.comparacion.value().resultados.map((fila) => fila.precio_mediano), 1)
      : 1,
  );
  protected readonly enCanasta = computed(() => this.canasta.ids().includes(this.id()));

  protected cambiarDepartamento(valor: string): void {
    this.departamento.set(valor || null);
    this.barrio.set(null);
  }

  protected alternarCanasta(): void {
    if (this.enCanasta()) {
      this.canasta.quitar(this.id());
    } else if (this.comparacion.hasValue()) {
      const { id, nombre } = this.comparacion.value().producto;
      this.canasta.agregar({ id, nombre });
    }
  }
}
