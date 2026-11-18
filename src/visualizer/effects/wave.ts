import * as THREE from 'three';
import type { Effect } from '../engine';
import { SPECTRUM_BANDS, WAVE_POINTS } from '../audioFeatures';
import { createLogo, createNeonLine, createSparks, levelOf } from './common';

/**
 * Neon Wave – kruhový osciloskop kolem loga: skutečný průběh vlny (azurová), jeho zpožděná
 * „ozvěna“ (růžová) a spektrum jako obrys (fialová). Na beat se od středu rozběhnou vlny.
 */
export function createWave(): Effect {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03020d);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 0, 62);

  const root = new THREE.Group();
  scene.add(root);

  const POINTS = 192;
  const R = 17;
  const wave = createNeonLine(POINTS, 0x00f3ff, 3, true);
  const echo = createNeonLine(POINTS, 0xff2bd6, 2, true, 0.8);
  const spec = createNeonLine(POINTS, 0x9d5cff, 2, true, 0.75);
  root.add(wave.line, echo.line, spec.line);
  const lines = [wave, echo, spec];

  // Rozbíhající se vlny na beat (pool kruhů)
  const RIPPLES = 6;
  const ripples = Array.from({ length: RIPPLES }, () => {
    const l = createNeonLine(96, 0x00f3ff, 2, true, 0);
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      l.set(i, Math.cos(a), Math.sin(a));
    }
    l.commit();
    scene.add(l.line);
    return { l, age: 99 };
  });
  let nextRipple = 0;

  const logo = createLogo(scene, 16);
  const sparks = createSparks(scene, 800, 0.4);
  const echoBuf = new Float32Array(WAVE_POINTS);
  const cyan = new THREE.Color(0x00f3ff);
  const pink = new THREE.Color(0xff2bd6);
  const white = new THREE.Color(0xffffff);

  // Uzavřená smyčka bez skoku: vlna se zrcadlí (0→1→0), takže začátek a konec navazují
  const waveAt = (src: Float32Array, i: number) => {
    const half = POINTS / 2;
    const k = i < half ? i / half : (POINTS - i) / half;
    return src[Math.min(WAVE_POINTS - 1, Math.floor(k * (WAVE_POINTS - 1)))];
  };

  return {
    name: 'Neon Wave',
    scene, camera,
    bloom: { strength: 0.85, radius: 0.35, threshold: 0.2 },
    bloomStrength: (f) => 0.75 + f.pulse * 0.4,
    resize: (w, h) => {
      lines.forEach((l) => l.resize(w, h));
      ripples.forEach((r) => r.l.resize(w, h));
    },
    update(f, dt, t) {
      // Ozvěna = pomaleji vyhlazená vlna
      for (let i = 0; i < WAVE_POINTS; i++) echoBuf[i] += (f.waveform[i] - echoBuf[i]) * Math.min(1, dt * 6);

      const base = R * (1 + f.bassN * 0.2 + f.pulse * 0.12);
      const amp = 3 + f.energyN * 8;
      const inward = 6; // dovnitř nejvýš o tolik – vlna nesmí zasahovat do loga
      for (let i = 0; i < POINTS; i++) {
        const a = (i / POINTS) * Math.PI * 2 + Math.PI / 2;
        const c = Math.cos(a), s = Math.sin(a);
        const rw = base + Math.max(-inward, waveAt(f.waveform, i) * amp);
        wave.set(i, c * rw, s * rw);
        const re = base + 2.5 + Math.max(-inward, waveAt(echoBuf, i) * amp * 1.3);
        echo.set(i, c * re, s * re);
        // Spektrum zrcadlově (basy nahoře)
        const half = POINTS / 2;
        const band = Math.min(SPECTRUM_BANDS - 1, Math.floor((i < half ? i / half : (POINTS - i) / half) * (SPECTRUM_BANDS - 1)));
        const rs = base + 5 + levelOf(f, band) * 13;
        spec.set(i, c * rs, s * rs);
      }
      lines.forEach((l) => l.commit());
      wave.material.color.copy(cyan).lerp(pink, f.highN * 0.6).lerp(white, f.pulse * 0.5);
      wave.material.linewidth = 2.5 + f.bassN * 3 + f.pulse * 2;
      echo.material.linewidth = 2 + f.midN * 2;
      spec.material.color.setHSL(0.75 - f.highN * 0.15, 1, 0.55 + f.pulse * 0.2);
      root.rotation.z += (0.04 + f.midN * 0.5) * dt;

      if (f.beat) {
        const r = ripples[nextRipple];
        nextRipple = (nextRipple + 1) % RIPPLES;
        r.age = 0;
        for (let k = 0; k < 40; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 15 + Math.random() * 25;
          sparks.emit(Math.cos(a) * base, Math.sin(a) * base, 0, Math.cos(a) * sp, Math.sin(a) * sp, 0, 0.5 + Math.random() * 0.4);
        }
      }
      for (const r of ripples) {
        r.age += dt;
        const k = Math.min(1, r.age / 1.6);
        const scale = base + k * 38;
        r.l.line.scale.set(scale, scale, 1);
        r.l.material.opacity = (1 - k) * 0.8;
        r.l.material.transparent = true;
        r.l.line.visible = k < 1;
      }
      sparks.update(dt);
      logo.update(f);

      camera.position.x = Math.sin(t * 0.27) * 3;
      camera.position.y = Math.cos(t * 0.21) * 2.5;
      camera.lookAt(0, 0, 0);
    },
  };
}
