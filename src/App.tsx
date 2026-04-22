import React, { useRef, useState } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1, FolderPlus, FolderOpen, Minimize2, X, Trash2 
} from 'lucide-react';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { SpectrumVisualizer } from './components/SpectrumVisualizer';

function App() {
  const {
    tracks,
    currentTrack,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    repeatMode,
    shuffle,
    addFiles,
    openFiles,
    removeTrack,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    cycleRepeat,
    toggleShuffle,
    seek,
    audioRef
  } = useAudioPlayer();

  const fileInputRef = useRef<HTMLInputElement>(null);      // Přidat
  const fileInputOpenRef = useRef<HTMLInputElement>(null);  // Otevřít
  const [isDragging, setIsDragging] = useState(false);

  // Format seconds to mm:ss
  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      openFiles(Array.from(e.target.files));
    }
    if (fileInputOpenRef.current) fileInputOpenRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const closeWindow = () => {
    // @ts-expect-error window.__TAURI_INTERNALS__ is injected
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window').then(m => m.getCurrentWindow().close());
    } else {
      window.close();
    }
  };

  const minimizeWindow = () => {
    // @ts-expect-error window.__TAURI_INTERNALS__ is injected
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window').then(m => m.getCurrentWindow().minimize());
    }
  };

  const startDragging = () => {
    // @ts-expect-error window.__TAURI_INTERNALS__ is injected
    if (window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window').then(m => m.getCurrentWindow().startDragging());
    }
  };

  return (
    <div 
      className={`w-full h-full flex flex-col bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 rounded-lg overflow-hidden transition-colors ${isDragging ? 'border-pink-500/80 shadow-[0_0_20px_rgba(248,0,255,0.4)]' : 'shadow-2xl'}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Title Bar - Draggable */}
      <div 
        data-tauri-drag-region
        onPointerDown={startDragging}
        className="h-10 shrink-0 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between px-3 border-b border-cyan-500/30 select-none cursor-move shadow-[0_2px_10px_rgba(0,243,255,0.1)]"
      >
        <div data-tauri-drag-region className="flex items-center gap-3 text-cyan-400 font-bold text-sm tracking-widest uppercase pointer-events-none drop-shadow-[0_0_5px_rgba(0,243,255,0.6)]">
          <img src="/logo.png" alt="Zažij VR Logo" className="h-6 object-contain drop-shadow-[0_0_8px_rgba(248,0,255,0.6)]" draggable={false} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={minimizeWindow} className="text-slate-400 hover:text-cyan-400 transition-colors p-1">
            <Minimize2 size={14} />
          </button>
          <button onClick={closeWindow} className="text-slate-400 hover:text-pink-500 transition-colors p-1">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Info */}
      <div className="p-4 flex flex-col items-center justify-center shrink-0 border-b border-white/5 relative overflow-hidden group">
        {/* Nativní Canvas Visualizer */}
        {currentTrack && <SpectrumVisualizer audioRef={audioRef} isPlaying={isPlaying} />}

        {/* Decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-cyan-500/10 blur-2xl rounded-full pointer-events-none"></div>
        {isPlaying && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-pink-500/10 blur-2xl rounded-full pointer-events-none animate-pulse"></div>
        )}

        <div className="h-16 w-full flex flex-col items-center justify-center text-center z-10 px-2 mt-2">
          {currentTrack ? (
            <>
              <h2 className="text-white font-semibold truncate w-full text-base tracking-wide drop-shadow-[0_0_8px_rgba(0,243,255,0.4)]">
                {currentTrack.name}
              </h2>
              <div className="text-cyan-400/70 text-xs mt-1 uppercase tracking-widest flex items-center gap-2">
                {isPlaying ? (
                  <span className="flex items-center gap-1.5">
                    <span className="flex items-end gap-px h-3 overflow-hidden pb-px">
                       <span className="eq-bar drop-shadow-[0_0_4px_rgba(0,243,255,0.8)]" style={{ animationDelay: '0.0s', animationDuration: '0.4s' }}></span>
                       <span className="eq-bar drop-shadow-[0_0_4px_rgba(248,0,255,0.8)] !bg-pink-500" style={{ animationDelay: '0.2s', animationDuration: '0.3s' }}></span>
                       <span className="eq-bar drop-shadow-[0_0_4px_rgba(0,243,255,0.8)]" style={{ animationDelay: '0.4s', animationDuration: '0.6s' }}></span>
                       <span className="eq-bar drop-shadow-[0_0_4px_rgba(248,0,255,0.8)] !bg-pink-500" style={{ animationDelay: '0.1s', animationDuration: '0.5s' }}></span>
                    </span>
                    Playing
                  </span>
                ) : 'Paused'}
              </div>
            </>
          ) : (
            <div className="text-slate-500 text-sm uppercase tracking-widest">No Track Loaded</div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full mt-4 flex items-center gap-3 text-xs text-slate-400 font-mono z-10">
          <span className="font-medium drop-shadow-sm text-cyan-400/80">{formatTime(currentTime)}</span>
          <div 
            className="flex-1 h-2 bg-slate-950/80 rounded-full overflow-hidden cursor-pointer relative group border border-white/5"
            onClick={(e) => {
              if (duration === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seek(percent * duration);
            }}
          >
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 via-pink-400 to-pink-500 transition-all duration-100 ease-linear shadow-[0_0_12px_rgba(248,0,255,0.8)]"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 blur-[2px]"></div>
            </div>
          </div>
          <span className="font-medium drop-shadow-sm text-pink-500/80">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-6 py-5 shrink-0 bg-gradient-to-t from-slate-950/80 to-transparent">
        <button 
          onClick={toggleShuffle} 
          className={`p-2 transition-all duration-300 rounded-full ${shuffle ? 'text-pink-500 bg-pink-500/10 shadow-[0_0_15px_rgba(248,0,255,0.4)] drop-shadow-[0_0_5px_#f800ff]' : 'text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10'}`}
        >
          <Shuffle size={18} />
        </button>

        <div className="flex items-center gap-5">
          <button onClick={prevTrack} className="text-slate-300 hover:text-cyan-400 drop-shadow-md hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.8)] transition-all hover:-translate-x-0.5">
            <SkipBack size={26} fill="currentColor" />
          </button>

          <button 
            onClick={togglePlay} 
            className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-cyan-500/40 flex items-center justify-center text-cyan-400 hover:border-cyan-400 hover:text-cyan-300 transition-all duration-300 hover:scale-105 shadow-[0_0_15px_rgba(0,243,255,0.2)] hover:shadow-[0_0_25px_rgba(0,243,255,0.6)] relative group"
          >
            <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
            {isPlaying ? <Pause size={28} fill="currentColor" className="z-10" /> : <Play size={28} fill="currentColor" className="ml-1 z-10" />}
          </button>

          <button onClick={nextTrack} className="text-slate-300 hover:text-cyan-400 drop-shadow-md hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.8)] transition-all hover:translate-x-0.5">
            <SkipForward size={26} fill="currentColor" />
          </button>
        </div>

        <button 
          onClick={cycleRepeat} 
          className={`p-2 transition-all duration-300 rounded-full ${repeatMode !== 'none' ? 'text-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(0,243,255,0.4)] drop-shadow-[0_0_5px_#00f3ff]' : 'text-slate-500 hover:text-pink-500 hover:bg-pink-500/10'}`}
        >
          {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>

      {/* Playlist */}
      <div className="flex-1 overflow-y-auto bg-slate-900 p-2 border-t border-white/5 relative">
        {tracks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-4 p-8 text-center pt-10">
            <FolderPlus size={36} className="text-slate-700" />
            <p>Drag & Drop audio files here or click below to browse</p>
          </div>
        ) : (
          <div className="space-y-1">
            {tracks.map((track, idx) => {
              const isCurrent = currentIndex === idx;
              return (
                <div 
                  key={track.id}
                  onClick={() => playTrack(idx)}
                  className={`
                    group px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 text-sm transition-all relative
                    ${isCurrent ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-pink-500 font-medium' : 'text-slate-300 hover:bg-white/5 border-l-2 border-transparent'}
                  `}
                >
                  <div className="text-xs text-slate-500 w-4 tracking-tighter tabular-nums">
                    {isCurrent && isPlaying ? (
                       <svg className="w-3 h-3 text-pink-500 animate-pulse" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>
                    ) : (idx + 1)}
                  </div>
                  <div className="flex-1 truncate">{track.name}</div>
                  <button 
                    onClick={(e) => removeTrack(e, idx)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-pink-500 transition-colors shrink-0"
                    title="Remove track"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <audio ref={audioRef} preload="auto" className="hidden" />

      {/* Footer */}
      <div className="shrink-0 p-3 bg-slate-950 border-t border-white/5 flex gap-2">
        {/* Skryté file inputy */}
        <input type="file" multiple accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        <input type="file" multiple accept="audio/*" className="hidden" ref={fileInputOpenRef} onChange={handleFileOpen} />

        {/* Přidat – přidá do existujícího playlistu */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-400 hover:shadow-[0_0_12px_rgba(0,243,255,0.2)] transition-all duration-300 text-xs font-bold uppercase tracking-[0.15em]"
        >
          <FolderPlus size={15} />
          Přidat
        </button>

        {/* Otevřít – vymaže playlist a načte nový */}
        <button
          onClick={() => fileInputOpenRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-gradient-to-r from-slate-800 to-slate-900 border border-cyan-500/30 text-cyan-400 hover:border-pink-500 hover:text-pink-400 hover:shadow-[0_0_15px_rgba(248,0,255,0.3)] transition-all duration-300 text-xs font-bold uppercase tracking-[0.2em]"
        >
          <FolderOpen size={15} className="drop-shadow-[0_0_5px_currentColor]" />
          Otevřít
        </button>
      </div>

    </div>
  );
}

export default App;
