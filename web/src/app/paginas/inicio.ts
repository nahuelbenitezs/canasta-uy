import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Mapa, parametros, Producto, ResultadoBusqueda, Salud } from '../api';
import { entero, fecha, precio } from '../formato';
import { masBaratos } from '../mapa/mapa-geometria';
import { MapaPrecios } from '../mapa/mapa-precios';

const ESPERA_BUSQUEDA_MS = 220;
/** Productos de la canasta diaria para abrir el mapa, en el orden en que se muestran. */
const PORTADA = new Map([
  ['Yerba mate común', 'Yerba'],
  ['Aceite de girasol', 'Aceite'],
  ['Arroz blanco', 'Arroz'],
  ['Café envasado (no instantáneo)', 'Café'],
  ['Dulce de leche', 'Dulce de leche'],
  ['Fideos secos al huevo', 'Fideos'],
]);

@Component({
  selector: 'app-inicio',
  imports: [MapaPrecios, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inicio.css',
  template: `
    <section class="portada">
      <div class="portada__texto">
        <h1>¿Dónde sale más barato?</h1>
        <p class="bajada">
          Cada columna es un supermercado de Uruguay. Cuanto más alta, más caro vende el producto.
        </p>

        <form class="buscador" role="search" (submit)="$event.preventDefault()">
          <label for="busqueda">Buscá un producto</label>
          <input
            id="busqueda"
            type="search"
            autocomplete="off"
            maxlength="100"
            [value]="texto()"
            (input)="escribir($any($event.target).value)"
            (keydown.escape)="escribir('')"
          />
          @if (consulta()) {
            <div class="resultados">
              @if (busqueda.error()) {
                <p role="alert">No pudimos buscar. Probá de nuevo en un momento.</p>
              } @else if (busqueda.hasValue()) {
                <p class="oculto-visual" role="status">{{ busqueda.value().total }} resultados</p>
                @for (producto of busqueda.value().resultados; track producto.id) {
                  <a [routerLink]="['/producto', producto.id]">{{ producto.nombre }}</a>
                } @empty {
                  <p>No encontramos "{{ consulta() }}". Probá con una palabra más general.</p>
                }
              } @else {
                <p>Buscando...</p>
              }
            </div>
          }
        </form>

        @if (destacados.hasValue()) {
          <div class="chips" role="group" aria-label="Ver en el mapa">
            @for (producto of destacados.value(); track producto.id) {
              <button
                type="button"
                [attr.aria-pressed]="producto.id === idMapa()"
                (click)="elegido.set(producto.id)"
              >
                {{ etiqueta(producto) }}
              </button>
            }
          </div>
        }
      </div>

      <div class="portada__mapa">
        <app-mapa-precios [datos]="datosMapa()" />
        @if (mapa.error() || destacados.error()) {
          <p class="aviso aviso-mapa" role="alert">
            No pudimos cargar los precios. Revisá tu conexión y recargá la página.
          </p>
        }
      </div>
    </section>

    <section class="contenedor detalle" aria-labelledby="titulo-baratos">
      @if (datosMapa(); as datos) {
        <div>
          <h2 id="titulo-baratos" class="seccion-titulo">{{ datos.producto.nombre }}</h2>
          <p class="ayuda">
            Los locales más baratos, con el precio habitual sin ofertas desde el
            {{ formatoFecha(datos.desde) }}.
          </p>
          <ol class="baratos">
            @for (local of baratos(); track local.id) {
              <li>
                <span>
                  <strong>{{ local.cadena }}</strong>
                  {{ local.sucursal }}, {{ local.barrio ?? local.departamento }}
                </span>
                <b>{{ formatoPrecio(local.precio!) }}</b>
              </li>
            } @empty {
              <li>No hay precios recientes de este producto.</li>
            }
          </ol>
          <a class="boton" [routerLink]="['/producto', datos.producto.id]">Comparar cadenas</a>
        </div>
      } @else {
        <div>
          <h2 id="titulo-baratos" class="seccion-titulo">Los locales más baratos</h2>
          <span class="esqueleto" style="height: 15rem"></span>
        </div>
      }

      @if (salud.hasValue()) {
        <aside class="origen">
          <h2 class="seccion-titulo">Precios que declaran los propios comercios</h2>
          <p>
            Usamos {{ formatoEntero(salud.value().precios_diarios) }} precios de
            {{ formatoEntero(salud.value().locales) }} locales, publicados por Defensa del
            Consumidor. Llegan con retraso: los últimos son del
            {{ formatoFecha(salud.value().datos_hasta) }}, así que no son los precios de hoy.
          </p>
        </aside>
      }
    </section>
  `,
})
export class Inicio {
  protected readonly formatoPrecio = precio;
  protected readonly formatoFecha = fecha;
  protected readonly formatoEntero = entero;

  protected readonly texto = signal('');
  protected readonly consulta = signal('');
  protected readonly elegido = signal<number | null>(null);

  protected readonly salud = httpResource<Salud>(() => '/salud');
  protected readonly destacados = httpResource<Producto[]>(
    () => ({ url: '/v1/productos/destacados', params: { tipos: [...PORTADA.keys()] } }),
    {
      parse: (respuesta) => {
        const orden = [...PORTADA.keys()];
        return [...(respuesta as Producto[])].sort(
          (a, b) => orden.indexOf(a.producto) - orden.indexOf(b.producto),
        );
      },
    },
  );
  protected readonly busqueda = httpResource<ResultadoBusqueda>(() =>
    this.consulta()
      ? { url: '/v1/productos', params: parametros({ q: this.consulta(), limit: 8 }) }
      : undefined,
  );

  protected readonly idMapa = computed(
    () =>
      this.elegido() ?? (this.destacados.hasValue() ? (this.destacados.value()[0]?.id ?? null) : null),
  );
  protected readonly mapa = httpResource<Mapa>(() => {
    const id = this.idMapa();
    return id === null ? undefined : `/v1/productos/${id}/mapa`;
  });
  /** Conserva el mapa anterior mientras llega el siguiente, para que las columnas se transformen. */
  private ultimoMapa: Mapa | undefined;
  protected readonly datosMapa = computed(() => {
    if (this.mapa.hasValue()) {
      this.ultimoMapa = this.mapa.value();
    }
    return this.ultimoMapa;
  });
  protected readonly baratos = computed(() => masBaratos(this.datosMapa()?.locales ?? [], 5));

  private espera?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.espera));
  }

  protected etiqueta(producto: Producto): string {
    return PORTADA.get(producto.producto) ?? producto.producto;
  }

  protected escribir(valor: string): void {
    this.texto.set(valor);
    clearTimeout(this.espera);
    this.espera = setTimeout(() => this.consulta.set(valor.trim()), ESPERA_BUSQUEDA_MS);
  }
}
