import React, { useEffect, useState } from 'react';
import { startDrag } from '../utils/drag';
import { EQ_BANDS, setEqGains } from '../audio/audioGraph';

// 10-pásmový ekvalizér – filtry jsou v audioGraph.ts, tady jen ovládání
export { EQ_BANDS };

export type EQGains = [number, number, number, number, number, number, number, number, number, number];

export type EQPreset = 'flat' | 'dance' | 'energy' | 'vocal' | 'epic' | 'relax' | 'custom';

export const EQ_PRESETS: Record<Exclude<EQPreset, 'custom'>, EQGains> = {
  flat:   [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  dance:  [ 6,  7,  2,  0, -2, -1,  0,  2,  3,  3],
  energy: [ 5,  4,  1,  0, -2,  1,  3,  4,  4,  3],
  vocal:  [-2, -3, -1,  2,  5,  6,  4,  2,  1, -1],
  // Orchestr / filmová hudba: tympány a žestě dole, méně „bahna“ ve spodních středech, víc lesku smyčců
  epic:   [ 5,  4,  2, -1, -2,  0,  2,  3,  4,  4],
  // Relax: teplý a měkký zvuk, ztlumené ostré výšky (únava sluchu při dlouhém poslechu)
  relax:  [ 3,  3,  2,  1,  0, -1, -2, -3, -4, -5],
};

type PresetMeta = {
  label: string;
  color: string;
  activeClass: string;
  badgeClass: string;
};

const PRESETS_META: Record<EQPreset, PresetMeta> = {
  flat:   { label: 'Flat',   color: '#94a3b8', activeClass: 'bg-slate-700/80 text-slate-100 border-slate-400 shadow-[0_0_12px_rgba(148,163,184,0.3)]',   badgeClass: 'text-slate-400 border-slate-500 bg-slate-800' },
  dance:  { label: 'Dance',  color: '#f472b6', activeClass: 'bg-pink-500/20 text-pink-300 border-pink-500 shadow-[0_0_15px_rgba(228,37,165,0.4)]',         badgeClass: 'text-pink-400 border-pink-500 bg-pink-500/10' },
  energy: { label: 'Energy', color: '#fb923c', activeClass: 'bg-orange-500/20 text-orange-300 border-orange-500 shadow-[0_0_15px_rgba(251,146,60,0.4)]',  badgeClass: 'text-orange-400 border-orange-500 bg-orange-500/10' },
  epic:   { label: 'Epic',   color: '#fbbf24', activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-[0_0_15px_rgba(251,191,36,0.4)]',   badgeClass: 'text-amber-400 border-amber-500 bg-amber-500/10' },
  relax:  { label: 'Relax',  color: '#34d399', activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-[0_0_15px_rgba(52,211,153,0.4)]', badgeClass: 'text-emerald-400 border-emerald-500 bg-emerald-500/10' },
  vocal:  { label: 'Vocal',  color: '#22d3ee', activeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500 shadow-[0_0_15px_rgba(1,218,246,0.4)]',         badgeClass: 'text-cyan-400 border-cyan-500 bg-cyan-500/10' },
  custom: { label: 'Custom', color: '#c084fc', activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]', badgeClass: 'text-purple-400 border-purple-500 bg-purple-500/10' },
};

function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function gainColor(gain: number): string {
  // Firemní barvy: zesílení neon / růžová, ztlumení šedomodrá (bez fialové)
  if (gain > 5)  return '#e425a5'; // výrazné zesílení – růžová
  if (gain > 1)  return '#01daf6'; // zesílení – neon
  if (gain >= 0) return '#3e5478'; // beze změny
  if (gain > -5) return '#8d9bb5'; // ztlumení
  return '#b7c2d6';                // výrazné ztlumení
}

interface EqualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isOpen: boolean;
  onClose: () => void;
  onPresetChange?: (preset: EQPreset) => void;
  /** Vložený do panelu (telefon): plná šířka, bez vlastní hlavičky (má ji panel) */
  embedded?: boolean;
}

const MAX_GAIN = 12;
const EQ_KEY = 'zvr-grid-eq';

/** Uložené nastavení ekvalizéru (kontrola tvaru – localStorage může obsahovat cokoli) */
function readSavedEq(): { preset: EQPreset; gains: EQGains } {
  const flat = { preset: 'flat' as EQPreset, gains: [...EQ_PRESETS.flat] as EQGains };
  try {
    const raw = JSON.parse(localStorage.getItem(EQ_KEY) || 'null');
    const ok =
      raw && raw.preset in PRESETS_META && Array.isArray(raw.gains) && raw.gains.length === EQ_BANDS.length &&
      raw.gains.every((g: unknown) => typeof g === 'number' && Number.isFinite(g) && Math.abs(g) <= MAX_GAIN);
    return ok ? { preset: raw.preset, gains: raw.gains as EQGains } : flat;
  } catch {
    return flat;
  }
}

export function Equalizer({ audioRef, isOpen, onClose, onPresetChange, embedded = false }: EqualizerProps) {
  const [{ preset, gains }, setEq] = useState(readSavedEq);
  const [dragging, setDragging] = useState<number | null>(null);

  // Zesílení do zvukového grafu (platí i pro graf vytvořený později) + zapamatovat do příště
  useEffect(() => {
    setEqGains(audioRef.current, gains);
    try { localStorage.setItem(EQ_KEY, JSON.stringify({ preset, gains })); } catch { /* jen se nezapamatuje */ }
  }, [audioRef, preset, gains]);

  // Hlavička (tlačítko EQ) ukazuje uložený preset hned po startu
  useEffect(() => { onPresetChange?.(preset); }, [preset, onPresetChange]);

  const selectPreset = (p: EQPreset) => {
    setEq((prev) => ({ preset: p, gains: p === 'custom' ? prev.gains : ([...EQ_PRESETS[p]] as EQGains) }));
  };

  const setGain = (index: number, value: number) => {
    const clamped = Math.max(-MAX_GAIN, Math.min(MAX_GAIN, Math.round(value * 2) / 2));
    setEq((prev) => {
      const next = [...prev.gains] as EQGains;
      next[index] = clamped;
      return { preset: 'custom', gains: next };
    });
  };

  // Drag handling pro slider
  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    setDragging(index);
    const rect = e.currentTarget.getBoundingClientRect();
    const compute = (clientY: number) => {
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return ratio * 2 * MAX_GAIN - MAX_GAIN;
    };
    startDrag(e, (_x, y) => setGain(index, compute(y)), () => setDragging(null));
  };

  const resetAll = () => selectPreset('flat');

  const presets: EQPreset[] = ['dance', 'energy', 'vocal', 'epic', 'relax', 'custom'];
  const meta = PRESETS_META[preset];

  return (
    <div
      className={embedded ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden' : `
        flex flex-col h-full bg-slate-900/95 border-l border-cyan-500/20
        shadow-[-8px_0_30px_rgba(0,0,0,0.5)] overflow-hidden shrink-0
        ${isOpen ? 'w-[280px]' : 'w-0'}
      `}
      style={{ minHeight: 0 }}
    >
      {/* Header */}
      {!embedded && (
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
      )}

      {/* Preset buttons */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-3 pb-2 shrink-0">
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
