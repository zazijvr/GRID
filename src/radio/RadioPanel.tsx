// Rádio: hledání v katalogu stanic (název, země, žánr) a oblíbené stanice.
// Stejný panel na počítači (místo seznamu skladeb) i na telefonu (vysouvací panel).
import { useEffect, useRef, useState } from 'react';
import { Loader2, Radio as RadioIcon, Search, Square, Star, X } from 'lucide-react';
import { GENRES, getCountries, searchStations, type Country, type SavedStation, type Station } from './radioBrowser';
import type { Radio } from './useRadio';

const COUNTRY_KEY = 'zvr-grid-radio-country';
const PAGE = 40;
const PINNED = ['CZ', 'SK'];

const readCountry = () => {
  try { return localStorage.getItem(COUNTRY_KEY) ?? 'CZ'; } catch { return 'CZ'; }
};

/** Logo stanice; když se nenačte (nebo chybí), neonová ikona rádia */
function StationLogo({ src, active }: { src: string; active: boolean }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  return (
    <div className={`w-9 h-9 shrink-0 rounded-lg overflow-hidden flex items-center justify-center border ${active ? 'border-pink-500/60 bg-pink-500/10' : 'border-white/10 bg-slate-950'}`}>
      {failed ? (
        <RadioIcon size={16} className={active ? 'text-pink-400' : 'text-cyan-400/60'} />
      ) : (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} className="w-full h-full object-contain bg-white/5" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

const meta = (s: SavedStation) => {
  const tags = s.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2).join(', ');
  const quality = [s.codec, s.bitrate > 0 ? `${s.bitrate} kb/s` : ''].filter(Boolean).join(' ');
  return [s.countrycode, tags, quality].filter(Boolean).join(' · ');
};

/** compact = počítač: málo místa pod přehrávačem – hledání a země v jednom řádku, bez karty „Právě hraje“
 *  (stanice je vidět nahoře v přehrávači), zavírací křížek v řádku záložek */
export function RadioPanel({ radio, onPlayed, compact = false, onClose }: { radio: Radio; onPlayed?: () => void; compact?: boolean; onClose?: () => void }) {
  const [tab, setTab] = useState<'browse' | 'favs'>(radio.favourites.length ? 'favs' : 'browse');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState(readCountry);
  const [genre, setGenre] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [results, setResults] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem(COUNTRY_KEY, country); } catch { /* jen se nezapamatuje */ }
  }, [country]);

  const load = (append: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const offset = append ? offsetRef.current : 0;
    setLoading(true);
    setError(false);
    searchStations({ name: query, countrycode: country, tag: genre, offset, limit: PAGE }, ctrl.signal)
      .then((list) => {
        if (ctrl.signal.aborted) return;
        offsetRef.current = offset + PAGE;
        setResults((prev) => {
          if (!append) return list;
          const seen = new Set(prev.map((s) => s.stationuuid));
          return [...prev, ...list.filter((s) => !seen.has(s.stationuuid))];
        });
        setHasMore(list.length > 0);
        setLoading(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
  };

  // Hledání při psaní (s krátkou prodlevou) a při změně země / žánru
  useEffect(() => {
    if (tab !== 'browse') return;
    const t = setTimeout(() => load(false), query ? 350 : 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load čte aktuální filtry
  }, [query, country, genre, tab]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const list: (Station | SavedStation)[] = tab === 'favs' ? radio.favourites : results;
  const pinned = countries.filter((c) => PINNED.includes(c.code)).sort((a, b) => PINNED.indexOf(a.code) - PINNED.indexOf(b.code));
  const others = countries.filter((c) => !PINNED.includes(c.code));

  const tabBtn = (id: 'browse' | 'favs', label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-[0.18em] border-b-2 transition-colors ${tab === id ? 'text-cyan-300 border-cyan-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 text-left">
      {/* Právě hraje */}
      {radio.station && !compact && (
        <div className="shrink-0 mx-3 mb-2 flex items-center gap-3 px-3 py-2 rounded-xl border border-pink-500/40 bg-pink-500/5">
          <StationLogo src={radio.station.favicon} active />
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm text-cyan-200 font-medium">{radio.station.name}</div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              {radio.status === 'loading' && <><Loader2 size={11} className="animate-spin" /> Připojuji…</>}
              {radio.status === 'playing' && <><span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" /> Živě{!radio.fx && ' · bez ekvalizéru a vizualizace'}</>}
              {radio.status === 'paused' && 'Pozastaveno'}
              {radio.status === 'error' && <span className="text-pink-400">Stanice teď nevysílá nebo nejde přehrát</span>}
            </div>
          </div>
          <button onClick={radio.stop} title="Vypnout rádio" aria-label="Vypnout rádio" className="p-2 -m-1 text-slate-400 hover:text-pink-400 active:text-pink-400">
            <Square size={15} fill="currentColor" />
          </button>
        </div>
      )}

      <div className="shrink-0 flex items-center px-3">
        {tabBtn('browse', compact ? 'Rádio' : 'Hledat')}
        {tabBtn('favs', `Oblíbené${radio.favourites.length ? ` (${radio.favourites.length})` : ''}`)}
        {radio.station && compact && (
          <button onClick={radio.stop} title="Vypnout rádio" aria-label="Vypnout rádio" className="ml-1 p-1.5 text-slate-400 hover:text-pink-400">
            <Square size={12} fill="currentColor" />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Zpět na seznam skladeb" aria-label="Zpět na seznam skladeb" className="ml-1 p-1.5 text-slate-500 hover:text-pink-400">
            <X size={14} />
          </button>
        )}
      </div>

      {tab === 'browse' && (
        <div className={`shrink-0 px-3 ${compact ? 'pt-2 pb-1.5 gap-1.5' : 'pt-3 pb-2 gap-2'} flex flex-col`}>
          <div className={compact ? 'flex gap-1.5' : 'contents'}>
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Název stanice…"
              maxLength={80}
              enterKeyHint="search"
              className={`w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 ${compact ? 'py-1.5' : 'py-2'} text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 select-text`}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Smazat hledání" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Země"
            className={`${compact ? 'w-[118px] shrink-0 px-2 py-1.5 text-xs' : 'w-full px-3 py-2 text-sm'} bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500`}
          >
            <option value="">Celý svět</option>
            {pinned.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.count})</option>)}
            {others.length > 0 && <option disabled>──────────</option>}
            {others.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.count})</option>)}
            {countries.length === 0 && country && <option value={country}>{country}</option>}
          </select>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {GENRES.map((g) => (
              <button
                key={g.tag}
                onClick={() => setGenre((v) => (v === g.tag ? '' : g.tag))}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${genre === g.tag ? 'border-pink-500 text-pink-300 bg-pink-500/10' : 'border-slate-700 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 border-t border-white/5 pt-1">
        {list.map((s) => {
          const current = radio.station?.stationuuid === s.stationuuid;
          const fav = radio.isFav(s.stationuuid);
          return (
            <div
              key={s.stationuuid}
              onClick={() => { radio.play(s, list); onPlayed?.(); }}
              className={`group flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer hover:bg-white/5 active:bg-white/5 border-l-2 ${current ? 'bg-cyan-500/10 border-pink-500' : 'border-transparent'}`}
            >
              <StationLogo src={s.favicon} active={current} />
              <div className="flex-1 min-w-0">
                <div className={`truncate text-sm ${current ? 'text-cyan-300 font-medium' : 'text-slate-200'}`}>{s.name.trim()}</div>
                <div className="truncate text-[11px] text-slate-500">{meta(s as SavedStation)}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); radio.toggleFav(s); }}
                aria-label={fav ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                aria-pressed={fav}
                className={`p-2 -m-1 shrink-0 transition-colors ${fav ? 'text-pink-400' : 'text-slate-600 hover:text-pink-300'}`}
              >
                <Star size={16} fill={fav ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}

        {tab === 'browse' && loading && (
          <div className="py-6 flex justify-center text-cyan-400/70"><Loader2 size={20} className="animate-spin" /></div>
        )}
        {tab === 'browse' && error && !loading && (
          <div className="py-6 px-4 text-center text-sm text-slate-400">
            Katalog stanic je teď nedostupný.
            <button onClick={() => load(false)} className="block mx-auto mt-2 text-cyan-300 underline underline-offset-4">Zkusit znovu</button>
          </div>
        )}
        {tab === 'browse' && !loading && !error && results.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500">Nic jsme nenašli. Zkus jiný název, zemi nebo žánr.</div>
        )}
        {tab === 'browse' && !loading && !error && hasMore && results.length > 0 && (
          <button onClick={() => load(true)} className="w-full mt-1 py-2.5 rounded-xl border border-slate-700 text-xs font-bold uppercase tracking-[0.15em] text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300">
            Načíst další
          </button>
        )}
        {tab === 'favs' && radio.favourites.length === 0 && (
          <div className="py-8 px-6 text-center text-sm text-slate-500">
            <Star size={26} className="mx-auto mb-2 text-slate-700" />
            Oblíbené stanice si přidáš hvězdičkou ve vyhledávání.
          </div>
        )}
      </div>
    </div>
  );
}
