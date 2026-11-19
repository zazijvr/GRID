import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { AudioFeatures } from './audioFeatures';

/** Jeden efekt vizualizace */
export interface Effect {
  name: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Neonová zář pro tento efekt */
  bloom: { strength: number; radius: number; threshold: number };
  /** dt = sekundy od minulého snímku, t = sekundy od spuštění efektu */
  update(f: AudioFeatures, dt: number, t: number): void;
  /** Síla záře v tomto snímku (např. silnější na beat); jinak bloom.strength */
  bloomStrength?(f: AudioFeatures): number;
  /** Změna velikosti plátna (silné čáry Line2 potřebují rozlišení) */
  resize?(width: number, height: number): void;
  dispose?(): void;
}

/** Úrovně kvality – při nízkých FPS se postupně snižují. maxPixels = strop vnitřního rozlišení:
 *  na celé obrazovce (ultrawide 5120 × 1440 = 7,4 Mpx) by se jinak počítal každý pixel. */
const QUALITY = [
  { maxPixels: 1.4e6, bloom: true, bloomScale: 0.5 },
  { maxPixels: 0.9e6, bloom: true, bloomScale: 0.5 },
  { maxPixels: 0.6e6, bloom: true, bloomScale: 0.4 },
  { maxPixels: 0.6e6, bloom: false, bloomScale: 0 },
  { maxPixels: 0.35e6, bloom: false, bloomScale: 0 },
];

export class VisualizerEngine {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private effect: Effect | null = null;
  private effectStart = 0;
  private width = 0;
  private height = 0;
  private quality = 0;
  // Měření výkonu
  private frameTimes: number[] = [];
  private sinceQualityChange = 0;

  /** startQuality: telefon začíná na nižší úrovni (baterie, teplo) */
  constructor(canvas: HTMLCanvasElement, startQuality = 0) {
    this.quality = Math.max(0, Math.min(QUALITY.length - 1, startQuality));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NoToneMapping; // sytý neon (tone mapping by barvy vybledil)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 0);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    // Převod barev a tone mapping na konci řetězce – bez něj je obraz s bloomem tmavý / jiných barev
    this.composer.addPass(new OutputPass());
    this.applyQuality();
  }

  setEffect(effect: Effect) {
    this.disposeEffect();
    this.effect = effect;
    this.effectStart = performance.now();
    this.renderPass.scene = effect.scene;
    this.renderPass.camera = effect.camera;
    this.bloom.radius = effect.bloom.radius;
    this.bloom.threshold = effect.bloom.threshold;
    this.width = 0; // přepočítat poměr stran kamery
  }

  private applyQuality() {
    this.bloom.enabled = QUALITY[this.quality].bloom;
    this.width = 0; // přepočítat rozlišení
  }

  private resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    const q = QUALITY[this.quality];
    // Poměr pixelů: ostré na malém okně, na velké obrazovce strop maxPixels (obraz se jen roztáhne)
    const pr = Math.min(window.devicePixelRatio || 1, Math.sqrt(q.maxPixels / Math.max(1, w * h)));
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    if (q.bloom) this.bloom.resolution.set(Math.max(64, w * pr * q.bloomScale), Math.max(64, h * pr * q.bloomScale));
    if (this.effect) {
      this.effect.resize?.(w, h);
      const aspect = w / Math.max(1, h);
      this.effect.camera.aspect = aspect;
      // Efekty jsou navržené na šířku – na výšku (telefon) oddálit, ať se vejdou do šířky obrazovky
      this.effect.camera.zoom = Math.min(1, aspect / 1.2);
      this.effect.camera.updateProjectionMatrix();
    }
  }

  /** Při trvale nízkých FPS sníží kvalitu (po 3 s měření, nejvýš jednou za 3 s) */
  private watchPerformance(dt: number) {
    this.sinceQualityChange += dt;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (this.sinceQualityChange < 3 || this.frameTimes.length < 90 || this.quality >= QUALITY.length - 1) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (avg > 1 / 40) {
      this.quality++;
      this.applyQuality();
      this.frameTimes = [];
      this.sinceQualityChange = 0;
    }
  }

  /** Jeden snímek; dt = sekundy od minulého snímku */
  render(f: AudioFeatures, dt: number) {
    const e = this.effect;
    if (!e) return;
    const t = (performance.now() - this.effectStart) / 1000;
    const canvas = this.renderer.domElement;
    if (canvas.clientWidth !== this.width || canvas.clientHeight !== this.height) {
      this.resize(canvas.clientWidth, canvas.clientHeight);
    }
    e.update(f, dt, t);
    this.bloom.strength = e.bloomStrength ? e.bloomStrength(f) : e.bloom.strength;
    if (this.bloom.enabled) this.composer.render(dt);
    else this.renderer.render(e.scene, e.camera);
    this.watchPerformance(dt);
  }

  private disposeEffect() {
    const e = this.effect;
    if (!e) return;
    e.dispose?.();
    e.scene.traverse((obj) => {
      const o = obj as THREE.Mesh;
      o.geometry?.dispose();
      const m = o.material;
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.effect = null;
  }

  dispose() {
    this.disposeEffect();
    this.composer.dispose();
    this.bloom.dispose();
    this.renderer.dispose();
  }
}
