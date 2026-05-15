export default function Explorer({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Explorer">
      <defs>
        <radialGradient id="exp-coat" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#d96565" />
          <stop offset="100%" stopColor="#8a2c2c" />
        </radialGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="20" cy="35" rx="9" ry="2.2" fill="rgba(0,0,0,0.35)" />
      {/* legs */}
      <path d="M 17 32 L 16 24 L 18 24 Z" fill="#2a2a2a" />
      <path d="M 23 32 L 22 24 L 24 24 Z" fill="#2a2a2a" />
      {/* body / coat */}
      <path d="M 14 24 Q 12 17 16 13 L 24 13 Q 28 17 26 24 Z" fill="url(#exp-coat)" stroke="#3a1414" strokeWidth="0.7" />
      {/* arm holding musket */}
      <rect x="25" y="16" width="2" height="9" rx="0.5" fill="#a04a4a" transform="rotate(15 26 20)" />
      <rect x="27" y="9" width="1.4" height="14" fill="#3d2a1c" transform="rotate(15 28 16)" />
      <rect x="27" y="22" width="3.2" height="1.2" fill="#222" transform="rotate(15 28.6 22.6)" />
      {/* head */}
      <circle cx="20" cy="11" r="3.2" fill="#e8c598" stroke="#6e4a2a" strokeWidth="0.6" />
      {/* tricorn hat */}
      <path d="M 14.5 9 Q 20 4 25.5 9 Q 20 7.5 14.5 9 Z" fill="#1a1a1a" />
      <path d="M 16 8.5 Q 20 5 24 8.5 L 23 10 L 17 10 Z" fill="#2a2a2a" />
    </svg>
  );
}
