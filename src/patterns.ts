/**
 * The pattern library, 'O' = live cell. Each pattern lists the rules it's known to work under: the
 * classic Life patterns, the ones that also behave the same in HighLife, HighLife's replicator, and
 * Day & Night's rocket and the oscillators that turn up most often in its random soups.
 */
export type PatternCategory = 'Spaceship' | 'Oscillator' | 'Still life' | 'Methuselah' | 'Gun' | 'Growth';

/** What each category means, shown under the chips when that category is picked. */
export const CATEGORY_INFO: Record<PatternCategory, string> = {
  Spaceship: 'Shapes that rebuild themselves one step over, so they glide across the board forever.',
  Oscillator: 'Shapes that cycle through a loop of forms and return to where they started, staying in place.',
  'Still life': 'Shapes that never change: every live cell has just enough neighbours to survive, and no new ones are born.',
  Methuselah: 'Tiny seeds that churn for hundreds or thousands of generations before settling down.',
  Gun: 'Machines that stay put and fire a fresh spaceship every cycle, so the population grows without end.',
  Growth: 'Patterns that keep spreading and leave a trail of debris behind them, some of them forever.',
};

export const LIFE = 'B3/S23';
export const HIGHLIFE = 'B36/S23';
export const DAY_AND_NIGHT = 'B3678/S34678';
const LIFE_AND_HIGHLIFE = [LIFE, HIGHLIFE];
const ALL = [LIFE, HIGHLIFE, DAY_AND_NIGHT];

export interface Pattern {
  name: string;
  category: PatternCategory;
  /** One line about it, shown on its card. */
  note: string;
  /** The rules it works under, written the standard way ("B36/S23"). */
  rules: readonly string[];
  cells: readonly string[];
}

export const PATTERNS: readonly Pattern[] = [
  { name: 'Glider', category: 'Spaceship', rules: LIFE_AND_HIGHLIFE, note: 'c/4 diagonal', cells: ['.O.', '..O', 'OOO'] },
  { name: 'LWSS', category: 'Spaceship', rules: LIFE_AND_HIGHLIFE, note: 'c/2 orthogonal', cells: ['.O..O', 'O....', 'O...O', 'OOOO.'] },
  { name: 'MWSS', category: 'Spaceship', rules: LIFE_AND_HIGHLIFE, note: 'c/2 orthogonal', cells: ['...O..', '.O...O', 'O.....', 'O....O', 'OOOOO.'] },
  { name: 'HWSS', category: 'Spaceship', rules: LIFE_AND_HIGHLIFE, note: 'c/2 orthogonal', cells: ['...OO..', '.O....O', 'O......', 'O.....O', 'OOOOOO.'] },
  {
    name: 'Loafer', category: 'Spaceship', rules: [LIFE], note: 'c/7 orthogonal',
    cells: ['.OO..O.OO', 'O..O..OO.', '.O.O.....', '..O......', '........O', '......OOO', '.....O...', '......O..', '.......OO'],
  },

  { name: 'Blinker', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 2', cells: ['OOO'] },
  { name: 'Toad', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 2', cells: ['.OOO', 'OOO.'] },
  { name: 'Beacon', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 2', cells: ['OO..', 'OO..', '..OO', '..OO'] },
  {
    name: 'Pulsar', category: 'Oscillator', rules: [LIFE], note: 'period 3',
    cells: ['..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............', '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..'],
  },
  { name: 'Pentadecathlon', category: 'Oscillator', rules: [LIFE], note: 'period 15', cells: ['..O....O..', 'OO.OOOO.OO', '..O....O..'] },
  {
    name: 'Queen bee shuttle', category: 'Oscillator', rules: [LIFE], note: 'period 30',
    cells: ['.........O............', '.......O.O............', '......O.O.............', 'OO...O..O...........OO', 'OO....O.O...........OO', '.......O.O............', '.........O............'],
  },

  { name: 'Block', category: 'Still life', rules: ALL, note: 'the simplest', cells: ['OO', 'OO'] },
  { name: 'Beehive', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '6 cells', cells: ['.OO.', 'O..O', '.OO.'] },
  { name: 'Loaf', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '7 cells', cells: ['.OO.', 'O..O', '.O.O', '..O.'] },
  { name: 'Boat', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '5 cells', cells: ['OO.', 'O.O', '.O.'] },
  { name: 'Tub', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '4 cells', cells: ['.O.', 'O.O', '.O.'] },
  { name: 'Eater 1', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: 'eats gliders', cells: ['OO..', 'O.O.', '..O.', '..OO'] },

  { name: 'R-pentomino', category: 'Methuselah', rules: [LIFE], note: 'settles at 1,103', cells: ['.OO', 'OO.', '.O.'] },
  { name: 'Acorn', category: 'Methuselah', rules: [LIFE], note: 'settles at 5,206', cells: ['.O.....', '...O...', 'OO..OOO'] },
  { name: 'Diehard', category: 'Methuselah', rules: [LIFE], note: 'vanishes at 130', cells: ['......O.', 'OO......', '.O...OOO'] },
  { name: 'B-heptomino', category: 'Methuselah', rules: [LIFE], note: 'settles at 148', cells: ['O.OO', 'OOO.', '.O..'] },
  { name: 'Herschel', category: 'Methuselah', rules: [LIFE], note: 'settles at 128', cells: ['O..', 'OOO', 'O.O', '..O'] },

  {
    name: 'Gosper glider gun', category: 'Gun', rules: [LIFE], note: 'a glider every 30',
    cells: [
      '........................O...........',
      '......................O.O...........',
      '............OO......OO............OO',
      '...........O...O....OO............OO',
      'OO........O.....O...OO..............',
      'OO........O...O.OO....O.O...........',
      '..........O.....O.......O...........',
      '...........O...O....................',
      '............OO......................',
    ],
  },
  {
    name: 'Simkin glider gun', category: 'Gun', rules: [LIFE], note: 'a glider every 120',
    cells: [
      'OO.....OO........................',
      'OO.....OO........................',
      '.................................',
      '....OO...........................',
      '....OO...........................',
      '.................................',
      '.................................',
      '.................................',
      '.................................',
      '......................OO.OO......',
      '.....................O.....O.....',
      '.....................O......O..OO',
      '.....................OOO...O...OO',
      '..........................O......',
      '.................................',
      '.................................',
      '.................................',
      '....................OO...........',
      '....................O............',
      '.....................OOO.........',
      '.......................O.........',
    ],
  },

  { name: 'Switch engine', category: 'Growth', rules: [LIFE], note: 'settles at 3,911', cells: ['.O.O..', 'O.....', '.O..O.', '...OOO'] },
  {
    name: 'Block-laying switch engine', category: 'Growth', rules: [LIFE], note: 'grows forever',
    cells: ['......O.', '....O.OO', '....O.O.', '....O...', '..O.....', 'O.O.....'],
  },

  // HighLife
  { name: 'Replicator', category: 'Growth', rules: [HIGHLIFE], note: 'copies itself every 12', cells: ['..OOO', '.O..O', 'O...O', 'O..O.', 'OOO..'] },

  // Day & Night. Its patterns mostly lack names, so the oscillators are called after their shapes.
  {
    name: 'Rocket', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/2 orthogonal, period 40',
    cells: [
      '......O......', '.....O.O.....', '.....OOO.....', '.....OOO.....', '...OOOOOOO...', '....OOOOO....', '.....OOO.....',
      '......O......', '.....OOO.....', '.............', '.............', '.............', '.............', '.............',
      '.............', '......O......', '.....O.O.....', '....OO.OO....', '...O.OOO.O...', '...OOOOOOO...', '....OOOOO....',
      '....OOOOO....', '.....OOO.....', '....OOOOO....', '....OOOOO....', '.....OOO.....', '.....OOO.....', '......O......',
      '....O.O.O....', '..OO.OOO.OO..', '..OOOOOOOOO..', '...OOOOOOO...', '..OOOOOOOOO..', 'OOOOOOOOOOOOO', 'O.OOOOOOOOO.O',
      '.OOOOOOOOOOO.', '.O.OOOOOOO.O.', '....OOOOO....', '...OOOOOOO...', '....OOOOO....', '.....OOO.....', '......O......',
    ],
  },
  { name: 'Hook', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 16, the commonest', cells: ['OO', 'OO', 'O.'] },
  { name: 'Plus', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 4', cells: ['.O.', 'OOO', '.O.'] },
  { name: 'Skew', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 2', cells: ['O..', '.OO', '.O.'] },
  { name: 'Zigzag', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 2', cells: ['.OO', 'OO.'] },
  { name: 'Twin X', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 4', cells: ['O.O', '.O.', '.O.', 'O.O'] },
  {
    name: 'Pinwheel', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 6',
    cells: ['..O....', '.O.O.O.', 'O.OOO.O', '.OOOOOO', '..OOOO.', '..OOO.O', '....OO.'],
  },
  { name: 'Slab', category: 'Still life', rules: [DAY_AND_NIGHT], note: '12 cells', cells: ['..O..', 'OOOOO', 'OOOOO', '..O..'] },
];
