import { PresenceArt } from './PresenceArt';

/** Sacred site: stacked presence over a radiant burst (neutral gold). */
export default function SacredSiteIcon({ size = 24, color = '#e3b44f' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Sacred Site">
      <PresenceArt color={color} sacred />
    </svg>
  );
}
