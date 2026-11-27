// Počítač: skladby otevřené ze systému (správce souborů „Otevřít v GRID“, GRID jako výchozí přehrávač).
// Cesty posílá nativní část (open_files.rs): při startu je vrátí take_open_files, z dalších spuštění
// přijdou událostí. Více událostí rychle za sebou (Windows spouští program pro každý soubor zvlášť)
// se spojí do jednoho otevření.
const OPEN_EVENT = 'grid://open-files';
const MERGE_MS = 400;

interface OpenedFile { path: string; name: string }

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  m4a: 'audio/mp4', aac: 'audio/aac', wma: 'audio/x-ms-wma', weba: 'audio/webm', webm: 'audio/webm',
};

async function readFiles(list: OpenedFile[]): Promise<File[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const files: File[] = [];
  for (const f of list) {
    try {
      const buf = await invoke<ArrayBuffer>('read_open_file', { path: f.path });
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      files.push(new File([buf], f.name, { type: MIME[ext] ?? 'audio/mpeg' }));
    } catch (e) {
      console.warn(`Soubor „${f.name}“ nejde otevřít`, e);
    }
  }
  return files;
}

/** Zavolá onOpen se soubory ze startu i z dalších otevření; vrací odhlášení */
export function watchOpenedFiles(onOpen: (files: File[]) => void): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;
  let batch: OpenedFile[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const deliver = async (list: OpenedFile[]) => {
    const files = await readFiles(list);
    if (!stopped && files.length) onOpen(files);
  };
  const queue = (list: OpenedFile[]) => {
    batch.push(...list);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { const l = batch; batch = []; timer = null; deliver(l); }, MERGE_MS);
  };

  (async () => {
    const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
    const un = await listen<OpenedFile[]>(OPEN_EVENT, (e) => queue(e.payload));
    if (stopped) { un(); return; }
    unlisten = un;
    const initial = await invoke<OpenedFile[]>('take_open_files');
    if (initial.length) queue(initial);
  })().catch((e) => console.warn('Otevírání souborů ze systému nefunguje', e));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unlisten?.();
  };
}
