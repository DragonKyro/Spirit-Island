import { Inked, ellipsePath, spiralPath, useUid } from './shared';

/** Slow power: a blue turtle (top-down) with a spiral shell. */
export default function SlowIcon({ size = 24 }: { size?: number }) {
  const id = useUid('sl');
  const limb = '#5d8fe0';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Slow">
      <defs>
        <radialGradient id={`${id}-s`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#8fb8ff" />
          <stop offset="0.55" stopColor="#3c69c2" />
          <stop offset="1" stopColor="#1c3778" />
        </radialGradient>
      </defs>
      <Inked
        parts={[
          { d: ellipsePath(28, 10, 4.4, 2.4), fill: limb, transform: 'rotate(-38 28 10)' },
          { d: ellipsePath(28, 30, 4.4, 2.4), fill: limb, transform: 'rotate(38 28 30)' },
          { d: ellipsePath(11, 10.6, 4, 2.3), fill: limb, transform: 'rotate(38 11 10.6)' },
          { d: ellipsePath(11, 29.4, 4, 2.3), fill: limb, transform: 'rotate(-38 11 29.4)' },
          { d: 'M7.6 18 L2.4 20 L7.6 22 Z', fill: limb },
          { d: ellipsePath(34, 20, 4.4, 3.6), fill: limb },
          { d: ellipsePath(19.4, 20, 12, 10), fill: `url(#${id}-s)` },
        ]}
      />
      <path d={spiralPath(19.4, 20, 7.8, 2.3)} transform="translate(19.4 20) scale(1 0.84) translate(-19.4 -20)" fill="none" stroke="#d6e6ff" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="19.4" cy="20" rx="10.4" ry="8.5" fill="none" stroke="#14275a" strokeWidth="0.8" opacity="0.7" />
      <circle cx="36" cy="18.4" r="0.9" fill="#0d1a3a" />
      <circle cx="36" cy="21.6" r="0.9" fill="#0d1a3a" />
    </svg>
  );
}
