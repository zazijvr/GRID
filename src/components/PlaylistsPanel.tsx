import { useEffect, useState } from 'react';
import { ListMusic, Play, Save, Trash2 } from 'lucide-react';
import type { SavedPlaylist } from '../audio/trackStore';

interface PlaylistsPanelProps {
  saved: SavedPlaylist[];
  /** Název playlistu, ze kterého je aktuální výběr (předvyplní se) */
  currentName: string | null;
  /** Počet skladeb v aktuálním výběru */
  trackCount: number;
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Uložení aktuálního výběru jako playlist a výběr z uložených (telefon i počítač) */
export function PlaylistsPanel({ saved, currentName, trackCount, onSave, onLoad, onDelete }: PlaylistsPanelProps) {
  const [name, setName] = useState(currentName ?? '');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => setName(currentName ?? ''), [currentName]);

  const exists = saved.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  const canSave = name.trim().length > 0 && trackCount > 0;
  const save = () => {
    if (!canSave) return;
    onSave(name);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Uložit aktuální výběr */}
      <div className="shrink-0 px-3 pb-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1.5">
          Uložit aktuální výběr ({trackCount} {trackCount === 1 ? 'skladba' : trackCount >= 2 && trackCount <= 4 ? 'skladby' : 'skladeb'})
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Název playlistu"
            maxLength={80}
            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!canSave}
            className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-xs font-bold uppercase tracking-wider disabled:opacity-40"
          >
            <Save size={14} /> {justSaved ? 'Uloženo' : exists ? 'Přepsat' : 'Uložit'}
          </button>
        </form>
        {exists && !justSaved && <div className="mt-1 text-[11px] text-amber-400/80">Playlist s tímto názvem se aktualizuje.</div>}
      </div>

      {/* Uložené playlisty */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 border-t border-white/5 pt-2">
        {saved.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <ListMusic size={28} className="mx-auto mb-2 text-slate-700" />
            Zatím žádný uložený playlist
          </div>
        ) : (
          saved.map((p) => {
            const active = p.name === currentName;
            return (
              <div
                key={p.id}
                onClick={() => { setConfirmDelete(null); onLoad(p.id); }}
                className={`group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer active:bg-white/5 hover:bg-white/5 ${active ? 'bg-cyan-500/10 border-l-2 border-pink-500' : 'border-l-2 border-transparent'}`}
              >
                <Play size={16} className={active ? 'text-pink-400' : 'text-cyan-400/70'} />
                <div className="flex-1 min-w-0">
                  <div className={`truncate text-sm ${active ? 'text-cyan-300 font-medium' : 'text-slate-200'}`}>{p.name}</div>
                  <div className="text-[11px] text-slate-500">{p.tracks.length} {p.tracks.length === 1 ? 'skladba' : p.tracks.length >= 2 && p.tracks.length <= 4 ? 'skladby' : 'skladeb'}</div>
                </div>
                {confirmDelete === p.id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); onDelete(p.id); }}
                    className="px-2.5 py-1.5 rounded-lg bg-pink-500/20 border border-pink-500/60 text-pink-300 text-[11px] font-bold uppercase"
                  >
                    Smazat?
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                    className="p-2 -m-1 text-slate-500 hover:text-pink-400 active:text-pink-400"
                    aria-label={`Smazat playlist ${p.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
