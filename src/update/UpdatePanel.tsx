// Nová verze: odznak v titulku okna a panel s aktualizací
import { ArrowUpCircle, Download, Loader2, RotateCw, X } from 'lucide-react';
import type { Update } from './useUpdate';

export function UpdateBadge({ update, onClick }: { update: Update; onClick: () => void }) {
  if (!update.release) return null;
  return (
    <button
      onClick={onClick}
      title={`Nová verze ${update.release.version}`}
      aria-label={`Nová verze ${update.release.version}`}
      className="relative p-1 text-pink-400 hover:text-pink-300 transition-colors drop-shadow-[0_0_6px_rgba(248,0,255,0.8)]"
    >
      <ArrowUpCircle size={14} />
      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping" />
    </button>
  );
}

export function UpdatePanel({ update, onClose }: { update: Update; onClose: () => void }) {
  const r = update.release;
  if (!r) return null;
  const auto = update.mode !== 'manual' && !!r.appImageUrl;
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={(e) => { if (e.target === e.currentTarget && update.state !== 'installing') onClose(); }}>
      <div className="w-full max-w-[320px] rounded-2xl border border-pink-500/40 bg-slate-950 shadow-[0_0_30px_rgba(248,0,255,0.25)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-pink-400">Nová verze</div>
            <div className="mt-1 text-xl font-black tracking-wider text-white drop-shadow-[0_0_10px_rgba(0,243,255,0.6)]">GRID {r.version}</div>
            {update.current && <div className="text-xs text-slate-500 mt-0.5">Teď máš {update.current}</div>}
          </div>
          {update.state !== 'installing' && (
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-pink-400" aria-label="Zavřít"><X size={16} /></button>
          )}
        </div>

        {r.notes && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-white/5 border border-white/5 px-3 py-2 text-xs leading-relaxed text-slate-300 whitespace-pre-line select-text">
            {r.notes}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {update.state === 'done' ? (
            <>
              <div className="text-xs text-cyan-300 text-center">Nainstalováno. Po restartu poběží nová verze.</div>
              <button onClick={update.restart} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-cyan-400/60 bg-cyan-400/10 text-cyan-200 text-xs font-bold uppercase tracking-[0.15em] hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]">
                <RotateCw size={15} /> Restartovat
              </button>
            </>
          ) : update.state === 'installing' ? (
            <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-cyan-300 uppercase tracking-[0.15em]">
              <Loader2 size={15} className="animate-spin" /> Stahuji a instaluji…
            </div>
          ) : (
            <button onClick={update.install} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-pink-500/60 bg-pink-500/10 text-pink-200 text-xs font-bold uppercase tracking-[0.15em] hover:shadow-[0_0_15px_rgba(248,0,255,0.4)]">
              <Download size={15} /> {auto ? 'Aktualizovat' : 'Stáhnout'}
            </button>
          )}
          {update.state === 'error' && (
            <div className="text-[11px] text-pink-400 text-center">
              Aktualizace se nepovedla ({update.error}).{' '}
              <button onClick={update.openReleases} className="underline underline-offset-2 text-slate-300">Stáhnout ručně</button>
            </div>
          )}
          {!auto && update.state === 'idle' && (
            <div className="text-[11px] text-slate-500 text-center">Otevře se stránka s vydáním – stáhni instalátor a spusť ho.</div>
          )}
        </div>
      </div>
    </div>
  );
}
