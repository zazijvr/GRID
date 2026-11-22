import React, { useRef, useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1, FolderPlus, FolderOpen, Trash2, Volume2, VolumeX, Minimize2, X, MonitorPlay, Library, Radio as RadioIcon
} from 'lucide-react';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { closeAudioGraph } from './audio/audioGraph';
import { startDrag } from './utils/drag';
import { SplashScreen } from './components/SplashScreen';
import { MobileLayout, type MobileSheet } from './components/MobileLayout';
import { PlaylistsPanel } from './components/PlaylistsPanel';
import { isAndroidApp, openWebsiteAndroid, postPlaybackState, setImmersive } from './platform/android';
import { SpectrumVisualizer } from './components/SpectrumVisualizer';
import { useRadio } from './radio/useRadio';
import { RadioPanel } from './radio/RadioPanel';
// three.js je velký – načte se až při otevření Visualizer Studia (rychlejší start přehrávače)
const VisualizerStudio = lazy(() => import('./components/VisualizerStudio').then((m) => ({ default: m.VisualizerStudio })));
import { Equalizer, EQButton } from './components/Equalizer';
import type { EQPreset } from './components/Equalizer';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const PLAYER_WIDTH  = 350; // px – šířka přehrávače
const EQ_PANEL_WIDTH = 280; // px – šířka EQ panelu
const VIZ_WIDTH = 520; // px – visualizer vedle přehrávače (pevný malý formát, velký = celá obrazovka)
const RADIO_HEIGHT = 860; // px – výška okna při otevřeném rádiu (počítač)
const isTauri = () => !!window.__TAURI_INTERNALS__;
/** Linux (počítač): okno nejde posunout doleva (Wayland) → pořadí přehrávač | visualizer | ekvalizér */
const vizOnRight = /Linux/.test(navigator.userAgent) && !isMobile;
const tauriWindow = () => import('@tauri-apps/api/window').then((m) => m.getCurrentWindow());
const ACCEPT_AUDIO = 'audio/*,.wav,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.wma,.weba,.webm';

function App() {
  const {
    tracks,
    currentTrack: fileTrack,
    currentIndex: fileIndex,
    isPlaying: filePlaying,
    currentTime: fileTime,
    duration: fileDuration,
    repeatMode,
    shuffle,
    addFiles,
    openFiles,
    removeTrack,
    playTrack,
    togglePlay: fileToggle,
    nextTrack: fileNext,
    prevTrack: filePrev,
    cycleRepeat,
    toggleShuffle,
    seek: fileSeek,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    audioRef,
    savedPlaylists,
    currentPlaylistName,
    savePlaylistAs,
    loadSavedPlaylist,
    deleteSavedPlaylist,
  } = useAudioPlayer();

  // ── Rádio: když hraje stanice, ovládání (play, další, předchozí) patří jí ──
  const fileToggleRef = useRef(fileToggle);
  fileToggleRef.current = fileToggle;
  const radio = useRadio({
    volume,
    // Spuštění stanice pozastaví hudbu ze souborů
    onStart: () => { if (audioRef.current && !audioRef.current.paused) fileToggleRef.current(); },
  });
  const radioOn = radio.station !== null;
  // Spuštění hudby ze souborů (klik na skladbu, nový playlist…) rádio vypne
  const radioStopRef = useRef(radio.stop);
  radioStopRef.current = radio.stop;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => radioStopRef.current();
    audio.addEventListener('play', onPlay);
    return () => audio.removeEventListener('play', onPlay);
  }, [audioRef]);
  /** Element, který je právě slyšet – z něj čte vizualizace (rádio, jinak přehrávač souborů) */
  const outputRef = useMemo<React.RefObject<HTMLAudioElement | null>>(
    () => ({ get current() { return radio.activeElRef.current ?? audioRef.current; } }) as React.RefObject<HTMLAudioElement | null>,
    [radio.activeElRef, audioRef],
  );
  const currentTrack = radioOn ? { id: `radio:${radio.station!.stationuuid}`, name: radio.station!.name } : fileTrack;
  const currentIndex = radioOn ? -1 : fileIndex;
  const isPlaying = radioOn ? radio.isPlaying : filePlaying;
  const currentTime = radioOn ? 0 : fileTime;
  const duration = radioOn ? 0 : fileDuration;
  const togglePlay = radioOn ? radio.toggle : fileToggle;
  const nextTrack = radioOn ? radio.next : fileNext;
  const prevTrack = radioOn ? radio.prev : filePrev;
  const seek = radioOn ? () => {} : fileSeek;

  const fileInputRef     = useRef<HTMLInputElement>(null);
  const fileInputOpenRef = useRef<HTMLInputElement>(null);
  const [isDragging,    setIsDragging]    = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showEQ,         setShowEQ]        = useState(false);
  /** Telefon: otevřený vysouvací panel (seznam skladeb / ekvalizér) */
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>('none');
  /** Počítač: místo seznamu skladeb panel uložených playlistů / rádia */
  const [showPlaylists, setShowPlaylistsState] = useState(false);
  const [showRadio, setShowRadioState] = useState(false);
  const setShowPlaylists = (v: boolean | ((p: boolean) => boolean)) => {
    setShowPlaylistsState((p) => { const n = typeof v === 'function' ? v(p) : v; if (n) setShowRadioState(false); return n; });
  };
  const setShowRadio = (v: boolean | ((p: boolean) => boolean)) => {
    setShowRadioState((p) => { const n = typeof v === 'function' ? v(p) : v; if (n) setShowPlaylistsState(false); return n; });
  };
  /** Úvodní animace při spuštění */
  const [showSplash, setShowSplash] = useState(true);
  /** Visualizer přes celý monitor (celá obrazovka okna) */
  const [vizFullscreen, setVizFullscreen] = useState(false);
  const [activePreset,   setActivePreset]  = useState<EQPreset>('flat');

  const [scrubbingTime, setScrubbingTime] = useState<number | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [hoverVolume,   setHoverVolume]   = useState<number | null>(null);

  // Šířka okna = [visualizer] + přehrávač + [ekvalizér]. Výšku, kterou si uživatel nastavil, nechá.
  // shiftLeft: o kolik posunout okno doleva (visualizer roste vlevo, přehrávač zůstane na místě) –
  // na Waylandu aplikace polohu okna měnit nesmí, tam okno jen poroste doprava.
  const programmaticResize = useRef(0);
  const resizeWindow = useCallback(async (width: number, shiftLeft = 0) => {
    if (!isTauri() || isMobile) return;
    programmaticResize.current = Date.now();
    const [win, { LogicalSize, LogicalPosition }] = await Promise.all([tauriWindow(), import('@tauri-apps/api/dpi')]);
    const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    if (shiftLeft) {
      try {
        const pos = await win.outerPosition();
        if (pos.x !== 0 || pos.y !== 0) await win.setPosition(new LogicalPosition(Math.max(0, pos.x / scale - shiftLeft), pos.y / scale));
      } catch { /* poloha okna není k dispozici (Wayland) */ }
    }
    await win.setSize(new LogicalSize(width, size.height / scale));
  }, []);
  const fixedWidth = (eq: boolean) => PLAYER_WIDTH + (eq ? EQ_PANEL_WIDTH : 0);

  // Rádio na počítači: pod přehrávačem je na seznam stanic málo místa → okno se na tu dobu prodlouží
  // (nejvýš na výšku obrazovky) a po zavření panelu se vrátí na původní výšku
  const heightBeforeRadio = useRef<number | null>(null);
  const setWindowHeight = useCallback(async (open: boolean) => {
    if (!isTauri() || isMobile) return;
    try {
      const [win, { LogicalSize }] = await Promise.all([tauriWindow(), import('@tauri-apps/api/dpi')]);
      const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
      const w = size.width / scale, h = size.height / scale;
      if (open) {
        const target = Math.min(RADIO_HEIGHT, window.screen.availHeight - 40);
        if (target <= h) return;
        heightBeforeRadio.current = h;
        programmaticResize.current = Date.now();
        await win.setSize(new LogicalSize(w, target));
      } else if (heightBeforeRadio.current !== null) {
        const back = heightBeforeRadio.current;
        heightBeforeRadio.current = null;
        programmaticResize.current = Date.now();
        await win.setSize(new LogicalSize(w, back));
      }
    } catch (e) {
      console.warn('Výšku okna nejde změnit', e);
    }
  }, []);
  useEffect(() => { setWindowHeight(showRadio); }, [showRadio, setWindowHeight]);

  const toggleEQ = useCallback(() => {
    const next = !showEQ;
    const viz = showVisualizer && !isMobile ? VIZ_WIDTH : 0;
    if (next) {
      // Otevřít: nejdřív rozšiř okno → pak zobraz panel
      resizeWindow(fixedWidth(true) + viz)
        .then(() => setShowEQ(true))
        .catch(() => setShowEQ(true)); // fallback i bez Tauri (browser preview)
    } else {
      // Zavřít: skryj panel a zmenši okno
      setShowEQ(false);
      resizeWindow(fixedWidth(false) + viz);
    }
  }, [showEQ, showVisualizer, resizeWindow]);

  const openVisualizer = useCallback(() => {
    setShowVisualizer(true);
    if (!isMobile) resizeWindow(fixedWidth(showEQ) + VIZ_WIDTH, vizOnRight ? 0 : VIZ_WIDTH).catch(() => {});
  }, [showEQ, resizeWindow]);

  // Celá obrazovka: celé okno přes monitor, visualizer přes celé okno (přehrávač a EQ pod ním)
  const setFullscreen = useCallback(async (on: boolean) => {
    setVizFullscreen(on);
    if (isMobile) setImmersive(on); // telefon: visualizer už je přes celé okno – schovat systémové lišty
    if (isTauri() && !isMobile) {
      try {
        const w = await tauriWindow();
        // Okno s pevnou velikostí některé správce oken (KWin) na celou obrazovku nepustí → dočasně povolit
        if (on) await w.setResizable(true);
        await w.setFullscreen(on);
        if (!on) await w.setResizable(false);
      } catch (e) {
        console.warn('Celá obrazovka není k dispozici', e);
      }
    }
  }, []);

  // Okno opustilo celou obrazovku jinak (systémová klávesa, správce oken) → srovnat stav
  useEffect(() => {
    if (!vizFullscreen || !isTauri()) return;
    const onResize = () => { tauriWindow().then(async (w) => { if (!(await w.isFullscreen())) { setVizFullscreen(false); await w.setResizable(false); } }).catch(() => {}); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [vizFullscreen]);

  const closeVisualizer = useCallback(() => {
    if (vizFullscreen) setFullscreen(false);
    setShowVisualizer(false);
    if (!isMobile) resizeWindow(fixedWidth(showEQ), vizOnRight ? 0 : -VIZ_WIDTH).catch(() => {});
  }, [showEQ, resizeWindow, vizFullscreen, setFullscreen]);

  // ── Android: oznámení / zamykací obrazovka / sluchátka a tlačítko Zpět ──
  // Stav přehrávání do nativní části (při změně a během hraní každých ~5 s kvůli pozici)
  const stateTick = isPlaying ? Math.floor(currentTime / 5) : -1;
  useEffect(() => {
    if (!isAndroidApp()) return;
    postPlaybackState({
      playing: isPlaying,
      title: currentTrack?.name ?? '',
      positionMs: currentTime * 1000,
      durationMs: duration * 1000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTime jen přes stateTick (ne každý snímek)
  }, [isPlaying, currentTrack?.id, duration, stateTick]);

  // Povely z nativní části – vždy na aktuální funkce (ref), handler se registruje jednou
  const mediaRef = useRef({ togglePlay, nextTrack, prevTrack, seek });
  mediaRef.current = { togglePlay, nextTrack, prevTrack, seek };
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = () => {
    if (isMobile) {
      // Telefon: Zpět nejdřív ukončí celou obrazovku visualizeru, pak zavře panel; jinak aplikaci schová
      if (vizFullscreen) { setFullscreen(false); return true; }
      if (mobileSheet !== 'none') { setMobileSheet('none'); return true; }
      return false;
    }
    if (showVisualizer) {
      closeVisualizer();
      return true;
    }
    if (showEQ) {
      toggleEQ();
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!isAndroidApp()) return;
    window.__gridMedia = (command: string) => {
      const m = mediaRef.current;
      const paused = outputRef.current?.paused ?? true;
      if (command === 'play') { if (paused) m.togglePlay(); }
      else if (command === 'pause') { if (!paused) m.togglePlay(); }
      else if (command === 'toggle') m.togglePlay();
      else if (command === 'next') m.nextTrack();
      else if (command === 'prev') m.prevTrack();
      else if (command.startsWith('seek:')) {
        const ms = Number(command.slice(5));
        if (Number.isFinite(ms) && ms >= 0) m.seek(ms / 1000);
      }
    };
    window.__gridBack = () => backRef.current();
    return () => {
      delete window.__gridMedia;
      delete window.__gridBack;
    };
  }, [audioRef, outputRef]);

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) openFiles(Array.from(e.target.files));
    if (fileInputOpenRef.current) fileInputOpenRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFiles(Array.from(e.dataTransfer.files));
  };

  const closeWindow = () => {
    radio.stop();
    audioRef.current?.pause();
    closeAudioGraph(audioRef.current);
    if (isTauri()) tauriWindow().then((w) => w.close());
    else window.close();
  };

  // Logo v titulku → web ZažijVR (v aplikaci přes Rust – jen tahle pevná adresa)
  const openWebsite = () => {
    if (isAndroidApp()) openWebsiteAndroid();
    else if (isTauri()) import('@tauri-apps/api/core').then(({ invoke }) => invoke('open_website')).catch((e) => console.warn('Web se nepodařilo otevřít', e));
    else window.open('https://zazijvr.cz', '_blank', 'noopener');
  };

  const minimizeWindow = () => {
    if (isTauri()) tauriWindow().then((w) => w.minimize());
  };

  // Přesun okna za titulek – ne při kliknutí na tlačítka v něm (jinak by se místo akce chytlo okno)
  const startDragging = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    if (isTauri()) tauriWindow().then((w) => w.startDragging());
  };

  // Visualizer (počítač): Windows / X11 vlevo od přehrávače (okno se posune doleva),
  // Linux vpravo – Wayland aplikaci posouvat okno nedovolí, rostlo by jen doprava
  const visualizerPanel = (
    <div
      className={vizFullscreen ? 'fixed inset-0 z-50' : 'relative shrink-0 h-full'}
      style={vizFullscreen ? undefined : { width: VIZ_WIDTH }}
    >
      <Suspense fallback={null}>
        <VisualizerStudio
          docked
          audioRef={outputRef}
          isPlaying={isPlaying}
          trackName={currentTrack?.name ?? null}
          currentTime={currentTime}
          duration={duration}
          onClose={closeVisualizer}
          volume={volume}
          onTogglePlay={togglePlay}
          onNext={nextTrack}
          onPrev={prevTrack}
          onSeek={seek}
          onVolume={setVolume}
          side={vizOnRight ? 'right' : 'left'}
          fullscreen={vizFullscreen}
          onFullscreen={isTauri() ? setFullscreen : undefined}
          live={radioOn}
          onDragStart={() => { if (isTauri()) tauriWindow().then((w) => w.startDragging()); }}
        />
      </Suspense>
    </div>
  );

  // ── Telefon: visualizer jako hlavní obrazovka, seznam a ekvalizér ve vysouvacích panelech ──
  if (isMobile) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-black">
        <MobileLayout
          audioRef={outputRef}
          radioOn={radioOn}
          radioPanel={<RadioPanel radio={radio} onPlayed={() => setMobileSheet('none')} />}
          tracks={tracks}
          currentIndex={currentIndex}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          sheet={mobileSheet}
          setSheet={setMobileSheet}
          fullscreen={vizFullscreen}
          onFullscreen={setFullscreen}
          onTogglePlay={togglePlay}
          onNext={nextTrack}
          onPrev={prevTrack}
          onSeek={seek}
          onVolume={setVolume}
          onPlayTrack={(i) => { playTrack(i); setMobileSheet('none'); }}
          live={radioOn}
          onRemoveTrack={removeTrack}
          onAddFiles={addFiles}
          onOpenFiles={(f) => { openFiles(f); setMobileSheet('none'); }}
          onPresetChange={setActivePreset}
          onOpenWebsite={openWebsite}
          shuffle={shuffle}
          repeatMode={repeatMode}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
          savedPlaylists={savedPlaylists}
          currentPlaylistName={currentPlaylistName}
          onSavePlaylist={savePlaylistAs}
          onLoadPlaylist={loadSavedPlaylist}
          onDeletePlaylist={deleteSavedPlaylist}
        />
        <audio ref={audioRef} preload="auto" className="hidden" />
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      </div>
    );
  }

  return (
    // Outer wrapper – flex-row pro player + EQ panel
    <div
      className={`relative w-full h-full flex flex-row overflow-hidden transition-colors
        ${!isMobile ? 'border border-cyan-500/30 rounded-lg shadow-2xl' : ''}
        ${isDragging ? 'border-pink-500/80 shadow-[0_0_20px_rgba(248,0,255,0.4)]' : ''}
      `}
      // Telefon: obsah mimo systémové lišty (aplikace kreslí edge-to-edge)
      style={isMobile ? { paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {showVisualizer && !isMobile && !vizOnRight && visualizerPanel}

      {/* ── PLAYER – fixní šířka aby EQ panel nevytlačil obsah ── */}
      <div className="flex flex-col bg-slate-900/90 overflow-hidden shrink-0" style={{ width: isMobile ? '100%' : PLAYER_WIDTH }}>

        {/* Title Bar */}
        {!isMobile && (
          <div
            data-tauri-drag-region
            onPointerDown={startDragging}
            className="h-10 shrink-0 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between px-3 border-b border-cyan-500/30 select-none cursor-move shadow-[0_2px_10px_rgba(0,243,255,0.1)]"
          >
            <div data-tauri-drag-region className="flex items-center gap-3 text-cyan-400 font-bold text-sm tracking-widest uppercase pointer-events-none drop-shadow-[0_0_5px_rgba(0,243,255,0.6)]">
              <button
                type="button"
                onClick={openWebsite}
                title="zazijvr.cz"
                aria-label="Otevřít web ZažijVR"
                className="pointer-events-auto hover:scale-105 active:scale-95 transition-transform"
              >
                <img src="/logo.png" alt="Zažij VR" className="grid-neon-logo h-6 object-contain" draggable={false} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {/* EQ toggle button */}
              <EQButton active={showEQ} onClick={toggleEQ} preset={activePreset} />

              <button
                onClick={showVisualizer ? closeVisualizer : openVisualizer}
                title="Visualizer Studio"
                className={`transition-colors p-1 ${showVisualizer ? 'text-cyan-400' : 'text-slate-400 hover:text-cyan-400'}`}
              >
                <MonitorPlay size={14} />
              </button>
              <button onClick={minimizeWindow} className="text-slate-400 hover:text-cyan-400 transition-colors p-1">
                <Minimize2 size={14} />
              </button>
              <button onClick={closeWindow} className="text-slate-400 hover:text-pink-500 transition-colors p-1">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Telefon: titulek okna není – logo s odkazem na zazijvr.cz nahoře */}
        {isMobile && (
          <div className="shrink-0 flex justify-center pt-3 pb-1">
            <button type="button" onClick={openWebsite} aria-label="Otevřít web ZažijVR" className="active:scale-95 transition-transform">
              <img src="/logo.png" alt="Zažij VR" className="grid-neon-logo h-7 object-contain" draggable={false} />
            </button>
          </div>
        )}

        {/* Main Info + Visualizer */}
        <div className="p-4 flex flex-col items-center justify-center shrink-0 border-b border-white/5 relative overflow-hidden group">
          {currentTrack && <SpectrumVisualizer audioRef={outputRef} isPlaying={isPlaying} />}

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-cyan-500/10 blur-2xl rounded-full pointer-events-none" />
          {isPlaying && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-pink-500/10 blur-2xl rounded-full pointer-events-none animate-pulse" />
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
                        <span className="eq-bar drop-shadow-[0_0_4px_rgba(0,243,255,0.8)]" style={{ animationDelay: '0.0s', animationDuration: '0.4s' }} />
                        <span className="eq-bar drop-shadow-[0_0_4px_rgba(248,0,255,0.8)] !bg-pink-500" style={{ animationDelay: '0.2s', animationDuration: '0.3s' }} />
                        <span className="eq-bar drop-shadow-[0_0_4px_rgba(0,243,255,0.8)]" style={{ animationDelay: '0.4s', animationDuration: '0.6s' }} />
                        <span className="eq-bar drop-shadow-[0_0_4px_rgba(248,0,255,0.8)] !bg-pink-500" style={{ animationDelay: '0.1s', animationDuration: '0.5s' }} />
                      </span>
                      {radioOn ? (radio.status === 'loading' ? 'Připojuji' : 'Rádio živě') : 'Playing'}
                    </span>
                  ) : radioOn && radio.status === 'error' ? <span className="text-pink-400 normal-case tracking-normal">Stanice nejde přehrát</span> : 'Paused'}
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-sm uppercase tracking-widest">No Track Loaded</div>
            )}
          </div>

          {/* Rádio: místo posuvníku značka živého vysílání */}
          {radioOn && (
            <div className="w-full mt-4 h-10 flex items-center justify-center gap-3 z-10">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-cyan-500/40" />
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-pink-400">
                <span className={`w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_8px_#f800ff] ${radio.status === 'playing' ? 'animate-pulse' : 'opacity-40'}`} />
                Živě
              </span>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-cyan-500/40" />
            </div>
          )}
          {!radioOn && (
          <div className="w-full mt-4 flex items-center gap-3 text-xs text-slate-400 font-mono z-10">
            <span className="font-medium drop-shadow-sm text-cyan-400/80">{formatTime(currentTime)}</span>
            <div
              className="flex-1 py-4 cursor-none relative group flex items-center"
              style={{ touchAction: 'none' }}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}
              onPointerLeave={() => setHoverProgress(null)}
              onPointerDown={(e) => {
                if (duration === 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const at = (x: number) => Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * duration;
                startDrag(
                  e,
                  (x) => setScrubbingTime(at(x)),
                  (x, _y, cancelled) => {
                    if (!cancelled) seek(at(x)); // zrušené gesto skladbou nehýbe
                    setScrubbingTime(null);
                  },
                );
              }}
            >
              <div className="w-full h-2 bg-slate-950/80 rounded-full relative border border-white/5 pointer-events-none">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-cyan-400 via-pink-400 to-pink-500 transition-all duration-100 ease-linear shadow-[0_0_12px_rgba(248,0,255,0.8)] pointer-events-none"
                  style={{ width: `${duration > 0 ? ((scrubbingTime !== null ? scrubbingTime : currentTime) / duration) * 100 : 0}%` }}
                >
                  <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 blur-[2px]" />
                </div>
              </div>
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full pointer-events-none z-20 flex items-center justify-center transition-all duration-150 ${scrubbingTime !== null ? 'bg-white/90 border-2 border-pink-500 shadow-[0_0_15px_rgba(248,0,255,0.8)] scale-[1.3]' : 'bg-pink-500/90 border border-white/50 shadow-[0_0_8px_rgba(248,0,255,0.5)] group-hover:scale-110 group-hover:bg-pink-400'}`}
                style={{ left: `calc(${duration > 0 ? ((scrubbingTime !== null ? scrubbingTime : currentTime) / duration) * 100 : 0}% - 8px)` }}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${scrubbingTime !== null ? 'bg-pink-500' : 'bg-white'}`} />
              </div>
              {hoverProgress !== null && scrubbingTime === null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white/20 border-2 border-white/40 rounded-full pointer-events-none z-10"
                  style={{ left: `calc(${hoverProgress * 100}% - 8px)` }}
                />
              )}
            </div>
            <span className="font-medium drop-shadow-sm text-pink-500/80">{formatTime(duration)}</span>
          </div>
          )}
          {radioOn && !radio.fx && radio.status === 'playing' && (
            <div className="z-10 -mt-1 text-[10px] text-slate-500 text-center">Tahle stanice nepovoluje ekvalizér ani vizualizaci</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 px-6 py-4 shrink-0 bg-gradient-to-t from-slate-950/80 to-transparent">
          <div className="flex items-center justify-between">
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
                <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                {isPlaying ? <Pause size={28} fill="currentColor" className="z-10" /> : <Play size={28} fill="currentColor" className="ml-1 z-10" />}
              </button>

              <button onClick={nextTrack} className="text-slate-300 hover:text-cyan-400 drop-shadow-md hover:drop-shadow-[0_0_8px_rgba(0,243,255,0.8)] transition-all hover:translate-x-0.5">
                <SkipForward size={26} fill="currentColor" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {isMobile && (
                <button
                  onClick={toggleEQ}
                  title="Equalizer"
                  className={`p-2 transition-all duration-300 rounded-full ${showEQ ? 'text-cyan-400 bg-cyan-400/10' : 'text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="4" width="2" height="8" rx="1" fill="currentColor"/>
                    <rect x="5" y="1" width="2" height="14" rx="1" fill="currentColor"/>
                    <rect x="9" y="3" width="2" height="10" rx="1" fill="currentColor"/>
                    <rect x="13" y="5" width="2" height="6" rx="1" fill="currentColor"/>
                  </svg>
                </button>
              )}
              {isMobile && (
                <button
                  onClick={openVisualizer}
                  title="Visualizer Studio"
                  className="p-2 transition-all duration-300 rounded-full text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10 hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]"
                >
                  <MonitorPlay size={18} />
                </button>
              )}
              <button
                onClick={cycleRepeat}
                className={`p-2 transition-all duration-300 rounded-full ${repeatMode !== 'none' ? 'text-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(0,243,255,0.4)] drop-shadow-[0_0_5px_#00f3ff]' : 'text-slate-500 hover:text-pink-500 hover:bg-pink-500/10'}`}
              >
                {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
              </button>
            </div>
          </div>

          {/* Volume Slider */}
          <div
            className="flex items-center justify-center gap-3 w-full max-w-[240px] mx-auto opacity-70 hover:opacity-100 transition-opacity py-4 -my-4"
            onWheel={(e) => {
              setVolume((v) => v + (e.deltaY < 0 ? 0.05 : -0.05));
            }}
          >
            <button onClick={toggleMute} className="text-slate-400 hover:text-cyan-400 transition-colors">
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <div
              className="flex-1 py-3 cursor-none relative group flex items-center"
              style={{ touchAction: 'none' }}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}
              onPointerLeave={() => setHoverVolume(null)}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                startDrag(e, (x) => setVolume(Math.max(0, Math.min(1, (x - rect.left) / rect.width))));
              }}
            >
              <div className="w-full h-1.5 bg-slate-900 rounded-full border border-white/5 pointer-events-none relative">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-cyan-500 transition-all pointer-events-none"
                  style={{ width: `${volume * 100}%` }}
                />
              </div>
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full pointer-events-none z-20 flex items-center justify-center transition-all duration-150 ${volume > 0 ? 'bg-cyan-400 border border-white/50 shadow-[0_0_8px_rgba(0,243,255,0.5)] group-hover:bg-cyan-300 group-hover:scale-110 group-active:bg-white/90 group-active:border-2 group-active:border-cyan-400 group-active:shadow-[0_0_15px_rgba(0,243,255,0.8)] group-active:scale-[1.3]' : 'bg-slate-700 border border-slate-500'}`}
                style={{ left: `calc(${volume * 100}% - 8px)` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white group-active:bg-cyan-500" />
              </div>
              {hoverVolume !== null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white/20 border-2 border-cyan-400/40 rounded-full pointer-events-none z-10"
                  style={{ left: `calc(${hoverVolume * 100}% - 8px)` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Uložené playlisty (místo seznamu skladeb) */}
        {showPlaylists && (
          <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border-t border-white/5">
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Playlisty</span>
              <button onClick={() => setShowPlaylists(false)} className="p-1 text-slate-500 hover:text-pink-400" aria-label="Zpět na seznam skladeb">
                <X size={14} />
              </button>
            </div>
            <PlaylistsPanel
              saved={savedPlaylists}
              currentName={currentPlaylistName}
              trackCount={tracks.length}
              onSave={savePlaylistAs}
              onLoad={(id) => { loadSavedPlaylist(id); setShowPlaylists(false); }}
              onDelete={deleteSavedPlaylist}
            />
          </div>
        )}

        {/* Rádio (místo seznamu skladeb) */}
        {showRadio && (
          <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border-t border-white/5 pt-1">
            <RadioPanel radio={radio} compact onClose={() => setShowRadio(false)} />
          </div>
        )}

        {/* Playlist */}
        <div className={`flex-1 overflow-y-auto bg-slate-900 p-2 border-t border-white/5 relative ${showPlaylists || showRadio ? 'hidden' : ''}`}>
          {currentPlaylistName && tracks.length > 0 && (
            <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.2em] text-pink-400/80 truncate">{currentPlaylistName}</div>
          )}
          {tracks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-4 p-8 text-center pt-10">
              <FolderPlus size={36} className="text-slate-700" />
              <p>Drag &amp; Drop audio files here or click below to browse</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tracks.map((track, idx) => {
                const isCurrent = currentIndex === idx;
                return (
                  <div
                    key={track.id}
                    onClick={() => playTrack(idx)}
                    className={`group px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 text-sm transition-all relative
                      ${isCurrent ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-pink-500 font-medium' : 'text-slate-300 hover:bg-white/5 border-l-2 border-transparent'}`}
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

        {/* Footer */}
        <div className="shrink-0 p-3 bg-slate-950 border-t border-white/5 flex gap-2">
          <input type="file" multiple accept={ACCEPT_AUDIO} className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <input type="file" multiple accept={ACCEPT_AUDIO} className="hidden" ref={fileInputOpenRef} onChange={handleFileOpen} />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-400 hover:shadow-[0_0_12px_rgba(0,243,255,0.2)] transition-all duration-300 text-xs font-bold uppercase tracking-[0.15em]"
          >
            <FolderPlus size={15} />
            Přidat
          </button>

          <button
            onClick={() => fileInputOpenRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-gradient-to-r from-slate-800 to-slate-900 border border-cyan-500/30 text-cyan-400 hover:border-pink-500 hover:text-pink-400 hover:shadow-[0_0_15px_rgba(248,0,255,0.3)] transition-all duration-300 text-xs font-bold uppercase tracking-[0.2em]"
          >
            <FolderOpen size={15} className="drop-shadow-[0_0_5px_currentColor]" />
            Otevřít
          </button>

          <button
            onClick={() => setShowPlaylists((v) => !v)}
            title="Uložené playlisty"
            aria-pressed={showPlaylists}
            className={`shrink-0 flex items-center justify-center px-3 rounded-md border transition-all duration-300 ${showPlaylists ? 'border-pink-500 text-pink-400 bg-pink-500/10' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-400'}`}
          >
            <Library size={16} />
          </button>

          <button
            onClick={() => setShowRadio((v) => !v)}
            title="Rádio"
            aria-pressed={showRadio}
            className={`shrink-0 flex items-center justify-center px-3 rounded-md border transition-all duration-300 ${showRadio || radioOn ? 'border-pink-500 text-pink-400 bg-pink-500/10' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-400'}`}
          >
            <RadioIcon size={16} />
          </button>
        </div>
      </div>
      {/* ── END LEFT COLUMN ── */}

      {showVisualizer && !isMobile && vizOnRight && visualizerPanel}

      {/* ── RIGHT COLUMN – EQ SIDE PANEL (telefon: přes přehrávač – vedle by byl mimo obrazovku) ── */}
      {isMobile ? (
        <div
          className={showEQ ? 'absolute inset-0 z-40 flex justify-end bg-black/60' : 'hidden'}
          onClick={(e) => { if (e.target === e.currentTarget) toggleEQ(); }}
        >
          <Equalizer audioRef={audioRef} isOpen onClose={toggleEQ} onPresetChange={setActivePreset} />
        </div>
      ) : (
        <Equalizer audioRef={audioRef} isOpen={showEQ} onClose={toggleEQ} onPresetChange={setActivePreset} />
      )}

      <audio ref={audioRef} preload="auto" className="hidden" />

      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      {/* Visualizer Studio – telefon: přes celou obrazovku */}
      {showVisualizer && isMobile && (
        <Suspense fallback={null}>
          <VisualizerStudio
            audioRef={outputRef}
            isPlaying={isPlaying}
            trackName={currentTrack?.name ?? null}
            currentTime={currentTime}
            duration={duration}
            onClose={closeVisualizer}
            volume={volume}
            onTogglePlay={togglePlay}
            onNext={nextTrack}
            onPrev={prevTrack}
            onSeek={seek}
            onVolume={setVolume}
            fullscreen={vizFullscreen}
            onFullscreen={isAndroidApp() ? setFullscreen : undefined}
            live={radioOn}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
