import React, { useEffect, useRef } from 'react';

interface SpectrumVisualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
}

export function SpectrumVisualizer({ audioRef, isPlaying }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const reqRef = useRef<number>(0);

  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    // Vytvoříme AudioContext + graf jen jednou (přežije HMR / StrictMode re-mount díky hacku na DOM el.)
    // @ts-expect-error
    if (!audio.__audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'playback' });

      const source = ctx.createMediaElementSource(audio);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.85;

      // Silencer – výchozí destination pro analyser; Equalizer mezi ně vloží filtry
      const silencer = ctx.createGain();
      silencer.gain.value = 1; // plný průchod do destination = slyšíme zvuk
      
      // Graf: source → analyser → silencer → destination
      source.connect(analyser);
      analyser.connect(silencer);
      silencer.connect(ctx.destination);

      // @ts-expect-error
      audio.__audioCtx = ctx;
      // @ts-expect-error
      audio.__analyser = analyser;
      // @ts-expect-error
      audio.__silencer = silencer;
      // @ts-expect-error
      audio.__source = source;
    }

    // @ts-expect-error
    analyserRef.current = audio.__analyser;
    if (analyserRef.current) {
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
    }
  }, [audioRef]);

  useEffect(() => {
    if (isPlaying) {
      // Prohlížeče pozastavují AudioContext do první uživatelské interakce
      // @ts-expect-error
      if (audioRef.current?.__audioCtx?.state === 'suspended') {
        // @ts-expect-error
        audioRef.current.__audioCtx.resume();
      }
      renderLoop();
    } else {
      cancelAnimationFrame(reqRef.current);
    }
    return () => cancelAnimationFrame(reqRef.current);
  }, [isPlaying]);

  const renderLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current || !dataArrayRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    reqRef.current = requestAnimationFrame(renderLoop);
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    ctx.clearRect(0, 0, width, height);

    const barCount = Math.floor(dataArrayRef.current.length * 0.75);
    const padding = 2;
    const barWidth = Math.max((width / barCount) - padding, 2);

    const totalBarsWidth = (barWidth + padding) * barCount;
    let x = (width - totalBarsWidth) / 2;

    for (let i = 0; i < barCount; i++) {
      const rawValue = dataArrayRef.current[i];
      const percent = Math.min(rawValue / 220, 1) ** 1.3;
      const barHeight = Math.max(percent * height, 2);

      const hue = 180 + (percent * 120);

      ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.6)`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsla(${hue}, 100%, 60%, 1)`;

      ctx.fillRect(x, height - barHeight, barWidth, barHeight);

      x += barWidth + padding;
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute bottom-0 left-0 w-full h-[65%] pointer-events-none opacity-60 z-0 transition-opacity duration-700 delay-[5ms]"
      style={{ opacity: isPlaying ? 0.45 : 0 }}
    />
  );
}
