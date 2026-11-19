import React, { lazy, Suspense, useRef } from 'react';
import { FolderOpen, FolderPlus, ListMusic, Trash2, X } from 'lucide-react';
import type { Track } from '../hooks/useAudioPlayer';
import { Equalizer, type EQPreset } from './Equalizer';
import { DancingMascot } from '../mascot/DancingMascot';

// Telefon: hlavní obrazovka „Teď hraje“ je visualizer přes celou plochu; seznam skladeb a ekvalizér
// se vysouvají zespodu. Prázdný playlist = uvítání s tančícím panáčkem a tlačítkem Přidat hudbu.

const VisualizerStudio = lazy(() => import('./VisualizerStudio').then((m) => ({ default: m.VisualizerStudio })));

export type MobileSheet = 'none' | 'playlist' | 'eq';

const ACCEPT_AUDIO = 'audio/*,.wav,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.wma,.weba,.webm';

interface MobileLayoutProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  tracks: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  sheet: MobileSheet;
  setSheet: (s: MobileSheet) => void;
  fullscreen: boolean;
  onFullscreen: (on: boolean) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (s: number) => void;
  onVolume: (v: number | ((prev: number) => number)) => void;
  onPlayTrack: (index: number) => void;
  onRemoveTrack: (e: React.MouseEvent, index: number) => void;
  onAddFiles: (files: File[]) => void;
  onOpenFiles: (files: File[]) => void;
  onPresetChange: (p: EQPreset) => void;
  onOpenWebsite: () => void;
}

/** Vysouvací panel zespodu; zavře se tahem dolů za úchyt, klepnutím vedle nebo tlačítkem Zpět */
function BottomSheet({ open, onClose, height, title, children }: { open: boolean; onClose: () => void; height: string; title: React.ReactNode; children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !panelRef.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panelRef.current.style.transform = `translateY(${drag.current.dy}px)`;
    panelRef.current.style.transition = 'none';
  };
  const onUp = () => {
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    if (panelRef.current) {
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
    }
    if (dy > 80) onClose();
  };
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-cyan-400/30 bg-slate-950/95 shadow-[0_-10px_40px_rgba(0,243,255,0.15)] transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-hidden={!open}
      >
        <div
          className="shrink-0 pt-2.5 pb-2 px-5 cursor-grab"
          style={{ touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="mx-auto w-10 h-1.5 rounded-full bg-slate-600" />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">{title}</div>
            <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} className="p-1.5 text-slate-400" aria-label="Zavřít">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </>
  );
}

export function MobileLayout(p: MobileLayoutProps) {
  const addRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const pick = (ref: React.RefObject<HTMLInputElement | null>) => ref.current?.click();
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>, fn: (f: File[]) => void) => {
    if (e.target.files?.length) fn(Array.from(e.target.files));
    e.target.value = '';
  };

  const logo = (
    <button type="button" onClick={p.onOpenWebsite} aria-label="Otevřít web ZažijVR" className="p-1.5 active:scale-95">
      <img src="/logo.png" alt="Zažij VR" className="grid-neon-logo h-7 object-contain" draggable={false} />
    </button>
  );

  const action = (icon: React.ReactNode, label: string, onClick: () => void, active = false) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors active:scale-95 ${active ? 'text-cyan-300' : 'text-slate-300'}`}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </button>
  );

  const bottomBar = (
    <div className="grid grid-cols-4 gap-1 border-t border-white/10 pt-2">
      {action(
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="2" height="8" rx="1" fill="currentColor" /><rect x="5" y="1" width="2" height="14" rx="1" fill="currentColor" /><rect x="9" y="3" width="2" height="10" rx="1" fill="currentColor" /><rect x="13" y="5" width="2" height="6" rx="1" fill="currentColor" /></svg>,
        'Ekvalizér', () => p.setSheet(p.sheet === 'eq' ? 'none' : 'eq'), p.sheet === 'eq',
      )}
      {action(<ListMusic size={20} />, 'Seznam', () => p.setSheet(p.sheet === 'playlist' ? 'none' : 'playlist'), p.sheet === 'playlist')}
      {action(<FolderPlus size={20} />, 'Přidat', () => pick(addRef))}
      {action(<FolderOpen size={20} />, 'Otevřít', () => pick(openRef))}
    </div>
  );

  const inputs = (
    <>
      <input ref={addRef} type="file" multiple accept={ACCEPT_AUDIO} className="hidden" onChange={(e) => onFiles(e, p.onAddFiles)} />
      <input ref={openRef} type="file" multiple accept={ACCEPT_AUDIO} className="hidden" onChange={(e) => onFiles(e, p.onOpenFiles)} />
    </>
  );

  // ── Prázdný playlist: uvítání ──
  if (p.tracks.length === 0) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center"
        style={{ background: 'radial-gradient(circle at 50% 40%, #10224a 0%, #060d22 60%, #03060f 100%)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {inputs}
        <div className="absolute left-3" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>{logo}</div>
        <DancingMascot className="w-48 h-48" />
        <div>
          <div className="text-2xl font-black tracking-[0.35em] text-white drop-shadow-[0_0_12px_rgba(0,243,255,0.8)]">GRID</div>
          <p className="mt-2 text-sm text-slate-400">Přidej hudbu z telefonu a pusť si ji s neonovou vizualizací.</p>
        </div>
        <button
          onClick={() => pick(addRef)}
          className="flex items-center gap-2.5 px-7 py-3.5 rounded-2xl border-2 border-cyan-400/60 bg-cyan-400/10 text-cyan-200 font-bold uppercase tracking-[0.15em] text-sm shadow-[0_0_20px_rgba(0,243,255,0.3)] active:scale-95"
        >
          <FolderPlus size={20} /> Přidat hudbu
        </button>
      </div>
    );
  }

  // ── Teď hraje: visualizer + vysouvací panely ──
  return (
    <div className="absolute inset-0 bg-black">
      {inputs}
      <Suspense fallback={null}>
        <VisualizerStudio
          mobile
          audioRef={p.audioRef}
          isPlaying={p.isPlaying}
          trackName={p.currentTrack?.name ?? null}
          currentTime={p.currentTime}
          duration={p.duration}
          onClose={() => {}}
          volume={p.volume}
          onTogglePlay={p.onTogglePlay}
          onNext={p.onNext}
          onPrev={p.onPrev}
          onSeek={p.onSeek}
          onVolume={p.onVolume}
          fullscreen={p.fullscreen}
          onFullscreen={p.onFullscreen}
          topLeft={logo}
          bottomBar={bottomBar}
          dimmed={p.sheet !== 'none'}
        />
      </Suspense>

      <BottomSheet
        open={p.sheet === 'playlist'}
        onClose={() => p.setSheet('none')}
        height="72%"
        title={<>Seznam skladeb <span className="text-slate-500 font-normal">· {p.tracks.length}</span></>}
      >
        <div className="flex-1 overflow-y-auto px-2">
          {p.tracks.map((t, i) => {
            const current = i === p.currentIndex;
            return (
              <div
                key={t.id}
                onClick={() => p.onPlayTrack(i)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm active:bg-white/5 ${current ? 'bg-cyan-500/10 text-cyan-300 font-medium border-l-2 border-pink-500' : 'text-slate-300 border-l-2 border-transparent'}`}
              >
                <span className="w-5 text-xs text-slate-500 tabular-nums">{current && p.isPlaying ? '▶' : i + 1}</span>
                <span className="flex-1 truncate">{t.name}</span>
                <button onClick={(e) => p.onRemoveTrack(e, i)} className="p-2 -m-1 text-slate-500 active:text-pink-400" aria-label="Odebrat skladbu">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="shrink-0 grid grid-cols-2 gap-2 p-3 border-t border-white/10">
          <button onClick={() => pick(addRef)} className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-[0.15em] active:scale-95">
            <FolderPlus size={16} /> Přidat
          </button>
          <button onClick={() => pick(openRef)} className="flex items-center justify-center gap-2 py-3 rounded-xl border border-cyan-500/40 text-cyan-300 text-xs font-bold uppercase tracking-[0.15em] active:scale-95">
            <FolderOpen size={16} /> Otevřít
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={p.sheet === 'eq'} onClose={() => p.setSheet('none')} height="58%" title="Ekvalizér">
        <Equalizer audioRef={p.audioRef} isOpen embedded onClose={() => p.setSheet('none')} onPresetChange={p.onPresetChange} />
      </BottomSheet>
    </div>
  );
}
