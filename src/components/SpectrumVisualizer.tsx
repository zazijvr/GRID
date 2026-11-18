import React, { useEffect, useRef } from 'react';
import { getAudioGraph } from '../audio/audioGraph';

interface SpectrumVisualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
}

const BAR_COUNT = 48;
const MIN_HZ = 30;
const MAX_HZ = 16000;

/** Spektrum za názvem skladby. Graf zvuku tvoří přehrávač (audioGraph.ts) – tady se jen čte. */
export function SpectrumVisualizer({ audioRef, isPlaying }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isPlaying) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    let edges: number[] = [];

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const analyser = getAudioGraph(audioRef.current)?.analyser;
      if (!analyser) return;

      if (!data || data.length !== analyser.frequencyBinCount) {
        data = new Uint8Array(analyser.frequencyBinCount);
        // Hranice sloupců v pásmech analyseru – logaritmicky (basy dostanou víc místa, jako je slyšíme)
        const binHz = analyser.context.sampleRate / analyser.fftSize;
        edges = Array.from({ length: BAR_COUNT + 1 }, (_, i) =>
          Math.min(data!.length - 1, Math.max(1, Math.round((MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BAR_COUNT)) / binHz))),
        );
      }
      analyser.getByteFrequencyData(data);

      // Velikost plátna jen při změně (přiřazení width/height plátno pokaždé vymaže a přealokuje)
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      const gap = 2;
      const barW = Math.max(w / BAR_COUNT - gap, 2);
      let x = (w - (barW + gap) * BAR_COUNT) / 2;
      ctx.shadowBlur = 15;
      for (let i = 0; i < BAR_COUNT; i++) {
        let peak = 0;
        for (let b = edges[i]; b <= Math.max(edges[i], edges[i + 1] - 1); b++) peak = Math.max(peak, data[b]);
        const percent = Math.min(peak / 220, 1) ** 1.3;
        const hue = 180 + percent * 120;
        ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.6)`;
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, 1)`;
        const barH = Math.max(percent * h, 2);
        ctx.fillRect(x, h - barH, barW, barH);
        x += barW + gap;
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, audioRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute bottom-0 left-0 w-full h-[65%] pointer-events-none z-0 transition-opacity duration-700"
      style={{ opacity: isPlaying ? 0.45 : 0 }}
    />
  );
}
