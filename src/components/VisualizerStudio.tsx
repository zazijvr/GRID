import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Maximize, Minimize, ChevronLeft, ChevronRight, Shuffle, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { getAudioGraph } from '../audio/audioGraph';
import { AudioAnalyzer } from '../visualizer/audioFeatures';
import { VisualizerEngine, type Effect } from '../visualizer/engine';
import { createRing } from '../visualizer/effects/ring';
import { createWave } from '../visualizer/effects/wave';
import { createEqualizer } from '../visualizer/effects/equalizer';
import { createHex } from '../visualizer/effects/hex';
import { createLasers } from '../visualizer/effects/lasers';
import { createGalaxy } from '../visualizer/effects/galaxy';

interface VisualizerStudioProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  trackName: string | null;
  currentTime: number;
  duration: number;
  onClose: () => void;
  /** Počítač: panel vlevo od přehrávače (jinak překryv přes celé okno – telefon) */
  docked?: boolean;
  /** Skutečná celá obrazovka okna (Tauri) – řídí ji App; bez ní celá obrazovka prohlížeče */
  fullscreen?: boolean;
  onFullscreen?: (on: boolean) => void;
  /** Na které straně je přehrávač (okraj panelu) */
  side?: 'left' | 'right';
  /** Ovládání přehrávání (na celé obrazovce) */
  volume: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (v: number | ((prev: number) => number)) => void;
  /** Přesun okna za prázdné místo horní lišty */
  onDragStart?: () => void;
}

const EFFECTS: Array<() => Effect> = [createRing, createWave, createEqualizer, createHex, createLasers, createGalaxy];
const EFFECT_NAMES = ['Neon Ring', 'Neon Wave', 'Neon Equalizer', 'Neon Hex', 'Neon Lasers', 'Neon Galaxy'];
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

export function VisualizerStudio({ audioRef, isPlaying, trackName, currentTime, duration, onClose, docked = false, onDragStart, side = 'left', fullscreen = false, onFullscreen, volume, onTogglePlay, onNext, onPrev, onSeek, onVolume }: VisualizerStudioProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VisualizerEngine | null>(null);
  const [initial] = useState(readSettings);
  const [effectIndex, setEffectIndex] = useState(initial.effect);
  const [autoCycle, setAutoCycle] = useState(initial.auto);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const isFullscreen = onFullscreen ? fullscreen : browserFullscreen;
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
      const graph = getAudioGraph(audioRef.current);
      analyzer.update(graph?.analyser ?? null, playingRef.current, dt, graph?.bassAnalyser);
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
    const onChange = () => setBrowserFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    // Aplikace: celé okno přes celý monitor (Tauri); prohlížeč: Fullscreen API
    if (onFullscreen) {
      onFullscreen(!fullscreen);
      return;
    }
    const p = document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen();
    p?.catch((e) => console.warn('Celá obrazovka není k dispozici', e));
  }, [onFullscreen, fullscreen]);

  // ── Klávesy: ←/→ efekt, F celá obrazovka, A střídání, Esc zavřít ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'a' || e.key === 'A') setAutoCycle((a) => !a);
      else if (e.key === ' ') onTogglePlay();
      else if (e.key === 'Escape') {
        if (onFullscreen && fullscreen) onFullscreen(false); // Esc nejdřív ukončí celou obrazovku
        else if (!document.fullscreenElement) onClose();
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, toggleFullscreen, onClose, onTogglePlay, onFullscreen, fullscreen]);

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
  // Ovládání přehrávání: na celé obrazovce a na telefonu (v panelu je přehrávač hned vedle)
  const showControls = isFullscreen || !docked;
  const [scrub, setScrub] = useState<number | null>(null);
  const lastVolume = useRef(volume || 1);
  if (volume > 0) lastVolume.current = volume;
  const ctrlBtn = 'p-2 text-slate-300 hover:text-cyan-300 hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.8)] transition-all';

  const btn = 'p-3 bg-slate-900/70 rounded-full border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.5)] transition-all';

  return (
    <div
      ref={containerRef}
      className={`${docked || isFullscreen ? `relative w-full h-full ${side === 'right' ? 'border-l' : 'border-r'} border-cyan-500/30` : 'absolute inset-0 z-50'} flex items-center justify-center bg-black overflow-hidden ${!isFullscreen && !docked ? 'rounded-3xl border-2 border-cyan-500/20 shadow-[0_0_50px_rgba(0,243,255,0.15)] m-4' : ''} ${hideUi ? 'cursor-none' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full absolute inset-0 z-0 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      />

      {error && <div className="relative z-10 px-6 text-center text-slate-300">{error}</div>}

      {/* Název efektu po přepnutí – malý štítek nahoře, aby nezakrýval efekt */}
      <div
        className={`absolute top-5 md:top-7 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-700 ${showName ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      >
        <div className="px-3 py-1.5 rounded-full bg-black/55 border border-cyan-400/30 text-[11px] font-bold tracking-[0.25em] uppercase text-cyan-200 whitespace-nowrap shadow-[0_0_12px_rgba(0,243,255,0.25)]">
          {EFFECT_NAMES[effectIndex]} <span className="text-cyan-400/60 font-normal">{effectIndex + 1}/{EFFECTS.length}</span>
        </div>
      </div>

      {/* Horní lišta */}
      <div
        className={`absolute top-0 inset-x-0 z-20 p-4 md:p-6 flex justify-between items-start transition-opacity duration-500 ${hideUi ? 'opacity-0' : 'opacity-100'} ${docked && !isFullscreen ? 'cursor-move' : ''}`}
        onPointerDown={(e) => {
          // Prázdné místo lišty = přesun okna (jako titulek přehrávače)
          if (docked && !isFullscreen && e.button === 0 && e.target === e.currentTarget) onDragStart?.();
        }}
      >
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

      {/* Skladba dole; na celé obrazovce (a na telefonu) i ovládání přehrávání */}
      {trackName && (
        <div className={`absolute bottom-0 inset-x-0 z-20 px-6 pb-5 pt-16 bg-gradient-to-t from-black/75 to-transparent transition-opacity duration-500 ${hideUi ? 'opacity-0' : 'opacity-100'} ${showControls ? '' : 'pointer-events-none'}`}>
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
            <div
              className={`mt-2 relative ${showControls ? 'py-2 -my-2 cursor-pointer group' : ''}`}
              onPointerDown={showControls ? (e) => {
                if (duration <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const at = (x: number) => Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * duration;
                const el = e.currentTarget;
                el.setPointerCapture(e.pointerId);
                setScrub(at(e.clientX));
                const move = (me: PointerEvent) => setScrub(at(me.clientX));
                const up = (ue: PointerEvent) => {
                  el.removeEventListener('pointermove', move);
                  el.removeEventListener('pointerup', up);
                  onSeek(at(ue.clientX));
                  setScrub(null);
                };
                el.addEventListener('pointermove', move);
                el.addEventListener('pointerup', up);
              } : undefined}
            >
              <div className={`rounded-full bg-white/10 overflow-hidden transition-all ${showControls ? 'h-1.5 group-hover:h-2.5' : 'h-1'}`}>
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-pink-500 shadow-[0_0_10px_rgba(248,0,255,0.8)]"
                  style={{ width: `${duration > 0 ? Math.min(100, ((scrub ?? currentTime) / duration) * 100) : 0}%` }}
                />
              </div>
            </div>

            {showControls && (
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="w-40 hidden sm:block" />
                <div className="flex items-center gap-5">
                  <button onClick={onPrev} title="Předchozí" className={ctrlBtn}><SkipBack size={22} fill="currentColor" /></button>
                  <button
                    onClick={onTogglePlay}
                    title="Přehrát / pauza (mezerník)"
                    className="w-14 h-14 rounded-full border-2 border-cyan-400/60 bg-black/50 text-cyan-300 flex items-center justify-center hover:border-cyan-300 hover:shadow-[0_0_20px_rgba(0,243,255,0.6)] transition-all"
                  >
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                  </button>
                  <button onClick={onNext} title="Další" className={ctrlBtn}><SkipForward size={22} fill="currentColor" /></button>
                </div>
                <div className="w-40 flex items-center gap-2" onWheel={(e) => onVolume((v) => v + (e.deltaY < 0 ? 0.05 : -0.05))}>
                  <button onClick={() => onVolume((v) => (v > 0 ? 0 : lastVolume.current))} title="Ztlumit" className="text-slate-300 hover:text-cyan-300 transition-colors">
                    {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input
                    type="range" min={0} max={1} step={0.01} value={volume}
                    onChange={(e) => onVolume(Number(e.target.value))}
                    aria-label="Hlasitost"
                    className="flex-1 accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
