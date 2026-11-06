import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { PuntoHistorial } from '../api';
import { fecha, fechaCorta, locales, precio } from '../formato';
import { masCercano, PuntoDibujado, trazar } from './historial-geometria';

const MARGENES = { arriba: 14, derecha: 14, abajo: 28, izquierda: 62 };
const ALTO = 300;

@Component({
  selector: 'app-historial-precios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .grafico {
      position: relative;
    }
    svg {
      display: block;
      width: 100%;
      touch-action: pan-y;
    }
    .rejilla {
      stroke: var(--linea);
      stroke-width: 1;
    }
    text {
      fill: var(--tinta-suave);
      font-size: 13px;
    }
    .linea {
      fill: none;
      stroke: var(--tinta);
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
      stroke-dasharray: 1;
      animation: trazar 900ms var(--salida) both;
    }
    @keyframes trazar {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    .cursor {
      stroke: var(--tinta-suave);
      stroke-width: 1;
    }
    .marcador {
      fill: var(--cartel);
      stroke: var(--tinta);
      stroke-width: 2.5;
    }
    .ficha {
      position: absolute;
      top: 0;
      display: grid;
      padding: 0.35rem 0.65rem;
      border-radius: 8px;
      background: var(--tinta);
      color: var(--papel);
      font-size: 0.85rem;
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
    }
    .ficha strong {
      color: var(--cartel);
      font-size: 1.05rem;
    }
    details {
      margin-top: 0.75rem;
    }
    summary {
      font-weight: 650;
      cursor: pointer;
    }
    .tabla {
      max-height: 18rem;
      margin-top: 0.5rem;
      overflow-y: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 0.3rem 0.5rem;
      border-bottom: 1px solid var(--linea);
      text-align: left;
    }
    td:not(:first-child),
    th:not(:first-child) {
      text-align: right;
    }
  `,
  template: `
    <div class="grafico" #contenedor>
      <svg
        [attr.viewBox]="'0 0 ' + ancho() + ' ' + alto"
        [attr.height]="alto"
        role="img"
        [attr.aria-label]="resumen()"
        (pointermove)="alMover($event)"
        (pointerleave)="activo.set(null)"
      >
        @for (marca of trazado().marcasY; track marca.valor) {
          <line class="rejilla" [attr.x1]="margenes.izquierda" [attr.x2]="ancho() - margenes.derecha" [attr.y1]="marca.y" [attr.y2]="marca.y" />
          <text [attr.x]="margenes.izquierda - 8" [attr.y]="marca.y + 4" text-anchor="end">{{ formatoPrecio(marca.valor) }}</text>
        }
        @for (marca of trazado().marcasX; track marca.semana; let ultimo = $last) {
          <text [attr.x]="marca.x" [attr.y]="alto - 8" [attr.text-anchor]="ultimo ? 'end' : 'middle'">{{ formatoFechaCorta(marca.semana) }}</text>
        }
        @for (tramo of trazado().tramos; track tramo) {
          <path class="linea" pathLength="1" [attr.d]="tramo" />
        }
        @if (activo(); as punto) {
          <line class="cursor" [attr.x1]="punto.x" [attr.x2]="punto.x" [attr.y1]="margenes.arriba" [attr.y2]="alto - margenes.abajo" />
          <circle class="marcador" r="6" [attr.cx]="punto.x" [attr.cy]="punto.y" />
        }
      </svg>
      @if (activo(); as punto) {
        <div class="ficha" [style.left.px]="fichaX(punto)">
          <strong>{{ formatoPrecio(punto.precio_mediano) }}</strong>
          <span>Semana del {{ formatoFechaCorta(punto.semana) }}, {{ formatoLocales(punto.locales) }}</span>
        </div>
      }
    </div>
    <details>
      <summary>Ver los datos en una tabla</summary>
      <div class="tabla" tabindex="0">
        <table>
          <thead>
            <tr><th scope="col">Semana del</th><th scope="col">Precio mediano</th><th scope="col">Locales</th></tr>
          </thead>
          <tbody>
            @for (punto of puntos(); track punto.semana) {
              <tr>
                <td>{{ formatoFecha(punto.semana) }}</td>
                <td>{{ formatoPrecio(punto.precio_mediano) }}</td>
                <td>{{ punto.locales }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </details>
  `,
})
export class HistorialPrecios {
  readonly puntos = input.required<PuntoHistorial[]>();

  protected readonly alto = ALTO;
  protected readonly margenes = MARGENES;
  protected readonly ancho = signal(720);
  protected readonly activo = signal<PuntoDibujado | null>(null);
  protected readonly formatoPrecio = precio;
  protected readonly formatoFecha = fecha;
  protected readonly formatoFechaCorta = fechaCorta;
  protected readonly formatoLocales = locales;

  protected readonly trazado = computed(() =>
    trazar(this.puntos(), this.ancho(), ALTO, MARGENES),
  );
  protected readonly resumen = computed(() => {
    const puntos = this.puntos();
    if (puntos.length === 0) {
      return 'Sin datos';
    }
    const primero = puntos[0];
    const ultimo = puntos[puntos.length - 1];
    return `El precio mediano pasó de ${precio(primero.precio_mediano)} a ${precio(ultimo.precio_mediano)} entre el ${fecha(primero.semana)} y el ${fecha(ultimo.semana)}.`;
  });

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const elemento = this.contenedor().nativeElement;
      const observador = new ResizeObserver(() => {
        if (elemento.clientWidth > 0) {
          this.ancho.set(elemento.clientWidth);
        }
      });
      observador.observe(elemento);
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }

  protected alMover(evento: PointerEvent): void {
    const caja = (evento.currentTarget as SVGElement).getBoundingClientRect();
    this.activo.set(masCercano(this.trazado().puntos, evento.clientX - caja.left));
  }

  protected fichaX(punto: PuntoDibujado): number {
    return Math.min(Math.max(0, punto.x - 90), Math.max(0, this.ancho() - 230));
  }
}
