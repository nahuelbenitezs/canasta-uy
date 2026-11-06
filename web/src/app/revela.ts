import { afterNextRender, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

const sinMovimiento = (): boolean =>
  typeof IntersectionObserver === 'undefined' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Hace entrar el elemento la primera vez que aparece. Sin soporte o con movimiento reducido, queda visible. */
@Directive({ selector: '[appRevela]' })
export class Revela {
  constructor() {
    const elemento = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (sinMovimiento()) {
        return;
      }
      elemento.classList.add('revela');
      const observador = new IntersectionObserver(
        ([entrada]) => {
          if (entrada.isIntersecting) {
            elemento.classList.add('revela--visto');
            observador.disconnect();
          }
        },
        { rootMargin: '0px 0px -8% 0px' },
      );
      observador.observe(elemento);
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }
}

/** Avisa cuando el elemento cruza la línea media de la pantalla: así el relato mueve el mapa. */
@Directive({ selector: '[appPaso]' })
export class Paso {
  readonly appPaso = output<void>();

  constructor() {
    const elemento = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }
      const observador = new IntersectionObserver(
        ([entrada]) => {
          if (entrada.isIntersecting) {
            this.appPaso.emit();
          }
        },
        { rootMargin: '-50% 0px -50% 0px' },
      );
      observador.observe(elemento);
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }
}
