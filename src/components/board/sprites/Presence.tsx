import { PresenceArt } from '../../art/PresenceArt';

/** Presence: a ringed disk in the spirit's colour; `sacred` = stacked disks over a radiant burst. */
export default function Presence({ size = 22, color = '#d4a14a', sacred = false }: { size?: number; color?: string; sacred?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={sacred ? 'Sacred Site' : 'Presence'}>
      <PresenceArt color={color} sacred={sacred} />
    </svg>
  );
}
