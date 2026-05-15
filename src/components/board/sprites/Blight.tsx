export default function Blight({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Blight">
      <defs>
        <radialGradient id="blight-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5a1c66" />
          <stop offset="100%" stopColor="#1a0820" />
        </radialGradient>
      </defs>
      {/* Twisted thorny growth */}
      <circle cx="20" cy="22" r="11" fill="url(#blight-core)" stroke="#0a0210" strokeWidth="0.6" />
      <path d="M 20 22 L 11 8" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      <path d="M 20 22 L 30 9" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      <path d="M 20 22 L 7 19" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      <path d="M 20 22 L 34 22" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      <path d="M 20 22 L 10 33" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      <path d="M 20 22 L 30 34" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      <path d="M 20 22 L 22 36" stroke="#3a1840" strokeWidth="2" strokeLinecap="round" />
      {/* thorns at tips */}
      <circle cx="11" cy="8" r="1.8" fill="#180520" />
      <circle cx="30" cy="9" r="1.8" fill="#180520" />
      <circle cx="7" cy="19" r="1.8" fill="#180520" />
      <circle cx="34" cy="22" r="1.8" fill="#180520" />
      <circle cx="10" cy="33" r="1.8" fill="#180520" />
      <circle cx="30" cy="34" r="1.8" fill="#180520" />
      <circle cx="22" cy="36" r="1.8" fill="#180520" />
      {/* glow */}
      <circle cx="20" cy="22" r="3" fill="#a04fc0" opacity="0.6" />
    </svg>
  );
}
