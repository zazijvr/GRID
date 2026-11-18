import { useState, useRef, useEffect, useCallback } from 'react';
import { ensureAudioGraph, fadeOut, getAudioGraph, restoreVolume, setGraphVolume } from '../audio/audioGraph';
import {
  blobToDataUrl, clearBlobs, deleteBlobs, getBlob, loadPlaylist, putBlobs, saveOrder, type TrackMeta,
} from '../audio/trackStore';

export type Track = TrackMeta;
export type RepeatMode = 'none' | 'all' | 'one';

// Jen zvukové soubory (playlisty .m3u/.pls nejsou zvuk – přehrát je nejde)
const AUDIO_EXT = /\.(wav|mp3|flac|ogg|oga|opus|m4a|aac|wma|weba|webm)$/i;
const PLAYLIST_EXT = /\.(m3u8?|pls|xspf|cue)$/i;
const isAudioFile = (f: File) =>
  !PLAYLIST_EXT.test(f.name) && !/mpegurl|scpls|xspf/i.test(f.type) && (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));

const VOLUME_KEY = 'zvr-grid-volume';
const readVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
};

/** Délka přechodu mezi skladbami (ztlumení před přepnutím) */
const FADE_MS = 55;

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolumeState] = useState(readVolume);
  const [isLoaded, setIsLoaded] = useState(false);

  // Aktuální hodnoty pro posluchače událostí (bez opakované registrace)
  const tracksRef = useRef<Track[]>([]);
  const currentIndexRef = useRef(-1);
  const repeatModeRef = useRef<RepeatMode>('none');
  const shuffleRef = useRef(false);
  const previousVolumeRef = useRef(volume || 1);
  /** Soubory přidané v tomto spuštění – hrají i kdyby se je nepodařilo uložit (plné úložiště) */
  const sessionFiles = useRef(new Map<string, Blob>());
  /** Číslo posledního požadavku na načtení – starší (rychlé přeskakování) se zahodí */
  const loadToken = useRef(0);

  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  const commitTracks = useCallback((next: Track[]) => {
    tracksRef.current = next;
    setTracks(next);
  }, []);

  const commitIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
  }, []);

  // Playlist z minula
  useEffect(() => {
    loadPlaylist().then((saved) => {
      if (saved.length > 0) commitTracks(saved);
      setIsLoaded(true);
    });
  }, [commitTracks]);

  // Ukládá se jen pořadí a názvy (soubory se uloží jednou při přidání)
  useEffect(() => {
    if (isLoaded) saveOrder(tracks);
  }, [tracks, isLoaded]);

  // Hlasitost: na začátku a po každé změně (gain grafu, dokud neexistuje element.volume)
  useEffect(() => {
    setGraphVolume(audioRef.current, volume);
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* jen se nezapamatuje */ }
  }, [volume]);

  const stopAudio = useCallback(() => {
    loadToken.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  /** Načte skladbu a (volitelně) spustí. Bezpečné při rychlém přeskakování. */
  const loadAndPlay = useCallback(async (index: number, shouldPlay = true) => {
    const audio = audioRef.current;
    const track = tracksRef.current[index];
    if (!audio || !track) return;

    const token = ++loadToken.current;
    commitIndex(index);
    setCurrentTime(0);
    setDuration(0);
    if (shouldPlay) setIsPlaying(true);

    const graph = shouldPlay ? ensureAudioGraph(audio) : getAudioGraph(audio);

    // Hraje-li něco, nejdřív plynule ztlumit (bez lupnutí), pak teprve zastavit
    if (graph && !audio.paused) {
      fadeOut(graph);
      await new Promise((r) => setTimeout(r, FADE_MS));
      if (token !== loadToken.current) return;
    }
    audio.pause();

    let url: string;
    try {
      const blob = sessionFiles.current.get(track.id) ?? (await getBlob(track.id));
      if (!blob) throw new Error('Soubor skladby chybí');
      url = await blobToDataUrl(blob);
    } catch (e) {
      console.warn(`Skladbu „${track.name}“ nejde načíst`, e);
      if (token === loadToken.current) setIsPlaying(false);
      return;
    }
    if (token !== loadToken.current) return;

    audio.src = url;
    audio.load();
    if (!shouldPlay) return;
    if (graph) restoreVolume(graph);
    audio.play().catch((e) => {
      if (token !== loadToken.current) return;
      console.warn('Přehrání se nepodařilo', e);
      setIsPlaying(false);
    });
  }, [commitIndex]);

  /** Index další skladby (shuffle / konec playlistu podle opakování); null = konec */
  const pickNext = useCallback((): number | null => {
    const list = tracksRef.current;
    const curr = currentIndexRef.current;
    if (list.length === 0) return null;
    if (shuffleRef.current && list.length > 1) {
      let next = curr;
      while (next === curr) next = Math.floor(Math.random() * list.length);
      return next;
    }
    if (curr + 1 < list.length) return curr + 1;
    return repeatModeRef.current === 'all' ? 0 : null;
  }, []);

  // Posluchače <audio> – jednou
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    // GStreamer (Linux) hlásí u data: URL zpočátku délku Infinity – doplní se později
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      syncDuration();
    };
    const onEnded = () => {
      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
        return;
      }
      const next = pickNext();
      if (next === null) {
        setIsPlaying(false);
        audio.currentTime = 0;
        return;
      }
      loadAndPlay(next, true);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, [loadAndPlay, pickNext]);

  // ───────── Veřejné API ─────────

  /** Soubory → skladby; uloží je (jednou) do IndexedDB */
  const importFiles = async (files: File[]): Promise<Track[]> => {
    const audioFiles = files.filter(isAudioFile);
    const added = audioFiles.map((f) => ({ id: crypto.randomUUID(), name: f.name.replace(/\.[^/.]+$/, ''), file: f }));
    for (const a of added) sessionFiles.current.set(a.id, a.file);
    try {
      await putBlobs(added.map((a) => ({ id: a.id, blob: a.file })));
    } catch (e) {
      // Plné úložiště apod. – hrát půjdou, jen nebudou po restartu
      console.warn('Skladby se nepodařilo uložit pro příští spuštění', e);
    }
    return added.map(({ id, name }) => ({ id, name }));
  };

  /** Přidá soubory na konec playlistu (prázdný playlist rovnou spustí) */
  const addFiles = async (files: File[]) => {
    const added = await importFiles(files);
    if (added.length === 0) return;
    const wasEmpty = tracksRef.current.length === 0;
    commitTracks([...tracksRef.current, ...added]);
    if (wasEmpty) loadAndPlay(0, true);
  };

  /** Nahradí celý playlist novými soubory (tlačítko „Otevřít“) */
  const openFiles = async (files: File[]) => {
    if (!files.some(isAudioFile)) return;
    stopAudio();
    sessionFiles.current.clear();
    await clearBlobs();
    const added = await importFiles(files);
    commitTracks(added);
    commitIndex(-1);
    if (added.length > 0) loadAndPlay(0, true);
  };

  const playTrack = (index: number) => loadAndPlay(index, true);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || tracksRef.current.length === 0) return;

    if (currentIndexRef.current === -1 || !audio.currentSrc) {
      const start = currentIndexRef.current >= 0
        ? currentIndexRef.current
        : shuffleRef.current ? Math.floor(Math.random() * tracksRef.current.length) : 0;
      loadAndPlay(start, true);
      return;
    }
    if (audio.paused) {
      ensureAudioGraph(audio);
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn('Přehrání se nepodařilo', e));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const nextTrack = () => {
    const next = pickNext();
    if (next !== null) {
      loadAndPlay(next, true);
      return;
    }
    // Konec playlistu bez opakování – zastavit na začátku skladby
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
  };

  const prevTrack = () => {
    const audio = audioRef.current;
    const list = tracksRef.current;
    const curr = currentIndexRef.current;
    if (!audio || list.length === 0) return;
    // Hraje-li skladba déle než 2 s, nejdřív zpět na její začátek
    if (audio.currentTime > 2 || (curr <= 0 && repeatModeRef.current !== 'all')) {
      audio.currentTime = 0;
      return;
    }
    loadAndPlay(curr <= 0 ? list.length - 1 : curr - 1, true);
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const cycleRepeat = () => setRepeatMode((p) => (p === 'none' ? 'all' : p === 'all' ? 'one' : 'none'));
  const toggleShuffle = () => setShuffle((p) => !p);

  const removeTrack = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const list = tracksRef.current;
    const removed = list[index];
    if (!removed) return;

    const next = list.filter((_, i) => i !== index);
    const curr = currentIndexRef.current;
    commitTracks(next);
    sessionFiles.current.delete(removed.id);
    deleteBlobs([removed.id]);

    if (index === curr) {
      if (next.length === 0) {
        stopAudio();
        commitIndex(-1);
      } else {
        const wasPlaying = !audioRef.current?.paused;
        loadAndPlay(Math.min(index, next.length - 1), wasPlaying);
      }
    } else if (index < curr) {
      commitIndex(curr - 1);
    }
  };

  /** Hlasitost 0–1, nebo funkce z předchozí hodnoty (kolečko myši – víc událostí za sebou) */
  const setVolume = useCallback((val: number | ((prev: number) => number)) => {
    setVolumeState((prev) => {
      const v = Math.max(0, Math.min(1, Math.round((typeof val === 'function' ? val(prev) : val) * 100) / 100));
      if (v > 0) previousVolumeRef.current = v;
      return v;
    });
  }, []);

  const isMuted = volume === 0;
  const toggleMute = useCallback(() => {
    setVolume(isMuted ? previousVolumeRef.current || 1 : 0);
  }, [isMuted, setVolume]);

  return {
    tracks,
    currentTrack: tracks[currentIndex] ?? null,
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
    volume,
    setVolume,
    isMuted,
    toggleMute,
    audioRef,
  };
}
