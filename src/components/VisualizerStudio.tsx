import React, { useEffect, useRef, useState } from 'react';
import { X, Maximize, ChevronRight } from 'lucide-react';
import * as THREE from 'three';
import { bandLevel, getAudioGraph } from '../audio/audioGraph';

interface VisualizerStudioProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  onClose: () => void;
}

/** Úrovně pásem 0–1 (0, když nehraje) */
interface Levels {
  bass: number;
  mid: number;
  high: number;
}

interface Scene3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Snímek: dt = sekundy od minulého snímku, t = sekundy od začátku */
  update: (lv: Levels, dt: number, t: number) => void;
}

const EFFECT_NAMES = ['Hyperspace Portal', 'Cyber Matrix Sphere', 'Audio Mountains'] as const;

function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.ReinhardToneMapping;
  // Vnitřní rozlišení max. 2× – na 4K kiosku by plné rozlišení zbytečně dusilo GPU
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return renderer;
}

// ───────── Efekt 1: Hyperspace Portal (tunel) ─────────
function createPortal(canvas: HTMLCanvasElement): Scene3D {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020516);
  scene.fog = new THREE.FogExp2(0x020516, 0.005); // hloubka portálu

  const camera = new THREE.PerspectiveCamera(85, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, -100);

  const tunnelGroup = new THREE.Group();
  scene.add(tunnelGroup);

  const TUNNEL_LENGTH = 600;
  const SEGMENTS = 80;
  const segmentSize = TUNNEL_LENGTH / SEGMENTS; // posun o celý segment = nekonečná smyčka

  const cynGeo = new THREE.CylinderGeometry(20, 20, TUNNEL_LENGTH, 32, SEGMENTS, true);
  cynGeo.rotateX(Math.PI / 2);
  const cynMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.4 });
  const cynMesh = new THREE.Mesh(cynGeo, cynMat);
  cynMesh.position.z = -TUNNEL_LENGTH / 2;
  tunnelGroup.add(cynMesh);

  // Druhý, větší válec – paralaxa drátů
  const magGeo = new THREE.CylinderGeometry(23, 23, TUNNEL_LENGTH, 24, SEGMENTS, true);
  magGeo.rotateX(Math.PI / 2);
  const magMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.25 });
  const magMesh = new THREE.Mesh(magGeo, magMat);
  magMesh.position.z = -TUNNEL_LENGTH / 2;
  tunnelGroup.add(magMesh);

  // Prach letící tunelem – jen u stěn (uprostřed by se slil do oslnivé koule)
  const STARS = 400;
  const starPos = new Float32Array(STARS * 3);
  const placeStar = (i: number, z: number) => {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 10;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = Math.sin(a) * r;
    starPos[i * 3 + 2] = z;
  };
  for (let i = 0; i < STARS; i++) placeStar(i, Math.random() * -300);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x88ccff, size: 0.5, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }),
  );
  tunnelGroup.add(stars);

  const cyan = new THREE.Color(0x00f3ff);
  const purple = new THREE.Color(0xff00ff);
  let travel = 0;
  let rotSpeed = 0;

  return {
    renderer, scene, camera,
    update: ({ bass, mid, high }, dt, t) => {
      const speed = 30 + mid * 120; // rychlost letu podle středů
      travel += speed * dt;
      const z = -TUNNEL_LENGTH / 2 + (travel % segmentSize);
      cynMesh.position.z = z;
      magMesh.position.z = z;

      for (let i = 0; i < STARS; i++) {
        starPos[i * 3 + 2] += speed * dt * 1.5;
        if (starPos[i * 3 + 2] > 20) placeStar(i, -300);
      }
      starGeo.attributes.position.needsUpdate = true;

      // Rotace celého prostoru, plynule podle basů
      rotSpeed += (0.3 + bass * 1.2 - rotSpeed) * Math.min(1, dt * 3);
      tunnelGroup.rotation.z += rotSpeed * dt;

      camera.rotation.z = Math.sin(t) * 0.1;
      camera.position.x = Math.sin(t * 2) * (1 + bass);
      camera.position.y = Math.cos(t * 1.5) * (1 + bass);

      // Záblesk jen na velmi silných výškách
      if (high > 0.85) {
        cynMat.color.setHex(0xccffff);
        magMat.color.setHex(0xffccff);
      } else {
        cynMat.color.copy(cyan).lerp(purple, mid);
        magMat.color.setHex(0xff00ff);
      }
      const s = 1 + bass * 0.15; // „dýchání“ tunelu
      tunnelGroup.scale.set(s, s, 1);
    },
  };
}

// ───────── Efekt 2: Cyber Matrix Sphere ─────────
function createSphere(canvas: HTMLCanvasElement): Scene3D {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01030d);
  scene.fog = new THREE.FogExp2(0x01030d, 0.003);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000);
  camera.position.set(0, 0, 70);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  const coreMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.8 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(8, 2), coreMat); // tepající střed
  group.add(core);

  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(35, 3),
    new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.25 }),
  );
  group.add(outer);

  const STARS = 500;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const r = 40 + Math.random() * 60;
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI * 2;
    starPos[i * 3] = r * Math.sin(a) * Math.cos(b);
    starPos[i * 3 + 1] = r * Math.sin(a) * Math.sin(b);
    starPos[i * 3 + 2] = r * Math.cos(a);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  group.add(new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x88ccff, size: 0.4, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }),
  ));

  let angle = 0;
  return {
    renderer, scene, camera,
    update: ({ bass, high }, dt) => {
      angle += (0.12 + bass * 0.3) * dt;
      camera.position.set(Math.sin(angle) * 75, Math.sin(angle * 0.5) * 20, Math.cos(angle) * 75);
      camera.lookAt(0, 0, 0);

      core.rotation.y -= (0.6 + bass * 1.2) * dt;
      core.rotation.x -= 0.3 * dt;
      const cs = 1 + bass * 1.5;
      core.scale.set(cs, cs, cs);
      const os = 1 + bass * 0.1;
      outer.scale.set(os, os, os);
      group.rotation.y = angle * 0.2;
      coreMat.color.setHex(high > 0.8 ? 0xccffff : 0xff00ff);
    },
  };
}

// ───────── Efekt 3: Audio Mountains ─────────
function createMountains(canvas: HTMLCanvasElement): Scene3D {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020516);
  scene.fog = new THREE.FogExp2(0x020516, 0.012);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, -50);

  const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.4 }),
  );
  terrain.position.set(0, -5, -130);
  scene.add(terrain);
  const base = Float32Array.from(terrainGeo.attributes.position.array as ArrayLike<number>);

  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.6 }),
  );
  horizon.position.set(0, 0, -180);
  scene.add(horizon);

  let travel = 0;
  return {
    renderer, scene, camera,
    update: ({ bass, mid }, dt, t) => {
      travel += (10 + mid * 15) * dt;
      const pos = terrainGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const dist = Math.abs(x);
        let y = 0;
        if (dist > 10) { // uprostřed volná cesta
          const nx = x * 0.05;
          const nz = (base[i * 3 + 2] + travel) * 0.03;
          const e = Math.sin(nx) * Math.cos(nz) + Math.sin(nx * 2.1 + nz * 1.3) * 0.5;
          y = Math.max(0, e) * (dist - 10) * 0.4 * (1 + bass * 4);
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      camera.position.x = Math.sin(t) * 2;
      camera.position.y = 5 + Math.abs(Math.cos(t * 2)) * 1.5 - bass * 1.5;
    },
  };
}

const EFFECTS = [createPortal, createSphere, createMountains];

/** Uvolní renderer i všechny geometrie a materiály scény (jinak WebGL paměť uniká) */
function disposeScene(s: Scene3D) {
  s.scene.traverse((obj) => {
    const o = obj as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
  s.renderer.dispose();
}

export function VisualizerStudio({ audioRef, isPlaying, onClose }: VisualizerStudioProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [effectIndex, setEffectIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen();
    p?.catch((e) => console.warn('Celá obrazovka není k dispozici', e));
  };

  // Scéna aktuálního efektu: vytvořit, animovat, při přepnutí / zavření uvolnit
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let s3d: Scene3D;
    try {
      s3d = EFFECTS[effectIndex](canvas);
    } catch (e) {
      console.warn('WebGL není k dispozici', e);
      return;
    }

    let data: Uint8Array<ArrayBuffer> | null = null;
    let raf = 0;
    let last = performance.now();
    const start = last;
    let w = 0;
    let h = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); // po skrytí okna žádný skok
      last = now;

      if (canvas.clientWidth !== w || canvas.clientHeight !== h) {
        w = canvas.clientWidth;
        h = canvas.clientHeight;
        s3d.renderer.setSize(w, h, false);
        s3d.camera.aspect = w / Math.max(1, h);
        s3d.camera.updateProjectionMatrix();
      }

      const levels: Levels = { bass: 0, mid: 0, high: 0 };
      const analyser = getAudioGraph(audioRef.current)?.analyser;
      if (analyser && playingRef.current) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        levels.bass = bandLevel(data, analyser, 20, 150);
        levels.mid = bandLevel(data, analyser, 400, 2500);
        levels.high = bandLevel(data, analyser, 5000, 12000);
      }
      s3d.update(levels, dt, (now - start) / 1000);
      s3d.renderer.render(s3d.scene, s3d.camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      disposeScene(s3d);
    };
  }, [effectIndex, audioRef]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-50 flex items-center justify-center bg-slate-950 overflow-hidden ${!isFullscreen ? 'rounded-3xl border-2 border-cyan-500/20 shadow-[0_0_50px_rgba(0,243,255,0.15)] m-4' : ''}`}
    >
      <canvas ref={canvasRef} className="w-full h-full absolute inset-0 z-0" />

      {/* Ovládání – na celé obrazovce se ukáže po najetí myší */}
      <div className={`absolute top-0 w-full p-6 flex justify-between items-start transition-opacity duration-500 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
        <button
          onClick={onClose}
          title="Zavřít Visualizer"
          className="p-3 bg-slate-900/80 rounded-full border border-white/10 text-slate-300 hover:text-pink-500 hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(255,0,255,0.5)] transition-all"
        >
          <X size={28} />
        </button>

        <div className="flex gap-4">
          <button
            onClick={() => setEffectIndex((p) => (p + 1) % EFFECTS.length)}
            title={`Přepnout vizualizaci (${EFFECT_NAMES[effectIndex]})`}
            className="p-3 font-semibold tracking-wide bg-slate-900/80 rounded-full border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.5)] transition-all flex items-center gap-2"
          >
            <ChevronRight size={24} /> Mode {effectIndex + 1}
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Ukončit celou obrazovku' : 'Celá obrazovka'}
            className={`p-3 bg-slate-900/80 rounded-full border-2 transition-all ${isFullscreen ? 'border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.5)]' : 'border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.5)]'}`}
          >
            <Maximize size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
