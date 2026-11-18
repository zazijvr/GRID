import * as THREE from 'three';
import type { Effect } from '../engine';

const DISPLACE_VERTEX = `
  uniform float uTime; uniform float uBass; uniform float uHigh; uniform float uPulse;
  varying float vDisp;
  // Plynulý „šum“ ze sinů – levný a stačí na organické vlnění
  float wave(vec3 p, float t){
    return sin(p.x * 0.35 + t) * sin(p.y * 0.41 + t * 1.3) * sin(p.z * 0.33 + t * 0.7)
         + 0.5 * sin(p.x * 0.9 - t * 1.7) * sin(p.z * 0.8 + t * 1.1);
  }
  void main(){
    vec3 n = normalize(position);
    float d = wave(position, uTime) * (1.5 + uBass * 7.0) + uPulse * 2.5
            + sin(dot(n, vec3(12.0, 7.0, 9.0)) + uTime * 6.0) * uHigh * 1.4;
    vDisp = d;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + n * d, 1.0);
  }`;

const DISPLACE_FRAGMENT = `
  uniform vec3 uColorA; uniform vec3 uColorB; uniform float uOpacity;
  varying float vDisp;
  void main(){ gl_FragColor = vec4(mix(uColorA, uColorB, clamp(vDisp * 0.18 + 0.5, 0.0, 1.0)), uOpacity); }`;

/** Cyber Sphere – drátěná koule, která se deformuje podle basů a výšek, kolem prstence a prach */
export function createSphere(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01030d);
  scene.fog = new THREE.FogExp2(0x01030d, 0.004);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 80);

  const group = new THREE.Group();
  scene.add(group);

  const uniforms = {
    uTime: { value: 0 }, uBass: { value: 0 }, uHigh: { value: 0 }, uPulse: { value: 0 },
    uColorA: { value: new THREE.Color(0x00f3ff) }, uColorB: { value: new THREE.Color(0xff00ff) }, uOpacity: { value: 0.55 },
  };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(16, 6),
    new THREE.ShaderMaterial({ uniforms, vertexShader: DISPLACE_VERTEX, fragmentShader: DISPLACE_FRAGMENT, wireframe: true, transparent: true }),
  );
  group.add(core);

  const shellMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.12 });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(34, 3), shellMat);
  group.add(shell);

  // Prstence jako u planety
  const rings = [0, 1, 2].map((i) => {
    const mat = new THREE.MeshBasicMaterial({ color: i === 1 ? 0xff00ff : 0x00f3ff, transparent: true, opacity: 0.6, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(24 + i * 4, 0.08, 6, 180), mat);
    mesh.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
    mesh.rotation.y = (i - 1) * 0.3;
    group.add(mesh);
    return { mesh, mat };
  });

  const STARS = 800;
  const pos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const r = 45 + Math.random() * 90;
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const k = Math.sqrt(1 - u * u);
    pos[i * 3] = r * k * Math.cos(a);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * k * Math.sin(a);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x88ccff, size: 0.5, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  let angle = 0;
  return {
    name: 'Cyber Sphere',
    scene, camera,
    bloom: { strength: 0.8, radius: 0.35, threshold: 0.2 },
    bloomStrength: (f) => 0.7 + f.pulse * 0.4,
    update(f, dt, t) {
      uniforms.uTime.value = t;
      uniforms.uBass.value = f.bass;
      uniforms.uHigh.value = f.high;
      uniforms.uPulse.value = f.pulse;

      angle += (0.1 + f.bass * 0.35) * dt;
      camera.position.set(Math.sin(angle) * 80, Math.sin(angle * 0.5) * 22, Math.cos(angle) * 80);
      camera.lookAt(0, 0, 0);

      core.rotation.y -= (0.3 + f.mid * 0.8) * dt;
      shell.rotation.y += 0.05 * dt;
      shell.scale.setScalar(1 + f.bass * 0.12 + f.pulse * 0.05);
      shellMat.opacity = 0.08 + f.high * 0.25;
      rings.forEach(({ mesh, mat }, i) => {
        mesh.rotation.z += (0.15 + i * 0.07) * dt * (i % 2 ? -1 : 1);
        mesh.scale.setScalar(1 + f.pulse * 0.08 * (i + 1));
        mat.opacity = 0.35 + f.mid * 0.5;
      });
      dust.rotation.y += 0.02 * dt;
    },
  };
}
