export default function City({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="City">
      <defs>
        <linearGradient id="city-wall" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#9aa1ad" />
          <stop offset="100%" stopColor="#4a4f5a" />
        </linearGradient>
        <linearGradient id="city-roof" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a83838" />
          <stop offset="100%" stopColor="#5a1a1a" />
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="44" rx="20" ry="3" fill="rgba(0,0,0,0.4)" />
      {/* Outer wall base */}
      <rect x="3" y="28" width="42" height="14" fill="url(#city-wall)" stroke="#2a2e36" strokeWidth="0.8" />
      {/* Wall battlements */}
      <rect x="3" y="26" width="4" height="3" fill="#6a707b" />
      <rect x="10" y="26" width="4" height="3" fill="#6a707b" />
      <rect x="17" y="26" width="4" height="3" fill="#6a707b" />
      <rect x="24" y="26" width="4" height="3" fill="#6a707b" />
      <rect x="31" y="26" width="4" height="3" fill="#6a707b" />
      <rect x="38" y="26" width="4" height="3" fill="#6a707b" />
      {/* Left tower */}
      <rect x="6" y="14" width="9" height="20" fill="url(#city-wall)" stroke="#2a2e36" strokeWidth="0.7" />
      <polygon points="5,14 16,14 10.5,5" fill="url(#city-roof)" stroke="#3a1414" strokeWidth="0.7" />
      {/* Center keep (tallest) */}
      <rect x="18" y="9" width="13" height="25" fill="url(#city-wall)" stroke="#2a2e36" strokeWidth="0.8" />
      <polygon points="17,9 32,9 24.5,1" fill="url(#city-roof)" stroke="#3a1414" strokeWidth="0.8" />
      <rect x="23.5" y="2" width="0.8" height="6" fill="#3a1414" />
      <polygon points="24.3,2.4 28,3.6 24.3,4.8" fill="#d4a14a" />
      {/* Right tower */}
      <rect x="33" y="14" width="9" height="20" fill="url(#city-wall)" stroke="#2a2e36" strokeWidth="0.7" />
      <polygon points="32,14 43,14 37.5,5" fill="url(#city-roof)" stroke="#3a1414" strokeWidth="0.7" />
      {/* Windows */}
      <rect x="9" y="20" width="2.5" height="3.5" fill="#1a1a1a" />
      <rect x="36" y="20" width="2.5" height="3.5" fill="#1a1a1a" />
      <rect x="21" y="14" width="2.5" height="3.5" fill="#1a1a1a" />
      <rect x="25.5" y="14" width="2.5" height="3.5" fill="#1a1a1a" />
      <rect x="21" y="20" width="2.5" height="3.5" fill="#1a1a1a" />
      <rect x="25.5" y="20" width="2.5" height="3.5" fill="#1a1a1a" />
      {/* Gate */}
      <rect x="22" y="34" width="5" height="9" fill="#1a0d0d" />
    </svg>
  );
}
