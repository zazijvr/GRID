// Přehrávání internetového rádia.
//
// Dva vlastní <audio> elementy (mimo přehrávač souborů):
//  - „fx“ s crossOrigin=anonymous je připojený do zvukového grafu → ekvalizér a vizualizace.
//    Funguje u stanic, které povolují CORS (většina Icecast/Shoutcast serverů).
//  - „plain“ bez grafu – záloha pro stanice bez CORS: hraje, ale bez ekvalizéru a vizualizace
//    (prohlížeč by přes graf pustil jen ticho).
// Živý stream se po pauze nenavazuje (hrál by se starý kus) – pokračování stanici načte znovu.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureAudioGraph, getAudioGraph, muteNow, restoreVolume } from '../audio/audioGraph';
import { reportClick, streamUrl, type SavedStation, type Station } from './radioBrowser';

export type RadioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

const FAVS_KEY = 'zvr-grid-radio-favs';

const toSaved = (s: Station | SavedStation): SavedStation => ({
  stationuuid: s.stationuuid, name: s.name.trim(), url_resolved: s.url_resolved, url: s.url, favicon: s.favicon,
  country: s.country, countrycode: s.countrycode, tags: s.tags, codec: s.codec, bitrate: s.bitrate, hls: s.hls,
});

const readFavs = (): SavedStation[] => {
  try {
    const v = JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => s && typeof s.stationuuid === 'string' && typeof s.name === 'string') : [];
  } catch {
    return [];
  }
};

const unload = (el: HTMLAudioElement) => {
  el.pause();
  el.removeAttribute('src');
  el.load();
};

export function useRadio({ volume, onStart }: { volume: number; onStart: () => void }) {
  const fxRef = useRef<HTMLAudioElement | null>(null);
  const plainRef = useRef<HTMLAudioElement | null>(null);
  /** Element, který právě hraje rádio (null = rádio vypnuté) – čte ho vizualizace a ekvalizér */
  const activeElRef = useRef<HTMLAudioElement | null>(null);
  const token = useRef(0);
  const queueRef = useRef<SavedStation[]>([]);
  const stationRef = useRef<SavedStation | null>(null);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  const [station, setStation] = useState<SavedStation | null>(null);
  const [status, setStatus] = useState<RadioStatus>('idle');
  /** Stanice jde přes zvukový graf (ekvalizér + vizualizace) */
  const [fx, setFx] = useState(true);
  const [favourites, setFavourites] = useState<SavedStation[]>(readFavs);

  const els = () => {
    if (!fxRef.current) {
      const fxEl = new Audio();
      fxEl.crossOrigin = 'anonymous';
      fxEl.preload = 'none';
      const plainEl = new Audio();
      plainEl.preload = 'none';
      for (const el of [fxEl, plainEl]) {
        // Události jen z elementu, který právě hraje
        el.addEventListener('waiting', () => { if (activeElRef.current === el) setStatus('loading'); });
        el.addEventListener('playing', () => { if (activeElRef.current === el) setStatus('playing'); });
        // Pauza zvenku (Android: hovor, jiná aplikace převzala zvuk)
        el.addEventListener('pause', () => { if (activeElRef.current === el && el.getAttribute('src')) setStatus((s) => (s === 'error' ? s : 'paused')); });
        el.addEventListener('error', () => { if (activeElRef.current === el && el.getAttribute('src')) setStatus('error'); });
      }
      fxRef.current = fxEl;
      plainRef.current = plainEl;
    }
    return { fxEl: fxRef.current!, plainEl: plainRef.current! };
  };

  // Hlasitost záložního elementu (graf má hlasitost v gainu – nastavuje ji přehrávač)
  useEffect(() => {
    if (plainRef.current) plainRef.current.volume = volume;
  }, [volume]);

  /** Spustí stanici; queue = seznam, ve kterém se pak přepíná dopředu / dozadu */
  const play = useCallback(async (s: Station | SavedStation, queue?: (Station | SavedStation)[]) => {
    const st = toSaved(s);
    if (queue) queueRef.current = queue.map(toSaved);
    const t = ++token.current;
    onStartRef.current();
    stationRef.current = st;
    setStation(st);
    setStatus('loading');

    const { fxEl, plainEl } = els();
    unload(plainEl);
    const url = streamUrl(st);

    // 1) Přes zvukový graf (CORS) – ekvalizér a vizualizace
    const graph = ensureAudioGraph(fxEl);
    activeElRef.current = fxEl;
    fxEl.src = url;
    try {
      if (graph) restoreVolume(graph);
      await fxEl.play();
      if (t !== token.current) return;
      setFx(!!graph);
      setStatus('playing');
      reportClick(st.stationuuid);
      return;
    } catch (e) {
      if (t !== token.current) return;
      if ((e as DOMException)?.name === 'AbortError') return;
      unload(fxEl);
    }

    // 2) Bez CORS – hraje, ale bez ekvalizéru a vizualizace
    activeElRef.current = plainEl;
    setStatus('loading');
    plainEl.volume = volume;
    plainEl.src = url;
    try {
      await plainEl.play();
      if (t !== token.current) return;
      setFx(false);
      setStatus('playing');
      reportClick(st.stationuuid);
    } catch (e) {
      if (t !== token.current) return;
      console.warn(`Stanici „${st.name}“ nejde přehrát`, e);
      unload(plainEl);
      setStatus('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hlasitost jen při spuštění (dál ji řídí efekt)
  }, []);

  const pause = useCallback(() => {
    const el = activeElRef.current;
    token.current++;
    if (el) {
      const graph = getAudioGraph(el);
      if (graph) muteNow(graph);
      el.pause();
    }
    setStatus('paused');
  }, []);

  const toggle = useCallback(() => {
    const st = stationRef.current;
    if (!st) return;
    if (status === 'playing' || status === 'loading') pause();
    else play(st); // živé vysílání: znovu načíst (ne navazovat na starý kus)
  }, [status, pause, play]);

  /** Vypne rádio (přehrávač souborů převezme ovládání) */
  const stop = useCallback(() => {
    token.current++;
    if (fxRef.current) unload(fxRef.current);
    if (plainRef.current) unload(plainRef.current);
    activeElRef.current = null;
    stationRef.current = null;
    setStation(null);
    setStatus('idle');
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    const q = queueRef.current;
    const st = stationRef.current;
    if (!st || q.length < 2) return;
    const i = q.findIndex((x) => x.stationuuid === st.stationuuid);
    play(q[((i < 0 ? 0 : i + dir) + q.length) % q.length]);
  }, [play]);
  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const isFav = useCallback((uuid: string) => favourites.some((f) => f.stationuuid === uuid), [favourites]);
  const toggleFav = useCallback((s: Station | SavedStation) => {
    setFavourites((list) => {
      const nextList = list.some((f) => f.stationuuid === s.stationuuid)
        ? list.filter((f) => f.stationuuid !== s.stationuuid)
        : [...list, toSaved(s)];
      try { localStorage.setItem(FAVS_KEY, JSON.stringify(nextList)); } catch { /* jen se nezapamatuje */ }
      return nextList;
    });
  }, []);

  return {
    station,
    status,
    isPlaying: status === 'playing' || status === 'loading',
    fx,
    play,
    pause,
    toggle,
    stop,
    next,
    prev,
    favourites,
    isFav,
    toggleFav,
    activeElRef,
  };
}

export type Radio = ReturnType<typeof useRadio>;
