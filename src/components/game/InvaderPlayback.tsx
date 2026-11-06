// Step-through playback of the latest Invader Phase. The engine resolves Invader
// actions instantly; this replays its log one action at a time, highlighting the
// lands involved on the map, so players can follow what happened.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, LogEntry } from '../../engine/state';

export interface PlaybackStep {
  title: string;
  lines: string[];
  spaces: string[];
}

export interface InvaderRun {
  /** log index where this Invader Phase starts (identifies it) */
  start: number;
  title: string;
  steps: PlaybackStep[];
  /** still in progress (waiting on a choice mid-phase) */
  live: boolean;
}

const SPACE_RE = /\b([A-D][0-8])\b/g;
/** Lines that start a new playback step (one Invader action each). */
const STEP_RE = /^(Ravage:|Build:|Explore:|High Immigration Build:|Fear Card:|Blighted Island —|Invaders' first Explore)/;
const isHeader = (e: LogEntry) => (e.depth ?? 1) === 0 && STEP_RE.test(e.text);

/** The most recent Invader Phase (or the Invaders' first Explore) in the log. */
export function latestInvaderRun(gs: GameState): InvaderRun | null {
  const log = gs.log;
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    const t = log[i].text;
    if (t === '━━ Invader Phase' || t.startsWith("Invaders' first Explore")) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const first = log[start].text;
  const isSetup = first.startsWith("Invaders' first Explore");
  const steps: PlaybackStep[] = [];
  let end = log.length;
  for (let i = start + (isSetup ? 0 : 1); i < log.length; i++) {
    const e = log[i];
    if (e.text.startsWith('━━') && i !== start) {
      end = i;
      break;
    }
    if (isHeader(e) || !steps.length) steps.push({ title: e.text, lines: [], spaces: [] });
    else steps[steps.length - 1].lines.push(e.text);
    const cur = steps[steps.length - 1];
    for (const m of e.text.matchAll(SPACE_RE)) if (!cur.spaces.includes(m[1])) cur.spaces.push(m[1]);
  }
  const live = end === log.length && gs.phase === 'INVADER';
  return {
    start,
    title: isSetup ? "The Invaders' first Explore" : `Turn ${log[start].turn} · Invader Phase`,
    steps: steps.filter((s) => s.title || s.lines.length),
    live,
  };
}

const STEP_MS = 2600;

/** Playback state for GameView. Opens automatically whenever a new Invader Phase appears. */
export function useInvaderPlayback(gs: GameState | undefined) {
  const run = useMemo(() => (gs ? latestInvaderRun(gs) : null), [gs, gs?.log.length]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!run) return;
    if (seen.current !== run.start) {
      seen.current = run.start;
      setOpen(true);
      setStep(0);
      setAuto(true);
    }
  }, [run]);

  const count = run?.steps.length ?? 0;
  useEffect(() => {
    if (!open || !auto || !count) return;
    if (step >= count - 1) {
      if (!run?.live) setAuto(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, count - 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [open, auto, step, count, run?.live]);

  const cur = open && run ? run.steps[Math.min(step, count - 1)] : null;
  return {
    run,
    open: open && !!run && count > 0,
    step: Math.min(step, Math.max(0, count - 1)),
    count,
    auto,
    current: cur,
    show: () => {
      setOpen(true);
      setStep(0);
      setAuto(true);
    },
    close: () => setOpen(false),
    prev: () => {
      setAuto(false);
      setStep((s) => Math.max(0, s - 1));
    },
    next: () => {
      setAuto(false);
      setStep((s) => Math.min(count - 1, s + 1));
    },
    toggleAuto: () => setAuto((a) => !a),
  };
}

export type Playback = ReturnType<typeof useInvaderPlayback>;

export function InvaderPlaybackPanel({ pb }: { pb: Playback }) {
  if (!pb.open || !pb.run || !pb.current) return null;
  const s = pb.current;
  return (
    <div className="playback" role="region" aria-label="Invader Phase playback">
      <div className="pb-head">
        <strong>{pb.run.title}</strong>
        <span className="dim small">
          {' '}
          · step {pb.step + 1}/{pb.count}
        </span>
        <button className="pb-x secondary" onClick={pb.close} title="Close">
          ✕
        </button>
      </div>
      <div className="pb-title">{s.title}</div>
      {s.lines.length > 0 && (
        <ul className="pb-lines">
          {s.lines.slice(0, 12).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          {s.lines.length > 12 && <li className="dim">…and {s.lines.length - 12} more (see the log)</li>}
        </ul>
      )}
      <div className="pb-bar" aria-hidden>
        {Array.from({ length: pb.count }, (_, i) => (
          <span key={i} className={i <= pb.step ? 'on' : ''} />
        ))}
      </div>
      <div className="pb-ctrl">
        <button className="secondary" onClick={pb.prev} disabled={pb.step === 0}>
          ◀
        </button>
        <button className="secondary" onClick={pb.toggleAuto}>
          {pb.auto ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button className="secondary" onClick={pb.next} disabled={pb.step >= pb.count - 1}>
          ▶
        </button>
        <button onClick={pb.close}>Done</button>
      </div>
    </div>
  );
}
