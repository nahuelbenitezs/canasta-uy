import {
  buscar_productos,
  calcular_canasta,
  calcular_filtros,
  calcular_historial,
  calcular_mapa,
  Catalogo,
  comparar_cadenas,
  inicioPeriodo,
  LocalDatos,
  MatrizPrecios,
} from './consultas';

const local = (
  id: number,
  cadena: string,
  barrio: string,
  departamento = 'Montevideo',
  tipo = 'supermercado',
): LocalDatos => ({
  id,
  cadena,
  sucursal: `S${id}`,
  barrio,
  departamento,
  tipo,
  latitud: -34.9,
  longitud: -56.1,
});

const AZUCAR = { id: 10, nombre: 'Azúcar Bella Unión', producto: 'Azúcar', marca: 'Bella Unión', especificacion: null };
const CAFE = { id: 11, nombre: 'Café Saint', producto: 'Café', marca: 'Saint', especificacion: null };

const CATALOGO: Catalogo = {
  salud: {
    estado: 'ok',
    datos_desde: '2026-08-03',
    datos_hasta: '2026-09-30',
    precios_diarios: 11,
    locales: 7,
    productos: 2,
  },
  locales: [
    local(1, 'Disco', 'Pocitos'),
    local(2, 'Disco', 'Centro'),
    local(3, 'Disco', 'Malvín'),
    local(4, 'Ta - Ta', 'Las Piedras', 'Canelones'),
    local(5, 'Farmashop', 'Centro', 'Montevideo', 'farmacia'),
    local(6, 'Sin cadena', 'Centro'),
    { ...local(7, 'Devoto', 'Carrasco'), latitud: null, longitud: null },
  ],
  productos: [AZUCAR, CAFE],
  destacados: [AZUCAR],
};

const MATRIZ_AZUCAR: MatrizPrecios = {
  semanas: ['2026-08-03', '2026-09-07', '2026-09-28'],
  locales: [1, 2, 3, 4, 5, 6],
  precios: [
    [null, 95, 100],
    [null, null, 110],
    [null, null, 5000],
    [900, null, 90],
    [null, null, 50],
    [null, null, 70],
  ],
};

const MATRIZ_CAFE: MatrizPrecios = {
  semanas: ['2026-08-03'],
  locales: [7],
  precios: [[300]],
};

describe('consultas en el navegador', () => {
  it('calcula el inicio del período desde el lunes de la última semana', () => {
    expect(inicioPeriodo('2026-09-30', 1)).toBe('2026-09-28');
    expect(inicioPeriodo('2026-09-30', 4)).toBe('2026-09-07');
    expect(inicioPeriodo('2026-09-28', 1)).toBe('2026-09-28');
    expect(inicioPeriodo('2026-09-27', 1)).toBe('2026-09-21');
  });

  it('compara cadenas de menor a mayor y resiste un precio mal declarado', () => {
    const { resultados, desde } = comparar_cadenas(CATALOGO, MATRIZ_AZUCAR, AZUCAR, {}, 4);
    expect(desde).toBe('2026-09-07');
    expect(resultados.map((r) => [r.cadena, r.precio_mediano, r.locales])).toEqual([
      ['Ta - Ta', 90, 1],
      ['Disco', 110, 3],
    ]);
  });

  it('respeta las semanas, la zona, el tipo y los comercios sin cadena', () => {
    const cadenas = (filtro = {}, semanas = 4) =>
      comparar_cadenas(CATALOGO, MATRIZ_AZUCAR, AZUCAR, filtro, semanas).resultados.map((r) => r.cadena);
    expect(comparar_cadenas(CATALOGO, MATRIZ_AZUCAR, AZUCAR, {}, 52).resultados[1]).toMatchObject({
      cadena: 'Ta - Ta',
      precio_mediano: 495,
    });
    expect(cadenas({ departamento: 'Canelones' })).toEqual(['Ta - Ta']);
    expect(cadenas({ barrio: 'Pocitos' })).toEqual(['Disco']);
    expect(cadenas({ tipo: 'farmacia' })).toEqual(['Farmashop']);
    expect(cadenas()).not.toContain('Sin cadena');
  });

  it('arma el historial semanal contando locales', () => {
    const { puntos } = calcular_historial(CATALOGO, MATRIZ_AZUCAR, AZUCAR, { cadena: 'Disco' });
    expect(puntos).toEqual([
      { semana: '2026-09-07', precio_mediano: 95, locales: 1 },
      { semana: '2026-09-28', precio_mediano: 110, locales: 3 },
    ]);
  });

  it('incluye en el mapa los locales sin precio y excluye los sin ubicación u otro tipo', () => {
    const { locales } = calcular_mapa(CATALOGO, MATRIZ_CAFE, CAFE);
    expect(locales.map((l) => l.id)).toEqual([1, 2, 3, 4, 6]);
    expect(locales.every((l) => l.precio === null)).toBe(true);
    const azucar = calcular_mapa(CATALOGO, MATRIZ_AZUCAR, AZUCAR).locales;
    expect(azucar.find((l) => l.id === 1)?.precio).toBe(97.5);
  });

  it('suma la canasta y ordena primero las cadenas completas', () => {
    const { resultados } = calcular_canasta(
      CATALOGO,
      [
        { producto: AZUCAR, matriz: MATRIZ_AZUCAR },
        { producto: CAFE, matriz: MATRIZ_CAFE },
      ],
      {},
      52,
    );
    expect(resultados.find((r) => r.cadena === 'Disco')).toMatchObject({
      total: 110,
      completa: false,
      productos_faltantes: [11],
    });
    expect(resultados.find((r) => r.cadena === 'Devoto')).toMatchObject({
      total: 300,
      productos_faltantes: [10],
    });
    const completa = calcular_canasta(CATALOGO, [{ producto: AZUCAR, matriz: MATRIZ_AZUCAR }], {});
    expect(completa.resultados.map((r) => [r.cadena, r.total, r.completa])).toEqual([
      ['Ta - Ta', 90, true],
      ['Disco', 110, true],
    ]);
  });

  it.each(['azucar', 'AZÚCAR', 'bella azucar', 'union azucar'])('busca "%s" sin distinguir acentos', (texto) => {
    expect(buscar_productos(CATALOGO, texto, 8).resultados.map((p) => p.id)).toEqual([10]);
  });

  it('busca texto literal, pagina y lista todo si no hay texto', () => {
    expect(buscar_productos(CATALOGO, '.*', 8).total).toBe(0);
    expect(buscar_productos(CATALOGO, '', 1)).toMatchObject({ total: 2, resultados: [AZUCAR] });
  });

  it('lista filtros y barrios por departamento', () => {
    const filtros = calcular_filtros(CATALOGO, 'Canelones');
    expect(filtros.departamentos).toEqual(['Canelones', 'Montevideo']);
    expect(filtros.barrios).toEqual(['Las Piedras']);
    expect(calcular_filtros(CATALOGO, null).barrios).toEqual([]);
  });
});
