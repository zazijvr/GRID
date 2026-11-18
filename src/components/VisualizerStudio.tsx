import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Maximize, Minimize, ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { getAudioGraph } from '../audio/audioGraph';
import { AudioAnalyzer } from '../visualizer/audioFeatures';
import { VisualizerEngine, type Effect } from '../visualizer/engine';
import { createPortal } from '../visualizer/effects/portal';
import { createRing } from '../visualizer/effects/ring';
import { createSynthwave } from '../visualizer/effects/synthwave';
import { createSphere } from '../visualizer/effects/sphere';
import { createMountains } from '../visualizer/effects/mountains';

interface VisualizerStudioProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  trackName: string | null;
  currentTime: number;
  duration: number;
  onClose: () => void;
}

const EFFECTS: Array<() => Effect> = [createPortal, createRing, createSynthwave, createSphere, createMountains];
const EFFECT_NAMES = ['Hyperspace Portal', 'Neon Ring', 'Synthwave', 'Cyber Sphere', 'Audio Mountains'];
const AUTO_CYCLE_S = 40;
const SETTINGS_KEY = 'zvr-grid-visualizer';

const readSettings = (): { effect: number; auto: boolean } => {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const effect = Number.isInteger(s.effect) && s.effect >= 0 && s.effect < EFFECTS.length ? s.effect : 0;
    return { effect, auto: s.auto === true };
  } catch {
    return { effect: 0, auto: false };
  }
};

const formatTime = (s: number) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export function VisualizerStudio({ audioRef, isPlaying, trackName, currentTime, duration, onClose }: VisualizerStudioProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VisualizerEngine | null>(null);
  const [initial] = useState(readSettings);
  const [effectIndex, setEffectIndex] = useState(initial.effect);
  const [autoCycle, setAutoCycle] = useState(initial.auto);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const [showName, setShowName] = useState(true);
  const [idle, setIdle] = useState(false);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  // ── Renderer + smyčka (jednou za otevření studia) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: VisualizerEngine;
    try {
      engine = new VisualizerEngine(canvas);
    } catch (e) {
      console.warn('WebGL není k dispozici', e);
      setError('Vizualizace potřebuje WebGL, které tady není k dispozici.');
      return;
    }
    engineRef.current = engine;
    const analyzer = new AudioAnalyzer();
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); // po skrytí okna žádný skok
      last = now;
      analyzer.update(getAudioGraph(audioRef.current)?.analyser ?? null, playingRef.current, dt);
      engine.render(analyzer.features, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      engine.dispose();
      engineRef.current = null;
    };
  }, [audioRef]);

  // ── Přepnutí efektu: krátké ztmavení, nová scéna, název efektu ──
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setFading(true);
    const t = setTimeout(() => {
      try {
        engine.setEffect(EFFECTS[effectIndex]());
      } catch (e) {
        console.warn('Efekt se nepodařilo vytvořit', e);
      }
      setFading(false);
    }, 180);
    setShowName(true);
    const hide = setTimeout(() => setShowName(false), 2500);
    return () => { clearTimeout(t); clearTimeout(hide); };
  }, [effectIndex]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ effect: effectIndex, auto: autoCycle })); } catch { /* jen se nezapamatuje */ }
  }, [effectIndex, autoCycle]);

  const step = useCallback((dir: number) => setEffectIndex((i) => (i + dir + EFFECTS.length) % EFFECTS.length), []);

  // ── Automatické střídání ──
  useEffect(() => {
    if (!autoCycle) return;
    const id = setInterval(() => step(1), AUTO_CYCLE_S * 1000);
    return () => clearInterval(id);
  }, [autoCycle, effectIndex, step]);

  // ── Celá obrazovka ──
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    const p = document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen();
    p?.catch((e) => console.warn('Celá obrazovka není k dispozici', e));
  }, []);

  // ── Klávesy: ←/→ efekt, F celá obrazovka, A střídání, Esc zavřít ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'a' || e.key === 'A') setAutoCycle((a) => !a);
      else if (e.key === 'Escape' && !document.fullscreenElement) onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, toggleFullscreen, onClose]);

  // ── Ovládání se po 3 s bez pohybu myši schová (na celé obrazovce) ──
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 3000);
    };
    wake();
    const el = containerRef.current;
    el?.addEventListener('pointermove', wake);
    return () => { clearTimeout(t); el?.removeEventListener('pointermove', wake); };
  }, []);
  const hideUi = isFullscreen && idle;

  const btn = 'p-3 bg-slate-900/70 rounded-full border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.5)] transition-all';

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-50 flex items-center justify-center bg-black overflow-hidden ${!isFullscreen ? 'rounded-3xl border-2 border-cyan-500/20 shadow-[0_0_50px_rgba(0,243,255,0.15)] m-4' : ''} ${hideUi ? 'cursor-none' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full absolute inset-0 z-0 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      />

      {error && <div className="relative z-10 px-6 text-center text-slate-300">{error}</div>}

      {/* Název efektu po přepnutí */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none text-center transition-all duration-700 ${showName ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="text-[10px] tracking-[0.5em] text-cyan-300/70 uppercase">Mode {effectIndex + 1} / {EFFECTS.length}</div>
        <div className="mt-1 text-2xl md:text-4xl font-black tracking-[0.2em] uppercase text-white drop-shadow-[0_0_18px_rgba(0,243,255,0.9)]">
          {EFFECT_NAMES[effectIndex]}
        </div>
      </div>

      {/* Horní lišta */}
      <div className={`absolute top-0 inset-x-0 z-20 p-4 md:p-6 flex justify-between items-start transition-opacity duration-500 ${hideUi ? 'opacity-0' : 'opacity-100'}`}>
        <button onClick={onClose} title="Zavřít (Esc)" className={`${btn} hover:!text-pink-500 hover:!border-pink-500/50`}>
          <X size={24} />
        </button>
        <div className="flex gap-2 md:gap-3">
          <button onClick={() => step(-1)} title="Předchozí efekt (←)" className={btn}><ChevronLeft size={24} /></button>
          <button onClick={() => step(1)} title="Další efekt (→)" className={btn}><ChevronRight size={24} /></button>
          <button
            onClick={() => setAutoCycle((a) => !a)}
            title={`Střídat efekty každých ${AUTO_CYCLE_S} s (A)`}
            className={`${btn} ${autoCycle ? '!text-pink-400 !border-pink-500/60 shadow-[0_0_15px_rgba(248,0,255,0.45)]' : ''}`}
          >
            <Shuffle size={24} />
          </button>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Ukončit celou obrazovku (F)' : 'Celá obrazovka (F)'} className={btn}>
            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
          </button>
        </div>
      </div>

      {/* Skladba dole */}
      {trackName && (
        <div className={`absolute bottom-0 inset-x-0 z-20 px-6 pb-5 pt-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none transition-opacity duration-500 ${hideUi ? 'opacity-40' : 'opacity-100'}`}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] tracking-[0.4em] uppercase text-cyan-300/70">{isPlaying ? 'Now playing' : 'Paused'}</div>
                <div className="truncate text-lg md:text-2xl font-bold tracking-wide text-white drop-shadow-[0_0_12px_rgba(0,243,255,0.6)]">{trackName}</div>
              </div>
              <div className="shrink-0 font-mono text-xs text-slate-300/80 tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-pink-500 shadow-[0_0_10px_rgba(248,0,255,0.8)]"
                style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
