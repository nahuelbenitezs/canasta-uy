import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Canasta UY: dónde sale más barato en Uruguay',
    loadComponent: () => import('./paginas/inicio').then((m) => m.Inicio),
  },
  {
    path: 'producto/:id',
    title: 'Precio del producto | Canasta UY',
    loadComponent: () => import('./paginas/producto').then((m) => m.Producto),
  },
  {
    path: 'canasta',
    title: 'Mi canasta | Canasta UY',
    loadComponent: () => import('./paginas/canasta').then((m) => m.Canasta),
  },
  { path: '**', redirectTo: '' },
];
