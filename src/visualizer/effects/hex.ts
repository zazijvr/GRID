import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';
import { createLogo, createSparks } from './common';

/**
 * Neon Hex – tunel neonových šestiúhelníků letících proti divákovi; každý patří k jednomu pásmu
 * spektra (barva a jas), rychlost podle středů, na beat záblesk a zrychlení. Logo uprostřed.
 */
export function createHex(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03020d);
  scene.fog = new THREE.Fog(0x03020d, 40, 170);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 0, 40);

  const tunnel = new THREE.Group();
  scene.add(tunnel);

  const COUNT = 28;
  const SPACING = 6;
  const FAR = -COUNT * SPACING + 30;
  // Torus s 6 segmenty po obvodu = šestiúhelník s tloušťkou
  const hexGeo = new THREE.TorusGeometry(18, 0.18, 6, 6);
  const hexes = Array.from({ length: COUNT }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true });
    const mesh = new THREE.Mesh(hexGeo, mat);
    mesh.position.z = 30 - i * SPACING;
    mesh.rotation.z = i * 0.09;
    tunnel.add(mesh);
    return { mesh, mat, band: Math.floor(Math.random() * SPECTRUM_BANDS) };
  });

  // Svítící body v rozích šestiúhelníků (prach tunelu)
  const DUST = 600;
  const dPos = new Float32Array(DUST * 3);
  const placeDust = (i: number, z: number) => {
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 14;
    dPos[i * 3] = Math.cos(a) * r; dPos[i * 3 + 1] = Math.sin(a) * r; dPos[i * 3 + 2] = z;
  };
  for (let i = 0; i < DUST; i++) placeDust(i, FAR + Math.random() * (30 - FAR));
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x88ddff, size: 0.3, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  const logo = createLogo(scene, 14);
  const sparks = createSparks(scene, 800, 0.4);
  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  let spin = 0;

  return {
    name: 'Neon Hex',
    scene, camera,
    bloom: { strength: 0.85, radius: 0.4, threshold: 0.2 },
    bloomStrength: (f) => 0.7 + f.pulse * 0.5,
    update(f, dt, t) {
      const speed = 14 + f.mid * 40 + f.pulse * 45;
      spin += (0.15 + f.bass * 0.8 - spin) * Math.min(1, dt * 3);
      tunnel.rotation.z += spin * dt;

      for (const h of hexes) {
        h.mesh.position.z += speed * dt;
        if (h.mesh.position.z > 32) {
          h.mesh.position.z -= COUNT * SPACING; // zpět dozadu, nové pásmo
          h.band = Math.floor(Math.random() * SPECTRUM_BANDS);
        }
        const level = f.spectrum[h.band];
        color.setHSL(0.5 + (h.band / SPECTRUM_BANDS) * 0.38, 1, 0.45 + level * 0.25);
        h.mat.color.copy(color).lerp(white, f.pulse * 0.35);
        // Blízko kamery zprůhlednit (neproletí obrazovkou jako zeď)
        const near = THREE.MathUtils.smoothstep(h.mesh.position.z, 18, 32);
        h.mat.opacity = (0.35 + level * 0.65) * (1 - near);
        const sc = 1 + level * 0.25 + f.bass * 0.1;
        h.mesh.scale.set(sc, sc, 1);
      }

      for (let i = 0; i < DUST; i++) {
        dPos[i * 3 + 2] += speed * dt * 1.4;
        if (dPos[i * 3 + 2] > 35) placeDust(i, FAR);
      }
      dustGeo.attributes.position.needsUpdate = true;

      if (f.beat) {
        for (let k = 0; k < 50; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 12 + Math.random() * 20;
          sparks.emit(Math.cos(a) * 8, Math.sin(a) * 8, 10, Math.cos(a) * sp, Math.sin(a) * sp, 8 + Math.random() * 10, 0.5 + Math.random() * 0.4);
        }
      }
      sparks.update(dt);
      logo.update(f);

      camera.position.x = Math.sin(t * 0.4) * (1.5 + f.bass * 2);
      camera.position.y = Math.cos(t * 0.31) * (1.5 + f.bass * 2);
      camera.lookAt(0, 0, -50);
    },
  };
}
