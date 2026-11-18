import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { AudioFeatures } from '../audioFeatures';

// Společné prvky neonových efektů: logo ZažijVR, jiskry na beat, silné neonové čáry.

/** Logo uprostřed: tmavý kruh pod ním (kontrast) a mírně ztlumené, aby svítilo, ale šlo přečíst */
export function createLogo(scene: THREE.Scene, width = 18, y = 0) {
  const backing = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.62, 64),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.02, 0.85 * (1.0 - smoothstep(0.55, 1.0, d))); }',
    }),
  );
  backing.position.set(0, y, -0.2);
  scene.add(backing);

  const tex = new THREE.TextureLoader().load('/logo.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  // Barva < 1 logo ztlumí – v záři pak nesplyne v jednu svítící skvrnu
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, color: new THREE.Color(0.62, 0.62, 0.62), depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, y, 0);
  scene.add(sprite);

  return {
    sprite,
    update(f: AudioFeatures) {
      const img = tex.image as HTMLImageElement | undefined;
      const aspect = img?.width ? img.height / img.width : 1 / 3;
      const s = 1 + f.bass * 0.06 + f.pulse * 0.05;
      sprite.scale.set(width * s, width * aspect * s, 1);
      backing.scale.setScalar(s);
      const b = 0.6 + f.pulse * 0.12; // na beat jen lehce zjasní
      mat.color.setRGB(b, b, b);
    },
  };
}

/** Jiskry (aditivní body) – burst() je vystřelí z daných pozic */
export function createSparks(scene: THREE.Scene, count = 1200, size = 0.45) {
  const pos = new Float32Array(count * 3).fill(1000);
  const vel = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const life = new Float32Array(count);
  let next = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  const c = new THREE.Color();

  return {
    /** Jedna jiskra z bodu (x, y, z) s rychlostí (vx, vy, vz) a odstínem hue 0–1 */
    emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, hue: number) {
      const i = next;
      next = (next + 1) % count;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      life[i] = 1;
      c.setHSL(hue, 1, 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    },
    update(dt: number, gravity = 0) {
      const drag = Math.max(0, 1 - dt * 1.5);
      const dim = Math.pow(0.4, dt); // aditivní míchání: tmavší barva = průhlednější
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * 0.9;
        vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - gravity * dt; vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        col[i * 3] *= dim; col[i * 3 + 1] *= dim; col[i * 3 + 2] *= dim;
        if (life[i] <= 0) pos[i * 3 + 2] = 1000; // mimo záběr
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

/**
 * Silná neonová čára (Line2 – běžné WebGL čáry mají vždy 1 px) s n body.
 * set(i, x, y, z) mění body na místě, commit() je pošle do GPU – bez nových bufferů v každém snímku.
 */
export function createNeonLine(points: number, color: number, widthPx: number, closed = false, opacity = 1) {
  const n = closed ? points + 1 : points;
  const geo = new LineGeometry();
  geo.setPositions(new Float32Array(n * 3));
  const mat = new LineMaterial({ color, linewidth: widthPx, transparent: opacity < 1, opacity, worldUnits: false });
  const line = new Line2(geo, mat);
  line.frustumCulled = false;
  const buf = (geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
  const arr = buf.array as Float32Array; // úsečky: [start xyz, end xyz] za sebou
  const xyz = new Float32Array(n * 3);

  return {
    line,
    material: mat,
    set(i: number, x: number, y: number, z = 0) {
      xyz[i * 3] = x; xyz[i * 3 + 1] = y; xyz[i * 3 + 2] = z;
    },
    commit() {
      if (closed) { xyz[points * 3] = xyz[0]; xyz[points * 3 + 1] = xyz[1]; xyz[points * 3 + 2] = xyz[2]; }
      for (let s = 0; s < n - 1; s++) {
        arr[s * 6] = xyz[s * 3]; arr[s * 6 + 1] = xyz[s * 3 + 1]; arr[s * 6 + 2] = xyz[s * 3 + 2];
        arr[s * 6 + 3] = xyz[s * 3 + 3]; arr[s * 6 + 4] = xyz[s * 3 + 4]; arr[s * 6 + 5] = xyz[s * 3 + 5];
      }
      buf.needsUpdate = true;
    },
    resize(w: number, h: number) {
      mat.resolution.set(w, h);
    },
  };
}
