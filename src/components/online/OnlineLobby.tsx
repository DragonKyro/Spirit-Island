// The online lobby: going online (name, create / join a room) and the room's
// lobby (seats, spirits, the host's settings, chat). Everything shown comes
// from networkStore; edits are lobby transactions. The host's "Start game"
// hands the lobby to `onStart`, which builds the engine setup and calls
// networkStore.startMatch(setup).

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MAX_NAME_LENGTH,
  MAX_SEATS,
  lobbyStartProblem,
  useNetworkStore,
  warmUpNetwork,
} from '../../store/networkStore';
import { isRoomCode, normalizeRoomCode, roomCodeFromUrl, roomLink } from '../../net/roomLink';
import type { LobbyState, Seat } from '../../net/types';
import './OnlineLobby.css';

export interface SpiritOption {
  id: string;
  name: string;
  color: string;
  complexity: string;
}

export interface AdversaryOption {
  id: string;
  name: string;
  maxLevel: number;
}

export interface OnlineLobbyProps {
  spirits: SpiritOption[];
  adversaries: AdversaryOption[];
  /** Board letters the host can assign (a seat without one gets a random board). */
  boards: string[];
  /** Host pressed "Start game": build the setup from `lobby` and call networkStore.startMatch. */
  onStart: (lobby: LobbyState) => void;
  /** Leave the online screen (only offered when not in a room). */
  onBack: () => void;
}

const net = () => useNetworkStore.getState();

/** A ?room= link opens straight into the room once per page when this browser has a saved name. */
let urlJoinTried = false;

export default function OnlineLobby(props: OnlineLobbyProps): JSX.Element {
  const status = useNetworkStore((s) => s.status);

  // Load the online code and sign in while the player reads the screen.
  useEffect(() => {
    warmUpNetwork();
  }, []);

  if (status === 'connecting') return <Connecting />;
  if (status === 'lobby') return <RoomLobby {...props} />;
  if (status === 'playing') return <InGame />;
  return <GoOnline {...props} />;
}

// ---------------------------------------------------------------------------

function ErrorBanner() {
  const error = useNetworkStore((s) => s.error);
  if (!error) return null;
  return (
    <div className="ol-error" role="alert">
      <span>{error}</span>
      <button className="ol-small" onClick={() => net().clearError()}>
        Dismiss
      </button>
    </div>
  );
}

function GoOnline({ adversaries, onBack }: OnlineLobbyProps) {
  const savedName = useNetworkStore((s) => s.me.name);
  const status = useNetworkStore((s) => s.status);
  const joinFailure = useNetworkStore((s) => s.joinFailure);
  const [urlCode] = useState(() => roomCodeFromUrl());
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(urlCode ?? joinFailure?.code ?? '');

  useEffect(() => {
    if (urlJoinTried || !urlCode) return;
    urlJoinTried = true; // once per page (StrictMode runs effects twice)
    if (net().me.name && net().status === 'offline') void net().joinRoom(urlCode);
  }, [urlCode]);

  const cleanCode = normalizeRoomCode(code);
  const hasName = name.trim().length > 0;
  const canJoin = hasName && isRoomCode(cleanCode);

  function commitName() {
    if (name.trim() !== savedName) net().setName(name);
  }

  function create() {
    if (!hasName) return;
    commitName();
    void net().createRoom({ adversary: adversaries[0]?.id ?? '', adversaryLevel: 0, boards: [] });
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (!canJoin) return;
    commitName();
    void net().joinRoom(cleanCode);
  }

  return (
    <div className="ol-page">
      <div className="ol-wrap" style={{ maxWidth: 520 }}>
        <div className="ol-topbar">
          <button onClick={onBack}>← Back</button>
          <h2>Play online</h2>
        </div>
        <ErrorBanner />
        {status === 'error' && joinFailure?.reason === 'unreachable' && (
          <div className="ol-row">
            <button className="primary" onClick={() => void net().retryJoin()}>
              Try joining {joinFailure.code} again
            </button>
          </div>
        )}
        <section className="ol-panel">
          <label className="ol-field">
            <span className="ol-label">Your name</span>
            <input
              className="ol-input"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Name shown to the other players"
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              autoFocus={!savedName}
            />
          </label>

          <h3>Host a game</h3>
          <button className="primary" disabled={!hasName} onClick={create}>
            Create room
          </button>
          <p className="ol-hint">You get a room code to share; up to {MAX_SEATS} players.</p>

          <div className="ol-divider">or</div>

          <h3>Join a friend</h3>
          <form className="ol-row" onSubmit={join}>
            <input
              className="ol-input ol-code-input"
              value={code}
              placeholder="CODE"
              aria-label="Room code"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button type="submit" disabled={!canJoin}>
              Join
            </button>
          </form>
          {!hasName && <p className="ol-hint">Enter your name first.</p>}
        </section>
      </div>
    </div>
  );
}

function Connecting() {
  const roomCode = useNetworkStore((s) => s.roomCode);
  const isHost = useNetworkStore((s) => s.isHost);
  return (
    <div className="ol-page">
      <div className="ol-wrap" style={{ maxWidth: 520 }}>
        <section className="ol-panel">
          <h3>{isHost && !roomCode ? 'Opening a room…' : `Joining room ${roomCode ?? ''}…`}</h3>
          <p className="ol-hint">Connecting to the game server.</p>
          <div className="ol-row" style={{ marginTop: '0.75rem' }}>
            <button onClick={() => net().leaveRoom()}>Cancel</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function InGame() {
  const roomCode = useNetworkStore((s) => s.roomCode);
  return (
    <div className="ol-page">
      <div className="ol-wrap" style={{ maxWidth: 520 }}>
        <section className="ol-panel">
          <h3>Room {roomCode}: a game is in progress</h3>
          <div className="ol-row" style={{ marginTop: '0.75rem' }}>
            <button onClick={() => net().leaveRoom()}>Leave room</button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RoomLobby({ spirits, adversaries, boards, onStart }: OnlineLobbyProps) {
  const lobby = useNetworkStore((s) => s.lobby);
  const me = useNetworkStore((s) => s.me);
  const isHost = useNetworkStore((s) => s.isHost);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const connected = useNetworkStore((s) => s.connected);
  const presence = useNetworkStore((s) => s.presence);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  if (!lobby) {
    return (
      <div className="ol-page">
        <p className="ol-hint">Loading the room…</p>
      </div>
    );
  }

  const seats = lobby.seats;
  const mySeatIndex = seats.findIndex((s) => s.uuid === me.uuid);
  const online = new Set(presence.map((p) => p.uuid));
  online.add(me.uuid);
  const watchers = presence.filter((p) => !seats.some((s) => s.uuid === p.uuid));
  const hostName = seats.find((s) => s.uuid === lobby.hostUuid)?.name ?? presence.find((p) => p.uuid === lobby.hostUuid)?.name;
  const problem = lobbyStartProblem(lobby);
  const spiritById = new Map(spirits.map((s) => [s.id, s]));
  const link = roomCode ? roomLink(roomCode) : '';

  function copy(what: 'code' | 'link') {
    if (!roomCode) return;
    void navigator.clipboard?.writeText(what === 'code' ? roomCode : link).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {},
    );
  }

  return (
    <div className="ol-page">
      <div className="ol-wrap">
        <div className="ol-topbar">
          <button onClick={() => net().leaveRoom()}>← Leave room</button>
          <h2>Online lobby</h2>
          <span className="ol-conn" title={connected ? 'Connected to the game server' : 'Reconnecting…'}>
            <span className={`ol-dot ${connected ? 'on' : 'off'}`} />
            {connected ? 'Connected' : 'Reconnecting…'}
          </span>
        </div>
        <ErrorBanner />

        <section className="ol-panel">
          <div className="ol-row">
            <span className="ol-label">Room</span>
            <code className="ol-room-code">{roomCode}</code>
            <button className="ol-small" onClick={() => copy('code')}>
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            <button className="ol-small" onClick={() => copy('link')}>
              {copied === 'link' ? 'Copied' : 'Copy invite link'}
            </button>
          </div>
          <div className="ol-row" style={{ marginTop: '0.5rem' }}>
            <span className="ol-link" title={link}>
              {link}
            </span>
          </div>
        </section>

        <div className="ol-grid">
          <div className="ol-col">
            <section className="ol-panel">
              <h3>
                Players · {seats.length} of {MAX_SEATS}
              </h3>
              <div className="ol-seats">
                {seats.map((seat, i) => (
                  <SeatRow
                    key={seat.uuid}
                    seat={seat}
                    index={i}
                    lobby={lobby}
                    mine={seat.uuid === me.uuid}
                    online={online.has(seat.uuid)}
                    spirit={seat.spirit ? spiritById.get(seat.spirit) : undefined}
                    boards={boards}
                    canEditBoard={isHost}
                  />
                ))}
                {Array.from({ length: Math.max(0, MAX_SEATS - seats.length) }, (_, i) => (
                  <div key={`empty-${i}`} className="ol-seat empty">
                    <span className="ol-seat-num">{seats.length + i + 1}</span>
                    <span>Open seat</span>
                    <span />
                  </div>
                ))}
              </div>
              <div className="ol-row" style={{ marginTop: '0.75rem' }}>
                {mySeatIndex < 0 ? (
                  <button onClick={() => void net().takeSeat()} disabled={seats.length >= MAX_SEATS}>
                    {seats.length >= MAX_SEATS ? 'Table full: watching' : 'Take a seat'}
                  </button>
                ) : (
                  <button onClick={() => void net().leaveSeat()}>Leave seat (watch)</button>
                )}
              </div>
              {watchers.length > 0 && (
                <div className="ol-watchers">Watching: {watchers.map((w) => w.name || 'A player').join(', ')}</div>
              )}
            </section>

            {mySeatIndex >= 0 && (
              <SpiritPicker spirits={spirits} seats={seats} myIndex={mySeatIndex} />
            )}
          </div>

          <div className="ol-col">
            <Settings lobby={lobby} adversaries={adversaries} isHost={isHost} hostName={hostName} />

            <section className="ol-panel">
              <h3>Start</h3>
              {isHost ? (
                <div className="ol-start">
                  <button className="primary" disabled={!!problem} onClick={() => onStart(lobby)}>
                    Start game
                  </button>
                  <span className="ol-hint" style={{ margin: 0 }}>
                    {problem ?? `${seats.length} player${seats.length === 1 ? '' : 's'} ready.`}
                  </span>
                </div>
              ) : (
                <p className="ol-hint" style={{ margin: 0 }}>
                  {online.has(lobby.hostUuid)
                    ? `Waiting for ${hostName ?? 'the host'} to start the game.`
                    : `${hostName ?? 'The host'} is offline; the game starts when they're back.`}
                </p>
              )}
            </section>

            <Chat />
          </div>
        </div>
      </div>
    </div>
  );
}

function SeatRow(props: {
  seat: Seat;
  index: number;
  lobby: LobbyState;
  mine: boolean;
  online: boolean;
  spirit: SpiritOption | undefined;
  boards: string[];
  canEditBoard: boolean;
}) {
  const { seat, index, lobby, mine, online, spirit, boards, canEditBoard } = props;
  const chosenBoards = lobby.settings.boards;
  const board = chosenBoards[index] ?? '';

  function setBoard(letter: string) {
    const next = Array.from({ length: lobby.seats.length }, (_, i) => chosenBoards[i] ?? '');
    next[index] = letter;
    void net().setSettings({ boards: next });
  }

  return (
    <div className={`ol-seat${mine ? ' mine' : ''}`}>
      <span className="ol-seat-num">{index + 1}</span>
      <div className="ol-seat-main">
        <span className="ol-seat-name">
          <span className={`ol-dot ${online ? 'on' : 'off'}`} title={online ? 'Online' : 'Offline'} />
          {seat.name || 'Player'}
          {mine && <span className="ol-tag">you</span>}
          {seat.uuid === lobby.hostUuid && <span className="ol-tag host">host</span>}
        </span>
        <span className="ol-seat-spirit">
          {seat.spirit ? (
            <>
              <span className="ol-swatch" style={{ background: spirit?.color ?? 'var(--ink-dim)' }} />
              {spirit?.name ?? seat.spirit}
            </>
          ) : (
            <em>choosing a spirit…</em>
          )}
        </span>
      </div>
      <span className="ol-board">
        Board
        {canEditBoard && boards.length > 0 ? (
          <select
            className="ol-select ol-small"
            aria-label={`Board for ${seat.name}`}
            value={board}
            onChange={(e) => setBoard(e.target.value)}
          >
            <option value="">Random</option>
            {boards.map((b) => (
              <option key={b} value={b} disabled={b !== board && chosenBoards.slice(0, lobby.seats.length).includes(b)}>
                {b}
              </option>
            ))}
          </select>
        ) : (
          <strong>{board || 'Random'}</strong>
        )}
      </span>
    </div>
  );
}

function SpiritPicker({ spirits, seats, myIndex }: { spirits: SpiritOption[]; seats: Seat[]; myIndex: number }) {
  const mine = seats[myIndex]?.spirit ?? null;
  const holder = new Map(seats.filter((_, i) => i !== myIndex && seats[i]!.spirit).map((s) => [s.spirit!, s.name]));
  return (
    <section className="ol-panel">
      <h3>Choose your spirit</h3>
      <div className="ol-spirits">
        {spirits.map((sp) => {
          const takenBy = holder.get(sp.id);
          const chosen = mine === sp.id;
          return (
            <button
              key={sp.id}
              className={`ol-spirit${chosen ? ' chosen' : ''}`}
              style={{ borderLeftColor: sp.color }}
              disabled={takenBy !== undefined}
              aria-pressed={chosen}
              title={takenBy !== undefined ? `Taken by ${takenBy}` : chosen ? 'Click again to unpick' : `Play ${sp.name}`}
              onClick={() => void net().chooseSpirit(chosen ? null : sp.id)}
            >
              <span className="ol-spirit-name">{sp.name}</span>
              <span className="ol-spirit-meta">
                {takenBy !== undefined ? `Taken by ${takenBy}` : chosen ? 'Your spirit' : `${sp.complexity} complexity`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Settings(props: { lobby: LobbyState; adversaries: AdversaryOption[]; isHost: boolean; hostName?: string }) {
  const { lobby, adversaries, isHost, hostName } = props;
  const { adversary, adversaryLevel } = lobby.settings;
  const current = adversaries.find((a) => a.id === adversary);
  const maxLevel = current?.maxLevel ?? 0;

  function pickAdversary(id: string) {
    const max = adversaries.find((a) => a.id === id)?.maxLevel ?? 0;
    void net().setSettings({ adversary: id, adversaryLevel: Math.min(adversaryLevel, max) });
  }

  return (
    <section className="ol-panel">
      <h3>Settings{isHost ? '' : ` (set by ${hostName ?? 'the host'})`}</h3>
      <label className="ol-field">
        <span className="ol-label">Adversary</span>
        <select
          className="ol-select"
          value={adversary}
          disabled={!isHost}
          onChange={(e) => pickAdversary(e.target.value)}
        >
          {!current && <option value={adversary}>{adversary || 'None chosen'}</option>}
          {adversaries.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ol-field">
        <span className="ol-label">Level</span>
        <select
          className="ol-select"
          value={Math.min(adversaryLevel, maxLevel)}
          disabled={!isHost || maxLevel === 0}
          onChange={(e) => void net().setSettings({ adversaryLevel: Number(e.target.value) })}
        >
          {Array.from({ length: maxLevel + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="ol-hint">Boards are set per player in the list (Random by default).</p>
    </section>
  );
}

function Chat() {
  const chat = useNetworkStore((s) => s.chat);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void net().sendChat(text);
    setText('');
  }

  return (
    <section className="ol-panel">
      <h3>Chat</h3>
      <div className="ol-chat-log" ref={logRef}>
        {chat.slice(-100).map((m) =>
          m.kind === 'system' ? (
            <div key={m.id} className="ol-chat-system">
              {m.text}
            </div>
          ) : (
            <div key={m.id}>
              <strong>{m.name}:</strong> {m.text}
            </div>
          ),
        )}
      </div>
      <form className="ol-chat-form" onSubmit={send}>
        <input
          className="ol-input"
          value={text}
          maxLength={500}
          placeholder="Say something…"
          aria-label="Chat message"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
