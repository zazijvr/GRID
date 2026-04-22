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

    // Zajistit, že AudioContext pro tenhle element vytvoříme jen jednou,
    // jinak prohlížeč vyhodí InvalidStateError.
    // @ts-expect-error ukládáme kontext přímo na DOM element jako hack pro React StrictMode / HMR
    if (!audio.__audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      
      // 128 dává rozumný počet cca 64 proužků na grafu, 256 dává 128 proužků atd.
      analyser.fftSize = 128;
      // Zjemnění pohybu, aby to na displeji nebylo jako stroboskop (1.0 = sekne, 0.0 = epileptický)
      analyser.smoothingTimeConstant = 0.85; 
      
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      // @ts-expect-error
      audio.__audioCtx = ctx;
      // @ts-expect-error
      audio.__analyser = analyser;
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

    // Velikost canvasu nativně podle jeho CSS v kontejneru pro maximální ostrost
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    reqRef.current = requestAnimationFrame(renderLoop);
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    ctx.clearRect(0, 0, width, height);

    // Zajímají nás hlavně první dvě třetiny frekvencí (ve vyšších se u hudby moc detailní grafický pohyb neděje)
    const barCount = Math.floor(dataArrayRef.current.length * 0.75); 
    const padding = 2; // Mezery mezi sloupci
    const barWidth = Math.max((width / barCount) - padding, 2);

    // Centrujeme všechny sloupce vizuálně doprostřed, pokud zbudou pixely po krajích
    const totalBarsWidth = (barWidth + padding) * barCount;
    let x = (width - totalBarsWidth) / 2;
    
    for (let i = 0; i < barCount; i++) {
        const rawValue = dataArrayRef.current[i];
        
        // Zvýšíme dynamiku nižších hodnot a mírně uříznem výšku
        const percent = Math.min(rawValue / 220, 1) ** 1.3; 
        const barHeight = Math.max(percent * height, 2); // vždy aspoň pidi linka (2px) dole

        // Barvy - od azurové přes modrou až po cyberpunk růžovou podle síly hudby
        const hue = 180 + (percent * 120); 
        
        // Výplň polo-průhledná se svítícím vnějším stínem (neon drop shadow glow)
        ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.6)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, 1)`;
        
        // Vykreslíme samotný sloupeček odspodu
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
