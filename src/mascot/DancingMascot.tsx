import { BODY_PATHS, CORE, CYAN, HEAD_3Q, HEAD_PIVOT, PINK } from './gridMascot';

const BEAT_S = 0.5; // 120 BPM

/**
 * VR panáček se sluchátky (hlava natočená do tří čtvrtin jako na ikoně), který pokyvuje hlavou
 * do rytmu – na každou dobu kývne dolů a vrátí se; tělo lehce pruží. Úvodní animace a prázdný playlist.
 */
export function DancingMascot({ className = '', beat = BEAT_S }: { className?: string; beat?: number }) {
  const lines = (paths: string[], color: string, width: number, opacity = 1) =>
    paths.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />);
  return (
    <>
      <style>{`
        @keyframes grid-dm-nod {
          0%   { transform: rotate(0deg) translateY(0); }
          22%  { transform: rotate(7deg) translateY(6px); }
          55%  { transform: rotate(-2deg) translateY(-1px); }
          100% { transform: rotate(0deg) translateY(0); }
        }
        @keyframes grid-dm-body {
          0%, 100% { transform: translateY(0); }
          22%      { transform: translateY(3px); }
          55%      { transform: translateY(-1px); }
        }
        .grid-dm-head { transform-box: view-box; transform-origin: ${HEAD_PIVOT.x}px ${HEAD_PIVOT.y}px; animation: grid-dm-nod ${beat}s ease-in-out infinite; }
        .grid-dm-body { animation: grid-dm-body ${beat}s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .grid-dm-head, .grid-dm-body { animation: none; } }
      `}</style>
      <svg
        viewBox="0 0 256 256"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ filter: `drop-shadow(0 0 6px ${CYAN}) drop-shadow(0 0 14px rgba(0,243,255,.45))`, overflow: 'visible' }}
        aria-hidden="true"
      >
        <g className="grid-dm-body">
          {lines(BODY_PATHS, CYAN, 5.5)}
          {lines(BODY_PATHS, CORE, 1.65, 0.75)}
        </g>
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
