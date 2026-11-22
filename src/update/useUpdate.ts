// Kontrola nové verze (jen aplikace na počítači – telefon aktualizuje Google Play).
// Ptá se veřejného API vydání na GitHubu nejvýš jednou za 6 hodin; neposílá nic o uživateli.
import { useCallback, useEffect, useState } from 'react';

const API = 'https://api.github.com/repos/zazijvr/GRID/releases/latest';
const CACHE_KEY = 'zvr-grid-update-check';
const CHECK_EVERY = 6 * 60 * 60 * 1000;

export type UpdateMode = 'appimage' | 'binary' | 'manual';
export interface Release { version: string; notes: string; appImageUrl: string | null }
export type UpdateState = 'idle' | 'installing' | 'done' | 'error';

const isTauri = () => !!window.__TAURI_INTERNALS__;
const invoke = <T,>(cmd: string, args?: Record<string, unknown>) => import('@tauri-apps/api/core').then(({ invoke: inv }) => inv<T>(cmd, args));

/** 1.10.0 > 1.9.3 – porovnání po číslech */
export function newer(a: string, b: string) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

async function fetchLatest(): Promise<Release | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (cached && Date.now() - cached.at < CHECK_EVERY) return cached.release;
  } catch { /* bez mezipaměti */ }
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = await res.json();
  const release: Release = {
    version: String(r.tag_name ?? '').replace(/^v/, ''),
    notes: typeof r.body === 'string' ? r.body.slice(0, 2000) : '',
    appImageUrl: (r.assets ?? []).find((a: { name: string }) => a.name.endsWith('.AppImage'))?.browser_download_url ?? null,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release })); } catch { /* jen se nezapamatuje */ }
  return release;
}

export function useUpdate(enabled: boolean) {
  const [current, setCurrent] = useState<string | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [mode, setMode] = useState<UpdateMode>('manual');
  const [state, setState] = useState<UpdateState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let cancelled = false;
    // Až po úvodní animaci – kontrola nesmí zdržet start
    const t = setTimeout(async () => {
      try {
        const [{ getVersion }, latest, m] = await Promise.all([
          import('@tauri-apps/api/app'),
          fetchLatest(),
          invoke<UpdateMode>('update_mode').catch(() => 'manual' as UpdateMode),
        ]);
        const v = await getVersion();
        if (cancelled) return;
        setCurrent(v);
        setMode(m);
        if (latest && newer(latest.version, v)) setRelease(latest);
      } catch (e) {
        console.warn('Kontrola aktualizací se nepovedla', e);
      }
    }, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [enabled]);

  /** Linux: stáhne a nainstaluje; jinak otevře stránku s vydáními */
  const install = useCallback(async () => {
    if (!release) return;
    if (mode === 'manual' || !release.appImageUrl) {
      invoke('open_releases').catch(() => {});
      return;
    }
    setState('installing');
    setError(null);
    try {
      await invoke('self_update', { url: release.appImageUrl });
      setState('done');
    } catch (e) {
      setError(String(e));
      setState('error');
    }
  }, [release, mode]);

  const restart = useCallback(() => { invoke('restart_app').catch((e) => setError(String(e))); }, []);
  const openReleases = useCallback(() => { invoke('open_releases').catch(() => {}); }, []);

  return { current, release, mode, state, error, install, restart, openReleases };
}

export type Update = ReturnType<typeof useUpdate>;
