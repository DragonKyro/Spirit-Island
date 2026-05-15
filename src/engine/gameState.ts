import { Adversary, NO_ADVERSARY, getDifficulty } from './adversary';
import {
  BlightCard,
  BLIGHT_CARDS,
  cloneBlightCard,
  removeBlight,
  setupBlight,
} from './blight';
import { FearSystem, makeFearSystem, setupFear } from './fear';
import {
  InvaderDeck,
  buildInvaderDeck,
  deckDraw,
  deckIsEmpty,
  invaderCardLabel,
  deckCardsRemaining,
} from './invaderDeck';
import {
  Land,
  cityCount,
  createSoloBoard,
  hasInvaders,
  populateBoard,
  townCount,
} from './land';
import { Spirit, spiritSetup } from './spirit';
import { explore } from './invaderActions';

export type GamePhase =
  | 'SPIRIT'
  | 'FAST_POWERS'
  | 'INVADER'
  | 'SLOW_POWERS'
  | 'TIME_PASSES'
  | 'GAME_OVER';

export type GameResult =
  | 'IN_PROGRESS'
  | 'VICTORY'
  | 'DEFEAT_BLIGHT'
  | 'DEFEAT_NO_PRESENCE'
  | 'DEFEAT_NO_CARDS'
  | 'SACRIFICE_VICTORY';

export interface GameState {
  spirits: Spirit[];
  adversary: Adversary;
  adversaryLevel: number;
  difficulty: number;
  lands: Land[];
  invaderDeck: InvaderDeck;
  fearSystem: FearSystem;
  blightCard: BlightCard | null;
  phase: GamePhase;
  turnNumber: number;
  result: GameResult;
  eventLog: string[];
}

export function makeGameState(): GameState {
  return {
    spirits: [],
    adversary: NO_ADVERSARY,
    adversaryLevel: 0,
    difficulty: 0,
    lands: [],
    invaderDeck: { deck: [], ravageCard: null, buildCard: null, discard: [] },
    fearSystem: makeFearSystem(),
    blightCard: null,
    phase: 'SPIRIT',
    turnNumber: 0,
    result: 'IN_PROGRESS',
    eventLog: [],
  };
}

export function log(state: GameState, msg: string): void {
  state.eventLog.push(msg);
}

export interface SetupConfig {
  spirits: Spirit[];
  adversary: Adversary;
  adversaryLevel: number;
}

export function setupGame(config: SetupConfig): GameState {
  const state = makeGameState();
  state.spirits = config.spirits;
  state.adversary = config.adversary;
  state.adversaryLevel = config.adversaryLevel;
  state.turnNumber = 0;
  state.result = 'IN_PROGRESS';
  state.eventLog = [];

  // Board
  state.lands = createSoloBoard();
  populateBoard(state.lands);
  log(state, 'Island board created and populated.');

  // Invader deck
  state.invaderDeck = buildInvaderDeck();
  log(state, `Invader deck built: ${deckCardsRemaining(state.invaderDeck)} cards.`);

  // Fear system
  const numPlayers = Math.max(1, state.spirits.length);
  state.fearSystem = makeFearSystem();
  setupFear(state.fearSystem, numPlayers);
  log(state, `Fear pool: ${state.fearSystem.fearPool} markers.`);

  // Blight card
  const sourceCard = BLIGHT_CARDS[Math.floor(Math.random() * BLIGHT_CARDS.length)];
  state.blightCard = cloneBlightCard(sourceCard);
  setupBlight(state.blightCard, numPlayers);
  log(
    state,
    `Blight Card: ${state.blightCard.name} (${state.blightCard.blightRemaining} blight)`,
  );

  // Spirits
  for (const spirit of state.spirits) {
    spiritSetup(spirit);
    placeStartingPresence(state, spirit);
    log(state, `Spirit '${spirit.name}' set up.`);
  }

  // Difficulty
  state.difficulty = getDifficulty(state.adversary, state.adversaryLevel);
  log(
    state,
    `Adversary: ${state.adversary.name} Level ${state.adversaryLevel} (Difficulty ${state.difficulty})`,
  );

  // Invaders' starting action: reveal top card, explore, place in build slot
  invadersStartingAction(state);

  return state;
}

function placeStartingPresence(state: GameState, spirit: Spirit): void {
  for (const landIdx of spirit.startingPresenceLands) {
    if (landIdx < 0 || landIdx >= state.lands.length) continue;
    const land = state.lands[landIdx];
    land.presence[spirit.name] = (land.presence[spirit.name] ?? 0) + 1;
    spirit.presenceOnBoard += 1;
  }
}

function invadersStartingAction(state: GameState): void {
  const card = deckDraw(state.invaderDeck);
  if (!card) return;
  log(state, `Starting Explore: ${invaderCardLabel(card)}`);
  const events = explore(state.lands, card.terrains);
  for (const e of events) log(state, e);
  state.invaderDeck.buildCard = card;
}

export function addBlightToLand(state: GameState, landIdx: number): string[] {
  const events: string[] = [];
  const queue: number[] = [landIdx];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (visited.has(idx)) continue;
    visited.add(idx);

    const land = state.lands[idx];
    const alreadyHadBlight = land.blight > 0;

    if (state.blightCard) {
      const ok = removeBlight(state.blightCard);
      if (!ok) {
        state.result = 'DEFEAT_BLIGHT';
        events.push('All blight exhausted - DEFEAT!');
        return events;
      }
      if (state.blightCard.isFlipped && !alreadyHadBlight) {
        events.push("Blight Card flipped to 'Blighted Island'!");
      }
    }

    land.blight += 1;
    events.push(`Blight added to Land ${land.number}`);

    // Destroy 1 presence from each spirit in this land
    for (const spirit of state.spirits) {
      if ((land.presence[spirit.name] ?? 0) > 0) {
        land.presence[spirit.name] -= 1;
        spirit.presenceOnBoard -= 1;
        events.push(`  Presence of ${spirit.name} destroyed in Land ${land.number}`);
        if (spirit.presenceOnBoard <= 0) {
          state.result = 'DEFEAT_NO_PRESENCE';
          events.push(`  ${spirit.name} has no presence - DEFEAT!`);
        }
      }
    }

    if (alreadyHadBlight) {
      events.push(`  Cascade from Land ${land.number}!`);
      const adj = land.adjacentIndices.filter((i) => !visited.has(i));
      if (adj.length > 0) {
        adj.sort((a, b) => state.lands[a].blight - state.lands[b].blight);
        queue.push(adj[0]);
      }
    }
  }
  return events;
}

export function checkVictory(state: GameState): void {
  if (state.result !== 'IN_PROGRESS') return;

  const tl = state.fearSystem.terrorLevel;
  if (tl === 1) {
    if (!state.lands.some(hasInvaders)) {
      state.result = 'VICTORY';
      log(state, 'VICTORY! No invaders remain (Terror Level 1)!');
    }
  } else if (tl === 2) {
    if (!state.lands.some((l) => townCount(l) + cityCount(l) > 0)) {
      state.result = 'VICTORY';
      log(state, 'VICTORY! No Towns or Cities remain (Terror Level 2)!');
    }
  } else {
    if (!state.lands.some((l) => cityCount(l) > 0)) {
      state.result = 'VICTORY';
      log(state, 'VICTORY! No Cities remain (Terror Level 3)!');
    }
  }

  // Defeat check: deck exhausted is checked when drawing
  void deckIsEmpty;
}
