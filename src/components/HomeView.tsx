import { Logo } from './art';

export default function HomeView({
  onPlayLocal,
  onPlayOnline,
  onContinue,
  canContinue,
  onRules,
  onHistory,
}: {
  onPlayLocal: () => void;
  onPlayOnline: () => void;
  onContinue: () => void;
  canContinue: boolean;
  onRules: () => void;
  onHistory?: () => void;
}) {
  return (
    <div className="home-view">
      <Logo width={460} />
      <p className="tagline">The island's Spirits rise against the Invaders. Grow, gather your power, and drive them into the sea.</p>
      <div className="home-buttons">
        {canContinue && (
          <button className="primary" onClick={onContinue}>
            Continue solo game
          </button>
        )}
        <button className={canContinue ? '' : 'primary'} onClick={onPlayLocal}>
          New solo / hot-seat game
        </button>
        <button onClick={onPlayOnline}>Play online with friends</button>
        <button className="secondary" onClick={onRules}>
          Rules reference
        </button>
        {onHistory && (
          <button className="secondary" onClick={onHistory}>
            History &amp; stats
          </button>
        )}
      </div>
      <p className="fine-print">
        A fan-made digital table for the base game of <em>Spirit Island</em> by R. Eric Reuss (Greater Than Games). Card text belongs to its owners.
      </p>
    </div>
  );
}
