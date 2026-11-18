import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';

/** Neon Ring – kruhové spektrum (zrcadlené) kolem pulzujícího loga ZažijVR, na beat jiskry */
export function createRing(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03020d);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 0, 62);

  const root = new THREE.Group();
  scene.add(root);

  // ── Sloupce spektra: 2 × SPECTRUM_BANDS (levá a pravá polovina kruhu zrcadlově) ──
  const BARS = SPECTRUM_BANDS * 2;
  const RADIUS = 15;
  const barGeo = new THREE.BoxGeometry(0.55, 1, 0.55);
  barGeo.translate(0, 0.5, 0); // roste od kruhu ven
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), BARS);
  const color = new THREE.Color();
  for (let i = 0; i < BARS; i++) {
    const k = i < SPECTRUM_BANDS ? i : BARS - 1 - i; // 0 = basy (nahoře), roste k výškám
    color.setHSL(0.5 + (k / SPECTRUM_BANDS) * 0.38, 1, 0.55); // azurová → fialová → růžová
    bars.setColorAt(i, color);
  }
  root.add(bars);
  // Odraz – stejné sloupce dovnitř, slabší
  const inner = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, toneMapped: false }), BARS);
  for (let i = 0; i < BARS; i++) { bars.getColorAt(i, color); inner.setColorAt(i, color); }
  root.add(inner);

  // ── Kruhy ──
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RADIUS - 0.4, 0.12, 8, 160), ringMat);
  root.add(ring);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.5, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(RADIUS + 13, 0.06, 6, 200), haloMat);
  root.add(halo);

  // ── Logo uprostřed ──
  const logoTex = new THREE.TextureLoader().load('/logo.png');
  logoTex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Sprite(new THREE.SpriteMaterial({ map: logoTex, transparent: true, opacity: 0.95 }));
  logo.scale.set(18, 6, 1);
  scene.add(logo);

  // ── Jiskry na beat ──
  const SPARKS = 1200;
  const sPos = new Float32Array(SPARKS * 3);
  const sVel = new Float32Array(SPARKS * 3);
  const sCol = new Float32Array(SPARKS * 3);
  const life = new Float32Array(SPARKS); // 0 = mrtvá
  let next = 0;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.45, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  scene.add(sparks);
  const burst = (count: number, strength: number) => {
    for (let n = 0; n < count; n++) {
      const i = next;
      next = (next + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2;
      const sp = (12 + Math.random() * 30) * strength;
      sPos[i * 3] = Math.cos(a) * RADIUS;
      sPos[i * 3 + 1] = Math.sin(a) * RADIUS;
      sPos[i * 3 + 2] = 0;
      sVel[i * 3] = Math.cos(a) * sp;
      sVel[i * 3 + 1] = Math.sin(a) * sp;
      sVel[i * 3 + 2] = (Math.random() - 0.5) * 10;
      life[i] = 1;
      color.setHSL(0.5 + Math.random() * 0.4, 1, 0.6);
      sCol[i * 3] = color.r; sCol[i * 3 + 1] = color.g; sCol[i * 3 + 2] = color.b;
    }
  };

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
      for (let i = 0; i < BARS; i++) {
        const k = i < SPECTRUM_BANDS ? i : BARS - 1 - i;
        const level = f.spectrum[k];
        // Úhel: basy nahoře (π/2), polovina kruhu na každou stranu
        const a = Math.PI / 2 + ((i + 0.5) / BARS) * Math.PI * 2;
        const r = RADIUS * pulse;
        q.setFromAxisAngle(zAxis, a - Math.PI / 2);
        p.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        s.set(1, 0.3 + level * 13, 1);
        bars.setMatrixAt(i, m.compose(p, q, s));
        // Odraz dovnitř
        q.setFromAxisAngle(zAxis, a + Math.PI / 2);
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
      const ls = 1 + f.bass * 0.12 + f.pulse * 0.1;
      const img = logoTex.image as HTMLImageElement | undefined;
      const aspect = img?.width ? img.height / img.width : 1 / 3;
      logo.scale.set(18 * ls, 18 * aspect * ls, 1);

      if (f.beat) burst(Math.round(60 + f.bass * 140), 0.8 + f.bass);
      for (let i = 0; i < SPARKS; i++) {
        if (life[i] <= 0) { sPos[i * 3 + 2] = 1000; continue; } // mimo záběr
        life[i] -= dt * 0.9;
        const drag = Math.max(0, 1 - dt * 1.5);
        sVel[i * 3] *= drag; sVel[i * 3 + 1] *= drag; sVel[i * 3 + 2] *= drag;
        sPos[i * 3] += sVel[i * 3] * dt;
        sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt;
        sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
        const dim = Math.pow(0.4, dt); // barva hasne (aditivní míchání → tmavší = průhlednější)
        sCol[i * 3] *= dim; sCol[i * 3 + 1] *= dim; sCol[i * 3 + 2] *= dim;
        if (life[i] <= 0) sPos[i * 3 + 2] = 1000;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;

      camera.position.x = Math.sin(t * 0.3) * 4;
      camera.position.y = Math.cos(t * 0.23) * 3;
      camera.lookAt(0, 0, 0);
    },
  };
}
