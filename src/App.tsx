import { useEffect, useState } from 'react';
import { ADVERSARIES, ADVERSARY_ORDER } from './engine/adversary';
import { SPIRITS, SPIRIT_ORDER } from './engine/spiritData';
import type { GameSetup } from './engine/state';
import { BOARD_NAMES } from './engine/types';
import type { AdversaryId, BoardName, SpiritId } from './engine/types';
import GameView from './components/GameView';
import HomeView from './components/HomeView';
import RulesView from './components/RulesView';
import SetupView, { assignBoards, randomSeed } from './components/SetupView';
import OnlineLobby from './components/online/OnlineLobby';
import type { LobbyState } from './net/types';
import { useGameStore } from './store/gameStore';
import { offlineSeats, useNetworkStore } from './store/networkStore';
import HistoryView from './components/HistoryView';
import { loadHistory } from './store/history';
import { SPIRIT_COLORS } from './components/art';

export type ViewName = 'home' | 'setup' | 'game' | 'rules' | 'online' | 'history';

const SPIRIT_OPTIONS = SPIRIT_ORDER.map((id) => ({ id, name: SPIRITS[id].name, color: SPIRIT_COLORS[id], complexity: SPIRITS[id].complexity }));
const ADVERSARY_OPTIONS = ADVERSARY_ORDER.map((id) => ({ id, name: ADVERSARIES[id].name, maxLevel: id === 'none' ? 0 : 6 }));

/** Validate a setup that arrived over the network before handing it to the engine. */
function asSetup(x: unknown): GameSetup | null {
  const s = x as GameSetup;
  if (!s || s.v !== 1 || typeof s.seed !== 'number') return null;
  if (!Array.isArray(s.spirits) || !s.spirits.length || s.spirits.length > 4) return null;
  if (!s.spirits.every((id) => SPIRIT_ORDER.includes(id))) return null;
  if (!Array.isArray(s.boards) || s.boards.length !== s.spirits.length || !s.boards.every((b) => BOARD_NAMES.includes(b))) return null;
  if (!ADVERSARY_ORDER.includes(s.adversary) || typeof s.adversaryLevel !== 'number') return null;
  return s;
}

function setupFromLobby(lobby: LobbyState): GameSetup {
  const seats = lobby.seats;
  const adv = (ADVERSARY_ORDER.includes(lobby.settings.adversary as AdversaryId) ? lobby.settings.adversary : 'none') as AdversaryId;
  const chosen = seats.map((_, i) => {
    const b = lobby.settings.boards[i];
    return BOARD_NAMES.includes(b as BoardName) ? (b as BoardName) : null;
  });
  // ignore duplicate picks
  const seen = new Set<string>();
  const dedup = chosen.map((b) => (b && !seen.has(b) ? (seen.add(b), b) : null));
  return {
    v: 1,
    seed: randomSeed(),
    spirits: seats.map((s) => s.spirit as SpiritId),
    boards: assignBoards(dedup),
    adversary: adv,
    adversaryLevel: adv === 'none' ? 0 : Math.max(0, Math.min(6, lobby.settings.adversaryLevel)),
    names: seats.map((s) => s.name),
  };
}

/** Keeps the game store in step with the room's start record and action log. */
function useOnlineBridge(active: boolean) {
  const start = useNetworkStore((s) => s.start);
  const actions = useNetworkStore((s) => s.actions);
  const lobby = useNetworkStore((s) => s.lobby);
  const me = useNetworkStore((s) => s.me);
  const match = useNetworkStore((s) => s.match);
  const { startOnline, syncOnline, setSender } = useGameStore();
  const game = useGameStore((s) => s.game);

  useEffect(() => {
    if (!active || !start) return;
    const setup = asSetup(start.setup);
    if (!setup) return;
    const seat = lobby ? lobby.seats.findIndex((s) => s.uuid === me.uuid) : -1;
    startOnline(setup, seat >= 0 ? seat : null);
    setSender((a) => {
      useNetworkStore.getState().sendAction(a).catch((e: Error) => console.warn('[net] send failed', e.message));
    });
    return () => setSender(null);
    // a new match index means a new game
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, start, match]);

  useEffect(() => {
    if (active && game) syncOnline(actions);
  }, [active, actions, game, syncOnline]);
}

function OnlineBar() {
  const { roomCode, connected, isHost, presence, lobby } = useNetworkStore();
  const { seat, undoRequest, requestUndo, voteUndo } = useGameStore();
  const game = useGameStore((s) => s.game);
  useGameStore((s) => s.tick);
  const result = game?.gs.result.kind;
  const players = game?.setup.spirits.length ?? 0;
  const nameOf = (i: number) => game?.setup.names?.[i] ?? game?.gs.spirits[i]?.name ?? `Seat ${i + 1}`;
  const off = lobby ? offlineSeats(lobby.seats, presence).map((s) => s.name) : [];
  return (
    <section className={`panel online-bar${connected ? '' : ' warn'}`}>
      {!connected && <div className="ob-banner">Connection lost — reconnecting… Your moves will be sent once you are back online.</div>}
      <div className="ob-row">
        <span className={`dot ${connected ? 'on' : 'off'}`} /> Room <strong>{roomCode}</strong> · {presence.length} online
        {off.length > 0 && <span className="ob-off"> · offline: {off.join(', ')}</span>}
      </div>
      {seat === null && <div className="ob-row dim">👁 You are watching this game (no seat). Choices appear for the seated players.</div>}
      {undoRequest ? (
        <div className="ob-undo">
          <strong>{nameOf(undoRequest.by)}</strong> asks to undo the last move ({undoRequest.yes.length}/{players} agree).
          {seat !== null && !undoRequest.yes.includes(seat) ? (
            <>
              <button className="small" onClick={() => voteUndo(true)}>Agree</button>
              <button className="secondary small" onClick={() => voteUndo(false)}>Decline</button>
            </>
          ) : (
            <span className="dim"> Waiting for the others…</span>
          )}
        </div>
      ) : (
        seat !== null &&
        result === 'IN_PROGRESS' &&
        (game?.answers.length ?? 0) > 0 && (
          <button className="secondary small" onClick={requestUndo} title={players > 1 ? 'Every player must agree' : 'Undo the last move'}>
            ↶ {players > 1 ? 'Ask to undo last move' : 'Undo last move'}
          </button>
        )
      )}
      {isHost && result && result !== 'IN_PROGRESS' && (
        <button className="secondary small" onClick={() => useNetworkStore.getState().returnToLobby()}>
          Back to lobby
        </button>
      )}
    </section>
  );
}

/**
 * Dev only: `?demo=river,shadows&steps=40&seed=7&adv=sweden&lvl=2` starts a local game and
 * auto-answers `steps` decisions (first non-pass option), for screenshots and debugging.
 */
function devDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  const q = new URLSearchParams(location.search);
  const demo = q.get('demo');
  if (!demo) return false;
  const spirits = demo.split(',').filter((s) => SPIRIT_ORDER.includes(s as SpiritId)) as SpiritId[];
  if (!spirits.length) return false;
  const adv = (q.get('adv') ?? 'none') as AdversaryId;
  useGameStore.getState().startLocal({
    v: 1,
    seed: Number(q.get('seed') ?? 7),
    spirits,
    boards: BOARD_NAMES.slice(0, spirits.length) as BoardName[],
    adversary: ADVERSARY_ORDER.includes(adv) ? adv : 'none',
    adversaryLevel: Number(q.get('lvl') ?? 0),
  });
  for (let i = 0, n = Number(q.get('steps') ?? 0); i < n; i++) {
    const g = useGameStore.getState().game!;
    const d = g.gs.pending[0];
    if (!d) break;
    const o = d.options.find((x) => !x.done && x.key !== 'cancel') ?? d.options[0];
    useGameStore.getState().answer(d.id, o.key);
  }
  return true;
}

export default function App() {
  const [view, setView] = useState<ViewName>(() => {
    const q = new URLSearchParams(location.search);
    if (q.has('room')) return 'online';
    if (q.has('rules')) return 'rules';
    return devDemo() ? 'game' : 'home';
  });
  const { startLocal, resumeLocal, hasSave, quit } = useGameStore();
  const netStatus = useNetworkStore((s) => s.status);
  const start = useNetworkStore((s) => s.start);
  const online = view === 'online';
  useOnlineBridge(online);
  const [, force] = useState(0);

  const inOnlineGame = online && netStatus === 'playing' && !!start && !!asSetup(start.setup);
  const lobby = useNetworkStore((s) => s.lobby);
  const presence = useNetworkStore((s) => s.presence);
  const offlineSeatIndexes = lobby ? lobby.seats.map((s, i) => (presence.some((p) => p.uuid === s.uuid) ? -1 : i)).filter((i) => i >= 0) : [];

  switch (view) {
    case 'home':
      return (
        <HomeView
          canContinue={hasSave()}
          onContinue={() => {
            if (resumeLocal()) setView('game');
            else force((n) => n + 1);
          }}
          onPlayLocal={() => setView('setup')}
          onPlayOnline={() => setView('online')}
          onRules={() => setView('rules')}
          onHistory={loadHistory().length ? () => setView('history') : undefined}
        />
      );
    case 'setup':
      return (
        <SetupView
          onBack={() => setView('home')}
          onStart={(s) => {
            startLocal(s);
            setView('game');
          }}
        />
      );
    case 'game':
      return (
        <GameView
          onExit={() => {
            quit();
            setView('home');
          }}
        />
      );
    case 'history':
      return <HistoryView onBack={() => setView('home')} />;
    case 'rules':
      return <RulesView initial={new URLSearchParams(location.search).get('rules')} onBack={() => setView('home')} />;
    case 'online':
      if (inOnlineGame) {
        return (
          <GameView
            online={<OnlineBar />}
            offline={offlineSeatIndexes}
            onExit={() => {
              useNetworkStore.getState().leaveRoom();
              quit();
              history.replaceState(null, '', location.pathname);
              setView('home');
            }}
          />
        );
      }
      return (
        <OnlineLobby
          spirits={SPIRIT_OPTIONS}
          adversaries={ADVERSARY_OPTIONS}
          boards={[...BOARD_NAMES]}
          onStart={(lobby) => {
            useNetworkStore.getState().startMatch(setupFromLobby(lobby)).catch((e: Error) => console.warn('[net] start failed', e.message));
          }}
          onBack={() => {
            useNetworkStore.getState().leaveRoom();
            history.replaceState(null, '', location.pathname);
            setView('home');
          }}
        />
      );
  }
}
