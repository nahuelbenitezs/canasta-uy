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
import { DatosService, ProductoNoEncontrado } from '../datos';
import { esReciente, fecha, locales, precio } from '../formato';
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

      @if (ficha.error()) {
        @if (noExiste()) {
          <h1>No encontramos ese producto</h1>
        } @else {
          <p class="aviso" role="alert">
            No pudimos cargar el producto. Revisá tu conexión y recargá la página.
          </p>
        }
      } @else {
        <header class="cabecera banda">
          @if (ficha.hasValue()) {
            <div>
              <h1>{{ ficha.value().nombre }}</h1>
              @if (presentacion(); as especificacion) {
                <p class="presentacion">{{ especificacion }}</p>
              }
            </div>
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

        <section aria-labelledby="titulo-online">
          <h2 id="titulo-online" class="seccion-titulo">Precios en tiendas online</h2>
          @if (online.isLoading()) {
            <span class="esqueleto" style="height: 7rem"></span>
          } @else if (ofertas().length) {
            <p class="ayuda">Confirmá la presentación, el precio y la entrega en la tienda.</p>
            <ul class="online">
              @for (oferta of ofertas(); track oferta.url) {
                <li [class.ganadora]="oferta.reciente && oferta.precio === menorPrecioReciente()">
                  <div class="online__tienda">
                    <strong>{{ oferta.cadena }}</strong>
                    <span class="ayuda">
                      @if (oferta.fecha) {
                        {{ oferta.reciente ? 'Revisado el' : 'Registro anterior del' }}
                        <time [attr.datetime]="oferta.fecha">{{ formatoFecha(oferta.fecha) }}</time>
                      } @else {
                        Fecha de consulta desconocida
                      }
                    </span>
                  </div>
                  <div class="online__precio">
                    <b>{{ formatoPrecio(oferta.precio) }}</b>
                    @if (oferta.reciente && oferta.precio === menorPrecioReciente()) {
                      <span class="ayuda">Menor precio reciente</span>
                    }
                  </div>
                  <a
                    class="boton boton--claro"
                    [href]="oferta.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="'Ver en la tienda de ' + oferta.cadena"
                    >Ver en la tienda</a
                  >
                </li>
              }
            </ul>
          } @else {
            <p class="aviso">Todavía no tenemos precios online para este producto.</p>
          }
        </section>

        <section class="referencia" aria-labelledby="titulo-referencia">
          <h2 id="titulo-referencia" class="seccion-titulo">Referencia de precios en Uruguay</h2>
          @if (referencia(); as dato) {
            <p class="referencia__mediana">
              <strong>{{ formatoPrecio(dato.mediana) }}</strong> mediana nacional del SIPC
            </p>
            <p>
              El 80 % central de los precios se ubicó entre {{ formatoPrecio(dato.p10) }} y
              {{ formatoPrecio(dato.p90) }}. Datos de {{ formatoLocales(dato.locales) }}.
            </p>
            <p class="ayuda">
              Resumen del
              <time [attr.datetime]="dato.actualizado">{{ formatoFecha(dato.actualizado) }}</time
              >.
              <a
                href="https://cambio-uruguay.com/precios-de-supermercado-uruguay"
                target="_blank"
                rel="noopener noreferrer"
                >Fuente del resumen: Cambio Uruguay y SIPC</a
              >
            </p>
          }
          <a href="https://www.precios.uy/sipc2Web/" target="_blank" rel="noopener noreferrer">
            Consultar precios por sucursal en el SIPC
          </a>
        </section>

        <section aria-labelledby="titulo-comparacion">
          <h2 id="titulo-comparacion" class="seccion-titulo">Precio habitual por cadena</h2>
          <p class="ayuda periodo">
            Precios declarados a Defensa del Consumidor, resumidos con medianas.
          </p>
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
                    <option [value]="opcion" [selected]="opcion === barrio()">{{ opcion }}</option>
                  }
                }
              </select>
            </label>
            <label class="campo">
              Período
              <select (change)="semanas.set(+$any($event.target).value)">
                <option value="1">Semana más reciente publicada</option>
                <option value="4" selected>4 semanas</option>
                <option value="13">13 semanas</option>
                <option value="26">26 semanas</option>
              </select>
            </label>
          </div>

          @if (comparacion.error()) {
            <p class="aviso estado-comparacion" role="alert">
              No pudimos cargar los precios por cadena.
            </p>
          } @else if (comparacion.isLoading() && !comparacion.hasValue()) {
            <span class="esqueleto" style="height: 16rem; margin-top: 1.5rem"></span>
          } @else if (comparacion.hasValue()) {
            <p class="ayuda estado-comparacion">
              Período del {{ formatoFecha(comparacion.value().desde) }} al
              {{ formatoFecha(comparacion.value().datos_hasta) }}.
              @if (!fechaReciente(comparacion.value().datos_hasta)) {
                El registro oficial tiene más de 7 días de retraso.
              }
            </p>
            <ol class="ranking" aria-live="polite">
              @for (fila of comparacion.value().resultados; track fila.cadena; let i = $index) {
                <li
                  [style.--i]="i"
                  [class.ganadora]="i === 0 && comparacion.value().resultados.length > 1"
                >
                  <div class="ranking__fila">
                    <strong>{{ fila.cadena }}</strong>
                    <b>{{ formatoPrecio(fila.precio_mediano) }}</b>
                  </div>
                  <span class="barra" [style.--ancho]="fila.precio_mediano / maximo()"></span>
                  <span class="ayuda">
                    {{ formatoLocales(fila.locales) }}
                    @if (fila.precio_p10 !== fila.precio_p90) {
                      , de {{ formatoPrecio(fila.precio_p10) }} a
                      {{ formatoPrecio(fila.precio_p90) }}
                    }
                  </span>
                </li>
              } @empty {
                <li class="aviso">
                  No hay precios de este producto con esos filtros. Probá con otra zona o un período
                  más largo.
                </li>
              }
            </ol>
          }
        </section>

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
            @if (ultimaSemana(); as semana) {
              <p class="ayuda">
                Último registro con estos filtros en la semana del {{ formatoFecha(semana) }}.
              </p>
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
  protected readonly fechaReciente = esReciente;

  private readonly datos = inject(DatosService);
  protected readonly ficha = resource({
    params: () => this.id(),
    loader: ({ params }) => this.datos.ficha(params),
  });
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
  private readonly referencias = resource({ loader: () => this.datos.referenciasRecientes() });
  protected readonly referencia = computed(() => {
    if (!this.referencias.hasValue()) return null;
    const archivo = this.referencias.value();
    const dato = archivo?.productos[this.id()];
    return dato && archivo ? { ...dato, actualizado: archivo.actualizado } : null;
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

  protected readonly noExiste = computed(() => this.ficha.error() instanceof ProductoNoEncontrado);
  protected readonly presentacion = computed(() => {
    if (!this.ficha.hasValue()) return null;

    const { nombre, especificacion } = this.ficha.value();
    return especificacion && !nombre.toLowerCase().includes(especificacion.toLowerCase())
      ? especificacion
      : null;
  });
  protected readonly ofertas = computed(() => {
    if (!this.online.hasValue()) return [];

    const { actualizado, ofertas } = this.online.value();
    return ofertas
      .map((oferta) => {
        const fecha = oferta.actualizado || actualizado;
        return { ...oferta, fecha, reciente: esReciente(fecha) };
      })
      .sort((a, b) => Number(b.reciente) - Number(a.reciente) || a.precio - b.precio);
  });
  protected readonly menorPrecioReciente = computed(() => {
    const recientes = this.ofertas().filter((oferta) => oferta.reciente);
    const cadenas = new Set(recientes.map((oferta) => oferta.cadena));
    return cadenas.size > 1 ? recientes[0].precio : null;
  });
  protected readonly ultimaSemana = computed(() =>
    this.historial.hasValue() ? this.historial.value().puntos.at(-1)?.semana : undefined,
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
    } else if (this.ficha.hasValue()) {
      const { id, nombre } = this.ficha.value();
      this.canasta.agregar({ id, nombre });
    }
  }
}
