// Katalog internetových rádií Radio Browser (radio-browser.info) – otevřená komunitní databáze
// desítek tisíc stanic z celého světa, bez klíče a registrace. Servery jsou v EU (Německo, Finsko).
// Posíláme jen hledaný text a filtry – žádné údaje o uživateli.

export interface Station {
  stationuuid: string;
  name: string;
  url_resolved: string;
  url: string;
  favicon: string;
  homepage: string;
  country: string;
  countrycode: string;
  tags: string;
  codec: string;
  bitrate: number;
  hls: number;
  votes: number;
  clickcount: number;
}

/** Jen to, co si pamatujeme u oblíbených (bez zbytečných údajů) */
export type SavedStation = Pick<Station, 'stationuuid' | 'name' | 'url_resolved' | 'url' | 'favicon' | 'country' | 'countrycode' | 'tags' | 'codec' | 'bitrate' | 'hls'>;

export interface Country { code: string; name: string; count: number }

const SERVERS = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
let preferred = 0;

/** GET na katalog; když server neodpoví, zkusí další */
async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < SERVERS.length; i++) {
    const idx = (preferred + i) % SERVERS.length;
    try {
      // Časový limit ručně (AbortSignal.any/timeout starší WebKitGTK nemá)
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort);
      let res: Response;
      try {
        res = await fetch(SERVERS[idx] + path, { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      preferred = idx;
      return (await res.json()) as T;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

/** HLS (.m3u8) přehrávače na počítači neumí – takové stanice nenabízíme */
const playable = (s: Station) => !s.hls && !!(s.url_resolved || s.url);

export interface SearchParams {
  name?: string;
  countrycode?: string;
  tag?: string;
  offset?: number;
  limit?: number;
}

export async function searchStations(p: SearchParams, signal?: AbortSignal): Promise<Station[]> {
  const q = new URLSearchParams({
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    limit: String(p.limit ?? 40),
    offset: String(p.offset ?? 0),
  });
  if (p.name?.trim()) q.set('name', p.name.trim());
  if (p.countrycode) q.set('countrycode', p.countrycode);
  if (p.tag) { q.set('tag', p.tag); q.set('tagExact', 'false'); }
  const list = await api<Station[]>(`/json/stations/search?${q}`, signal);
  // Katalog obsahuje i duplicitní záznamy téže stanice – stejný název + adresa jen jednou
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = `${s.name.trim().toLowerCase()}|${s.url_resolved}`;
    if (!playable(s) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let countriesCache: Promise<Country[]> | null = null;
/** Všechny země s počtem stanic, s českými názvy, seřazené podle abecedy */
export function getCountries(): Promise<Country[]> {
  if (!countriesCache) {
    const names = new Intl.DisplayNames(['cs'], { type: 'region' });
    countriesCache = api<{ name: string; iso_3166_1: string; stationcount: number }[]>('/json/countries?hidebroken=true')
      .then((list) => list
        .filter((c) => /^[A-Z]{2}$/.test(c.iso_3166_1) && c.stationcount > 0)
        .map((c) => {
          let name = c.name;
          try { name = names.of(c.iso_3166_1) ?? c.name; } catch { /* neznámý kód – anglický název */ }
          return { code: c.iso_3166_1, name, count: c.stationcount };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'cs')));
    countriesCache.catch(() => { countriesCache = null; });
  }
  return countriesCache;
}

/** Katalog doporučuje hlásit spuštění stanice (řadí podle toho oblíbenost) – jen ID stanice */
export function reportClick(uuid: string) {
  api(`/json/url/${encodeURIComponent(uuid)}`).catch(() => {});
}

export const streamUrl = (s: Pick<Station, 'url_resolved' | 'url'>) => s.url_resolved || s.url;

/** Žánry pro rychlý výběr (štítky v katalogu jsou anglicky) */
export const GENRES: { tag: string; label: string }[] = [
  { tag: 'pop', label: 'Pop' },
  { tag: 'rock', label: 'Rock' },
  { tag: 'dance', label: 'Dance' },
  { tag: 'electronic', label: 'Elektronická' },
  { tag: 'hip hop', label: 'Hip hop' },
  { tag: 'oldies', label: 'Oldies' },
  { tag: 'jazz', label: 'Jazz' },
  { tag: 'classical', label: 'Klasika' },
  { tag: 'country', label: 'Country' },
  { tag: 'metal', label: 'Metal' },
  { tag: 'chillout', label: 'Chill' },
  { tag: 'news', label: 'Zprávy' },
  { tag: 'talk', label: 'Mluvené slovo' },
  { tag: 'kids', label: 'Pro děti' },
];
