export default function Town({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Town">
      <defs>
        <linearGradient id="town-wall" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d8c7a0" />
          <stop offset="100%" stopColor="#8a7548" />
        </linearGradient>
        <linearGradient id="town-roof" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c84f4f" />
          <stop offset="100%" stopColor="#7a2828" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="36" rx="14" ry="2.5" fill="rgba(0,0,0,0.35)" />
      {/* Back small building */}
      <rect x="6" y="18" width="11" height="13" fill="url(#town-wall)" stroke="#4d3920" strokeWidth="0.6" />
      <polygon points="5,18 17,18 11,11" fill="url(#town-roof)" stroke="#3a1414" strokeWidth="0.6" />
      <rect x="9" y="22" width="2.5" height="3" fill="#3a2a14" />
      {/* Main building (foreground) */}
      <rect x="16" y="14" width="15" height="18" fill="url(#town-wall)" stroke="#4d3920" strokeWidth="0.7" />
      <polygon points="15,14 32,14 23.5,5" fill="url(#town-roof)" stroke="#3a1414" strokeWidth="0.7" />
      <rect x="18" y="20" width="3" height="4" fill="#3a2a14" />
      <rect x="25" y="20" width="3" height="4" fill="#3a2a14" />
      <rect x="21.5" y="25" width="4" height="7" fill="#2a1c0c" />
      {/* Chimney */}
      <rect x="26" y="6" width="2.2" height="6" fill="#7a5a3a" />
    </svg>
  );
}
