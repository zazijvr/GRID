// Playlist v IndexedDB.
//
// v2: soubory skladeb jako Blob (každý uložený jednou, podle id) + malý seznam {id, name} s pořadím.
//     Do paměti (jako data: URL) se načítá jen skladba, která se právě hraje.
// v1 (starší verze): celý playlist jako pole {id, name, url: data:…} pod klíčem 'tracks' – při
//     otevření se jednou převede na v2.

export interface TrackMeta {
  id: string;
  name: string;
}

const DB_NAME = 'zvr-grid-db';
const DB_VERSION = 2;
const LEGACY_STORE = 'playlist'; // v1
const META_STORE = 'meta';
const BLOB_STORE = 'blobs';
const ORDER_KEY = 'order';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** data:…;base64,… → Blob (bez fetch – funguje i s přísnou CSP) */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m || !m[2]) return null;
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'audio/mpeg' });
}

/** Převod playlistu z verze 1 (data: URL v jednom poli) */
async function migrateLegacy(db: IDBDatabase): Promise<TrackMeta[] | null> {
  if (!db.objectStoreNames.contains(LEGACY_STORE)) return null;
  const legacy = await request(db.transaction(LEGACY_STORE, 'readonly').objectStore(LEGACY_STORE).get('tracks'));
  if (!Array.isArray(legacy)) return null;

  const order: TrackMeta[] = [];
  const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
  for (const t of legacy as Array<{ id?: unknown; name?: unknown; url?: unknown }>) {
    if (typeof t?.id !== 'string' || typeof t.name !== 'string' || typeof t.url !== 'string') continue;
    const blob = dataUrlToBlob(t.url);
    if (!blob) continue;
    tx.objectStore(BLOB_STORE).put(blob, t.id);
    order.push({ id: t.id, name: t.name });
  }
  tx.objectStore(META_STORE).put(order, ORDER_KEY);
  await done(tx);
  // Starý záznam pryč – jinak by zabíral místo podruhé
  const clear = db.transaction(LEGACY_STORE, 'readwrite');
  clear.objectStore(LEGACY_STORE).delete('tracks');
  await done(clear).catch(() => {});
  return order;
}

export async function loadPlaylist(): Promise<TrackMeta[]> {
  try {
    const db = await openDB();
    const order = await request(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(ORDER_KEY));
    if (Array.isArray(order)) {
      return order.filter((t): t is TrackMeta => typeof t?.id === 'string' && typeof t?.name === 'string');
    }
    return (await migrateLegacy(db)) ?? [];
  } catch (e) {
    console.warn('Playlist se nepodařilo načíst', e);
    return [];
  }
}

/** Uloží jen pořadí a názvy (malé) */
export async function saveOrder(tracks: TrackMeta[]) {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(tracks.map(({ id, name }) => ({ id, name })), ORDER_KEY);
    await done(tx);
  } catch (e) {
    console.warn('Playlist se nepodařilo uložit', e);
  }
}

export async function putBlobs(entries: Array<{ id: string; blob: Blob }>) {
  if (entries.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(BLOB_STORE, 'readwrite');
  for (const { id, blob } of entries) tx.objectStore(BLOB_STORE).put(blob, id);
  await done(tx);
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  const blob = await request(db.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE).get(id));
  return blob instanceof Blob ? blob : null;
}

export async function deleteBlobs(ids: string[]) {
  if (ids.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    for (const id of ids) tx.objectStore(BLOB_STORE).delete(id);
    await done(tx);
  } catch (e) {
    console.warn('Soubory skladeb se nepodařilo smazat', e);
  }
}

export async function clearBlobs() {
  try {
    const db = await openDB();
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    tx.objectStore(BLOB_STORE).clear();
    await done(tx);
  } catch (e) {
    console.warn('Soubory skladeb se nepodařilo smazat', e);
  }
}

/**
 * Adresa souboru pro <audio>:
 *  - WebKitGTK (Linux): data: URL – GStreamer zadrhává u blob: URL (range požadavky), data: se načte celá;
 *  - Chromium (Android WebView, Windows WebView2): blob: URL – Chromium nepřijme adresu delší než 2 MB,
 *    takže data: URL běžné skladby (5–15 MB) by vůbec nezahrála.
 */
export const usesDataUrl = !/Chrome|Chromium|Edg\//.test(navigator.userAgent);

export function playableUrl(blob: Blob): Promise<string> {
  return usesDataUrl ? blobToDataUrl(blob) : Promise.resolve(URL.createObjectURL(blob));
}

/** Uvolní adresu z playableUrl (blob: URL drží soubor v paměti, dokud se neuvolní) */
export function releaseUrl(url: Promise<string>) {
  url.then((u) => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); }).catch(() => {});
}

/** Soubor → data: URL (celý soubor v adrese) */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
