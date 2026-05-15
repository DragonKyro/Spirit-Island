export default function Presence({ size = 22, color = '#d4a14a' }: { size?: number; color?: string }) {
  const gradId = `pres-grad-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Presence">
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="40%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.2" />
        </radialGradient>
      </defs>
      {/* halo */}
      <circle cx="20" cy="20" r="16" fill={color} opacity="0.18" />
      <circle cx="20" cy="20" r="12" fill={color} opacity="0.28" />
      {/* core orb */}
      <circle cx="20" cy="20" r="9" fill={`url(#${gradId})`} stroke={color} strokeWidth="0.8" />
      {/* rune mark */}
      <path d="M 16 20 L 20 14 L 24 20 L 20 26 Z" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9" />
      <circle cx="20" cy="20" r="1.6" fill="#fff" />
    </svg>
  );
}
