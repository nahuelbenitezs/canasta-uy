import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { CanastaStore } from './canasta-store';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.css',
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="barra" [class.barra--cartel]="esInicio()">
      <a class="marca" routerLink="/">Canasta UY</a>
      <a class="enlace-canasta" routerLink="/canasta">
        Mi canasta
        @if (canasta.cantidad() > 0) {
          <span class="contador">{{ canasta.cantidad() }}</span>
        }
      </a>
    </header>
    <main id="contenido" tabindex="-1">
      <router-outlet />
    </main>
    <footer class="pie">
      <div class="contenedor">
        <p>
          <strong>Fuente:</strong> Defensa del Consumidor,
          <a
            href="https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sistema-de-informacion-de-precios-al-consumidor-2026"
            rel="noopener"
            >Sistema de Información de Precios al Consumidor 2026</a
          >, con
          <a
            href="https://www.gub.uy/agencia-gobierno-electronico-sociedad-informacion-conocimiento/sites/agencia-gobierno-electronico-sociedad-informacion-conocimiento/files/documentos/publicaciones/licencia_de_datos_abiertos_0.pdf"
            rel="noopener"
            >Licencia de Datos Abiertos - Uruguay</a
          >.
        </p>
        <p>
          Los datos fueron limpiados y resumidos por semana: se corrigieron ubicaciones y se
          descartaron filas inválidas o repetidas. Canasta UY es un proyecto independiente.
          <a href="https://github.com/nahuelbenitezs/canasta-uy" rel="noopener">Ver el código</a>.
        </p>
      </div>
    </footer>
  `,
})
export class App {
  protected readonly canasta = inject(CanastaStore);
  private readonly router = inject(Router);

  protected readonly esInicio = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      map(() => this.router.url.split(/[?#]/)[0] === '/'),
    ),
    { initialValue: true },
  );
}
