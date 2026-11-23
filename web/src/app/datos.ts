import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Canasta,
  Comparacion,
  Filtros,
  Historial,
  Mapa,
  Producto,
  ResultadoBusqueda,
  Salud,
} from './api';
import type { LineaCanasta } from './canasta-store';
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
import { esReciente } from './formato';
import { calcularCanastaOnline, type CanastaOnline } from './precios-online';

export class ProductoNoEncontrado extends Error {
  readonly status = 404;

  constructor(id: number) {
    super(`No existe el producto ${id}`);
  }
}

export interface OfertaOnline {
  cadena: string;
  precio: number;
  url: string;
  actualizado?: string;
}

export interface PreciosOnline {
  actualizado: string;
  ofertas: OfertaOnline[];
}

interface ArchivoTiendas {
  actualizado: string;
  productos: Record<string, OfertaOnline[]>;
}

export interface ResumenOnline {
  ultimo: string | null;
  tiendas: number;
  precios: ReadonlyMap<number, number>;
}

export interface ReferenciaSIPC {
  mediana: number;
  p10: number;
  p90: number;
  locales: number;
}

export interface ReferenciasRecientes {
  actualizado: string;
  productos: Record<string, ReferenciaSIPC>;
}

/** Lee los archivos estáticos publicados con la web y calcula en el navegador cada consulta. */
@Injectable({ providedIn: 'root' })
export class DatosService {
  private readonly http = inject(HttpClient);
  private catalogoEnCurso?: Promise<Catalogo>;
  private readonly matrices = new Map<number, Promise<MatrizPrecios>>();
  private tiendasEnCurso?: Promise<ArchivoTiendas>;
  private referenciasEnCurso?: Promise<ReferenciasRecientes | null>;

  /** Precios online del producto. Si el archivo falla, la página sigue con los datos oficiales. */
  async tiendas(id: number): Promise<PreciosOnline> {
    const { actualizado, productos } = await this.archivoTiendas();
    const ofertas = [...(productos[id] ?? [])].sort((a, b) => a.precio - b.precio);
    return { actualizado, ofertas };
  }

  async resumenOnline(): Promise<ResumenOnline> {
    const { actualizado, productos } = await this.archivoTiendas();
    const precios = new Map<number, number>();
    const cadenas = new Set<string>();
    let ultimo: string | null = null;
    const ahora = new Date();
    for (const [id, ofertas] of Object.entries(productos)) {
      for (const oferta of ofertas) {
        const dia = oferta.actualizado ?? actualizado;
        if (!esReciente(dia, ahora)) continue;
        const producto = Number(id);
        precios.set(producto, Math.min(precios.get(producto) ?? Infinity, oferta.precio));
        cadenas.add(oferta.cadena);
        if (!ultimo || dia > ultimo) ultimo = dia;
      }
    }
    return { ultimo, tiendas: cadenas.size, precios };
  }

  async canastaOnline(items: readonly LineaCanasta[]): Promise<CanastaOnline[]> {
    const { actualizado, productos } = await this.archivoTiendas();
    return calcularCanastaOnline(items, productos, actualizado);
  }

  async referenciasRecientes(): Promise<ReferenciasRecientes | null> {
    this.referenciasEnCurso ??= firstValueFrom(
      this.http.get<ReferenciasRecientes>('datos/recientes.json'),
    ).catch(() => {
      this.referenciasEnCurso = undefined;
      return null;
    });
    const archivo = await this.referenciasEnCurso;
    return archivo && esReciente(archivo.actualizado) ? archivo : null;
  }

  private archivoTiendas(): Promise<ArchivoTiendas> {
    this.tiendasEnCurso ??= firstValueFrom(
      this.http.get<ArchivoTiendas>('datos/tiendas.json'),
    ).catch(() => {
      this.tiendasEnCurso = undefined;
      return { actualizado: '', productos: {} };
    });
    return this.tiendasEnCurso;
  }

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

  async ficha(id: number): Promise<Producto> {
    return this.producto(await this.catalogo(), id);
  }

  async filtros(departamento: string | null): Promise<Filtros> {
    return calcular_filtros(await this.catalogo(), departamento);
  }

  /** Productos con más cobertura de los tipos pedidos, en ese mismo orden. */
  async destacados(tipos: readonly string[]): Promise<Producto[]> {
    const { destacados } = await this.catalogo();
    return tipos.flatMap((tipo) => destacados.filter((p) => p.producto === tipo));
  }

  async buscar(
    texto: string,
    limite: number,
    recientes?: ReadonlySet<number>,
  ): Promise<ResultadoBusqueda> {
    return buscar_productos(await this.catalogo(), texto, limite, recientes);
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

  async canasta(
    ids: readonly number[],
    filtro: FiltroZona,
    cantidades: ReadonlyMap<number, number> = new Map(),
  ): Promise<Canasta> {
    const catalogo = await this.catalogo();
    const matrices = await Promise.all(
      ids.map(async (id) => {
        const producto = this.producto(catalogo, id);
        return { producto, matriz: await this.matriz(id), cantidad: cantidades.get(id) };
      }),
    );
    return calcular_canasta(catalogo, matrices, filtro);
  }
}
