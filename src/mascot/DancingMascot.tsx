import { BODY_PATHS, CORE, CYAN, HEAD_3Q, HEAD_PIVOT, PINK } from './gridMascot';

const BEAT_S = 0.5; // 120 BPM

/**
 * VR panáček se sluchátky (hlava natočená do tří čtvrtin jako na ikoně), který pokyvuje hlavou
 * do rytmu – na každou dobu kývne dolů a vrátí se; tělo lehce pruží. Úvodní animace a prázdný playlist.
 */
export function DancingMascot({ className = '', beat = BEAT_S, headOnly = false }: { className?: string; beat?: number; headOnly?: boolean }) {
  const lines = (paths: string[], color: string, width: number, opacity = 1) =>
    paths.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />);
  return (
    <>
      <style>{`
        /* Kývnutí do rytmu jako člověk: panáček kouká doleva, takže brada jde dolů a dopředu
           = otočení proti směru hodinových ručiček (záporný úhel). Rychle dolů na dobu,
           pomalejší měkký návrat s lehkým dozvukem. */
        @keyframes grid-dm-nod {
          0%   { transform: rotate(0deg) translate(0, 0); animation-timing-function: cubic-bezier(.3, 0, .2, 1); }
          16%  { transform: rotate(-9deg) translate(-2px, 3px); animation-timing-function: cubic-bezier(.4, 0, .4, 1); }
          58%  { transform: rotate(1.5deg) translate(0, -1px); animation-timing-function: ease-in-out; }
          100% { transform: rotate(0deg) translate(0, 0); }
        }
        @keyframes grid-dm-body {
          0%, 100% { transform: translateY(0); }
          16%      { transform: translateY(2px); }
          58%      { transform: translateY(-0.5px); }
        }
        .grid-dm-head { transform-box: view-box; transform-origin: ${HEAD_PIVOT.x}px ${HEAD_PIVOT.y}px; animation: grid-dm-nod ${beat}s infinite; }
        .grid-dm-body { animation: grid-dm-body ${beat}s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .grid-dm-head, .grid-dm-body { animation: none; } }
      `}</style>
      <svg
        viewBox={headOnly ? '40 -12 176 176' : '0 0 256 256'}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ filter: `drop-shadow(0 0 6px ${CYAN}) drop-shadow(0 0 14px rgba(0,243,255,.45))`, overflow: 'visible' }}
        aria-hidden="true"
      >
        {!headOnly && (
          <g className="grid-dm-body">
            {lines(BODY_PATHS, CYAN, 5.5)}
            {lines(BODY_PATHS, CORE, 1.65, 0.75)}
          </g>
        )}
        <g className="grid-dm-head">
          {lines(HEAD_3Q.head, CYAN, 5.5)}
          {lines(HEAD_3Q.head, CORE, 1.65, 0.75)}
          <g transform={HEAD_3Q.faceTransform}>
            {lines(HEAD_3Q.face, CYAN, 5.5)}
            {lines(HEAD_3Q.face, CORE, 1.65, 0.75)}
          </g>
          {lines(HEAD_3Q.band, CYAN, 6)}
          {lines(HEAD_3Q.band, CORE, 1.8, 0.75)}
          {lines(HEAD_3Q.cups, CYAN, 6.5)}
          {lines(HEAD_3Q.cups, CORE, 1.9, 0.75)}
          {lines(HEAD_3Q.accent, PINK, 8)}
        </g>
      </svg>
    </>
  );
}
