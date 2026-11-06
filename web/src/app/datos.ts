import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Canasta, Comparacion, Filtros, Historial, Mapa, Producto, ResultadoBusqueda, Salud } from './api';
import {
  buscar_productos,
  calcular_canasta,
  calcular_filtros,
  calcular_historial,
  calcular_mapa,
  Catalogo,
  comparar_cadenas,
  FiltroZona,
  MatrizPrecios,
} from './consultas';

export class ProductoNoEncontrado extends Error {
  readonly status = 404;

  constructor(id: number) {
    super(`No existe el producto ${id}`);
  }
}

/** Lee los archivos estáticos publicados con la web y calcula en el navegador cada consulta. */
@Injectable({ providedIn: 'root' })
export class DatosService {
  private readonly http = inject(HttpClient);
  private catalogoEnCurso?: Promise<Catalogo>;
  private readonly matrices = new Map<number, Promise<MatrizPrecios>>();

  private catalogo(): Promise<Catalogo> {
    this.catalogoEnCurso ??= firstValueFrom(this.http.get<Catalogo>('datos/catalogo.json')).catch(
      (error: unknown) => {
        this.catalogoEnCurso = undefined;
        throw error;
      },
    );
    return this.catalogoEnCurso;
  }

  private matriz(id: number): Promise<MatrizPrecios> {
    let pedido = this.matrices.get(id);
    if (!pedido) {
      pedido = firstValueFrom(this.http.get<MatrizPrecios>(`datos/precios/${id}.json`)).catch(
        (error: unknown) => {
          this.matrices.delete(id);
          throw error;
        },
      );
      this.matrices.set(id, pedido);
    }
    return pedido;
  }

  private producto(catalogo: Catalogo, id: number): Producto {
    const producto = catalogo.productos.find((p) => p.id === id);
    if (!producto) {
      throw new ProductoNoEncontrado(id);
    }
    return producto;
  }

  async salud(): Promise<Salud> {
    return (await this.catalogo()).salud;
  }

  async filtros(departamento: string | null): Promise<Filtros> {
    return calcular_filtros(await this.catalogo(), departamento);
  }

  /** Productos con más cobertura de los tipos pedidos, en ese mismo orden. */
  async destacados(tipos: readonly string[]): Promise<Producto[]> {
    const { destacados } = await this.catalogo();
    return tipos.flatMap((tipo) => destacados.filter((p) => p.producto === tipo));
  }

  async buscar(texto: string, limite: number): Promise<ResultadoBusqueda> {
    return buscar_productos(await this.catalogo(), texto, limite);
  }

  async mapa(id: number): Promise<Mapa> {
    const catalogo = await this.catalogo();
    const producto = this.producto(catalogo, id);
    return calcular_mapa(catalogo, await this.matriz(id), producto);
  }

  async comparacion(id: number, filtro: FiltroZona, semanas: number): Promise<Comparacion> {
    const catalogo = await this.catalogo();
    const producto = this.producto(catalogo, id);
    return comparar_cadenas(catalogo, await this.matriz(id), producto, filtro, semanas);
  }

  async historial(id: number, filtro: FiltroZona): Promise<Historial> {
    const catalogo = await this.catalogo();
    const producto = this.producto(catalogo, id);
    return calcular_historial(catalogo, await this.matriz(id), producto, filtro);
  }

  async canasta(ids: readonly number[], filtro: FiltroZona): Promise<Canasta> {
    const catalogo = await this.catalogo();
    const matrices = await Promise.all(
      ids.map(async (id) => {
        const producto = this.producto(catalogo, id);
        return { producto, matriz: await this.matriz(id) };
      }),
    );
    return calcular_canasta(catalogo, matrices, filtro);
  }
}
