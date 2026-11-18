import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';
import { createLogo, createSparks } from './common';

/**
 * Neon Equalizer – klasický ekvalizér zrcadlený od středu (basy uprostřed), odraz v „podlaze“,
 * padající špičky a jiskry z vrcholů na beat. Logo nad sloupci.
 */
export function createEqualizer(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03020d);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 4, 70);

  const BARS = SPECTRUM_BANDS * 2;
  const WIDTH = 74;
  const step = WIDTH / BARS;
  const MAX_H = 22;
  const FLOOR = -8;

  const barGeo = new THREE.BoxGeometry(step * 0.5, 1, step * 0.5);
  barGeo.translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial(), BARS);
  const mirror = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18 }), BARS);
  const capGeo = new THREE.BoxGeometry(step * 0.5, 0.22, step * 0.5);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), BARS);
  const color = new THREE.Color();
  // Basy uprostřed, k okrajům výšky
  const bandOf = (i: number) => {
    const fromCenter = Math.abs(i + 0.5 - BARS / 2) / (BARS / 2);
    return Math.min(SPECTRUM_BANDS - 1, Math.floor(fromCenter * SPECTRUM_BANDS));
  };
  for (let i = 0; i < BARS; i++) {
    color.setHSL(0.5 + (bandOf(i) / SPECTRUM_BANDS) * 0.38, 1, 0.45);
    bars.setColorAt(i, color);
    mirror.setColorAt(i, color);
    color.setHSL(0.5 + (bandOf(i) / SPECTRUM_BANDS) * 0.38, 1, 0.8);
    caps.setColorAt(i, color);
  }
  scene.add(bars, mirror, caps);

  // Podlaha – svítící linka a slabá mřížka
  const floorLineMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
  const floorLine = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 6, 0.12, 0.12), floorLineMat);
  floorLine.position.y = FLOOR - 0.15;
  scene.add(floorLine);
  const grid = new THREE.GridHelper(160, 40, 0x3a1a6a, 0x1a0d3a);
  grid.position.set(0, FLOOR - 0.2, -30);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  scene.add(grid);

  const logo = createLogo(scene, 20, 24);
  const sparks = createSparks(scene, 1200, 0.4);

  const heights = new Float32Array(BARS);
  const peaks = new Float32Array(BARS);
  const peakHold = new Float32Array(BARS);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const cyan = new THREE.Color(0x00f3ff);
  const white = new THREE.Color(0xffffff);

  return {
    name: 'Neon Equalizer',
    scene, camera,
    bloom: { strength: 0.6, radius: 0.3, threshold: 0.3 },
    bloomStrength: (f) => 0.55 + f.pulse * 0.35,
    update(f, dt, t) {
      for (let i = 0; i < BARS; i++) {
        const target = 0.15 + f.spectrum[bandOf(i)] ** 1.3 * MAX_H;
        heights[i] += (target - heights[i]) * Math.min(1, dt * 20);
        const h = heights[i];
        const x = -WIDTH / 2 + (i + 0.5) * step;
        p.set(x, FLOOR, 0); s.set(1, h, 1);
        bars.setMatrixAt(i, m.compose(p, q.identity(), s));
        p.set(x, FLOOR - 0.3, 0); s.set(1, h * 0.6, 1);
        mirror.setMatrixAt(i, m.compose(p, flip, s));
        // Špička: drží se chvíli nahoře, pak padá
        if (h >= peaks[i]) { peaks[i] = h; peakHold[i] = 0.35; }
        else if ((peakHold[i] -= dt) < 0) peaks[i] = Math.max(h, peaks[i] - dt * 14);
        p.set(x, FLOOR + peaks[i] + 0.4, 0); s.set(1, 1, 1);
        caps.setMatrixAt(i, m.compose(p, q.identity(), s));
      }
      bars.instanceMatrix.needsUpdate = true;
      mirror.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;

      floorLineMat.color.copy(cyan).lerp(white, f.pulse * 0.7);
      logo.update(f);

      if (f.beat) {
        // Jiskry z nejvyšších sloupců
        for (let i = 0; i < BARS; i += 2) {
          if (heights[i] < MAX_H * 0.35) continue;
          const x = -WIDTH / 2 + (i + 0.5) * step;
          for (let k = 0; k < 3; k++) {
            sparks.emit(x, FLOOR + heights[i], 0, (Math.random() - 0.5) * 6, 10 + Math.random() * 18, (Math.random() - 0.5) * 6, 0.5 + (bandOf(i) / SPECTRUM_BANDS) * 0.38);
          }
        }
      }
      sparks.update(dt, 22);
      grid.position.z = -30 + ((t * (6 + f.mid * 12)) % 4);

      camera.position.x = Math.sin(t * 0.2) * 6;
      camera.position.y = 4 + Math.sin(t * 0.33) * 2;
      camera.lookAt(0, 4, 0);
    },
  };
}
