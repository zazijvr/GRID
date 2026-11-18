import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';
import { createLogo, levelOf } from './common';

const GALAXY_VERTEX = `
  attribute float aBand; attribute float aSize; attribute vec3 aColor;
  uniform float uLevels[${SPECTRUM_BANDS}]; uniform float uPulse; uniform float uPixel;
  varying vec3 vColor; varying float vGlow;
  void main(){
    float lv = uLevels[int(aBand)];
    vGlow = 0.18 + lv * 1.0 + uPulse * 0.3;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position * (1.0 + lv * 0.08), 1.0);
    gl_PointSize = aSize * (0.8 + lv * 2.4 + uPulse * 0.6) * uPixel * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const GALAXY_FRAGMENT = `
  varying vec3 vColor; varying float vGlow;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, d));
    gl_FragColor = vec4(vColor * vGlow * a, 1.0);
  }`;

/**
 * Neon Galaxy – spirální galaxie z tisíců částic kolem loga. Vzdálenost od středu = pásmo
 * spektra (basy uvnitř), takže ramena svítí podle hudby. Na beat se rozběhne rázová vlna.
 */
export function createGalaxy(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02010a);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(0, 34, 52);
  camera.lookAt(0, 0, 0);

  const galaxy = new THREE.Group();
  scene.add(galaxy);

  const COUNT = 9000;
  const ARMS = 4;
  const R_MIN = 9;
  const R_MAX = 42;
  const pos = new Float32Array(COUNT * 3);
  const band = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  const col = new Float32Array(COUNT * 3);
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const t = Math.pow(Math.random(), 0.8);
    const r = R_MIN + t * (R_MAX - R_MIN);
    const arm = (i % ARMS) / ARMS;
    const angle = arm * Math.PI * 2 + t * 4.2; // spirála
    const scatter = (1 - t * 0.5) * 3.2;
    pos[i * 3] = Math.cos(angle) * r + (Math.random() - 0.5) * scatter;
    pos[i * 3 + 1] = (Math.random() - 0.5) * (2.2 - t * 1.6);
    pos[i * 3 + 2] = Math.sin(angle) * r + (Math.random() - 0.5) * scatter;
    band[i] = Math.min(SPECTRUM_BANDS - 1, Math.floor(t * SPECTRUM_BANDS));
    size[i] = 0.6 + Math.random() * 1.4;
    c.setHSL(0.5 + t * 0.38 + (Math.random() - 0.5) * 0.04, 1, 0.55);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBand', new THREE.BufferAttribute(band, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const uniforms = {
    uLevels: { value: new Array(SPECTRUM_BANDS).fill(0) as number[] },
    uPulse: { value: 0 },
    uPixel: { value: 1 },
  };
  galaxy.add(new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: GALAXY_VERTEX, fragmentShader: GALAXY_FRAGMENT,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // Rázové vlny na beat (ploché prstence v rovině galaxie)
  const waves = Array.from({ length: 4 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 160), mat); // tloušťka roste se zvětšením – tenký
    mesh.rotation.x = Math.PI / 2;
    galaxy.add(mesh);
    return { mesh, mat, age: 99 };
  });
  let nextWave = 0;

  // Logo „lícem“ ke kameře nad středem galaxie
  const logo = createLogo(scene, 16, 2, camera);
  const cyan = new THREE.Color(0x00f3ff);
  const pink = new THREE.Color(0xff2bd6);

  return {
    name: 'Neon Galaxy',
    scene, camera,
    bloom: { strength: 0.5, radius: 0.3, threshold: 0.35 },
    bloomStrength: (f) => 0.45 + f.pulse * 0.25,
    // Velikost bodů s výškou okna jen mírně – na celé obrazovce by se aditivní záře slila do jedné plochy
    resize: (_w, h) => { uniforms.uPixel.value = Math.min(1.15, Math.max(0.6, h / 700)); },
    update(f, dt, t) {
      const lv = uniforms.uLevels.value;
      for (let i = 0; i < SPECTRUM_BANDS; i++) lv[i] = levelOf(f, i);
      uniforms.uPulse.value = f.pulse;
      galaxy.rotation.y += (0.05 + f.energyN * 0.7 + f.pulse * 0.6) * dt;
      const gs = 1 + f.bassN * 0.12 + f.pulse * 0.08;
      galaxy.scale.set(gs, 1 + f.pulse * 0.6, gs);

      if (f.beat) {
        const w = waves[nextWave];
        nextWave = (nextWave + 1) % waves.length;
        w.age = 0;
        w.mat.color.copy(Math.random() < 0.5 ? cyan : pink);
      }
      for (const w of waves) {
        w.age += dt;
        const k = Math.min(1, w.age / 1.8);
        w.mesh.scale.setScalar(R_MIN + k * (R_MAX + 8 - R_MIN));
        w.mat.opacity = (1 - k) * 0.6;
        w.mesh.visible = k < 1;
      }
      logo.update(f);

      camera.position.x = Math.sin(t * 0.12) * 18;
      camera.position.z = 50 + Math.cos(t * 0.12) * 6;
      camera.position.y = 30 + Math.sin(t * 0.2) * 5;
      camera.lookAt(0, 0, 0);
    },
  };
}
