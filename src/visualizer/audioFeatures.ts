// Analýza zvuku pro vizualizace: vyhlazené úrovně pásem, spektrum v logaritmických pásmech
// a detekce beatu. Hodnoty 0–1, nezávislé na snímkové frekvenci.

export const SPECTRUM_BANDS = 64;
export const WAVE_POINTS = 256;

export interface AudioFeatures {
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  /** Celková hlasitost */
  energy: number;
  /** true jen ve snímku, kdy přišel beat */
  beat: boolean;
  /** 1 při beatu, pak plynule klesá k 0 (pro pulzy a záblesky) */
  pulse: number;
  /** Vyhlazené spektrum, SPECTRUM_BANDS pásem 30 Hz – 16 kHz (logaritmicky) */
  spectrum: Float32Array;
  /** Průběh vlny (osciloskop), WAVE_POINTS hodnot −1…1, vyhlazený */
  waveform: Float32Array;
  /** Hraje hudba (jinak je všechno 0) */
  playing: boolean;
}

const MIN_HZ = 30;
const MAX_HZ = 16000;

/** Vyhlazení: rychlý náběh, pomalejší dozvuk */
const smooth = (prev: number, next: number, dt: number, attack = 18, release = 5) =>
  prev + (next - prev) * Math.min(1, dt * (next > prev ? attack : release));

export class AudioAnalyzer {
  readonly features: AudioFeatures = {
    bass: 0, lowMid: 0, mid: 0, high: 0, energy: 0, beat: false, pulse: 0,
    spectrum: new Float32Array(SPECTRUM_BANDS), waveform: new Float32Array(WAVE_POINTS), playing: false,
  };
  private data: Uint8Array<ArrayBuffer> | null = null;
  private time: Uint8Array<ArrayBuffer> | null = null;
  private edges: number[] = [];
  private binHz = 0;
  // Detekce beatu: energie basů proti klouzavému průměru
  private bassAvg = 0;
  private sinceBeat = 1;

  update(analyser: AnalyserNode | null, playing: boolean, dt: number) {
    const f = this.features;
    f.beat = false;
    f.pulse = Math.max(0, f.pulse - dt * 3.2);
    f.playing = playing && !!analyser;

    if (!analyser || !playing) {
      // Plynulé doznění po pauze
      f.bass = smooth(f.bass, 0, dt); f.lowMid = smooth(f.lowMid, 0, dt);
      f.mid = smooth(f.mid, 0, dt); f.high = smooth(f.high, 0, dt); f.energy = smooth(f.energy, 0, dt);
      for (let i = 0; i < SPECTRUM_BANDS; i++) f.spectrum[i] = smooth(f.spectrum[i], 0, dt);
      for (let i = 0; i < WAVE_POINTS; i++) f.waveform[i] = smooth(f.waveform[i], 0, dt);
      return;
    }

    if (!this.data || this.data.length !== analyser.frequencyBinCount) {
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.binHz = analyser.context.sampleRate / analyser.fftSize;
      this.edges = Array.from({ length: SPECTRUM_BANDS + 1 }, (_, i) =>
        Math.min(this.data!.length - 1, Math.max(1, Math.round((MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / SPECTRUM_BANDS)) / this.binHz))),
      );
    }
    const data = this.data;
    analyser.getByteFrequencyData(data);
    if (!this.time || this.time.length !== analyser.fftSize) this.time = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(this.time);
    // Vlna: začít v průchodu nulou nahoru (obraz „stojí“, neposkakuje), pak převzorkovat
    const td = this.time;
    let start = 0;
    for (let i = 1; i < td.length / 2; i++) if (td[i - 1] < 128 && td[i] >= 128) { start = i; break; }
    const span = Math.min(td.length - start, 1024);
    for (let i = 0; i < WAVE_POINTS; i++) {
      const v = (td[start + Math.floor((i / WAVE_POINTS) * span)] - 128) / 128;
      f.waveform[i] += (v - f.waveform[i]) * Math.min(1, dt * 30);
    }

    const band = (lo: number, hi: number) => {
      const a = Math.max(0, Math.floor(lo / this.binHz));
      const b = Math.min(data.length - 1, Math.ceil(hi / this.binHz));
      let s = 0;
      for (let i = a; i <= b; i++) s += data[i];
      return b >= a ? s / ((b - a + 1) * 255) : 0;
    };
    const bass = band(20, 140);
    f.bass = smooth(f.bass, bass, dt);
    f.lowMid = smooth(f.lowMid, band(140, 500), dt);
    f.mid = smooth(f.mid, band(500, 2500), dt);
    f.high = smooth(f.high, band(4000, 14000), dt);
    f.energy = smooth(f.energy, band(20, 14000), dt);

    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      let peak = 0;
      for (let b = this.edges[i]; b <= Math.max(this.edges[i], this.edges[i + 1] - 1); b++) peak = Math.max(peak, data[b]);
      // Výšky mají v hudbě menší energii – mírné zvýraznění, ať spektrum není jen „vlevo“
      const tilt = 1 + (i / SPECTRUM_BANDS) * 0.6;
      f.spectrum[i] = smooth(f.spectrum[i], Math.min(1, (peak / 255) * tilt) ** 1.4, dt, 25, 7);
    }

    // Beat: basy výrazně nad průměrem posledních ~1,5 s a nejdřív 0,22 s po minulém
    this.sinceBeat += dt;
    this.bassAvg += (bass - this.bassAvg) * Math.min(1, dt * 0.7);
    if (bass > 0.25 && bass > this.bassAvg * 1.25 + 0.04 && this.sinceBeat > 0.22) {
      f.beat = true;
      f.pulse = 1;
      this.sinceBeat = 0;
    }
  }
}
