import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { animate as animarValor } from 'motion';
import type * as THREE from 'three';
import { LocalMapa, Mapa } from '../api';
import { precio } from '../formato';
import {
  alturasRelativas,
  CENTRO_MONTEVIDEO,
  CENTRO_PAIS,
  marcarBaratos,
  proyectar,
  retrasosDeOla,
} from './mapa-geometria';
import { SILUETA_URUGUAY } from './uruguay';

const COLOR_TINTA = 0x14140f;
const COLOR_BARATO = 0xc8201a;
const COLOR_SIN_DATO = 0xa98800;
const COLOR_TENUE = 0xcdb65c;
/** Qué muestra el mapa en cada paso del relato de la portada. */
const PASOS: readonly { vista: Vista; giro: number; resaltar: boolean }[] = [
  { vista: 'pais', giro: 0, resaltar: false },
  { vista: 'pais', giro: 0.55, resaltar: false },
  { vista: 'montevideo', giro: -0.3, resaltar: false },
  { vista: 'pais', giro: -0.75, resaltar: true },
];
const ALTURA_MAXIMA = 2.15;
const ALTURA_SIN_DATO = 0.03;
const ACIMUT_INICIAL = 0.34;
const ELEVACION = 0.82;
const COLOR_TIERRA = 0xffe98f;
const ALTO_TIERRA = 0.16;
const DISTANCIA = 40;

type Vista = 'pais' | 'montevideo';

interface Escena {
  THREE: typeof THREE;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  raycaster: THREE.Raycaster;
  columnas?: THREE.InstancedMesh;
}

const mezclar = (a: number, b: number, t: number): number => a + (b - a) * t;
const salidaExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

@Component({
  selector: 'app-mapa-precios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './mapa-precios.css',
  template: `
    <div class="lienzo" #contenedor>
      <canvas
        #lienzo
        role="img"
        [attr.aria-label]="descripcion()"
        (pointerdown)="alPresionar($event)"
        (pointermove)="alMover($event)"
        (pointerup)="alSoltar($event)"
        (pointerleave)="alSalir()"
      ></canvas>
      @if (seleccionado(); as local) {
        <div class="ficha" [style.left.px]="fichaX()" [style.top.px]="fichaY()">
          <strong>{{ local.precio === null ? 'Sin precio reciente' : formatoPrecio(local.precio) }}</strong>
          <span>{{ local.cadena }}, {{ local.sucursal }}</span>
          <span class="ficha__zona">{{ local.barrio ?? local.departamento }}</span>
        </div>
      }
      @if (sinWebgl()) {
        <p class="sin-webgl">Tu navegador no puede mostrar el mapa 3D. Abajo tenés los datos.</p>
      }
    </div>
    <div class="controles">
      <div class="vista" role="group" aria-label="Zona del mapa">
        <button type="button" [attr.aria-pressed]="vista() === 'pais'" (click)="cambiarVista('pais')">
          Todo el país
        </button>
        <button
          type="button"
          [attr.aria-pressed]="vista() === 'montevideo'"
          (click)="cambiarVista('montevideo')"
        >
          Montevideo
        </button>
      </div>
      <ul class="leyenda">
        <li><i class="muestra muestra--tinta"></i>Más alta, más cara</li>
        <li><i class="muestra muestra--barato"></i>10 % más barato</li>
      </ul>
    </div>
  `,
})
export class MapaPrecios {
  readonly datos = input<Mapa | undefined>();
  readonly paso = input(0);

  protected readonly vista = signal<Vista>('pais');
  protected readonly seleccionado = signal<LocalMapa | null>(null);
  protected readonly fichaX = signal(0);
  protected readonly fichaY = signal(0);
  protected readonly sinWebgl = signal(false);
  protected readonly formatoPrecio = precio;
  protected readonly descripcion = computed(() => {
    const datos = this.datos();
    return datos
      ? `Mapa 3D de Uruguay con el precio de ${datos.producto.nombre} en cada local`
      : 'Mapa 3D de Uruguay con el precio de un producto en cada local';
  });

  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private readonly destroyRef = inject(DestroyRef);

  private escena?: Escena;
  private locales: LocalMapa[] = [];
  private alturasActuales = new Float32Array();
  private alturasOrigen = new Float32Array();
  private alturasDestino = new Float32Array();
  private retrasos: number[] = [];
  private posiciones: { x: number; z: number }[] = [];
  private progresoVista = 0;
  private acimut = ACIMUT_INICIAL;
  private usuarioRoto = false;
  private arrastre: { x: number; acimut: number; distancia: number } | null = null;
  private fijado = false;
  private visible = true;
  private cuadro = 0;
  private necesitaDibujo = true;
  private animaciones = new Set<{ stop(): void }>();
  private ultimaPosicion: { x: number; y: number } | null = null;
  private inicioRotacion = 0;
  private yaEntro = false;
  private giro = 0;
  private resaltado = 0;
  private baratos: boolean[] = [];
  private controlVista?: { stop(): void };
  private controlGiro?: { stop(): void };
  private controlTono?: { stop(): void };
  private readonly movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)');

  constructor() {
    afterNextRender(() => void this.iniciar());
    effect(() => {
      const datos = this.datos();
      if (datos && this.escena) {
        this.aplicarDatos(datos);
      }
    });
    effect(() => {
      const paso = this.paso();
      untracked(() => this.aplicarPaso(paso));
    });
    this.destroyRef.onDestroy(() => this.liberar());
  }

  protected cambiarVista(vista: Vista): void {
    if (this.vista() === vista) {
      return;
    }
    this.vista.set(vista);
    this.seleccionado.set(null);
    this.fijado = false;
    const destino = vista === 'montevideo' ? 1 : 0;
    if (this.movimientoReducido.matches) {
      this.progresoVista = destino;
      this.dibujarColumnas();
      this.actualizarCamara();
      this.pedirDibujo();
      return;
    }
    this.controlVista?.stop();
    this.controlVista = this.animar(this.progresoVista, destino, { duration: 0.9, ease: [0.16, 1, 0.3, 1] }, (valor) => {
      this.progresoVista = valor;
      this.dibujarColumnas();
      this.actualizarCamara();
    });
  }

  private aplicarPaso(indice: number): void {
    const paso = PASOS[indice] ?? PASOS[0];
    if (!this.escena) {
      return;
    }
    this.cambiarVista(paso.vista);
    const tono = paso.resaltar ? 1 : 0;
    if (this.movimientoReducido.matches) {
      this.giro = paso.giro;
      this.resaltado = tono;
      this.colorear();
      this.actualizarCamara();
      this.pedirDibujo();
      return;
    }
    this.controlGiro?.stop();
    this.controlGiro = this.animar(this.giro, paso.giro, { duration: 1.2, ease: [0.16, 1, 0.3, 1] }, (valor) => {
      this.giro = valor;
      this.actualizarCamara();
    });
    if (this.resaltado !== tono) {
      this.controlTono?.stop();
      this.controlTono = this.animar(this.resaltado, tono, { duration: 0.6 }, (valor) => {
        this.resaltado = valor;
        this.colorear();
      });
    }
  }

  private colorear(): void {
    const escena = this.escena;
    const columnas = escena?.columnas;
    if (!escena || !columnas) {
      return;
    }
    const color = new escena.THREE.Color();
    const tenue = new escena.THREE.Color(COLOR_TENUE);
    this.locales.forEach((local, i) => {
      if (local.precio === null) {
        color.setHex(COLOR_SIN_DATO);
      } else if (this.baratos[i]) {
        color.setHex(COLOR_BARATO);
      } else {
        color.setHex(COLOR_TINTA).lerp(tenue, this.resaltado);
      }
      columnas.setColorAt(i, color);
    });
    if (columnas.instanceColor) {
      columnas.instanceColor.needsUpdate = true;
    }
  }

  protected alPresionar(evento: PointerEvent): void {
    this.arrastre = { x: evento.clientX, acimut: this.acimut, distancia: 0 };
    (evento.target as Element).setPointerCapture?.(evento.pointerId);
  }

  protected alMover(evento: PointerEvent): void {
    if (this.arrastre) {
      const dx = evento.clientX - this.arrastre.x;
      this.arrastre.distancia = Math.abs(dx);
      if (Math.abs(dx) > 4) {
        this.usuarioRoto = true;
        this.acimut = this.arrastre.acimut - dx * 0.006;
        this.actualizarCamara();
        this.pedirDibujo();
      }
      return;
    }
    if (evento.pointerType === 'mouse' && !this.fijado) {
      this.ultimaPosicion = { x: evento.clientX, y: evento.clientY };
      this.pedirDibujo();
    }
  }

  protected alSoltar(evento: PointerEvent): void {
    const toque = this.arrastre !== null && this.arrastre.distancia <= 6;
    this.arrastre = null;
    if (!toque) {
      return;
    }
    const local = this.localEn(evento.clientX, evento.clientY);
    this.fijado = local !== null && this.seleccionado()?.id !== local.id;
    this.seleccionado.set(this.fijado ? local : null);
    if (this.fijado) {
      this.ubicarFicha(evento.clientX, evento.clientY);
    }
  }

  protected alSalir(): void {
    this.ultimaPosicion = null;
    if (!this.fijado) {
      this.seleccionado.set(null);
    }
  }

  private async iniciar(): Promise<void> {
    const three = await import('three');
    if (this.liberado) {
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new three.WebGLRenderer({
        canvas: this.lienzo().nativeElement,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      this.sinWebgl.set(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    // Las sombras solo cambian con las columnas, no con la cámara: ahorra batería en el celular.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = three.PCFShadowMap;

    const scene = new three.Scene();
    scene.add(new three.HemisphereLight(0xfff6cf, 0x7a6300, 2.1));
    const sol = new three.DirectionalLight(0xffffff, 2.4);
    sol.position.set(-8, 16, 6);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1536, 1536);
    Object.assign(sol.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, far: 50 });
    scene.add(sol);

    const suelo = new three.Mesh(
      new three.PlaneGeometry(60, 60),
      new three.ShadowMaterial({ color: 0x4d3f00, opacity: 0.32 }),
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    suelo.position.y = -ALTO_TIERRA;
    scene.add(suelo);

    const contorno = new three.Shape(
      SILUETA_URUGUAY.map(([longitud, latitud]) => {
        const { x, z } = proyectar(latitud, longitud);
        return new three.Vector2(x, -z);
      }),
    );
    const relieve = new three.ExtrudeGeometry(contorno, { depth: ALTO_TIERRA, bevelEnabled: false });
    relieve.rotateX(-Math.PI / 2);
    relieve.translate(0, -ALTO_TIERRA, 0);
    const tierra = new three.Mesh(
      relieve,
      new three.MeshStandardMaterial({ color: COLOR_TIERRA, roughness: 0.9 }),
    );
    tierra.castShadow = true;
    tierra.receiveShadow = true;
    scene.add(tierra);

    const camera = new three.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    this.escena = { THREE: three, renderer, scene, camera, raycaster: new three.Raycaster() };

    const observadorTamanio = new ResizeObserver(() => this.ajustarTamanio());
    observadorTamanio.observe(this.contenedor().nativeElement);
    const observadorVisible = new IntersectionObserver(([entrada]) => {
      this.visible = entrada.isIntersecting;
      this.pedirDibujo();
    });
    observadorVisible.observe(this.contenedor().nativeElement);
    const alCambiarPestana = () => this.pedirDibujo();
    document.addEventListener('visibilitychange', alCambiarPestana);
    this.destroyRef.onDestroy(() => {
      observadorTamanio.disconnect();
      observadorVisible.disconnect();
      document.removeEventListener('visibilitychange', alCambiarPestana);
    });

    this.ajustarTamanio();
    this.inicioRotacion = performance.now();
    const datos = this.datos();
    if (datos) {
      this.aplicarDatos(datos);
    }
    this.aplicarPaso(this.paso());
  }

  private liberado = false;

  private aplicarDatos(datos: Mapa): void {
    const escena = this.escena;
    if (!escena) {
      return;
    }
    this.seleccionado.set(null);
    this.fijado = false;
    const conjuntoNuevo =
      datos.locales.length !== this.locales.length ||
      datos.locales.some((local, i) => local.id !== this.locales[i]?.id);
    this.locales = datos.locales;
    if (conjuntoNuevo) {
      this.crearColumnas(escena);
    }

    const precios = datos.locales.map((local) => local.precio);
    const relativas = alturasRelativas(precios);
    this.baratos = marcarBaratos(precios);
    this.alturasOrigen = this.alturasActuales.slice();
    this.alturasDestino = Float32Array.from(relativas, (a) =>
      a === null ? ALTURA_SIN_DATO : ALTURA_MAXIMA * (0.12 + 0.88 * a),
    );
    this.colorear();
    this.transicionarAlturas();
  }

  private crearColumnas(escena: Escena): void {
    const { THREE: three, scene } = escena;
    if (escena.columnas) {
      scene.remove(escena.columnas);
      escena.columnas.geometry.dispose();
      (escena.columnas.material as THREE.Material).dispose();
    }
    const geometria = new three.BoxGeometry(1, 1, 1);
    geometria.translate(0, 0.5, 0);
    const columnas = new three.InstancedMesh(
      geometria,
      new three.MeshStandardMaterial({ roughness: 0.62, metalness: 0.05 }),
      this.locales.length,
    );
    columnas.castShadow = true;
    columnas.frustumCulled = false;
    scene.add(columnas);
    escena.columnas = columnas;
    this.posiciones = this.locales.map((local) => proyectar(local.latitud, local.longitud));
    this.retrasos = retrasosDeOla(this.posiciones);
    this.alturasActuales = new Float32Array(this.locales.length);
    this.alturasOrigen = new Float32Array(this.locales.length);
  }

  /** La primera vez, las columnas brotan en ola desde Montevideo; después cambian con un resorte. */
  private transicionarAlturas(): void {
    if (this.movimientoReducido.matches) {
      this.alturasActuales = this.alturasDestino.slice();
      this.yaEntro = true;
      this.dibujarColumnas();
      this.actualizarCamara();
      this.pedirDibujo();
      return;
    }
    const entrada = !this.yaEntro;
    this.yaEntro = true;
    this.actualizarCamara();
    const opciones = entrada
      ? { duration: 2.1, ease: 'linear' as const }
      : { type: 'spring' as const, stiffness: 90, damping: 16 };
    this.animar(0, 1, opciones, (t) => {
      for (let i = 0; i < this.alturasDestino.length; i++) {
        const progreso = entrada
          ? salidaExpo(Math.max(0, Math.min(1, (t - this.retrasos[i] * 0.55) / 0.45)))
          : t;
        this.alturasActuales[i] = mezclar(this.alturasOrigen[i], this.alturasDestino[i], progreso);
      }
      this.dibujarColumnas();
    });
  }

  private animar(
    desde: number,
    hasta: number,
    opciones: Record<string, unknown>,
    alActualizar: (valor: number) => void,
  ): { stop(): void } {
    const control = animarValor(desde, hasta, {
      ...opciones,
      onUpdate: (valor: number) => {
        alActualizar(valor);
        this.pedirDibujo();
      },
    });
    this.animaciones.add(control);
    void control.then(() => this.animaciones.delete(control));
    return control;
  }

  private dibujarColumnas(): void {
    const escena = this.escena;
    const columnas = escena?.columnas;
    if (!escena || !columnas) {
      return;
    }
    const matriz = new escena.THREE.Matrix4();
    const ancho = mezclar(0.15, 0.036, this.progresoVista);
    const factor = mezclar(1, 0.2, this.progresoVista);
    for (let i = 0; i < this.posiciones.length; i++) {
      const { x, z } = this.posiciones[i];
      matriz.makeScale(ancho, Math.max(0.001, this.alturasActuales[i]) * factor, ancho);
      matriz.setPosition(x, 0, z);
      columnas.setMatrixAt(i, matriz);
    }
    columnas.instanceMatrix.needsUpdate = true;
    escena.renderer.shadowMap.needsUpdate = true;
  }

  private ajustarTamanio(): void {
    const escena = this.escena;
    const { clientWidth: ancho, clientHeight: alto } = this.contenedor().nativeElement;
    if (!escena || ancho === 0 || alto === 0) {
      return;
    }
    escena.renderer.setSize(ancho, alto, false);
    const proporcion = ancho / alto;
    const tamanio = proporcion >= 1 ? 13.5 : 13.5 / proporcion;
    Object.assign(escena.camera, {
      top: tamanio / 2,
      bottom: -tamanio / 2,
      left: (-tamanio / 2) * proporcion,
      right: (tamanio / 2) * proporcion,
    });
    this.actualizarCamara();
    this.pedirDibujo();
  }

  private actualizarCamara(): void {
    const escena = this.escena;
    if (!escena) {
      return;
    }
    const pais = proyectar(CENTRO_PAIS.latitud, CENTRO_PAIS.longitud);
    const capital = proyectar(CENTRO_MONTEVIDEO.latitud, CENTRO_MONTEVIDEO.longitud);
    const objetivoX = mezclar(pais.x, capital.x, this.progresoVista);
    const objetivoZ = mezclar(pais.z, capital.z, this.progresoVista);
    const { camera } = escena;
    camera.position.set(
      objetivoX + DISTANCIA * Math.cos(ELEVACION) * Math.sin(this.acimutActual()),
      DISTANCIA * Math.sin(ELEVACION),
      objetivoZ + DISTANCIA * Math.cos(ELEVACION) * Math.cos(this.acimutActual()),
    );
    camera.lookAt(objetivoX, 0.4, objetivoZ);
    camera.zoom = mezclar(1, 4.8, this.progresoVista);
    camera.updateProjectionMatrix();
  }

  /** Un vaivén lento mientras nadie tocó el mapa, para que se lea como un objeto en 3D. */
  private acimutActual(): number {
    if (this.usuarioRoto || this.movimientoReducido.matches) {
      return this.acimut + this.giro;
    }
    return this.acimut + this.giro + Math.sin((performance.now() - this.inicioRotacion) / 7000) * 0.16;
  }

  private pedirDibujo(): void {
    this.necesitaDibujo = true;
    if (this.cuadro === 0 && this.escena && this.visible && !document.hidden) {
      this.cuadro = requestAnimationFrame(() => this.dibujar());
    }
  }

  private dibujar(): void {
    this.cuadro = 0;
    const escena = this.escena;
    if (!escena || !this.visible || document.hidden) {
      return;
    }
    const vaiven = !this.usuarioRoto && !this.movimientoReducido.matches;
    if (vaiven) {
      this.actualizarCamara();
    }
    if (this.ultimaPosicion) {
      const local = this.localEn(this.ultimaPosicion.x, this.ultimaPosicion.y);
      if (local?.id !== this.seleccionado()?.id) {
        this.seleccionado.set(local);
      }
      if (local) {
        this.ubicarFicha(this.ultimaPosicion.x, this.ultimaPosicion.y);
      }
      this.ultimaPosicion = null;
    }
    escena.renderer.render(escena.scene, escena.camera);
    this.necesitaDibujo = false;
    if (vaiven) {
      this.pedirDibujo();
    }
  }

  private localEn(clienteX: number, clienteY: number): LocalMapa | null {
    const escena = this.escena;
    if (!escena?.columnas) {
      return null;
    }
    const caja = this.lienzo().nativeElement.getBoundingClientRect();
    const punto = new escena.THREE.Vector2(
      ((clienteX - caja.left) / caja.width) * 2 - 1,
      -((clienteY - caja.top) / caja.height) * 2 + 1,
    );
    escena.columnas.computeBoundingSphere();
    escena.raycaster.setFromCamera(punto, escena.camera);
    const impacto = escena.raycaster.intersectObject(escena.columnas)[0];
    return impacto?.instanceId !== undefined ? (this.locales[impacto.instanceId] ?? null) : null;
  }

  private ubicarFicha(clienteX: number, clienteY: number): void {
    const caja = this.contenedor().nativeElement.getBoundingClientRect();
    this.fichaX.set(Math.min(clienteX - caja.left + 14, Math.max(0, caja.width - 240)));
    this.fichaY.set(Math.max(0, clienteY - caja.top - 86));
  }

  private liberar(): void {
    this.liberado = true;
    cancelAnimationFrame(this.cuadro);
    this.animaciones.forEach((control) => control.stop());
    const escena = this.escena;
    if (!escena) {
      return;
    }
    escena.scene.traverse((objeto) => {
      const malla = objeto as THREE.Mesh;
      malla.geometry?.dispose();
      (malla.material as THREE.Material | undefined)?.dispose?.();
    });
    escena.renderer.dispose();
    this.escena = undefined;
  }
}
