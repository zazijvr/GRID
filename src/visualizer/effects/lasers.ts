import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';
import { createLogo, createNeonLine, createSparks } from './common';

/**
 * Neon Lasers – laserová show jako v klubu: paprsky ze tří zdrojů dole, kužel světla v „mlze“,
 * jas podle pásma, kmitání podle středů. Na beat záblesk a každé 4 beaty jiný vzorec.
 */
export function createLasers(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020109);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(0, 6, 60);
  camera.lookAt(0, 8, 0);

  const EMITTERS = [-26, 0, 26];
  const PER = 8; // paprsků na zdroj
  const LEN = 70;
  const BASE_Y = -14;
  const coneGeo = new THREE.BufferGeometry();
  // Kužel: trojúhelník od zdroje k šířce na konci; barva + průhlednost přes vertex barvy
  coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1.6, LEN, 0, 1.6, LEN, 0]), 3));
  coneGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0, 0, 0, 0]), 3));

  const beams = EMITTERS.flatMap((ex, e) =>
    Array.from({ length: PER }, (_, k) => {
      const band = Math.floor(((e * PER + k) / (EMITTERS.length * PER)) * SPECTRUM_BANDS);
      const hue = 0.5 + (band / SPECTRUM_BANDS) * 0.38;
      const color = new THREE.Color().setHSL(hue, 1, 0.55);
      const core = createNeonLine(2, color.getHex(), 2.5);
      const coneMat = new THREE.MeshBasicMaterial({
        color, vertexColors: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(ex, BASE_Y, -3.5);
      scene.add(core.line, cone);
      return { core, cone, coneMat, color, band, ex, k, e };
    }),
  );

  // Zdroje – svítící body dole
  const emitterMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const ex of EMITTERS) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), emitterMat);
    m.position.set(ex, BASE_Y, -3);
    scene.add(m);
  }
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(90, 0.1, 0.1), floorMat);
  floor.position.y = BASE_Y - 0.8;
  scene.add(floor);

  const logo = createLogo(scene, 18, 8);
  const sparks = createSparks(scene, 800, 0.4);

  let pattern = 0;
  let beats = 0;
  let phase = 0;
  const white = new THREE.Color(0xffffff);
  const tmp = new THREE.Color();

  /** Úhel paprsku (0 = svisle nahoru) podle vzorce */
  const angleOf = (e: number, k: number, ph: number) => {
    const spread = (k / (PER - 1) - 0.5) * 2; // −1…1
    const side = e - 1; // −1, 0, 1
    switch (pattern) {
      case 0: return spread * 0.75 + Math.sin(ph) * 0.25; // vějíř
      case 1: return -side * 0.45 + spread * 0.35 + Math.sin(ph * 1.3 + e) * 0.3; // kříž
      default: return Math.sin(ph * 1.6 + k * 0.5 + e) * 0.8; // vlna
    }
  };

  return {
    name: 'Neon Lasers',
    scene, camera,
    bloom: { strength: 0.9, radius: 0.4, threshold: 0.2 },
    bloomStrength: (f) => 0.8 + f.pulse * 0.6,
    resize: (w, h) => beams.forEach((b) => b.core.resize(w, h)),
    update(f, dt, t) {
      phase += (0.6 + f.mid * 2.5) * dt;
      if (f.beat && ++beats % 4 === 0) pattern = (pattern + 1) % 3;

      for (const b of beams) {
        const level = f.spectrum[b.band];
        const a = angleOf(b.e, b.k, phase);
        const len = LEN * (0.55 + level * 0.45);
        // Paprsky za logem (z = −3) – logo zůstane čitelné
        b.core.set(0, b.ex, BASE_Y, -3);
        b.core.set(1, b.ex + Math.sin(a) * len, BASE_Y + Math.cos(a) * len, -3);
        b.core.commit();
        b.core.line.visible = level > 0.04 || f.pulse > 0.5;
        tmp.copy(b.color).lerp(white, f.pulse * 0.6);
        b.core.material.color.copy(tmp);
        b.cone.rotation.z = -a;
        b.cone.scale.set(1 + f.pulse * 0.8, len / LEN, 1);
        b.coneMat.color.copy(tmp);
        b.coneMat.opacity = 0.05 + level * 0.18 + f.pulse * 0.08;
      }
      floorMat.color.setHSL(0.5 + Math.sin(t * 0.5) * 0.1, 1, 0.5 + f.pulse * 0.3);
      logo.update(f);

      if (f.beat) {
        for (const ex of EMITTERS) {
          for (let k = 0; k < 18; k++) {
            sparks.emit(ex, BASE_Y, 0, (Math.random() - 0.5) * 16, 8 + Math.random() * 20, (Math.random() - 0.5) * 6, 0.5 + Math.random() * 0.4);
          }
        }
      }
      sparks.update(dt, 18);

      camera.position.x = Math.sin(t * 0.18) * 5;
      camera.lookAt(0, 8, 0);
    },
  };
}
