import { useState, useRef, useEffect, useCallback } from 'react';
import { ensureAudioGraph, fadeOut, getAudioGraph, muteNow, restoreVolume, setGraphVolume, waitForDrain } from '../audio/audioGraph';
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
  /** O kolik je currentTime napřed před slyšeným zvukem (s) – WebKitGTK dekóduje ~1 s dopředu.
   *  Měří se při každé pauze (jak dlouho ještě teče zvuk); jinde (Windows) vyjde ~0. */
  const lagRef = useRef(0);
  /** Pozice v okamžiku pauzy – při pokračování se vrátí o lagRef (ztlumené zbytky nikdo neslyšel) */
  const pausedAtRef = useRef<number | null>(null);
  /** Připravené data: URL (aktuální a následující skladba) – přepnutí bez čekání na převod */
  const urlCache = useRef(new Map<string, Promise<string>>());

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

  /** data: URL skladby – z mezipaměti, nebo převodem souboru */
  const trackUrl = useCallback((id: string): Promise<string> => {
    const cache = urlCache.current;
    let p = cache.get(id);
    if (!p) {
      p = (async () => {
        const blob = sessionFiles.current.get(id) ?? (await getBlob(id));
        if (!blob) throw new Error('Soubor skladby chybí');
        return blobToDataUrl(blob);
      })();
      p.catch(() => cache.delete(id));
      cache.set(id, p);
    }
    return p;
  }, []);

  /** Dopředu připraví následující skladbu; v paměti drží jen aktuální a příští (data: URL jsou velké) */
  const prefetchNext = useCallback((index: number) => {
    const list = tracksRef.current;
    const keep = new Set([list[index]?.id]);
    if (!shuffleRef.current && list.length > 1) {
      const next = index + 1 < list.length ? index + 1 : repeatModeRef.current === 'all' ? 0 : -1;
      if (next >= 0) {
        keep.add(list[next].id);
        // Až po rozběhnutí aktuální skladby – převod nesmí zdržet start
        setTimeout(() => { trackUrl(list[next].id).catch(() => {}); }, 1500);
      }
    }
    for (const id of urlCache.current.keys()) if (!keep.has(id)) urlCache.current.delete(id);
  }, [trackUrl]);

  /** Načte skladbu a (volitelně) spustí. Bezpečné při rychlém přeskakování. */
  const loadAndPlay = useCallback(async (index: number, shouldPlay = true) => {
    const audio = audioRef.current;
    const track = tracksRef.current[index];
    if (!audio || !track) return;

    const token = ++loadToken.current;
    pausedAtRef.current = null;
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
      url = await trackUrl(track.id);
    } catch (e) {
      console.warn(`Skladbu „${track.name}“ nejde načíst`, e);
      if (token === loadToken.current) setIsPlaying(false);
      return;
    }
    if (token !== loadToken.current) return;

    audio.src = url;
    audio.load();
    prefetchNext(index);
    if (!shouldPlay) return;
    if (graph) restoreVolume(graph);
    audio.play().catch((e) => {
      if (token !== loadToken.current) return;
      console.warn('Přehrání se nepodařilo', e);
      setIsPlaying(false);
    });
  }, [commitIndex, trackUrl, prefetchNext]);

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
    // Zobrazuje se slyšená pozice (currentTime je o rezervu napřed)
    const onTimeUpdate = () => {
      setCurrentTime(Math.max(0, audio.currentTime - (getAudioGraph(audio) ? lagRef.current : 0)));
      syncDuration();
    };
    const onEnded = async () => {
      // Konec hlásí přehrávač, když je v rezervě ještě ~1 s zvuku; přepnutí skladby by ji zahodilo
      // (každé skladbě by chyběl konec) – nejdřív nechat dohrát
      const graph = getAudioGraph(audio);
      if (graph) {
        const token = loadToken.current;
        await waitForDrain(graph, 2500);
        if (token !== loadToken.current) return; // mezitím uživatel přepnul / spustil něco jiného
      }
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
    urlCache.current.clear();
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
      const graph = ensureAudioGraph(audio);
      // Ztlumený zbytek rezervy se při pauze neslyšel → vrátit se o něj, ať nic nepřeskočí
      if (graph && pausedAtRef.current !== null && Math.abs(audio.currentTime - pausedAtRef.current) < 0.05 && lagRef.current > 0.05) {
        audio.currentTime = Math.max(0, pausedAtRef.current - lagRef.current);
      }
      pausedAtRef.current = null;
      if (graph) restoreVolume(graph);
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.warn('Přehrání se nepodařilo', e));
      setIsPlaying(true);
    } else {
      // Pauza okamžitě: ztlumit konec řetězce (rezerva by jinak ještě ~1 s hrála) a změřit rezervu
      const graph = getAudioGraph(audio);
      if (graph) muteNow(graph);
      pausedAtRef.current = audio.currentTime;
      audio.pause();
      setIsPlaying(false);
      if (graph) {
        waitForDrain(graph, 2500).then((ms) => {
          if (ms > 30 && ms < 2400) lagRef.current = ms / 1000;
        });
      }
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
    pausedAtRef.current = null; // posun zahodí rezervu – při pokračování se už nevrací
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
