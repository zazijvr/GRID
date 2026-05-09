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
      const ctx = new Ctx({ latencyHint: 'playback' });
      const analyser = ctx.createAnalyser();
      
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.85; 
      
      // === LINUX WEBKITGTK FIX (PARALLEL AUDIO HACK) ===
      // WebKitGTK má obrovský bug: pokud použijeme createMediaElementSource na hlavní audio tag,
      // buď to úplně rozbije routování do Bluetooth, nebo to vytvoří 2 streamy (doubled audio) a hraje to hrozně.
      // ŘEŠENÍ: Hlavní <audio> tag necháme úplně napokoji (bude hrát čistě a nativně).
      // Vytvoříme si tajný "klon", který bude hrát paralelně, a ten odkloníme do vizualizéru!
      const cloneAudio = new Audio();
      cloneAudio.crossOrigin = "anonymous";
      cloneAudio.muted = true;
      cloneAudio.volume = 0;
      
      audio.addEventListener('play', () => {
        if (cloneAudio.src !== audio.src) cloneAudio.src = audio.src;
        cloneAudio.currentTime = audio.currentTime;
        cloneAudio.play().catch(e => console.error("Clone play error", e));
      });
      audio.addEventListener('pause', () => cloneAudio.pause());
      audio.addEventListener('seeking', () => { cloneAudio.currentTime = audio.currentTime; });
      audio.addEventListener('timeupdate', () => {
        // Občasná synchronizace, pokud by se klon rozešel o víc jak 0.2s
        if (!cloneAudio.paused && Math.abs(cloneAudio.currentTime - audio.currentTime) > 0.2) {
          cloneAudio.currentTime = audio.currentTime;
        }
      });

      const source = ctx.createMediaElementSource(cloneAudio);
      source.connect(analyser);
      
      // Nutné propojení do destination, jinak WebKitGTK neztlumí původní HTML výstup klonu
      // a klon hraje nahlas (což způsobilo to "doubled" echo a "hraje to blbě").
      // Ztlumíme to přes GainNode na nulu, takže AudioContext ven posílá absolutní ticho,
      // ale analyzér svoje data dostane. Zvuk hraje čistě a jen jednou z originálního <audio>.
      const silencer = ctx.createGain();
      silencer.gain.value = 0;
      analyser.connect(silencer);
      silencer.connect(ctx.destination);

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
      // Odstraněn suspend() hack: WebKitGTK má známý bug, kdy volání suspend()
      // a následné resume() na Linuxu "zmrazí" PulseAudio buffer a do Bluetooth repráků
      // posílá jen ticho, i když je stream v pavucontrol vidět jako "active".
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
