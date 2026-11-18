import * as THREE from 'three';
import type { Effect } from '../engine';

/** Hyperspace Portal – let neonovým tunelem; rychlost podle středů, na beat zrychlení a záblesk */
export function createPortal(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020516);
  scene.fog = new THREE.FogExp2(0x020516, 0.006);

  const camera = new THREE.PerspectiveCamera(85, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, -100);

  const group = new THREE.Group();
  scene.add(group);

  const LENGTH = 600;
  const SEGMENTS = 80;
  const segment = LENGTH / SEGMENTS; // posun o celý segment = nekonečná smyčka

  const tube = (radius: number, sides: number, color: number, opacity: number) => {
    const geo = new THREE.CylinderGeometry(radius, radius, LENGTH, sides, SEGMENTS, true);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -LENGTH / 2;
    group.add(mesh);
    return { mesh, mat };
  };
  const inner = tube(20, 32, 0x00f3ff, 0.45);
  const outer = tube(23, 24, 0xff00ff, 0.28); // paralaxa drátů

  // Prach u stěn tunelu (uprostřed by se slil do oslnivé koule)
  const STARS = 500;
  const pos = new Float32Array(STARS * 3);
  const place = (i: number, z: number) => {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 10;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r;
    pos[i * 3 + 2] = z;
  };
  for (let i = 0; i < STARS; i++) place(i, Math.random() * -300);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xaaddff, size: 0.35, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  const cyan = new THREE.Color(0x00f3ff);
  const pink = new THREE.Color(0xff00ff);
  const white = new THREE.Color(0xe0ffff);
  let travel = 0;
  let spin = 0;

  return {
    name: 'Hyperspace Portal',
    scene, camera,
    bloom: { strength: 0.8, radius: 0.35, threshold: 0.18 },
    bloomStrength: (f) => 0.7 + f.pulse * 0.45 + f.high * 0.2,
    update(f, dt, t) {
      const speed = 25 + f.mid * 110 + f.pulse * 90;
      travel += speed * dt;
      const z = -LENGTH / 2 + (travel % segment);
      inner.mesh.position.z = z;
      outer.mesh.position.z = z;

      for (let i = 0; i < STARS; i++) {
        pos[i * 3 + 2] += speed * dt * 1.6;
        if (pos[i * 3 + 2] > 20) place(i, -300);
      }
      starGeo.attributes.position.needsUpdate = true;

      spin += (0.25 + f.bass * 1.3 - spin) * Math.min(1, dt * 3);
      group.rotation.z += spin * dt;

      camera.rotation.z = Math.sin(t * 0.8) * 0.12;
      camera.position.x = Math.sin(t * 1.7) * (0.8 + f.bass * 1.5);
      camera.position.y = Math.cos(t * 1.3) * (0.8 + f.bass * 1.5);
      camera.fov = 85 + f.pulse * 8; // „nádech“ na beat
      camera.updateProjectionMatrix();

      inner.mat.color.copy(cyan).lerp(pink, f.mid).lerp(white, f.pulse * 0.6);
      outer.mat.color.copy(pink).lerp(white, f.pulse * 0.4);
      const s = 1 + f.bass * 0.15;
      group.scale.set(s, s, 1);
    },
  };
}
