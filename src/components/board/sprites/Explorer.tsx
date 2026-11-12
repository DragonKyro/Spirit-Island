import { INK, Inked, Scorch, circlePath, useUid } from '../../art/shared';

/** Explorer: a colonist in a buff coat and brimmed hat, holding a red-pennant staff. */
export default function Explorer({ size = 28, damaged = 0 }: { size?: number; damaged?: number }) {
  const id = useUid('exp');
  const hurt = damaged > 0;
  const coat = `url(#${id}-coat)`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={hurt ? 'Explorer (damaged)' : 'Explorer'}>
      <defs>
        <linearGradient id={`${id}-coat`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#fdf5df" />
          <stop offset="1" stopColor="#b79c6c" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="36.4" rx={hurt ? 15 : 10} ry="2.3" fill="#000" opacity="0.32" />
      <g transform={hurt ? 'translate(20 23) rotate(-80) scale(0.92) translate(-25.2 -20.3)' : undefined}>
        <Inked
          parts={[
            { d: 'M29.6 4.6 L28.6 36', stroke: '#6e4826', sw: 2 },
            { d: 'M29.6 4.8 L38.4 8.2 L29.8 11.8 Z', fill: '#c8352a' },
            { d: 'M14.8 29 h3.6 v7 h-3.6 Z M20.6 29 h3.6 v7 h-3.6 Z', fill: '#3a281c' },
            { d: 'M12 31.8 C12 25 13.4 20.4 15.8 18.4 L23.6 18.4 C26 20.4 27.2 25 27.2 31.8 Q19.6 33.8 12 31.8 Z', fill: coat },
            { d: 'M24.2 20.4 Q27.2 21.6 28.4 24.4', stroke: coat, sw: 3 },
            { d: circlePath(28.6, 24.8, 1.8), fill: '#e8c09a' },
            { d: circlePath(19.6, 14.2, 4), fill: '#eec89e' },
            { d: 'M12.4 11.4 Q19.6 8.8 26.8 11.4 Q19.6 13.6 12.4 11.4 Z', fill: '#2b1e16' },
            { d: 'M15.8 11 C15.8 7.4 17.3 6 19.6 6 C21.9 6 23.4 7.4 23.4 11 Z', fill: '#3d2c21' },
          ]}
        />
        <path d="M19.6 19 V31.6" stroke="#8d7550" strokeWidth="0.7" opacity="0.8" />
        <path d="M12.6 25.6 Q19.6 27.6 26.6 25.6" stroke="#6b4423" strokeWidth="1.8" fill="none" />
        <rect x="18.5" y="25.7" width="2.3" height="2.1" fill="#e2bb52" stroke={INK} strokeWidth="0.4" />
        <path d="M16 9.8 Q19.6 8.8 23.2 9.8" stroke="#a8322a" strokeWidth="1" fill="none" />
        <path d="M30.4 6.6 L35 8.2" stroke="#f2d27a" strokeWidth="0.8" />
      </g>
      {hurt && <Scorch cx={20} cy={27} r={7} />}
    </svg>
  );
}
