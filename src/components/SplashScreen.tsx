import { useEffect, useRef, useState } from 'react';
import { CYAN } from '../mascot/gridMascot';
import { DancingMascot } from '../mascot/DancingMascot';

const BPM = 120;
const BEAT = 60 / BPM;
const SHOW_MS = 2800;
const FADE_MS = 500;
const BARS = 72;

/** Barva mezi neonem #01daf6 (t = 0) a růžovou #e425a5 (t = 1) jako „r, g, b“ */
const brandMix = (t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return [[1, 228], [218, 37], [246, 165]].map(([a, b]) => Math.round(a + (b - a) * k)).join(', ');
};

/**
 * Úvodní animace: VR panáček se sluchátky pokyvuje hlavou do rytmu, kolem něj neonové kruhové
 * spektrum (jako Neon Ring), které na každou dobu pulzne a vystřelí jiskry. Klepnutím se přeskočí.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finish = () => setLeaving(true);

  useEffect(() => {
    const t1 = setTimeout(finish, reduced ? 1200 : SHOW_MS);
    return () => clearTimeout(t1);
  }, [reduced]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => doneRef.current(), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  // Kruhové spektrum + jiskry (2D canvas – lehké, běží i na slabém telefonu)
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const levels = new Float32Array(BARS);
    const seeds = Array.from({ length: BARS }, () => Math.random() * Math.PI * 2);
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; hue: number };
    const sparks: Spark[] = [];
    let raf = 0;
    let lastBeat = -1;
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 10 || h < 10) return; // plátno ještě nemá velikost (první snímek)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = (now - start) / 1000;
      const beatIndex = Math.floor(t / BEAT);
      const phase = (t % BEAT) / BEAT;
      const kick = Math.exp(-phase * 5); // 1 na dobu, pak dozní
      const intro = Math.min(1, t / 0.6); // náběh

      const cx = w / 2, cy = h * 0.42;
      const R = Math.min(w, h) * 0.26 * (1 + kick * 0.05);

      // Spektrum: basy nahoře, zrcadlově; „hudba“ = doba + vlnění
      for (let i = 0; i < BARS; i++) {
        const k = i < BARS / 2 ? i : BARS - 1 - i;
        const low = 1 - k / (BARS / 2);
        const target = intro * (0.15 + low * kick * 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * 6 + seeds[i])) * (0.4 + 0.6 * (1 - low)));
        levels[i] += (target - levels[i]) * 0.35;
      }
      ctx.lineCap = 'round';
      ctx.shadowBlur = 14;
      for (let i = 0; i < BARS; i++) {
        const k = i < BARS / 2 ? i : BARS - 1 - i;
        const a = -Math.PI / 2 + ((i + 0.5) / BARS) * Math.PI * 2;
        const len = 6 + levels[i] * Math.min(w, h) * 0.16;
        // přechod neon → růžová (firemní barvy, bez fialové uprostřed)
        const c = brandMix(k / (BARS / 2));
        ctx.strokeStyle = `rgba(${c}, 0.9)`;
        ctx.shadowColor = `rgb(${c})`;
        ctx.lineWidth = Math.max(2, (Math.PI * 2 * R) / BARS * 0.45);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
        ctx.stroke();
      }
      // Svítící kruh
      ctx.shadowColor = CYAN;
      ctx.strokeStyle = `rgba(1,218,246, ${0.5 + kick * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, R - 4), 0, Math.PI * 2);
      ctx.stroke();

      // Jiskry na každou dobu
      if (beatIndex !== lastBeat && t > 0.3) {
        lastBeat = beatIndex;
        for (let n = 0; n < 40; n++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 80 + Math.random() * 160;
          sparks.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: Math.random() });
        }
      }
      ctx.shadowBlur = 8;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= 1 / 50;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        s.x += s.vx / 60; s.y += s.vy / 60; s.vx *= 0.96; s.vy *= 0.96;
        ctx.fillStyle = `rgba(${brandMix(s.hue)}, ${s.life})`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div
      onClick={finish}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% 42%, #152e50 0%, #0b1733 45%, #061026 100%)',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes grid-pop { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
        @keyframes grid-logo-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes grid-title { from { opacity: 0; letter-spacing: .8em; } to { opacity: 1; letter-spacing: .45em; } }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Panáček se sluchátky – hlava kývá do rytmu */}
      {/* Vnější vrstva centruje, vnitřní animuje (animace transformace by centrování přepsala) */}
      <div className="absolute" style={{ width: 'min(34vmin, 210px)', top: '42%', left: '50%', transform: 'translate(-50%, -52%)' }}>
      <div style={{ animation: 'grid-pop .6s cubic-bezier(.2,.8,.2,1.2) both' }}>
        <DancingMascot className="block w-full h-auto" beat={BEAT} headOnly />
      </div>
      </div>

      <div
        className="absolute left-0 right-0 text-center font-black text-3xl text-white"
        style={{ top: 'calc(42% + 43vmin)', animation: 'grid-title .9s ease-out .4s both', textShadow: '0 0 12px rgba(1,218,246,.9), 0 0 28px rgba(228,37,165,.5)' }}
      >
        GRID
      </div>
      {/* Oficiální logo ZažijVR pod názvem */}
      <div
        className="absolute left-0 right-0 flex justify-center"
        style={{ top: 'calc(42% + 43vmin + 46px)', animation: 'grid-logo-in .9s ease-out .7s both' }}
      >
        <img src="/logo.png" alt="Zažij VR" className="h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(1,218,246,0.55)]" draggable={false} />
      </div>
    </div>
  );
}
