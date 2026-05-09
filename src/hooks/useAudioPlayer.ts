import { useState, useRef, useEffect, useCallback } from 'react';

export type Track = {
  id: string;
  name: string;
  file: File;
  url: string;
};

export type RepeatMode = 'none' | 'all' | 'one';

const DB_NAME = 'zvr-grid-db';
const STORE_NAME = 'playlist';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function savePlaylist(tracks: Track[]) {
  openDB().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const dataToSave = tracks.map(t => ({ id: t.id, name: t.name, url: t.url }));
    store.put(dataToSave, 'tracks');
  }).catch(e => console.warn("Failed to save playlist", e));
}

function loadPlaylist(): Promise<Track[]> {
  return openDB().then(db => {
    return new Promise<Track[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('tracks');
      request.onsuccess = () => {
        if (request.result) {
          const recovered = request.result.map((t: any) => ({
            id: t.id,
            name: t.name,
            url: t.url,
            file: new File([], t.name, { type: 'audio/mpeg' }) 
          }));
          resolve(recovered);
        } else {
          resolve([]);
        }
      };
      request.onerror = () => resolve([]);
    });
  }).catch(e => {
    console.warn("Failed to load playlist", e);
    return [];
  });
}

export function useAudioPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const previousVolumeRef = useRef<number>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Refs pro přístup k aktuálním hodnotám uvnitř event listenerů
  // bez nutnosti re-registrovat listenery při každé změně stavu
  const tracksRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const repeatModeRef = useRef<RepeatMode>('none');
  const shuffleRef = useRef<boolean>(false);

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadPlaylist().then(savedTracks => {
      if (savedTracks && savedTracks.length > 0) {
        setTracks(savedTracks);
        tracksRef.current = savedTracks;
      }
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => { 
    tracksRef.current = tracks; 
    if (isLoaded) {
      savePlaylist(tracks);
    }
  }, [tracks, isLoaded]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  const setVolume = useCallback((val: number) => {
    setVolumeState(val);
    if (val > 0) {
      previousVolumeRef.current = val;
      setIsMuted(false);
    } else {
      setIsMuted(true);
    }
    if (audioRef.current) {
      audioRef.current.volume = val;
      // @ts-expect-error
      if (audioRef.current.__gainNode) {
        // @ts-expect-error
        audioRef.current.__gainNode.gain.value = val;
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted || volume === 0) {
      const prevVol = previousVolumeRef.current > 0 ? previousVolumeRef.current : 1;
      setVolume(prevVol);
    } else {
      previousVolumeRef.current = volume;
      setVolume(0);
    }
  }, [isMuted, volume, setVolume]);

  // --- Funkce přímého ovládání audia (imperativní, ne přes useState) ---

  const loadAndPlay = useCallback((index: number, shouldPlay = true) => {
    const audio = audioRef.current;
    const tracks = tracksRef.current;
    if (!audio || index < 0 || index >= tracks.length) return;

    const track = tracks[index];
    currentIndexRef.current = index;

    // Okamžitě resetuj UI pozici – zabrání vizuálnímu skoku na starou pozici
    setCurrentTime(0);
    setDuration(0);

    // Odstranit staré listenery 'canplay' aby nedošlo k vícenásobnému spuštění
    const onCanPlay = () => {
      audio.removeEventListener('canplay', onCanPlay);
      if (shouldPlay) {
        audio.play().catch(e => console.error('Playback error:', e));
      }
    };

    audio.addEventListener('canplay', onCanPlay);
    audio.src = track.url;
    audio.load();
  }, []);

  const playAtIndex = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
    loadAndPlay(index, true);
  }, [loadAndPlay]);

  // Inicializace DOM audio elementu – event listenery zaregistrovat jen 1x
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Pokud GStreamer (Linux) nahlásil u base64 stringu zpočátku Infinity,
      // obvykle na to přijde po několika frejmech bufferování. Tímto se to
      // opožděně propíše do UI hned, jak to WebKit pochopí.
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(prev => prev !== audio.duration ? audio.duration : prev);
      }
    };
    const onLoadedMetadata = () => {
      console.log('[Audio] loadedmetadata – duration:', audio.duration, 'currentTime:', audio.currentTime);
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };
    const onCanPlay = () => console.log('[Audio] canplay – currentTime:', audio.currentTime);
    const onSeeked = () => console.log('[Audio] seeked – currentTime:', audio.currentTime);
    const onPlay = () => console.log('[Audio] play event');
    const onPause = () => console.log('[Audio] pause event');
    const onSeeking = () => console.log('[Audio] SEEKING – to:', audio.currentTime);
    const onEnded = () => {
      const tracks = tracksRef.current;
      const currIdx = currentIndexRef.current;
      const repeat = repeatModeRef.current;
      const doShuffle = shuffleRef.current;

      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
        return;
      }

      let nextIdx: number;
      if (doShuffle && tracks.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * tracks.length);
        } while (nextIdx === currIdx);
      } else {
        nextIdx = currIdx + 1;
        if (nextIdx >= tracks.length) {
          if (repeat === 'all') {
            nextIdx = 0;
          } else {
            setIsPlaying(false);
            audio.currentTime = 0;
            return;
          }
        }
      }
      setCurrentIndex(nextIdx);
      setIsPlaying(true);
      loadAndPlay(nextIdx, true);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [loadAndPlay]);

  // --- Veřejné API (pro UI) ---

  const addFiles = async (files: File[]) => {
    const audioFiles = files.filter(f => 
      f.type.startsWith('audio/') || 
      f.name.toLowerCase().match(/\.(wav|mp3|flac|ogg|m4a|aac|wma|pls|m3u|m3u8|speex)$/)
    );

    const newTracksPromises = audioFiles.map(async (f) => {
      // Čteme soubor jako base64 Data URI – GStreamer má
      // problémy se streamováním blob: URL přes WebKitGTK range requests.
      // Data URI je načtena jako celek, bez potřeby HTTP range → žádné stutter.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      return {
        id: crypto.randomUUID(),
        name: f.name.replace(/\.[^/.]+$/, ''),
        file: f,
        url: dataUrl,
      };
    });

    const newTracks = await Promise.all(newTracksPromises);

    setTracks(prev => {
      const combined = [...prev, ...newTracks];
      tracksRef.current = combined;
      if (prev.length === 0 && combined.length > 0) {
        setTimeout(() => playAtIndex(0), 0);
      }
      return combined;
    });
  };

  // Vymaže celý playlist a načte nové soubory (pro tlačítko "Otevřít")
  const openFiles = async (files: File[]) => {
    console.log('[openFiles] Zpracovávám novou složku:', files.length, 'souborů');
    
    // Filtrujeme audio soubory
    const audioFiles = files.filter(f => 
      f.type.startsWith('audio/') || 
      f.name.toLowerCase().match(/\.(wav|mp3|flac|ogg|m4a|aac|wma|pls|m3u|m3u8|speex)$/)
    );
    if (audioFiles.length === 0) {
      console.warn('[openFiles] Nebyly nalezeny žádné validní audio soubory.');
      return;
    }

    // Čteme jako Data URI
    const newTracksPromises = audioFiles.map(async (f) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      return {
        id: crypto.randomUUID(),
        name: f.name.replace(/\.[^/.]+$/, ''),
        file: f,
        url: dataUrl,
      };
    });

    const newTracks = await Promise.all(newTracksPromises);
    console.log('[openFiles] Načteno!', newTracks.length, 'stop.');

    // Zastavíme stávající přehrávání
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }

    // Okamžitě nastavíme Refs pro imperativní manipulaci (nečekáme na React)
    tracksRef.current = newTracks;
    currentIndexRef.current = 0;

    // Aktualizujeme React stav čistě pro UI
    setTracks(newTracks);
    setCurrentTime(0);
    setDuration(0);
    setCurrentIndex(0);
    setIsPlaying(true);
    
    // Okamžitě načteme a spustíme - loadAndPlay používá jen tracksRef.current
    loadAndPlay(0, true);
  };

  const playTrack = (index: number) => playAtIndex(index);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || tracksRef.current.length === 0) return;

    if (currentIndexRef.current === -1) {
      if (shuffleRef.current) {
        playAtIndex(Math.floor(Math.random() * tracksRef.current.length));
      } else {
        playAtIndex(0);
      }
      return;
    }

    if (audio.paused) {
      audio.play().catch(e => console.error('Playback error:', e));
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const nextTrack = useCallback(() => {
    const tracks = tracksRef.current;
    const currIdx = currentIndexRef.current;
    if (tracks.length === 0) return;

    let nextIdx = 0;

    if (shuffleRef.current && tracks.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * tracks.length);
      } while (nextIdx === currIdx);
    } else {
      nextIdx = currIdx + 1;
      if (nextIdx >= tracks.length) {
        if (repeatModeRef.current === 'all') {
          nextIdx = 0;
        } else {
          // Nakonec playlistu nepřehráváme dál
          setIsPlaying(false);
          const audio = audioRef.current;
          if (audio) {
            audio.pause();
            audio.currentTime = 0;
          }
          return;
        }
      }
    }

    setCurrentIndex(nextIdx);
    setIsPlaying(true);
    loadAndPlay(nextIdx, true);
  }, [loadAndPlay]);

  const prevTrack = () => {
    const audio = audioRef.current;
    const tracks = tracksRef.current;
    const currIdx = currentIndexRef.current;
    if (!audio || tracks.length === 0) return;

    // Vrátit na začátek aktuálně přehrávané skladby (pokud hraje déle než 2 vteřiny)
    if (audio.currentTime > 2) {
      audio.currentTime = 0;
      return;
    }

    // Jinak přepínáme na předchozí skladbu
    const prevIdx = currIdx - 1 < 0
      ? (repeatModeRef.current === 'all' ? tracks.length - 1 : 0)
      : currIdx - 1;

    // Odchyt pro začátek playlistu, pokud není repeat=all
    if (currIdx - 1 < 0 && repeatModeRef.current !== 'all') {
      audio.currentTime = 0;
      return;
    }

    setCurrentIndex(prevIdx);
    setIsPlaying(true);
    loadAndPlay(prevIdx, true);
  };

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const cycleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  };

  const toggleShuffle = () => setShuffle(p => !p);

  const removeTrack = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();

    setTracks(prev => {
      const newTracks = [...prev];
      const url = newTracks[index].url;
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      newTracks.splice(index, 1);
      tracksRef.current = newTracks;

      const currIdx = currentIndexRef.current;

      if (index === currIdx) {
        if (newTracks.length === 0) {
          const audio = audioRef.current;
          if (audio) { audio.pause(); audio.src = ''; }
          setIsPlaying(false);
          setCurrentIndex(-1);
          currentIndexRef.current = -1;
        } else {
          const nextIdx = index >= newTracks.length ? newTracks.length - 1 : index;
          setCurrentIndex(nextIdx);
          setTimeout(() => loadAndPlay(nextIdx, true), 0);
        }
      } else if (index < currIdx) {
        setCurrentIndex(currIdx - 1);
        currentIndexRef.current = currIdx - 1;
      }

      return newTracks;
    });
  };

  return {
    tracks,
    currentTrack: currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null,
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
