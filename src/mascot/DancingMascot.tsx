import { BODY_PATHS, CORE, CYAN, HEAD_PATHS, HEAD_PIVOT, HEADPHONE_ACCENT_PATHS, HEADPHONE_PATHS, PINK } from './gridMascot';

const BEAT_S = 0.5; // 120 BPM

/** VR panáček se sluchátky, který kývá hlavou do rytmu (prázdný playlist na telefonu) */
export function DancingMascot({ className = '' }: { className?: string }) {
  const lines = (paths: string[], color: string, width: number, opacity = 1) =>
    paths.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />);
  return (
    <>
      <style>{`
        @keyframes grid-dm-head {
          0%   { transform: rotate(-7deg) translateY(0); }
          18%  { transform: rotate(5deg) translateY(4px); }
          50%  { transform: rotate(7deg) translateY(0); }
          68%  { transform: rotate(-5deg) translateY(4px); }
          100% { transform: rotate(-7deg) translateY(0); }
        }
        @keyframes grid-dm-body { 0%, 50%, 100% { transform: translateY(0); } 18%, 68% { transform: translateY(3px); } }
        .grid-dm-head { transform-box: view-box; transform-origin: ${HEAD_PIVOT.x}px ${HEAD_PIVOT.y}px; animation: grid-dm-head ${BEAT_S * 2}s ease-in-out infinite; }
        .grid-dm-body { animation: grid-dm-body ${BEAT_S * 2}s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .grid-dm-head, .grid-dm-body { animation: none; } }
      `}</style>
      <svg
        viewBox="0 0 256 256"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ filter: `drop-shadow(0 0 6px ${CYAN}) drop-shadow(0 0 14px rgba(0,243,255,.45))` }}
        aria-hidden="true"
      >
        <g className="grid-dm-body">
          {lines(BODY_PATHS, CYAN, 5.5)}
          {lines(BODY_PATHS, CORE, 1.65, 0.75)}
        </g>
        <g className="grid-dm-head">
          {lines(HEAD_PATHS, CYAN, 5.5)}
          {lines(HEAD_PATHS, CORE, 1.65, 0.75)}
          {lines(HEADPHONE_PATHS, CYAN, 6.5)}
          {lines(HEADPHONE_PATHS, CORE, 1.9, 0.75)}
          {lines(HEADPHONE_ACCENT_PATHS, PINK, 9)}
        </g>
      </svg>
    </>
  );
}
