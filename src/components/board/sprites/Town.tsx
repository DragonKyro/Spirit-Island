import { Inked, Scorch, useUid } from '../../art/shared';

/** Town: a tall gabled house behind a timber-framed longhouse with a chimney. */
export default function Town({ size = 32, damaged = 0 }: { size?: number; damaged?: number }) {
  const id = useUid('town');
  const hurt = damaged > 0;
  const wall = `url(#${id}-w)`;
  const roof = `url(#${id}-r)`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={hurt ? 'Town (damaged)' : 'Town'}>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8efd8" />
          <stop offset="1" stopColor="#c4ac80" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9623f" />
          <stop offset="1" stopColor="#8a2c1c" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="36.4" rx="16" ry="2.4" fill="#000" opacity="0.32" />
      <g transform={hurt ? 'translate(20 21.5) rotate(80) scale(0.86) translate(-20.4 -22.2)' : undefined}>
        <Inked
          parts={[
            { d: 'M5 18.6 H17 V33.6 H5 Z', fill: wall },
            { d: 'M3.2 19.4 L11 9.4 L18.8 19.4 Z', fill: roof },
            { d: 'M27.4 16 V9.4 H31 V16 Z', fill: '#8a5a3a' },
            { d: 'M13.4 22.6 H35.4 V35 H13.4 Z', fill: wall },
            { d: 'M11.2 23.4 L16.2 13.6 L32.6 13.6 L37.6 23.4 Z', fill: roof },
          ]}
        />
        <path d="M11 9.8 L18.4 19 H11 Z" fill="#000" opacity="0.2" />
        <rect x="8.6" y="22.2" width="4.8" height="4.6" fill="#3a2716" />
        <path d="M11 22.2 V26.8 M8.6 24.5 H13.4" stroke="#e9dcbc" strokeWidth="0.7" />
        <path d="M13.4 27.8 H35.4 M20.6 22.6 V35 M28.4 22.6 V35 M14 23 L20.2 27.4 M34.8 23 L28.8 27.4" stroke="#5b3b22" strokeWidth="1" fill="none" />
        <path d="M22.4 35 V30 Q24.5 28 26.6 30 V35 Z" fill="#3a2414" />
        <rect x="15.2" y="29.4" width="3.6" height="3.4" fill="#3a2716" />
        <rect x="30" y="29.4" width="3.6" height="3.4" fill="#3a2716" />
        <path d="M13.6 19.6 H35.2 M15 16.6 H33.8" stroke="#7a2416" strokeWidth="0.7" />
        <path d="M16.4 13.8 H32.4" stroke="#f0a07e" strokeWidth="0.8" />
      </g>
      {hurt && <Scorch cx={21} cy={26} r={8} />}
    </svg>
  );
}
