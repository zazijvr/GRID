import * as THREE from 'three';
import type { Effect } from '../engine';

/** Audio Mountains – let nad drátěnou krajinou, hory rostou s basy, horizont svítí na beat */
export function createMountains(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020516);
  scene.fog = new THREE.FogExp2(0x020516, 0.012);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, -50);

  const geo = new THREE.PlaneGeometry(300, 300, 90, 90);
  geo.rotateX(-Math.PI / 2);
  const terrainMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.35 });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.position.set(0, -5, -130);
  scene.add(terrain);
  const base = Float32Array.from(geo.attributes.position.array as ArrayLike<number>);

  const horizonMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.7, toneMapped: false });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.6), horizonMat);
  horizon.position.set(0, 0, -180);
  scene.add(horizon);

  const cyan = new THREE.Color(0x00f3ff);
  const pink = new THREE.Color(0xff00ff);
  let travel = 0;

  return {
    name: 'Audio Mountains',
    scene, camera,
    bloom: { strength: 0.7, radius: 0.35, threshold: 0.2 },
    bloomStrength: (f) => 0.6 + f.pulse * 0.4,
    update(f, dt, t) {
      travel += (10 + f.mid * 18 + f.pulse * 14) * dt;
      const pos = geo.attributes.position;
      const lift = 1 + f.bass * 4 + f.pulse * 1.5;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const dist = Math.abs(x);
        let y = 0;
        if (dist > 10) { // uprostřed volná cesta
          const nx = x * 0.05;
          const nz = (base[i * 3 + 2] + travel) * 0.03;
          const e = Math.sin(nx) * Math.cos(nz) + Math.sin(nx * 2.1 + nz * 1.3) * 0.5;
          y = Math.max(0, e) * (dist - 10) * 0.4 * lift;
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      terrainMat.color.copy(cyan).lerp(pink, f.high * 0.8);
      horizonMat.opacity = 0.5 + f.pulse * 0.5;
      horizon.scale.y = 1 + f.pulse * 3;

      camera.position.x = Math.sin(t) * 2;
      camera.position.y = 5 + Math.abs(Math.cos(t * 2)) * 1.5 - f.bass * 1.5;
    },
  };
}
