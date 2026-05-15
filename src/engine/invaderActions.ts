import {
  Land,
  hasInvaders,
  hasTownOrCity,
  totalInvaderDamage,
  townCount,
  cityCount,
} from './land';
import {
  Terrain,
  Invader,
  INVADER_FEAR,
  dahanIsDestroyed,
  invaderIsDestroyed,
  invaderRemainingHealth,
  makeInvader,
} from './pieces';

export function explore(lands: Land[], terrains: Terrain[]): string[] {
  const events: string[] = [];
  const terrainSet = new Set(terrains);

  for (const land of lands) {
    if (!terrainSet.has(land.terrain)) continue;

    const hasSource = hasTownOrCity(land);
    let accessible = hasSource || land.isCoastal;

    if (!accessible) {
      for (const adjIdx of land.adjacentIndices) {
        if (hasTownOrCity(lands[adjIdx])) {
          accessible = true;
          break;
        }
      }
    }

    if (accessible) {
      land.invaders.push(makeInvader('EXPLORER'));
      events.push(`Explorer added to Land ${land.number} (${land.terrain})`);
    }
  }
  return events;
}

export function build(lands: Land[], terrains: Terrain[]): string[] {
  const events: string[] = [];
  const terrainSet = new Set(terrains);

  for (const land of lands) {
    if (!terrainSet.has(land.terrain)) continue;
    if (!hasInvaders(land)) continue;

    if (townCount(land) > cityCount(land)) {
      land.invaders.push(makeInvader('CITY'));
      events.push(`City built in Land ${land.number} (${land.terrain})`);
    } else {
      land.invaders.push(makeInvader('TOWN'));
      events.push(`Town built in Land ${land.number} (${land.terrain})`);
    }
  }
  return events;
}

export interface RavageResult {
  events: string[];
  fearGenerated: number;
  blightLands: number[];
}

export function ravage(
  lands: Land[],
  terrains: Terrain[],
  bonusDamage: number = 0,
): RavageResult {
  const events: string[] = [];
  let totalFear = 0;
  const blightLands: number[] = [];
  const terrainSet = new Set(terrains);

  for (let i = 0; i < lands.length; i++) {
    const land = lands[i];
    if (!terrainSet.has(land.terrain)) continue;
    if (!hasInvaders(land)) continue;

    const rawDamage = totalInvaderDamage(land) + bonusDamage;
    const effectiveDamage = Math.max(0, rawDamage - land.defend);
    land.defend = 0;

    events.push(
      `Ravage in Land ${land.number} (${land.terrain}): ${rawDamage} damage (defend absorbed ${rawDamage - effectiveDamage})`,
    );

    if (effectiveDamage >= 2) {
      blightLands.push(i);
      events.push(`  Land ${land.number} takes blight`);
    }

    // Invaders damage Dahan
    let dahanDamage = effectiveDamage;
    const survivingDahan = [];
    for (const dahan of land.dahan) {
      if (dahanDamage <= 0) {
        survivingDahan.push(dahan);
        continue;
      }
      const dmg = Math.min(2 - dahan.damageTaken, dahanDamage);
      dahan.damageTaken += dmg;
      dahanDamage -= dmg;
      if (dahanIsDestroyed(dahan)) {
        events.push(`  Dahan destroyed in Land ${land.number}`);
      } else {
        survivingDahan.push(dahan);
      }
    }
    land.dahan = survivingDahan;

    // Surviving Dahan fight back
    const dahanTotalDamage = land.dahan.length * 2;
    if (dahanTotalDamage > 0) {
      const r = applyDamageToInvaders(land, dahanTotalDamage);
      totalFear += r.fear;
      for (const e of r.events) events.push(`  ${e}`);
    }
  }

  return { events, fearGenerated: totalFear, blightLands };
}

function applyDamageToInvaders(land: Land, damage: number): { fear: number; events: string[] } {
  const events: string[] = [];
  let fear = 0;
  let remaining = damage;

  const targets = [...land.invaders].sort(
    (a, b) => invaderRemainingHealth(a) - invaderRemainingHealth(b),
  );

  const destroyed = new Set<Invader>();
  for (const inv of targets) {
    if (remaining <= 0) break;
    const applied = Math.min(invaderRemainingHealth(inv), remaining);
    inv.damageTaken += applied;
    remaining -= applied;
    if (invaderIsDestroyed(inv)) {
      destroyed.add(inv);
      fear += INVADER_FEAR[inv.type];
      events.push(
        `${inv.type.charAt(0) + inv.type.slice(1).toLowerCase()} destroyed in Land ${land.number}`,
      );
    }
  }

  land.invaders = land.invaders.filter((i) => !destroyed.has(i));
  return { fear, events };
}
