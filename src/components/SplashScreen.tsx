import { useEffect, useRef, useState } from 'react';
import { BODY_PATHS, CORE, CYAN, HEAD_PATHS, HEAD_PIVOT, HEADPHONE_ACCENT_PATHS, HEADPHONE_PATHS, PINK } from '../mascot/gridMascot';

const BPM = 120;
const BEAT = 60 / BPM;
const SHOW_MS = 2800;
const FADE_MS = 500;
const BARS = 72;

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
        const hue = 185 + (k / (BARS / 2)) * 140;
        ctx.strokeStyle = `hsla(${hue}, 100%, 62%, 0.9)`;
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, 1)`;
        ctx.lineWidth = Math.max(2, (Math.PI * 2 * R) / BARS * 0.45);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
        ctx.stroke();
      }
      // Svítící kruh
      ctx.shadowColor = CYAN;
      ctx.strokeStyle = `rgba(0, 243, 255, ${0.5 + kick * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 4, 0, Math.PI * 2);
      ctx.stroke();

      // Jiskry na každou dobu
      if (beatIndex !== lastBeat && t > 0.3) {
        lastBeat = beatIndex;
        for (let n = 0; n < 40; n++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 80 + Math.random() * 160;
          sparks.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: 185 + Math.random() * 140 });
        }
      }
      ctx.shadowBlur = 8;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= 1 / 50;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        s.x += s.vx / 60; s.y += s.vy / 60; s.vx *= 0.96; s.vy *= 0.96;
        ctx.fillStyle = `hsla(${s.hue}, 100%, 65%, ${s.life})`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const lines = (paths: string[], color: string, width: number, opacity = 1) =>
    paths.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />);

  return (
    <div
      onClick={finish}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% 42%, #10224a 0%, #060d22 60%, #03060f 100%)',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes grid-head-bob {
          0%   { transform: rotate(-7deg) translateY(0); }
          18%  { transform: rotate(5deg) translateY(4px); }
          50%  { transform: rotate(7deg) translateY(0); }
          68%  { transform: rotate(-5deg) translateY(4px); }
          100% { transform: rotate(-7deg) translateY(0); }
        }
        @keyframes grid-body-bounce {
          0%, 50%, 100% { transform: translateY(0); }
          18%, 68%      { transform: translateY(3px); }
        }
        @keyframes grid-pop { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
        @keyframes grid-title { from { opacity: 0; letter-spacing: .8em; } to { opacity: 1; letter-spacing: .45em; } }
        .grid-head { transform-box: view-box; transform-origin: ${HEAD_PIVOT.x}px ${HEAD_PIVOT.y}px; animation: grid-head-bob ${BEAT * 2}s ease-in-out infinite; }
        .grid-body { animation: grid-body-bounce ${BEAT * 2}s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .grid-head, .grid-body { animation: none; } }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Panáček se sluchátky – hlava kývá do rytmu */}
      {/* Vnější vrstva centruje, vnitřní animuje (animace transformace by centrování přepsala) */}
      <div className="absolute" style={{ width: 'min(34vmin, 210px)', top: '42%', left: '50%', transform: 'translate(-50%, -52%)' }}>
      <svg
        viewBox="0 0 256 256"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block w-full h-auto"
        style={{
          filter: `drop-shadow(0 0 6px ${CYAN}) drop-shadow(0 0 14px rgba(0,243,255,.45))`,
          animation: 'grid-pop .6s cubic-bezier(.2,.8,.2,1.2) both',
        }}
      >
        <g className="grid-body">
          {lines(BODY_PATHS, CYAN, 5.5)}
          {lines(BODY_PATHS, CORE, 1.65, 0.75)}
        </g>
        <g className="grid-head">
          {lines(HEAD_PATHS, CYAN, 5.5)}
          {lines(HEAD_PATHS, CORE, 1.65, 0.75)}
          {lines(HEADPHONE_PATHS, CYAN, 6.5)}
          {lines(HEADPHONE_PATHS, CORE, 1.9, 0.75)}
          {lines(HEADPHONE_ACCENT_PATHS, PINK, 9)}
        </g>
      </svg>
      </div>

      <div
        className="absolute left-0 right-0 text-center font-black text-3xl text-white"
        style={{ top: 'calc(42% + 43vmin)', animation: 'grid-title .9s ease-out .4s both', textShadow: '0 0 12px rgba(0,243,255,.9), 0 0 28px rgba(248,0,255,.5)' }}
      >
        GRID
      </div>
      <div
        className="absolute left-0 right-0 text-center text-[10px] tracking-[0.5em] uppercase text-cyan-300/70"
        style={{ top: 'calc(42% + 43vmin + 44px)', animation: 'grid-title .9s ease-out .7s both' }}
      >
        Zažij VR
      </div>
    </div>
  );
}
