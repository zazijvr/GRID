import React, { useEffect, useRef, useState } from 'react';

// 10-pásmový equalizer – frekvence v Hz
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export type EQGains = [number, number, number, number, number, number, number, number, number, number];

export type EQPreset = 'flat' | 'dance' | 'energy' | 'vocal' | 'custom';

export const EQ_PRESETS: Record<Exclude<EQPreset, 'custom'>, EQGains> = {
  flat:   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  dance:  [ 6,  7,  2,  0, -2, -1,  0,  2,  3,  3],
  energy: [ 5,  4,  1,  0, -2,  1,  3,  4,  4,  3],
  vocal:  [-2, -3, -1,  2,  5,  6,  4,  2,  1, -1],
};

type PresetMeta = {
  label: string;
  color: string;
  activeClass: string;
  badgeClass: string;
};

const PRESETS_META: Record<EQPreset, PresetMeta> = {
  flat:   { label: 'Flat',   color: '#94a3b8', activeClass: 'bg-slate-700/80 text-slate-100 border-slate-400 shadow-[0_0_12px_rgba(148,163,184,0.3)]',   badgeClass: 'text-slate-400 border-slate-500 bg-slate-800' },
  dance:  { label: 'Dance',  color: '#f472b6', activeClass: 'bg-pink-500/20 text-pink-300 border-pink-500 shadow-[0_0_15px_rgba(248,0,255,0.4)]',         badgeClass: 'text-pink-400 border-pink-500 bg-pink-500/10' },
  energy: { label: 'Energy', color: '#fb923c', activeClass: 'bg-orange-500/20 text-orange-300 border-orange-500 shadow-[0_0_15px_rgba(251,146,60,0.4)]',  badgeClass: 'text-orange-400 border-orange-500 bg-orange-500/10' },
  vocal:  { label: 'Vocal',  color: '#22d3ee', activeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-[0_0_15px_rgba(0,243,255,0.4)]',         badgeClass: 'text-cyan-400 border-cyan-500 bg-cyan-500/10' },
  custom: { label: 'Custom', color: '#c084fc', activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]', badgeClass: 'text-purple-400 border-purple-500 bg-purple-500/10' },
};

function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function gainColor(gain: number): string {
  if (gain > 5)  return '#f472b6'; // hot pink
  if (gain > 1)  return '#22d3ee'; // cyan
  if (gain >= 0) return '#475569'; // neutral slate
  if (gain > -5) return '#818cf8'; // indigo
  return '#a78bfa';                // deep purple (heavy cut)
}

interface EqualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isOpen: boolean;
  onClose: () => void;
  onPresetChange?: (preset: EQPreset) => void;
}

const MAX_GAIN = 12;

export function Equalizer({ audioRef, isOpen, onClose, onPresetChange }: EqualizerProps) {
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const [preset, setPreset]   = useState<EQPreset>('flat');
  const [gains, setGains]     = useState<EQGains>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [dragging, setDragging] = useState<number | null>(null);

  // Vytvoříme EQ filtry a zapojíme je do audio grafu
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      // @ts-expect-error
      if (audio.__audioCtx && !audio.__eqFilters) {
        // @ts-expect-error
        const ctx: AudioContext = audio.__audioCtx;
        // @ts-expect-error
        const analyser: AnalyserNode = audio.__analyser;
        // @ts-expect-error
        const silencer: GainNode = audio.__silencer;
        if (!analyser || !silencer) return;

        const filters = EQ_BANDS.map((freq, i) => {
          const f = ctx.createBiquadFilter();
          f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
          f.frequency.value = freq;
          f.Q.value = 1.4;
          f.gain.value = 0;
          return f;
        });

        // Přepojíme: analyser → filters[0..n] → silencer
        try { analyser.disconnect(silencer); } catch {}
        analyser.connect(filters[0]);
        for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
        filters[filters.length - 1].connect(silencer);

        // @ts-expect-error
        audio.__eqFilters = filters;
        filtersRef.current = filters;
        clearInterval(checkInterval);
      }
      // @ts-expect-error
      if (audio.__eqFilters) {
        // @ts-expect-error
        filtersRef.current = audio.__eqFilters;
        clearInterval(checkInterval);
      }
    }, 200);
    return () => clearInterval(checkInterval);
  }, [audioRef]);

  const applyGains = (newGains: EQGains) => {
    // @ts-expect-error
    const filters: BiquadFilterNode[] = audioRef.current?.__eqFilters ?? filtersRef.current;
    if (!filters?.length) return;
    newGains.forEach((g, i) => { if (filters[i]) filters[i].gain.value = g; });
  };

  const selectPreset = (p: EQPreset) => {
    setPreset(p);
    onPresetChange?.(p);
    if (p !== 'custom') {
      const g = [...EQ_PRESETS[p]] as EQGains;
      setGains(g);
      applyGains(g);
    }
  };

  const setGain = (index: number, value: number) => {
    const clamped = Math.max(-MAX_GAIN, Math.min(MAX_GAIN, Math.round(value * 2) / 2));
    const newGains = [...gains] as EQGains;
    newGains[index] = clamped;
    setGains(newGains);
    setPreset('custom');
    onPresetChange?.('custom');
    applyGains(newGains);
  };

  // Drag handling pro slider
  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(index);

    const rect = e.currentTarget.getBoundingClientRect();
    const compute = (clientY: number) => {
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return ratio * 2 * MAX_GAIN - MAX_GAIN;
    };
    setGain(index, compute(e.clientY));

    const onMove = (me: PointerEvent) => setGain(index, compute(me.clientY));
    const onUp   = () => {
      setDragging(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const resetAll = () => selectPreset('flat');

  const presets: EQPreset[] = ['dance', 'energy', 'vocal', 'custom'];
  const meta = PRESETS_META[preset];

  return (
    <div
      className={`
        flex flex-col h-full bg-slate-900/95 backdrop-blur-md border-l border-cyan-500/20
        shadow-[-8px_0_30px_rgba(0,0,0,0.5)] overflow-hidden shrink-0
        ${isOpen ? 'w-[280px]' : 'w-0'}
      `}
      style={{ minHeight: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-cyan-400">
            <rect x="1" y="4" width="2" height="8" rx="1" fill="currentColor"/>
            <rect x="5" y="1" width="2" height="14" rx="1" fill="currentColor"/>
            <rect x="9" y="3" width="2" height="10" rx="1" fill="currentColor"/>
            <rect x="13" y="5" width="2" height="6" rx="1" fill="currentColor"/>
          </svg>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Equalizer</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none ${meta.badgeClass}`}>
            {meta.label.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-pink-400 transition-colors p-1"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-2 gap-1.5 px-3 pt-3 pb-2 shrink-0">
        {presets.map(p => {
          const m = PRESETS_META[p];
          const isActive = preset === p;
          return (
            <button
              key={p}
              onClick={() => selectPreset(p)}
              className={`
                py-2 text-[11px] font-bold uppercase tracking-wider rounded-md border transition-all duration-200
                ${isActive ? m.activeClass : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 hover:bg-white/5'}
              `}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* EQ Sliders */}
      <div className="flex-1 flex flex-col px-2 pb-3 min-h-0">
        <div className="flex gap-1 items-start justify-between h-full pt-1">
          {EQ_BANDS.map((freq, i) => {
            const gain   = gains[i];
            const pct    = (gain + MAX_GAIN) / (2 * MAX_GAIN); // 0..1, 0.5 = zero
            const color  = gainColor(gain);
            const isDrag = dragging === i;

            return (
              <div key={freq} className="flex flex-col items-center flex-1 h-full gap-1">
                {/* Gain label */}
                <div
                  className="text-[10px] font-mono tabular-nums font-bold leading-none shrink-0 transition-colors duration-100"
                  style={{ color: gain === 0 ? '#475569' : color }}
                >
                  {gain > 0 ? `+${gain}` : gain === 0 ? '0' : gain}
                </div>

                {/* Slider track & thumb area */}
                <div
                  className={`
                    relative flex-1 w-full flex justify-center cursor-ns-resize
                    ${isDrag ? 'opacity-100' : 'opacity-80 hover:opacity-100'}
                    transition-opacity duration-150
                  `}
                  style={{ minHeight: 0, touchAction: 'none' }}
                  onPointerDown={e => handleSliderPointerDown(e, i)}
                >
                  {/* Track bg */}
                  <div className="relative h-full w-2 bg-slate-800 rounded-full border border-white/5">
                    {/* Zero marker */}
                    <div
                      className="absolute left-0 right-0 h-px bg-slate-500/50 z-10"
                      style={{ top: '50%' }}
                    />

                    {/* Fill above zero (boost) */}
                    {gain > 0 && (
                      <div
                        className="absolute left-0.5 right-0.5 rounded-full transition-all duration-75"
                        style={{
                          bottom: '50%',
                          height: `${(pct - 0.5) * 100}%`,
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}88`,
                        }}
                      />
                    )}
                    {/* Fill below zero (cut) */}
                    {gain < 0 && (
                      <div
                        className="absolute left-0.5 right-0.5 rounded-full transition-all duration-75"
                        style={{
                          top: '50%',
                          height: `${(0.5 - pct) * 100}%`,
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}88`,
                          opacity: 0.7,
                        }}
                      />
                    )}
                  </div>

                  {/* Thumb */}
                  <div
                    className={`
                      absolute left-1/2 -translate-x-1/2 rounded-full border-2 pointer-events-none z-20
                      transition-transform duration-75
                      ${isDrag ? 'w-5 h-5 scale-110' : 'w-4 h-4'}
                    `}
                    style={{
                      top: `calc(${(1 - pct) * 100}% - ${isDrag ? 10 : 8}px)`,
                      backgroundColor: isDrag ? '#fff' : color,
                      borderColor: color,
                      boxShadow: `0 0 ${isDrag ? 16 : 8}px ${color}`,
                    }}
                  />
                </div>

                {/* Freq label */}
                <div className="text-[9px] text-slate-500 font-mono shrink-0">
                  {bandLabel(freq)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer – reset */}
      <div className="px-3 pb-3 shrink-0 border-t border-white/5 pt-2">
        <button
          onClick={resetAll}
          className="w-full py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// Malý EQ toggle button – použijeme v App.tsx
interface EQButtonProps {
  active: boolean;
  onClick: () => void;
  preset?: EQPreset;
}

export function EQButton({ active, onClick, preset = 'flat' }: EQButtonProps) {
  const color = active ? PRESETS_META[preset].color : undefined;
  return (
    <button
      onClick={onClick}
      title="Equalizer"
      className={`
        p-1.5 rounded transition-all duration-200 relative
        ${active
          ? 'text-cyan-400 bg-cyan-400/10'
          : 'text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10'
        }
      `}
      style={active && color ? { color, textShadow: `0 0 8px ${color}` } : undefined}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="4" width="2" height="8" rx="1" fill="currentColor"/>
        <rect x="5" y="1" width="2" height="14" rx="1" fill="currentColor"/>
        <rect x="9" y="3" width="2" height="10" rx="1" fill="currentColor"/>
        <rect x="13" y="5" width="2" height="6" rx="1" fill="currentColor"/>
      </svg>
      {active && (
        <span
          className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
    </button>
  );
}
