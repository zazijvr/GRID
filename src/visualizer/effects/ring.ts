import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';
import { createLogo, createSparks } from './common';

/** Neon Ring – kruhové spektrum (zrcadlené) kolem loga ZažijVR, na beat jiskry */
export function createRing(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03020d);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 0, 62);

  const root = new THREE.Group();
  scene.add(root);

  // Sloupce spektra: 2 × SPECTRUM_BANDS (levá a pravá polovina kruhu zrcadlově), basy nahoře
  const BARS = SPECTRUM_BANDS * 2;
  const RADIUS = 15;
  const barGeo = new THREE.BoxGeometry(0.55, 1, 0.55);
  barGeo.translate(0, 0.5, 0); // roste od kruhu ven
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial(), BARS);
  const inner = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 }), BARS);
  const color = new THREE.Color();
  const bandOf = (i: number) => (i < SPECTRUM_BANDS ? i : BARS - 1 - i);
  for (let i = 0; i < BARS; i++) {
    color.setHSL(0.5 + (bandOf(i) / SPECTRUM_BANDS) * 0.38, 1, 0.55); // azurová → fialová → růžová
    bars.setColorAt(i, color);
    inner.setColorAt(i, color);
  }
  root.add(bars, inner);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS - 0.4, 0.12, 8, 160), ringMat);
  root.add(ring);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.5 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(RADIUS + 13, 0.06, 6, 200), haloMat);
  root.add(halo);

  const logo = createLogo(scene, 18);
  const sparks = createSparks(scene);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const cyan = new THREE.Color(0x00f3ff);
  const white = new THREE.Color(0xffffff);

  return {
    name: 'Neon Ring',
    scene, camera,
    bloom: { strength: 0.8, radius: 0.35, threshold: 0.25 },
    bloomStrength: (f) => 0.7 + f.pulse * 0.4,
    update(f, dt, t) {
      const pulse = 1 + f.bass * 0.18 + f.pulse * 0.08;
      const r = RADIUS * pulse;
      for (let i = 0; i < BARS; i++) {
        const level = f.spectrum[bandOf(i)];
        const a = Math.PI / 2 + ((i + 0.5) / BARS) * Math.PI * 2;
        q.setFromAxisAngle(zAxis, a - Math.PI / 2);
        p.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        s.set(1, 0.3 + level * 13, 1);
        bars.setMatrixAt(i, m.compose(p, q, s));
        q.setFromAxisAngle(zAxis, a + Math.PI / 2); // odraz dovnitř
        p.set(Math.cos(a) * (r - 0.6), Math.sin(a) * (r - 0.6), 0);
        s.set(1, 0.2 + level * 5, 1);
        inner.setMatrixAt(i, m.compose(p, q, s));
      }
      bars.instanceMatrix.needsUpdate = true;
      inner.instanceMatrix.needsUpdate = true;

      root.rotation.z += (0.05 + f.mid * 0.25) * dt;
      ring.scale.setScalar(pulse);
      ringMat.color.copy(cyan).lerp(white, f.pulse * 0.7);
      halo.scale.setScalar(1 + f.pulse * 0.12 + f.high * 0.1);
      haloMat.opacity = 0.25 + f.high * 0.5 + f.pulse * 0.25;
      halo.rotation.z -= 0.1 * dt;
      logo.update(f);

      if (f.beat) {
        const n = Math.round(60 + f.bass * 140);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = (12 + Math.random() * 30) * (0.8 + f.bass);
          sparks.emit(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.5) * 10, 0.5 + Math.random() * 0.4);
        }
      }
      sparks.update(dt);

      camera.position.x = Math.sin(t * 0.3) * 4;
      camera.position.y = Math.cos(t * 0.23) * 3;
      camera.lookAt(0, 0, 0);
    },
  };
}
