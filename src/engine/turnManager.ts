import {
  GameState,
  addBlightToLand,
  checkVictory,
  log,
} from './gameState';
import { addFear, resolveEarnedFearCards } from './fear';
import { build, explore, ravage } from './invaderActions';
import {
  deckAdvance,
  deckCardsRemaining,
  deckDraw,
  invaderCardLabel,
} from './invaderDeck';
import {
  cardPlays as spiritCardPlays,
  gainEnergyPhase,
  reclaimAll,
  timePasses as spiritTimePasses,
} from './spirit';
import { cityCount, townCount } from './land';

/**
 * Advance the game state by one phase. Mutates state. Returns true if game continues.
 */
export function advancePhase(state: GameState): boolean {
  if (state.result !== 'IN_PROGRESS') return false;

  switch (state.phase) {
    case 'SPIRIT':
      spiritPhase(state);
      state.phase = 'FAST_POWERS';
      break;
    case 'FAST_POWERS':
      fastPowersPhase(state);
      state.phase = 'INVADER';
      break;
    case 'INVADER':
      invaderPhase(state);
      state.phase = 'SLOW_POWERS';
      break;
    case 'SLOW_POWERS':
      slowPowersPhase(state);
      state.phase = 'TIME_PASSES';
      break;
    case 'TIME_PASSES':
      timePasses(state);
      state.phase = 'SPIRIT';
      state.turnNumber += 1;
      break;
    case 'GAME_OVER':
      return false;
  }

  checkVictory(state);
  if (state.result !== 'IN_PROGRESS') {
    state.phase = 'GAME_OVER';
    return false;
  }
  return true;
}

function spiritPhase(state: GameState): void {
  log(state, `\n=== TURN ${state.turnNumber + 1} ===`);
  log(state, '-- Spirit Phase --');

  for (const spirit of state.spirits) {
    // Growth (auto: pick first option)
    const option = spirit.growthOptions[0];
    if (option) {
      log(state, `  ${spirit.name} Growth: ${option.description}`);
      if (option.reclaimAll) {
        reclaimAll(spirit);
        log(state, `    Reclaimed all cards`);
      }
      if (option.gainEnergy > 0) {
        spirit.energy += option.gainEnergy;
        log(state, `    Gained ${option.gainEnergy} bonus energy`);
      }
      if (option.addPresenceRange > 0) {
        log(state, `    TODO: Place presence (range ${option.addPresenceRange})`);
      }
      if (option.gainPowerCard) {
        log(state, `    TODO: Gain a power card`);
      }
    }

    const gained = gainEnergyPhase(spirit);
    log(state, `  ${spirit.name} gains ${gained} energy (total: ${spirit.energy})`);
    log(
      state,
      `  ${spirit.name} can play ${spiritCardPlays(spirit)} cards (TODO: player chooses)`,
    );
  }
}

function fastPowersPhase(state: GameState): void {
  log(state, '-- Fast Powers Phase --');
  for (const spirit of state.spirits) {
    const fastCards = spirit.playedCards.filter((c) => c.speed === 'FAST');
    for (const card of fastCards) {
      log(state, `  TODO: Resolve ${card.name} (${spirit.name})`);
    }
    for (const innate of spirit.innatePowers) {
      log(state, `  TODO: Check innate '${innate.name}' (${spirit.name})`);
    }
  }
}

function invaderPhase(state: GameState): void {
  log(state, '-- Invader Phase --');

  // 1. Blighted Island Effect
  if (state.blightCard?.isFlipped) {
    log(state, `  Blighted Island: ${state.blightCard.blightedEffect}`);
  }

  // 2. Fear Effects
  const resolved = resolveEarnedFearCards(state.fearSystem);
  for (const { card, effect } of resolved) {
    log(state, `  Fear Card '${card.name}': ${effect}`);
  }

  // 3a. Ravage
  if (state.invaderDeck.ravageCard) {
    const ravageCard = state.invaderDeck.ravageCard;
    log(state, `  Ravage: ${invaderCardLabel(ravageCard)}`);

    let bonusDamage = 0;
    if (state.adversary.name === 'Sweden') {
      if (state.adversaryLevel >= 4) bonusDamage = 2;
      else if (state.adversaryLevel >= 1) bonusDamage = 1;
    }

    const { events, fearGenerated, blightLands } = ravage(
      state.lands,
      ravageCard.terrains,
      bonusDamage,
    );
    for (const e of events) log(state, `    ${e}`);

    for (const landIdx of blightLands) {
      const blightEvents = addBlightToLand(state, landIdx);
      for (const be of blightEvents) log(state, `    ${be}`);
      if (state.result !== 'IN_PROGRESS') return;
    }

    if (fearGenerated > 0) {
      const fearEvents = addFear(state.fearSystem, fearGenerated);
      log(state, `    ${fearGenerated} Fear generated from combat`);
      for (const fe of fearEvents) log(state, `    ${fe}`);
    }
  }

  checkVictory(state);
  if (state.result !== 'IN_PROGRESS') return;

  // 3b. Build
  if (state.invaderDeck.buildCard) {
    const buildCard = state.invaderDeck.buildCard;
    log(state, `  Build: ${invaderCardLabel(buildCard)}`);
    const events = build(state.lands, buildCard.terrains);
    for (const e of events) log(state, `    ${e}`);
  }

  // 3c. Explore
  const newCard = deckDraw(state.invaderDeck);
  if (!newCard && deckCardsRemaining(state.invaderDeck) === 0
      && !state.invaderDeck.buildCard && !state.invaderDeck.ravageCard) {
    state.result = 'DEFEAT_NO_CARDS';
    log(state, '  No Invader Cards left to explore - DEFEAT!');
    return;
  }

  if (newCard) {
    log(state, `  Explore: ${invaderCardLabel(newCard)}`);
    if (newCard.hasEscalation && state.adversary.name !== 'No Adversary') {
      log(state, `    Escalation! ${state.adversary.escalationEffect}`);
    }
    const events = explore(state.lands, newCard.terrains);
    for (const e of events) log(state, `    ${e}`);
  }

  // 4. Advance Invader Cards
  deckAdvance(state.invaderDeck, newCard);
  log(state, '  Invader cards advanced.');
}

function slowPowersPhase(state: GameState): void {
  log(state, '-- Slow Powers Phase --');
  for (const spirit of state.spirits) {
    const slowCards = spirit.playedCards.filter((c) => c.speed === 'SLOW');
    for (const card of slowCards) {
      log(state, `  TODO: Resolve ${card.name} (${spirit.name})`);
    }
    for (const innate of spirit.innatePowers) {
      if (innate.speed === 'slow') {
        log(state, `  TODO: Check innate '${innate.name}' (${spirit.name})`);
      }
    }
  }
}

function timePasses(state: GameState): void {
  log(state, '-- Time Passes --');
  for (const spirit of state.spirits) {
    spiritTimePasses(spirit);
  }
  for (const land of state.lands) {
    land.defend = 0;
    for (const inv of land.invaders) inv.damageTaken = 0;
    for (const dahan of land.dahan) dahan.damageTaken = 0;
  }
  log(state, '  Cards discarded, damage cleared, elements cleared.');

  const totalInvaders = state.lands.reduce((s, l) => s + l.invaders.length, 0);
  const totalTowns = state.lands.reduce((s, l) => s + townCount(l), 0);
  const totalCities = state.lands.reduce((s, l) => s + cityCount(l), 0);
  const totalDahan = state.lands.reduce((s, l) => s + l.dahan.length, 0);
  const totalBlight = state.lands.reduce((s, l) => s + l.blight, 0);

  log(
    state,
    `  Board: ${totalInvaders} invaders (${totalCities}C/${totalTowns}T), ${totalDahan} Dahan, ${totalBlight} Blight`,
  );
  log(
    state,
    `  Terror Level: ${state.fearSystem.terrorLevel}, Invader cards remaining: ${deckCardsRemaining(state.invaderDeck)}`,
  );
}
