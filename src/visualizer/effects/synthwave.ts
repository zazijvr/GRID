import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS } from '../audioFeatures';

/** Synthwave – retro slunce s pruhy, ubíhající neonová mřížka, hory jako ekvalizér a hvězdy */
export function createSynthwave(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0018);
  scene.fog = new THREE.Fog(0x0a0018, 60, 210);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  camera.position.set(0, 6, 30);
  camera.lookAt(0, 9, -100);

  // ── Obloha: přechod od fialové k tmavé ──
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.ShaderMaterial({
      depthWrite: false, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv;
        void main(){ vec3 top = vec3(0.02,0.0,0.06); vec3 hor = vec3(0.22,0.01,0.22);
          gl_FragColor = vec4(mix(hor, top, smoothstep(0.0, 0.55, vUv.y)), 1.0); }`,
    }),
  );
  sky.position.set(0, 110, -260);
  scene.add(sky);

  // ── Slunce s pruhy (shader) ──
  const sunUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(38, 96),
    new THREE.ShaderMaterial({
      uniforms: sunUniforms, transparent: true, fog: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform float uPulse; varying vec2 vUv;
        void main(){
          vec3 col = mix(vec3(1.0,0.12,0.55), vec3(1.0,0.85,0.25), smoothstep(0.15, 0.95, vUv.y));
          // Pruhy ve spodní polovině, ubíhají dolů a houstnou
          float y = vUv.y;
          float band = step(0.5, fract(y * 14.0 - uTime * 0.6));
          float cut = (y < 0.55) ? mix(1.0, band, smoothstep(0.55, 0.05, y)) : 1.0;
          gl_FragColor = vec4(col * (0.95 + uPulse * 0.35), cut);
        }`,
    }),
  );
  sun.position.set(0, 26, -230);
  scene.add(sun);

  // ── Hory: silueta = ekvalizér (výška podle spektra), tmavá výplň + neonová hrana ──
  const RIDGE_POINTS = 96;
  const ridgeWidth = 760; // přes celou šířku i na ultrawide
  const ridgeBase = new Float32Array(RIDGE_POINTS); // tvar hor bez hudby
  for (let i = 0; i < RIDGE_POINTS; i++) {
    const x = i / (RIDGE_POINTS - 1);
    const center = Math.abs(x - 0.5) * 2; // uprostřed (za sluncem) nižší
    ridgeBase[i] = (4 + Math.abs(Math.sin(i * 0.9) * 6 + Math.sin(i * 0.37) * 9)) * (0.35 + center * 0.9);
  }
  const fillPos = new Float32Array(RIDGE_POINTS * 2 * 3);
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
  const idx: number[] = [];
  for (let i = 0; i < RIDGE_POINTS - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  fillGeo.setIndex(idx);
  const ridgeFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x07000f, side: THREE.DoubleSide, fog: false }));
  ridgeFill.position.z = -170;
  scene.add(ridgeFill);
  const edgePos = new Float32Array(RIDGE_POINTS * 3);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x00f3ff, fog: false, toneMapped: false });
  const ridgeEdge = new THREE.Line(edgeGeo, edgeMat);
  ridgeEdge.position.z = -169.8;
  scene.add(ridgeEdge);

  // ── Podlaha: nekonečná mřížka (shader), čáry zesvětlí na beat ──
  const gridUniforms = { uOffset: { value: 0 }, uPulse: { value: 0 }, uColor: { value: new THREE.Color(0xff2bd6) } };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 400, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: gridUniforms,
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uOffset; uniform float uPulse; uniform vec3 uColor; varying vec3 vPos;
        float line(float c, float w){ float f = abs(fract(c) - 0.5); return 1.0 - smoothstep(0.0, w * fwidth(c), 0.5 - f); }
        void main(){
          vec2 c = vec2(vPos.x / 8.0, (vPos.y + uOffset) / 8.0);
          float g = max(line(c.x, 1.5), line(c.y, 1.5));
          // do dálky (k horám, y ≈ 80) plynule vyhasne – jinak se zhuštěné čáry slijí do pruhu
          float fade = smoothstep(-200.0, 20.0, vPos.y) * (1.0 - smoothstep(5.0, 78.0, vPos.y));
          float glow = 0.5 + uPulse * 0.6;
          // Neprůhledná tmavá podlaha – jinak by skrz ni prosvítala spodní část oblohy a slunce
          vec3 base = vec3(0.03, 0.0, 0.06);
          gl_FragColor = vec4(mix(base, uColor * glow, g * fade * 0.8), 1.0);
        }`,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -90);
  scene.add(floor);

  // ── Hvězdy ──
  const STARS = 700;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 700;
    starPos[i * 3 + 1] = 40 + Math.random() * 180;
    starPos[i * 3 + 2] = -240 - Math.random() * 10;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.8, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  const cyan = new THREE.Color(0x00f3ff);
  const white = new THREE.Color(0xffffff);
  let offset = 0;
  const heights = new Float32Array(RIDGE_POINTS);

  return {
    name: 'Synthwave',
    scene, camera,
    bloom: { strength: 0.7, radius: 0.4, threshold: 0.3 },
    bloomStrength: (f) => 0.6 + f.pulse * 0.4 + f.bass * 0.15,
    update(f, dt, t) {
      offset += (14 + f.mid * 30 + f.pulse * 25) * dt;
      gridUniforms.uOffset.value = offset;
      gridUniforms.uPulse.value = f.pulse;
      sunUniforms.uTime.value = t;
      sunUniforms.uPulse.value = f.pulse * 0.6 + f.bass * 0.4;
      const ss = 1 + f.bass * 0.06;
      sun.scale.set(ss, ss, 1);

      // Hory: k základnímu tvaru přičíst spektrum (zrcadlově od středu – basy uprostřed)
      for (let i = 0; i < RIDGE_POINTS; i++) {
        const fromCenter = Math.abs(i / (RIDGE_POINTS - 1) - 0.5) * 2;
        const band = Math.min(SPECTRUM_BANDS - 1, Math.floor(fromCenter * (SPECTRUM_BANDS - 1)));
        const target = ridgeBase[i] + f.spectrum[band] * 26 * (0.4 + fromCenter);
        heights[i] += (target - heights[i]) * Math.min(1, dt * 12);
        const x = (i / (RIDGE_POINTS - 1) - 0.5) * ridgeWidth;
        edgePos[i * 3] = x; edgePos[i * 3 + 1] = heights[i]; edgePos[i * 3 + 2] = 0;
        fillPos[i * 6] = x; fillPos[i * 6 + 1] = heights[i]; fillPos[i * 6 + 2] = 0;
        fillPos[i * 6 + 3] = x; fillPos[i * 6 + 4] = -2; fillPos[i * 6 + 5] = 0;
      }
      edgeGeo.attributes.position.needsUpdate = true;
      fillGeo.attributes.position.needsUpdate = true;
      edgeMat.color.copy(cyan).lerp(white, f.pulse * 0.5);
      starMat.opacity = 0.5 + f.high * 0.5;

      camera.position.x = Math.sin(t * 0.25) * 4;
      camera.position.y = 6 + Math.sin(t * 0.5) * 0.8 - f.pulse * 0.6;
      camera.lookAt(camera.position.x * 0.3, 9, -100);
    },
  };
}
