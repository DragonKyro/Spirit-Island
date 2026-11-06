import { INK, Inked, Num } from './shared';

/** Range: an arrow in flight; shows `value` above it when given. */
export default function RangeIcon({ size = 24, value }: { size?: number; value?: number }) {
  const hasValue = value !== undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={hasValue ? `Range ${value}` : 'Range'}>
      {!hasValue && <path d="M6 26 Q20 6 34 26" fill="none" stroke={INK} strokeWidth="1.6" strokeDasharray="2.4 2.6" opacity="0.7" />}
      <Inked
        parts={[
          { d: 'M8 31 H29', stroke: '#8a5a2e', sw: 2.2 },
          { d: 'M28 26 L37 31 L28 36 L30 31 Z', fill: '#cfd6dc' },
          { d: 'M9.6 31 L5.6 26.4 L2.6 26.4 L6 31 L2.6 35.6 L5.6 35.6 Z', fill: '#d8342a' },
        ]}
        w={2.4}
      />
      {hasValue && <Num value={value} y={15.4} fs={String(value).length > 1 ? 17 : 21} fill="#fff" halo={INK} />}
    </svg>
  );
}
