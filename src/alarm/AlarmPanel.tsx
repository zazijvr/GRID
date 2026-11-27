// Panel Budík (jen telefon s Androidem): seznam budíků a úprava jednoho budíku.
// Vlastní zvonění dělá nativní část – tady se jen nastavuje.
// Zvuk pro budík se do budíku KOPÍRUJE – výběr skladby ani playlistu nikdy nemění playlist v GRIDu.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlarmClock, AlertTriangle, Check, ChevronLeft, FolderOpen, ListMusic, Music, Plus, Radio as RadioIcon, Trash2, Volume2 } from 'lucide-react';
import { WAKE_UP_TRACK, type TrackMeta } from '../audio/trackStore';
import { streamUrl, type SavedStation } from '../radio/radioBrowser';
import {
  askNotifications, cancelSnooze, DAY_SHORT, daysLabel, EVERYDAY, inLabel, newAlarm, onNative, openExactSettings, openFullScreenSettings,
  openNotificationSettings, PLAYLIST_MAX, requestList, saveAll, songs, soundLabel, testAlarm, timeLabel, uploadTrack, WORKDAYS,
  type Alarm, type AlarmSource, type AlarmState,
} from './alarms';

const SNOOZE = [5, 10, 15, 20];
const ACCEPT_AUDIO = 'audio/*,.wav,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.wma,.weba,.webm';

interface Props {
  /** Skladby z playlistu a uložených playlistů (každá jednou) – výběr jedné skladby */
  tracks: TrackMeta[];
  /** Aktuální playlist (pro zdroj „Playlist“) */
  playlist: { name: string | null; tracks: TrackMeta[] };
  /** Oblíbené stanice */
  stations: SavedStation[];
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={`relative w-12 h-7 rounded-full border transition-colors shrink-0 ${on ? 'bg-cyan-400/30 border-cyan-400' : 'bg-slate-800 border-slate-600'}`}
    >
      <span className={`absolute top-0.5 w-5.5 h-5.5 rounded-full transition-all ${on ? 'left-[22px] bg-cyan-300 shadow-[0_0_10px_#01daf6]' : 'left-0.5 bg-slate-400'}`} />
    </button>
  );
}

const noExt = (name: string) => name.replace(/\.[^/.]+$/, '');

/**
 * Výběr jedné skladby: ze seznamu skladeb GRIDu, nebo rovnou ze složky v telefonu
 * (soubor ze složky se do playlistu NEPŘIDÁ – jen se zkopíruje do budíku).
 */
function TrackPicker({ value, name, tracks, emptyLabel, onPick, onFile }: {
  value: string; name: string; tracks: TrackMeta[]; emptyLabel: string;
  onPick: (key: string, name: string) => void; onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const known = tracks.some((t) => t.id === value);
  return (
    <div className="flex flex-col gap-2">
      <select value={value} onChange={(ev) => { const t = tracks.find((x) => x.id === ev.target.value); onPick(t?.id ?? '', t?.name ?? ''); }}
        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm text-slate-200">
        <option value="">{emptyLabel}</option>
        {/* skladba ze složky (není v playlistu) */}
        {value && !known && <option value={value}>{name} (ze složky)</option>}
        {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <input ref={inputRef} type="file" accept={ACCEPT_AUDIO} className="hidden"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) onFile(f); ev.target.value = ''; }} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider active:scale-[0.98]">
        <FolderOpen size={15} /> Vybrat ze složky v telefonu
      </button>
    </div>
  );
}

export function AlarmPanel({ tracks, playlist, stations }: Props) {
  const [state, setState] = useState<AlarmState | null>(null);
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  /** Soubory vybrané ze složky (klíč → soubor), zkopírují se do budíku při uložení */
  const pendingFiles = useRef(new Map<string, File>());

  useEffect(() => {
    const off = onNative((m) => {
      if (m.type === 'list') setState({ alarms: m.alarms.map((a) => ({ ...a, playlistFiles: a.playlistFiles ?? [] })), status: m.status, files: m.files });
      else if (m.type === 'changed') requestList();
    });
    requestList();
    // stav oprávnění se mohl změnit v nastavení telefonu → po návratu načíst znovu
    const onVis = () => { if (document.visibilityState === 'visible') requestList(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => tick((n) => n + 1), 30_000); // „za X min“
    return () => { off(); document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, []);

  const alarms = useMemo(() => [...(state?.alarms ?? [])].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)), [state]);

  const persist = (list: Alarm[]) => {
    setState((s) => (s ? { ...s, alarms: list } : s));
    saveAll(list);
  };

  /** Snímek aktuálního playlistu (prvních PLAYLIST_MAX skladeb) – playlist samotný se nemění */
  const playlistSnapshot = () => ({
    playlistFiles: playlist.tracks.slice(0, PLAYLIST_MAX).map((t) => t.id),
    trackName: playlist.name ?? 'Aktuální výběr',
  });

  /** Uložit upravovaný budík (nejdřív zkopírovat skladby, které nativní část ještě nemá) */
  const saveEditing = async (andTest = false) => {
    if (!editing || !state) return;
    setError(null);
    const a: Alarm = { ...editing, enabled: true };
    if (a.source === 'track' && !a.trackFile) { setError('Vyber skladbu.'); return; }
    if (a.source === 'playlist' && !a.playlistFiles.length) { setError('Playlist je prázdný – nejdřív přidej hudbu.'); return; }
    if (a.source === 'radio' && !a.radioUrl) { setError('Vyber stanici z oblíbených.'); return; }
    if (a.source !== 'track' && a.source !== 'playlist') { a.trackName = ''; }
    if (a.source !== 'track') a.trackFile = '';
    if (a.source !== 'playlist') a.playlistFiles = [];
    if (a.source !== 'radio') { a.radioUrl = ''; a.radioName = ''; }
    if (a.source === 'system') { a.backupFile = ''; a.backupName = ''; }
    const keys = [a.trackFile, ...a.playlistFiles, a.backupFile].filter((k) => k && !state.files.includes(k));
    try {
      for (let i = 0; i < keys.length; i++) {
        const label = keys.length > 1 ? `Kopíruji skladby do budíku ${i + 1}/${keys.length}…` : 'Kopíruji skladbu do budíku…';
        setBusy(`${label} 0 %`);
        await uploadTrack(keys[i], (p) => setBusy(`${label} ${Math.round(p * 100)} %`), pendingFiles.current.get(keys[i]));
        state.files.push(keys[i]);
      }
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
      return;
    }
    setBusy(null);
    if (!state.status.notifications) askNotifications();
    persist(state.alarms.some((x) => x.id === a.id) ? state.alarms.map((x) => (x.id === a.id ? a : x)) : [...state.alarms, a]);
    setEditing(null);
    if (andTest) setTimeout(() => testAlarm(a.id), 400);
  };

  if (!state) return <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Načítám budíky…</div>;

  // ── Úprava budíku ──
  if (editing) {
    const e = editing;
    const set = (patch: Partial<Alarm>) => setEditing({ ...e, ...patch });
    const isNew = !state.alarms.some((x) => x.id === e.id);
    const fromFolder = (file: File) => {
      const key = crypto.randomUUID();
      pendingFiles.current.set(key, file);
      return { key, name: noExt(file.name) };
    };
    const sourceBtn = (s: AlarmSource, icon: ReactNode, label: string) => (
      <button type="button"
        onClick={() => set({
          source: s,
          ...(s === 'playlist' && e.source !== 'playlist' ? playlistSnapshot() : {}),
          // Bez zálohy by při nehrajícím rádiu / chybějící skladbě zazvonil jen systémový zvuk
          ...(s !== 'system' && !e.backupFile ? { backupFile: WAKE_UP_TRACK.id, backupName: WAKE_UP_TRACK.name } : {}),
        })}
        className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] uppercase tracking-wider ${e.source === s ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>
        {icon}{label}
      </button>
    );
    const backupPicker = (
      <>
        <div className="text-[11px] text-slate-500 mt-2">Záloha, když nic z toho nepůjde přehrát (třeba bez internetu):</div>
        <TrackPicker value={e.backupFile} name={e.backupName} tracks={tracks} emptyLabel="Zvuk budíku z telefonu"
          onPick={(key, name) => set({ backupFile: key, backupName: name })}
          onFile={(f) => { const r = fromFolder(f); set({ backupFile: r.key, backupName: r.name }); }} />
      </>
    );
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
        <button onClick={() => { setEditing(null); setError(null); }} className="self-start flex items-center gap-1 text-sm text-slate-400 -mb-1">
          <ChevronLeft size={18} /> Budíky
        </button>

        <input type="time" value={timeLabel(e).padStart(5, '0')} required
          onChange={(ev) => { const [h, m] = ev.target.value.split(':').map(Number); if (!isNaN(h) && !isNaN(m)) set({ hour: h, minute: m }); }}
          className="w-full text-center text-5xl font-black tracking-wider text-cyan-300 bg-transparent border-b-2 border-cyan-500/40 py-2 drop-shadow-[0_0_12px_rgba(1,218,246,0.6)] [color-scheme:dark]" />

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Opakovat · {daysLabel(e.days)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_SHORT.map((d, i) => {
              const on = (e.days >> i) & 1;
              return (
                <button key={d} type="button" onClick={() => set({ days: e.days ^ (1 << i) })}
                  className={`py-2.5 rounded-xl text-xs font-bold border ${on ? 'border-pink-500 bg-pink-500/15 text-pink-200' : 'border-slate-700 text-slate-400'}`}>{d}</button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2 text-xs">
            <button type="button" onClick={() => set({ days: WORKDAYS })} className="px-3 py-1.5 rounded-full border border-slate-700 text-slate-300">Pracovní dny</button>
            <button type="button" onClick={() => set({ days: EVERYDAY })} className="px-3 py-1.5 rounded-full border border-slate-700 text-slate-300">Každý den</button>
            <button type="button" onClick={() => set({ days: 0 })} className="px-3 py-1.5 rounded-full border border-slate-700 text-slate-300">Jednou</button>
          </div>
        </div>

        <input value={e.label} onChange={(ev) => set({ label: ev.target.value.slice(0, 60) })} placeholder="Název (nepovinné)"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm text-slate-200 placeholder:text-slate-600" />

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Zvuk</div>
          <div className="flex gap-1.5">
            {sourceBtn('track', <Music size={18} />, 'Skladba')}
            {sourceBtn('playlist', <ListMusic size={18} />, 'Playlist')}
            {sourceBtn('radio', <RadioIcon size={18} />, 'Rádio')}
            {sourceBtn('system', <AlarmClock size={18} />, 'Budík')}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {e.source === 'track' && (
              <>
                <TrackPicker value={e.trackFile} name={e.trackName} tracks={tracks} emptyLabel="Vyber skladbu z GRIDu…"
                  onPick={(key, name) => set({ trackFile: key, trackName: name })}
                  onFile={(f) => { const r = fromFolder(f); set({ trackFile: r.key, trackName: r.name }); }} />
                <p className="text-[11px] text-slate-500">Skladba se zkopíruje do budíku – playlist v GRIDu se nezmění.</p>
                {backupPicker}
              </>
            )}
            {e.source === 'playlist' && (
              <>
                <div className="p-3 rounded-xl border border-slate-700 bg-white/[0.03] text-sm">
                  <div className="text-slate-200 font-semibold truncate">{e.trackName || 'Aktuální výběr'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {e.playlistFiles.length ? `${songs(e.playlistFiles.length)} – hrají postupně dokola` : 'Playlist je prázdný'}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Do budíku se zkopíruje prvních {PLAYLIST_MAX} skladeb aktuálního playlistu (budík bez reakce zvoní nejvýš 10 minut).
                  Playlist v GRIDu zůstane, jak je.
                </p>
                <button type="button" onClick={() => set(playlistSnapshot())}
                  className="py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider">
                  Použít aktuální playlist{playlist.name ? ` (${playlist.name})` : ''}
                </button>
                {backupPicker}
              </>
            )}
            {e.source === 'radio' && (stations.length ? (
              <>
                <div className="flex flex-col gap-1.5">
                  {stations.map((s) => {
                    const on = e.radioUrl === streamUrl(s);
                    return (
                      <button key={s.stationuuid} type="button" onClick={() => set({ radioUrl: streamUrl(s), radioName: s.name })}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border text-left ${on ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700'}`}>
                        {s.favicon
                          ? <img src={s.favicon} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/5 shrink-0" onError={(ev) => { (ev.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                          : <span className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0"><RadioIcon size={16} className="text-slate-500" /></span>}
                        <span className={`flex-1 truncate text-sm ${on ? 'text-cyan-200 font-semibold' : 'text-slate-300'}`}>{s.name}</span>
                        {on && <Check size={18} className="text-cyan-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {backupPicker}
              </>
            ) : <p className="text-xs text-slate-500">Nemáš žádné oblíbené stanice. V Rádiu označ stanici hvězdičkou ☆ a pak ji tady vybereš.</p>)}
            {e.source === 'system' && <p className="text-xs text-slate-500">Zazvoní zvuk budíku nastavený v telefonu.</p>}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Odložit o</div>
          <div className="grid grid-cols-4 gap-2">
            {SNOOZE.map((m) => (
              <button key={m} type="button" onClick={() => set({ snoozeMin: m })}
                className={`py-2.5 rounded-xl text-sm font-bold border ${e.snoozeMin === m ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{m} min</button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
          <span className="flex items-center gap-2"><Volume2 size={16} className="text-cyan-400" /> Postupně zesilovat</span>
          <Toggle on={e.ramp} onChange={(v) => set({ ramp: v })} label="Postupně zesilovat" />
        </label>

        {error && <div className="text-sm text-pink-300">{error}</div>}
        {busy && <div className="text-sm text-cyan-300">{busy}</div>}

        <div className="flex flex-col gap-2 mt-1">
          <button disabled={!!busy} onClick={() => saveEditing()} className="py-3.5 rounded-2xl bg-cyan-400 text-slate-950 font-black uppercase tracking-[0.15em] text-sm disabled:opacity-50 active:scale-[0.98]">Uložit</button>
          <button disabled={!!busy} onClick={() => saveEditing(true)} className="py-3 rounded-2xl border border-cyan-500/50 text-cyan-300 font-bold uppercase tracking-[0.15em] text-xs disabled:opacity-50 active:scale-[0.98]">Uložit a vyzkoušet</button>
          {!isNew && (
            <button disabled={!!busy} onClick={() => { persist(state.alarms.filter((x) => x.id !== e.id)); setEditing(null); }}
              className="py-3 rounded-2xl text-pink-400 text-xs font-bold uppercase tracking-[0.15em] flex items-center justify-center gap-2"><Trash2 size={15} /> Smazat budík</button>
          )}
        </div>
      </div>
    );
  }

  // ── Seznam budíků ──
  const st = state.status;
  const warn = (text: string, action: string, onClick: () => void) => (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-400/40 bg-amber-400/10 text-xs text-amber-100">
      <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
      <div className="flex-1">{text} <button onClick={onClick} className="underline font-bold text-amber-200">{action}</button></div>
    </div>
  );
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
      {alarms.length > 0 && !st.notifications && warn('Oznámení jsou vypnutá – budík nezobrazí zvonicí obrazovku.', 'Povolit', openNotificationSettings)}
      {alarms.length > 0 && !st.exact && warn('Přesné budíky nejsou povolené – telefon může zazvonění o pár minut posunout.', 'Povolit', openExactSettings)}
      {alarms.length > 0 && !st.fullScreen && warn('Zvonicí obrazovka přes zamčený telefon není povolená (zvuk zazní i tak).', 'Povolit', openFullScreenSettings)}

      {alarms.length === 0 && (
        <div className="py-8 flex flex-col items-center gap-2 text-center">
          <AlarmClock size={40} className="text-cyan-400 drop-shadow-[0_0_10px_rgba(1,218,246,0.6)]" />
          <p className="text-sm text-slate-400">Žádný budík. Vzbudí tě skladba, playlist nebo rádio – i když je aplikace zavřená.</p>
        </div>
      )}

      {alarms.map((a) => (
        <div key={a.id} onClick={() => { setError(null); setEditing(a); }}
          className={`flex items-center gap-4 p-4 rounded-2xl border active:scale-[0.99] ${a.enabled ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-slate-800 bg-white/[0.02]'}`}>
          <div className="flex-1 min-w-0">
            <div className={`text-4xl font-black tracking-wide ${a.enabled ? 'text-cyan-300 drop-shadow-[0_0_10px_rgba(1,218,246,0.5)]' : 'text-slate-500'}`}>{timeLabel(a)}</div>
            <div className="text-xs text-slate-400 mt-1 truncate">
              {daysLabel(a.days)}{a.label ? ` · ${a.label}` : ''}
            </div>
            <div className="text-xs text-slate-500 truncate">♪ {soundLabel(a)}</div>
            {a.snoozeUntil && a.snoozeUntil > Date.now() ? (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-pink-300">
                  Odloženo – zazvoní v {timeLabel({ hour: new Date(a.snoozeUntil).getHours(), minute: new Date(a.snoozeUntil).getMinutes() })} ({inLabel(a.snoozeUntil)})
                </span>
                <button onClick={(ev) => { ev.stopPropagation(); cancelSnooze(a.id); }}
                  className="px-2.5 py-1 rounded-full border border-pink-500/60 text-pink-200 text-[10px] font-bold uppercase tracking-wider active:scale-95">
                  Zrušit odložení
                </button>
              </div>
            ) : a.enabled && inLabel(a.next) && <div className="text-[11px] text-pink-300 mt-0.5">Zazvoní {inLabel(a.next)}</div>}
          </div>
          <Toggle on={a.enabled} label={a.enabled ? 'Vypnout budík' : 'Zapnout budík'}
            onChange={(v) => {
              // vypnutím budíku skončí i jeho odložení
              if (!v && a.snoozeUntil) cancelSnooze(a.id);
              persist(state.alarms.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)));
            }} />
        </div>
      ))}

      <button onClick={() => { setError(null); setEditing(newAlarm()); }}
        className="mt-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-cyan-400/60 bg-cyan-400/10 text-cyan-200 font-bold uppercase tracking-[0.15em] text-sm active:scale-[0.98]">
        <Plus size={18} /> Nový budík
      </button>
    </div>
  );
}
