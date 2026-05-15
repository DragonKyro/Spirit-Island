export default function Dahan({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Dahan">
      <defs>
        <linearGradient id="dahan-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c8895a" />
          <stop offset="100%" stopColor="#7a4a26" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="35" rx="9" ry="2.2" fill="rgba(0,0,0,0.35)" />
      {/* legs */}
      <path d="M 17 32 L 16.5 24 L 18.5 24 Z" fill="#3a2818" />
      <path d="M 23 32 L 22.5 24 L 24.5 24 Z" fill="#3a2818" />
      {/* skirt/loincloth */}
      <path d="M 14 24 Q 20 22 26 24 L 25 28 L 15 28 Z" fill="#5a3a22" />
      {/* torso */}
      <path d="M 15 22 Q 13 15 17 12 L 23 12 Q 27 15 25 22 Z" fill="url(#dahan-body)" stroke="#3a2010" strokeWidth="0.6" />
      {/* head */}
      <circle cx="20" cy="10" r="3.3" fill="#c8956a" stroke="#5a3320" strokeWidth="0.6" />
      {/* hair (dark, long) */}
      <path d="M 16.8 8 Q 17.5 5 20 4.5 Q 22.5 5 23.2 8 L 23 11 Q 23.5 13 22 13.5 L 18 13.5 Q 16.5 13 17 11 Z" fill="#1c1410" />
      {/* spear in right hand */}
      <line x1="29" y1="3" x2="22" y2="28" stroke="#5a3a1a" strokeWidth="1.2" />
      <polygon points="29,3 31.5,5 28,6.5" fill="#cdcdc8" stroke="#5a5a55" strokeWidth="0.4" />
      {/* arm */}
      <path d="M 25 16 Q 27 18 26 22" stroke="url(#dahan-body)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
