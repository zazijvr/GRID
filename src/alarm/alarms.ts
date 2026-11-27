// Budík (jen Android). Budíky plánuje a zvoní nativní část (AlarmStore / AlarmRingService) – funguje
// i se zavřenou aplikací a zamčeným telefonem. Tady je jen komunikace přes window.GridAndroid:
//  → alarms:get | alarms:set {alarms} | alarms:file {key,seq,total,data} | alarms:test {id} | alarms:open*
//  ← window.__gridAlarm({type:'list'|'changed'|'fileSaved'|'fileError', …})
import { getBlob, WAKE_UP_TRACK } from '../audio/trackStore';

export type AlarmSource = 'track' | 'playlist' | 'radio' | 'system';

export interface Alarm {
  id: string;
  enabled: boolean;
  hour: number;
  minute: number;
  /** bit 0 = pondělí … bit 6 = neděle; 0 = jen jednou */
  days: number;
  snoozeMin: number;
  label: string;
  source: AlarmSource;
  /** Klíč zvuku v úložišti budíku = id skladby */
  trackFile: string;
  /** Název skladby, u zdroje „playlist“ název playlistu */
  trackName: string;
  /** Playlist: klíče zkopírovaných skladeb (hrají postupně dokola) */
  playlistFiles: string[];
  radioUrl: string;
  radioName: string;
  backupFile: string;
  backupName: string;
  ramp: boolean;
  /** Další zazvonění (ms) – počítá nativní část; null = vypnutý */
  next?: number | null;
  /** Odložený budík zazvoní znovu v tento čas (ms); null = neodložený */
  snoozeUntil?: number | null;
}

export interface AlarmStatus {
  /** Přesné budíky povolené (jinak může systém zazvonění o pár minut posunout) */
  exact: boolean;
  /** Zvonicí obrazovka přes zamčený telefon (Android 14+ povoluje uživatel) */
  fullScreen: boolean;
  notifications: boolean;
}

export interface AlarmState {
  alarms: Alarm[];
  status: AlarmStatus;
  files: string[];
}

type NativeMsg =
  | { type: 'list'; alarms: Alarm[]; status: AlarmStatus; files: string[] }
  | { type: 'changed' }
  | { type: 'fileSaved'; key: string }
  | { type: 'fileError'; key: string };

declare global {
  interface Window {
    __gridAlarm?: (msg: NativeMsg) => void;
  }
}

const send = (msg: Record<string, unknown>) => window.GridAndroid?.postMessage(JSON.stringify(msg));

const listeners = new Set<(m: NativeMsg) => void>();
export function onNative(fn: (m: NativeMsg) => void) {
  listeners.add(fn);
  window.__gridAlarm = (m) => listeners.forEach((l) => l(m));
  return () => { listeners.delete(fn); };
}

export const requestList = () => send({ type: 'alarms:get' });
export const saveAll = (alarms: Alarm[]) =>
  send({ type: 'alarms:set', alarms: alarms.map(({ next: _next, snoozeUntil: _snooze, ...a }) => a) });
/** Zrušit odložení (odložený budík už znovu nezazvoní; pravidelný budík zůstává zapnutý) */
export const cancelSnooze = (id: string) => send({ type: 'alarms:cancelSnooze', id });
export const testAlarm = (id: string) => send({ type: 'alarms:test', id });
export const openExactSettings = () => send({ type: 'alarms:openExact' });
export const openFullScreenSettings = () => send({ type: 'alarms:openFullScreen' });
export const openNotificationSettings = () => send({ type: 'alarms:openNotifications' });
export const askNotifications = () => send({ type: 'alarms:askNotifications' });

const CHUNK = 192 * 1024;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Kolik skladeb z playlistu se zkopíruje do budíku (budík bez reakce zvoní nejvýš 10 minut) */
export const PLAYLIST_MAX = 8;

/**
 * Zkopíruje zvuk do úložiště budíku (po kouscích přes most). blob = soubor vybraný ze složky,
 * jinak se vezme skladba GRIDu se stejným id. Playlist ani soubory GRIDu se tím nemění.
 * onProgress 0–1. Vyhodí chybu, když skladba není uložená nebo zápis selže.
 */
export async function uploadTrack(key: string, onProgress?: (p: number) => void, file?: Blob): Promise<void> {
  const blob = file ?? (await getBlob(key));
  if (!blob) throw new Error('Skladba není uložená v telefonu – vyber ji znovu');
  const total = Math.max(1, Math.ceil(blob.size / CHUNK));
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('Ukládání skladby trvá příliš dlouho')); }, 120_000);
    const off = onNative((m) => {
      if ((m.type === 'fileSaved' || m.type === 'fileError') && m.key === key) {
        clearTimeout(timer);
        off();
        if (m.type === 'fileSaved') resolve(); else reject(new Error('Skladbu se nepodařilo uložit'));
      }
    });
  });
  for (let seq = 0; seq < total; seq++) {
    const data = toBase64(await blob.slice(seq * CHUNK, (seq + 1) * CHUNK).arrayBuffer());
    send({ type: 'alarms:file', key, seq, total, data });
    onProgress?.((seq + 1) / total);
    // Nechat most dýchat (zprávy se zapisují postupně)
    if (seq % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }
  await done;
}

export const DAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
export const WORKDAYS = 0b0011111;
export const EVERYDAY = 0b1111111;

export function daysLabel(days: number): string {
  if (days === 0) return 'Jednou';
  if (days === EVERYDAY) return 'Každý den';
  if (days === WORKDAYS) return 'Pracovní dny';
  if (days === 0b1100000) return 'Víkend';
  return DAY_SHORT.filter((_, i) => (days >> i) & 1).join(' ');
}

export const timeLabel = (a: Pick<Alarm, 'hour' | 'minute'>) => `${a.hour}:${String(a.minute).padStart(2, '0')}`;

/** „za 7 h 32 min“ */
export function inLabel(next: number | null | undefined, now = Date.now()): string | null {
  if (!next) return null;
  const min = Math.max(1, Math.round((next - now) / 60_000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `za ${d} d ${h} h`;
  if (h > 0) return `za ${h} h ${m} min`;
  return `za ${m} min`;
}

export function newAlarm(): Alarm {
  const d = new Date(Date.now() + 60 * 60_000);
  return {
    id: crypto.randomUUID(), enabled: true, hour: d.getHours(), minute: 0, days: 0, snoozeMin: 10, label: '',
    // Výchozí zvuk = přibalená skladba Wake Up Easy (i jako záloha, když rádio nehraje)
    source: 'track', trackFile: WAKE_UP_TRACK.id, trackName: WAKE_UP_TRACK.name, playlistFiles: [], radioUrl: '', radioName: '',
    backupFile: WAKE_UP_TRACK.id, backupName: WAKE_UP_TRACK.name, ramp: true,
  };
}

/** 1 skladba, 2–4 skladby, 5 skladeb */
export const songs = (n: number) => `${n} ${n === 1 ? 'skladba' : n >= 2 && n <= 4 ? 'skladby' : 'skladeb'}`;

export const soundLabel = (a: Alarm) =>
  a.source === 'track' ? a.trackName
    : a.source === 'playlist' ? `${a.trackName && a.trackName !== 'Aktuální výběr' ? `Playlist ${a.trackName}` : 'Playlist'} · ${songs(a.playlistFiles?.length ?? 0)}`
      : a.source === 'radio' ? `${a.radioName} (rádio)` : 'Zvuk budíku';
