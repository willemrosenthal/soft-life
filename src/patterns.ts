/** The pattern library: classic Life patterns, 'O' = live cell. */
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

export interface Pattern {
  name: string;
  category: PatternCategory;
  /** One line about it, shown on its card. */
  note: string;
  cells: readonly string[];
}

export const PATTERNS: readonly Pattern[] = [
  { name: 'Glider', category: 'Spaceship', note: 'c/4 diagonal', cells: ['.O.', '..O', 'OOO'] },
  { name: 'LWSS', category: 'Spaceship', note: 'c/2 orthogonal', cells: ['.O..O', 'O....', 'O...O', 'OOOO.'] },
  { name: 'MWSS', category: 'Spaceship', note: 'c/2 orthogonal', cells: ['...O..', '.O...O', 'O.....', 'O....O', 'OOOOO.'] },
  { name: 'HWSS', category: 'Spaceship', note: 'c/2 orthogonal', cells: ['...OO..', '.O....O', 'O......', 'O.....O', 'OOOOOO.'] },
  {
    name: 'Loafer', category: 'Spaceship', note: 'c/7 orthogonal',
    cells: ['.OO..O.OO', 'O..O..OO.', '.O.O.....', '..O......', '........O', '......OOO', '.....O...', '......O..', '.......OO'],
  },

  { name: 'Blinker', category: 'Oscillator', note: 'period 2', cells: ['OOO'] },
  { name: 'Toad', category: 'Oscillator', note: 'period 2', cells: ['.OOO', 'OOO.'] },
  { name: 'Beacon', category: 'Oscillator', note: 'period 2', cells: ['OO..', 'OO..', '..OO', '..OO'] },
  {
    name: 'Pulsar', category: 'Oscillator', note: 'period 3',
    cells: ['..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............', '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..'],
  },
  { name: 'Pentadecathlon', category: 'Oscillator', note: 'period 15', cells: ['..O....O..', 'OO.OOOO.OO', '..O....O..'] },
  {
    name: 'Queen bee shuttle', category: 'Oscillator', note: 'period 30',
    cells: ['.........O............', '.......O.O............', '......O.O.............', 'OO...O..O...........OO', 'OO....O.O...........OO', '.......O.O............', '.........O............'],
  },

  { name: 'Block', category: 'Still life', note: 'the simplest', cells: ['OO', 'OO'] },
  { name: 'Beehive', category: 'Still life', note: '6 cells', cells: ['.OO.', 'O..O', '.OO.'] },
  { name: 'Loaf', category: 'Still life', note: '7 cells', cells: ['.OO.', 'O..O', '.O.O', '..O.'] },
  { name: 'Boat', category: 'Still life', note: '5 cells', cells: ['OO.', 'O.O', '.O.'] },
  { name: 'Tub', category: 'Still life', note: '4 cells', cells: ['.O.', 'O.O', '.O.'] },
  { name: 'Eater 1', category: 'Still life', note: 'eats gliders', cells: ['OO..', 'O.O.', '..O.', '..OO'] },

  { name: 'R-pentomino', category: 'Methuselah', note: 'settles at 1,103', cells: ['.OO', 'OO.', '.O.'] },
  { name: 'Acorn', category: 'Methuselah', note: 'settles at 5,206', cells: ['.O.....', '...O...', 'OO..OOO'] },
  { name: 'Diehard', category: 'Methuselah', note: 'vanishes at 130', cells: ['......O.', 'OO......', '.O...OOO'] },
  { name: 'B-heptomino', category: 'Methuselah', note: 'settles at 148', cells: ['O.OO', 'OOO.', '.O..'] },
  { name: 'Herschel', category: 'Methuselah', note: 'settles at 128', cells: ['O..', 'OOO', 'O.O', '..O'] },

  {
    name: 'Gosper glider gun', category: 'Gun', note: 'a glider every 30',
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
    name: 'Simkin glider gun', category: 'Gun', note: 'a glider every 120',
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

  { name: 'Switch engine', category: 'Growth', note: 'settles at 3,911', cells: ['.O.O..', 'O.....', '.O..O.', '...OOO'] },
  {
    name: 'Block-laying switch engine', category: 'Growth', note: 'grows forever',
    cells: ['......O.', '....O.OO', '....O.O.', '....O...', '..O.....', 'O.O.....'],
  },
];
