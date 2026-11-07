import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Mapa, Producto } from '../api';
import { DatosService } from '../datos';
import { entero, fecha, precio } from '../formato';
import { masBaratos } from '../mapa/mapa-geometria';
import { MapaPrecios } from '../mapa/mapa-precios';
import { Paso, Revela } from '../revela';

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
  imports: [MapaPrecios, Paso, Revela, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inicio.css',
  template: `
    <div class="escenario">
      <section class="portada__texto" (appPaso)="paso.set(0)">
        <h1>
          <span class="palabra"><span style="--i: 0">¿Dónde</span></span>&ngsp;
          <span class="palabra"><span style="--i: 1">sale</span></span>&ngsp;
          <span class="palabra"><span style="--i: 2">más</span></span>&ngsp;
          <span class="palabra"><span style="--i: 3">barato?</span></span>
        </h1>
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
      </section>

      <div class="portada__mapa">
        <app-mapa-precios [datos]="datosMapa()" [paso]="paso()" />
        @if (mapa.error() || destacados.error()) {
          <p class="aviso aviso-mapa" role="alert">
            No pudimos cargar los precios. Revisá tu conexión y recargá la página.
          </p>
        }
      </div>

      @if (datosMapa(); as datos) {
        <div class="relato">
          <article (appPaso)="paso.set(1)">
            <h2>{{ conPrecio() }} locales, un solo producto</h2>
            <p><strong>{{ datos.producto.nombre }}</strong></p>
            <p>La altura va del percentil 5 al 95, así un precio raro no tapa al resto.</p>
          </article>
          <article (appPaso)="paso.set(2)">
            <h2>{{ enMontevideo() }} están en Montevideo</h2>
            <p>Girá el mapa y tocá una columna para ver el precio y la sucursal.</p>
          </article>
          <article (appPaso)="paso.set(3)">
            <h2>Lo rojo es lo más barato</h2>
            @if (baratos()[0]; as primero) {
              <p>
                Es el 10 % de precios más bajos. El menor: {{ primero.cadena }},
                {{ primero.sucursal }}, con {{ formatoPrecio(primero.precio!) }}.
              </p>
            }
          </article>
        </div>
      }
    </div>

    <section class="contenedor detalle" aria-labelledby="titulo-baratos">
      @if (datosMapa(); as datos) {
        <div class="impresora" appRevela>
          @for (clave of [datos.producto.id]; track clave) {
            <div class="ticket ticket--impreso">
              <p class="ticket__cabeza">Canasta UY<br />Los 5 locales más baratos</p>
              <h2 id="titulo-baratos">{{ datos.producto.nombre }}</h2>
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
              <p class="ticket__pie">
                Precio habitual sin ofertas desde el {{ formatoFecha(datos.desde) }}.
              </p>
            </div>
          }
        </div>
        <div class="siguiente" appRevela>
          <p class="siguiente__titulo">¿Y entre cadenas?</p>
          <p>Compará medianas por zona y mirá cómo cambió el precio semana a semana.</p>
          <a class="boton" [routerLink]="['/producto', datos.producto.id]">Comparar cadenas</a>
        </div>
      } @else {
        <div>
          <h2 id="titulo-baratos" class="seccion-titulo">Los locales más baratos</h2>
          <span class="esqueleto" style="height: 15rem"></span>
        </div>
      }
    </section>

    @if (salud.hasValue()) {
      <section class="origen" aria-labelledby="titulo-origen">
        <div class="contenedor">
          <h2 id="titulo-origen" appRevela>Precios que declaran los propios comercios</h2>
          <dl class="cifras">
            <div appRevela>
              <dd>{{ formatoEntero(salud.value().precios_diarios) }}</dd>
              <dt>precios</dt>
            </div>
            <div appRevela>
              <dd>{{ formatoEntero(salud.value().locales) }}</dd>
              <dt>locales</dt>
            </div>
            <div appRevela>
              <dd>{{ formatoEntero(salud.value().productos) }}</dd>
              <dt>presentaciones de productos</dt>
            </div>
          </dl>
          <p appRevela>
            Los publica Defensa del Consumidor y llegan con retraso: los últimos son del
            {{ formatoFecha(salud.value().datos_hasta) }}, así que no son los precios de hoy.
          </p>
        </div>
      </section>
    }

    <section class="cierre" appRevela>
      <div class="contenedor">
        <h2>Sumá tu compra y mirá qué cadena te sale menos.</h2>
        <a class="boton" routerLink="/canasta">Abrir mi canasta</a>
      </div>
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
  protected readonly paso = signal(0);

  private readonly datos = inject(DatosService);
  protected readonly salud = resource({ loader: () => this.datos.salud() });
  protected readonly destacados = resource({
    loader: () => this.datos.destacados([...PORTADA.keys()]),
  });
  protected readonly busqueda = resource({
    params: () => this.consulta() || undefined,
    loader: ({ params }) => this.datos.buscar(params, 8),
  });

  protected readonly idMapa = computed(
    () =>
      this.elegido() ?? (this.destacados.hasValue() ? (this.destacados.value()[0]?.id ?? null) : null),
  );
  protected readonly mapa = resource({
    params: () => this.idMapa() ?? undefined,
    loader: ({ params }) => this.datos.mapa(params),
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

  protected readonly conPrecio = computed(
    () => (this.datosMapa()?.locales ?? []).filter((local) => local.precio !== null).length,
  );
  protected readonly enMontevideo = computed(
    () =>
      (this.datosMapa()?.locales ?? []).filter(
        (local) => local.precio !== null && local.departamento === 'Montevideo',
      ).length,
  );

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
