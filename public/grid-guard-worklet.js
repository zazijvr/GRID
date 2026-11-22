// Pojistka na konci zvukového grafu: do systému nikdy nepustí neplatná čísla (NaN / nekonečno).
// Jinak by je mixer (PipeWire) sečetl se zvukem ostatních aplikací a ztichlo by všechno, dokud
// se GRID neztlumí. Když na ně narazí, nahradí je tichem a ohlásí to (graf si obnoví filtry).
class GridGuard extends AudioWorkletProcessor {
  constructor() {
    super();
    this.reported = false;
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    let bad = false;
    for (let c = 0; c < output.length; c++) {
      const src = input[c] || input[0];
      const dst = output[c];
      if (!src) { dst.fill(0); continue; }
      for (let i = 0; i < dst.length; i++) {
        const x = src[i];
        if (x !== x || x === Infinity || x === -Infinity) { dst[i] = 0; bad = true; }
        else dst[i] = x > 1 ? 1 : x < -1 ? -1 : x;
      }
    }
    if (bad && !this.reported) this.port.postMessage('invalid');
    this.reported = bad;
    return true;
  }
}
registerProcessor('grid-guard', GridGuard);
