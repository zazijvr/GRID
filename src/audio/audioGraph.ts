// Zvukový graf Web Audio pro přehrávač – jeden na <audio> element:
//
//   <audio> → MediaElementSource → EQ (10 filtrů) → analyser → gain (hlasitost) → reproduktory
//
// - Analyser je za ekvalizérem a před hlasitostí: vizualizace ukazuje to, co je slyšet,
//   a nezmizí při ztišení.
// - Hlasitost řídí jen gain (element.volume zůstává 1) – jinak by se násobila dvakrát
//   a na WebKitGTK (Linux) element.volume po připojení do grafu stejně nefunguje.
// - createMediaElementSource jde na element zavolat jen jednou → graf se drží ve WeakMap.
// - AudioContext se smí rozběhnout jen po akci uživatele → ensureAudioGraph() volat z kliknutí.

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export type EQGains = number[];

export interface AudioGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  filters: BiquadFilterNode[];
  analyser: AnalyserNode;
  gain: GainNode;
}

const graphs = new WeakMap<HTMLMediaElement, AudioGraph>();

// Nastavení platí i před vytvořením grafu – použijí se při jeho vzniku
let eqGains: EQGains = EQ_BANDS.map(() => 0);
let volume = 1;

type AudioContextCtor = typeof AudioContext;

export function getAudioGraph(audio: HTMLMediaElement | null): AudioGraph | null {
  return audio ? graphs.get(audio) ?? null : null;
}

/** Vytvoří graf (jen poprvé) a rozběhne AudioContext. Volat z akce uživatele (klik, klávesa). */
export function ensureAudioGraph(audio: HTMLMediaElement): AudioGraph | null {
  let graph = graphs.get(audio);
  if (!graph) {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null; // bez Web Audio hraje element sám (bez EQ a vizualizace)

    const ctx = new Ctor({ latencyHint: 'playback' });
    const source = ctx.createMediaElementSource(audio);

    const filters = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = eqGains[i] ?? 0;
      return f;
    });

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; // 1024 pásem – vizualizace si je seskupí podle frekvencí
    analyser.smoothingTimeConstant = 0.85;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
    filters[filters.length - 1].connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    audio.volume = 1;
    graph = { ctx, source, filters, analyser, gain };
    graphs.set(audio, graph);
  }
  if (graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});
  return graph;
}

/** Hlasitost 0–1: přes gain, nebo přímo na elementu, dokud graf neexistuje */
export function setGraphVolume(audio: HTMLMediaElement | null, value: number) {
  volume = Math.max(0, Math.min(1, value));
  const graph = getAudioGraph(audio);
  if (graph) {
    graph.gain.gain.cancelScheduledValues(graph.ctx.currentTime);
    graph.gain.gain.setValueAtTime(volume, graph.ctx.currentTime);
  } else if (audio) {
    audio.volume = volume;
  }
}

export const getVolume = () => volume;

/** Plynulé ztlumení (~40 ms) před přepnutím skladby – bez lupnutí */
export function fadeOut(graph: AudioGraph) {
  const g = graph.gain.gain;
  const t = graph.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(g.value, 0.0001), t);
  g.setTargetAtTime(0, t, 0.008);
}

/** Vrátí hlasitost na nastavenou hodnotu (po přepnutí skladby) */
export function restoreVolume(graph: AudioGraph) {
  const g = graph.gain.gain;
  g.cancelScheduledValues(graph.ctx.currentTime);
  g.setValueAtTime(volume, graph.ctx.currentTime);
}

export function setEqGains(audio: HTMLMediaElement | null, gains: EQGains) {
  eqGains = [...gains];
  const graph = getAudioGraph(audio);
  graph?.filters.forEach((f, i) => {
    f.gain.value = eqGains[i] ?? 0;
  });
}

/** Průměrná úroveň (0–1) frekvenčního pásma loHz–hiHz z dat analyseru (getByteFrequencyData) */
export function bandLevel(data: Uint8Array, analyser: AnalyserNode, loHz: number, hiHz: number): number {
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const from = Math.max(0, Math.floor(loHz / binHz));
  const to = Math.min(data.length - 1, Math.ceil(hiHz / binHz));
  if (to < from) return 0;
  let sum = 0;
  for (let i = from; i <= to; i++) sum += data[i];
  return sum / ((to - from + 1) * 255);
}

/** Zavře AudioContext (při zavírání okna). Element zůstává svázaný se zavřeným grafem –
 *  createMediaElementSource na něj podruhé zavolat nejde, takže se z mapy neodebírá. */
export function closeAudioGraph(audio: HTMLMediaElement | null) {
  getAudioGraph(audio)?.ctx.close().catch(() => {});
}
