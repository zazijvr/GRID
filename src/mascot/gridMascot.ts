// VR panáček GRIDu se sluchátky – sdílené tvary pro úvodní animaci (React) i ikonu aplikace
// (scripts/gen-android-icon.mjs je vykreslí do PNG). Souřadnice ve viewBoxu 0 0 256 256.
// Hlava (head) se v animaci kývá kolem krku – bod HEAD_PIVOT.

export const CYAN = '#00f3ff';
export const CORE = '#e6ffff';
export const PINK = '#f72585';

export const HEAD_PIVOT = { x: 128, y: 132 };

/** Tělo a ruce */
export const BODY_PATHS = [
  'M100 139 C84 150 68 170 63 194 C61 206 65 215 73 216 C81 217 85 209 86 201 C89 187 95 173 105 161 Z',
  'M 156 139 C 172 150 188 170 193 194 C 195 206 191 215 183 216 C 175 217 171 209 170 201 C 167 187 161 173 151 161 Z',
  'M104 130 C86 142 80 166 80 194 C80 212 83 226 88 238 Q96 252 109 243 L120 218 Q128 211 136 218 L147 243 Q160 252 168 238 C173 226 176 212 176 194 C176 166 170 142 152 130 Z',
];

/** Hlava: obrys, úsměv, brýle VR (vnější a vnitřní rámeček) */
export const HEAD_PATHS = [
  'M72 80 A56 56 0 1 1 184 80 A56 56 0 1 1 72 80 Z',
  'M114 119 Q128 129 142 119',
  'M86 54 H168 Q186 54 186 72 V84 Q186 104 166 104 H148 Q140 104 136 97 Q128 86 120 97 Q116 104 108 104 H90 Q70 104 70 84 V72 Q70 54 86 54 Z',
  'M89 62 H166 Q178 62 178 73 V83 Q178 96 165 96 H149 Q143 96 140 91 Q128 76 116 91 Q113 96 107 96 H91 Q78 96 78 83 V73 Q78 62 89 62 Z',
];

/** Sluchátka: oblouk přes hlavu a mušle po stranách (azurové) */
export const HEADPHONE_PATHS = [
  'M60 84 C54 -8 202 -8 196 84',
  'M48 70 Q48 62 56 62 H64 Q70 62 70 70 V102 Q70 110 64 110 H56 Q48 110 48 102 Z',
  'M186 70 Q186 62 192 62 H200 Q208 62 208 70 V102 Q208 110 200 110 H192 Q186 110 186 102 Z',
];

/** Polstrování mušlí (růžový akcent) */
export const HEADPHONE_ACCENT_PATHS = [
  'M59 73 V99',
  'M197 73 V99',
];

/** Celý panáček jako samostatné SVG (ikona); glow = neonová záře (rozmazaná vrstva pod čarami) */
export function mascotSvg({ glow = true, mono = false }: { glow?: boolean; mono?: boolean } = {}): string {
  const line = mono ? '#ffffff' : CYAN;
  const core = mono ? '#ffffff' : CORE;
  const accent = mono ? '#ffffff' : PINK;
  const strokes = (paths: string[], color: string, w: number, extra = '') =>
    paths.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${extra}/>`).join('');
  const shape =
    strokes(BODY_PATHS, line, 5.5) + strokes(HEAD_PATHS, line, 5.5) + strokes(HEADPHONE_PATHS, line, 6.5) +
    strokes(HEADPHONE_ACCENT_PATHS, accent, 9);
  const cores = mono ? '' :
    strokes(BODY_PATHS, core, 1.65, ' opacity=".75"') + strokes(HEAD_PATHS, core, 1.65, ' opacity=".75"') +
    strokes(HEADPHONE_PATHS, core, 1.9, ' opacity=".75"');
  const glowLayer = glow && !mono ? `<g filter="url(#glow)" opacity=".65">${shape}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" stroke-linecap="round" stroke-linejoin="round">` +
    `<defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>` +
    `${glowLayer}${shape}${cores}</svg>`;
}
