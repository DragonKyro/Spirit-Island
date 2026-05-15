export interface AdversaryLevel {
  level: number;
  difficulty: number;
  description: string;
  fearDeckConfig: [number, number, number] | null;
}

export interface Adversary {
  name: string;
  description: string;
  escalationEffect: string;
  levels: AdversaryLevel[];
}

export function getDifficulty(adversary: Adversary, level: number): number {
  return adversary.levels.find((l) => l.level === level)?.difficulty ?? 0;
}

export const NO_ADVERSARY: Adversary = {
  name: 'No Adversary',
  description: 'Standard game with no adversary modifications.',
  escalationEffect: 'None',
  levels: [{ level: 0, difficulty: 0, description: 'No adversary', fearDeckConfig: null }],
};

export const BRANDENBURG_PRUSSIA: Adversary = {
  name: 'Brandenburg-Prussia',
  description: 'Speed is the name of the game: Invaders do everything at a faster tempo.',
  escalationEffect: 'The first Ravage Card also does a Build there.',
  levels: [
    { level: 1, difficulty: 2, description: 'During Setup, put an extra Town in land #1.', fearDeckConfig: [3, 3, 3] },
    { level: 2, difficulty: 4, description: 'During Setup, put an extra Town in land #2.', fearDeckConfig: [3, 4, 3] },
    { level: 3, difficulty: 6, description: 'During Setup, put an extra Town in land #3.', fearDeckConfig: [4, 4, 3] },
    { level: 4, difficulty: 7, description: 'The first time the Invader Deck has only Stage II cards, put an extra City in the land with the most Towns.', fearDeckConfig: [4, 5, 3] },
    { level: 5, difficulty: 9, description: 'During Setup, add 1 Town to each Inland land.', fearDeckConfig: [4, 5, 4] },
    { level: 6, difficulty: 10, description: 'During Setup, add 1 City to the land with the most Towns.', fearDeckConfig: [5, 5, 4] },
  ],
};

export const ENGLAND: Adversary = {
  name: 'England',
  description: 'Buildings everywhere — England sends so many immigrants that colonies spill into unexplored lands.',
  escalationEffect: 'On each board: in the land with the fewest Invaders (min. 1), add 1 Town.',
  levels: [
    { level: 1, difficulty: 1, description: 'During Setup, add 1 City to land #1.', fearDeckConfig: [3, 3, 3] },
    { level: 2, difficulty: 3, description: 'During Setup, add 1 City to land #2.', fearDeckConfig: [3, 4, 3] },
    { level: 3, difficulty: 4, description: 'Build Cards affect lands without Invaders, adding 1 Explorer instead of a normal Build.', fearDeckConfig: [4, 4, 3] },
    { level: 4, difficulty: 6, description: 'During Setup, add 1 Town to each Coastal land without Towns.', fearDeckConfig: [4, 5, 3] },
    { level: 5, difficulty: 7, description: 'During any Invader Phase where you Build in a land, if that land has 4+ Invaders, also add 1 Town.', fearDeckConfig: [4, 5, 4] },
    { level: 6, difficulty: 9, description: 'Additional loss condition: if there are ever more Towns + Cities than non-Town/City Invaders on any single board, you lose.', fearDeckConfig: [5, 5, 4] },
  ],
};

export const SWEDEN: Adversary = {
  name: 'Sweden',
  description: "Sweden's Ravages are more dangerous with advanced military tactics.",
  escalationEffect: 'On each board with 2+ Dahan: in the land with the most Dahan, replace 1 Dahan with 1 Town.',
  levels: [
    { level: 1, difficulty: 2, description: 'During Ravage, Invaders deal +1 Damage total (not each).', fearDeckConfig: [3, 3, 3] },
    { level: 2, difficulty: 3, description: 'During Setup, add 1 Blight to each land with Town. (Setup Blight does not Cascade or destroy Presence.)', fearDeckConfig: [3, 4, 3] },
    { level: 3, difficulty: 5, description: 'After Build, if 3+ Invaders are in a land, replace 1 Dahan with 1 Town.', fearDeckConfig: [4, 4, 3] },
    { level: 4, difficulty: 6, description: 'During Ravage, Invaders deal +2 Damage total.', fearDeckConfig: [4, 5, 3] },
    { level: 5, difficulty: 7, description: 'After Build, if 2+ Invaders in a land, replace 1 Dahan with 1 Town.', fearDeckConfig: [4, 5, 4] },
    { level: 6, difficulty: 8, description: 'During Ravage, Invaders deal +3 Damage total.', fearDeckConfig: [5, 5, 4] },
  ],
};

export const ALL_ADVERSARIES: Record<string, Adversary> = {
  'No Adversary': NO_ADVERSARY,
  'Brandenburg-Prussia': BRANDENBURG_PRUSSIA,
  England: ENGLAND,
  Sweden: SWEDEN,
};
