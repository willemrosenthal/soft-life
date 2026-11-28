/**
 * The pattern library, 'O' = live cell. Each pattern lists the rules it's known to work under: the
 * classic Life patterns, the ones that also behave the same in HighLife, HighLife's own (replicator,
 * bomber, …), and Day & Night's. Names and many shapes come from Catagolue's census of objects found
 * in random soups (catagolue.hatsya.com); every pattern is checked under its rules in the tests.
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

  // More Life classics, and named oscillators from Catagolue's soup census that work in Life and HighLife alike.
  {
    name: 'Figure eight', category: 'Oscillator', rules: [LIFE], note: 'period 8',
    cells: ['OOO...', 'OOO...', 'OOO...', '...OOO', '...OOO', '...OOO'],
  },
  {
    name: 'Kok\'s galaxy', category: 'Oscillator', rules: [LIFE], note: 'period 8',
    cells: ['OOOOOO.OO', 'OOOOOO.OO', '.......OO', 'OO.....OO', 'OO.....OO', 'OO.....OO', 'OO.......', 'OO.OOOOOO', 'OO.OOOOOO'],
  },
  {
    name: 'Tumbler', category: 'Oscillator', rules: [LIFE], note: 'period 14',
    cells: ['.O.....O.', 'O.O...O.O', 'O..O.O..O', '..O...O..', '..OO.OO..'],
  },
  {
    name: 'Octagon 2', category: 'Oscillator', rules: [LIFE], note: 'period 5',
    cells: ['...OO...', '..O..O..', '.O....O.', 'O......O', 'O......O', '.O....O.', '..O..O..', '...OO...'],
  },
  {
    name: 'Copperhead', category: 'Spaceship', rules: [LIFE], note: 'c/10 orthogonal',
    cells: ['.OO..OO.', '...OO...', '...OO...', 'O.O..O.O', 'O......O', '........', 'O......O', '.OO..OO.', '..OOOO..', '........', '...OO...', '...OO...'],
  },
  { name: 'Ship', category: 'Still life', rules: [LIFE], note: '6 cells', cells: ['OO.', 'O.O', '.OO'] },
  { name: 'Pi-heptomino', category: 'Methuselah', rules: [LIFE], note: 'settles at 173', cells: ['OOO', 'O.O', 'O.O'] },
  { name: 'Rabbits', category: 'Methuselah', rules: [LIFE], note: 'settles at 17,331', cells: ['O...OOO', 'OOO..O.', '.O.....'] },
  { name: 'Clock', category: 'Oscillator', rules: ALL, note: 'period 2', cells: ['..O.', 'OO..', '..OO', '.O..'] },
  { name: 'Mold', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 4', cells: ['OOO...', 'OOO.O.', '.O.O.O', '..O..O', '...OO.'] },
  {
    name: 'Mazing', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 4',
    cells: ['..OOO..', '..OOO..', 'OO..OOO', 'OO.....', 'OOO....', '..O....', '..O....'],
  },
  {
    name: 'Fumarole', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 5',
    cells: ['OO....OO', 'O.O..O.O', '..O..O..', '.O....O.', '.OO..OO.', '...OO...'],
  },
  {
    name: 'Coe\'s p8', category: 'Oscillator', rules: LIFE_AND_HIGHLIFE, note: 'period 8',
    cells: ['....OO', '....OO', '....OO', '...OO.', '..OOOO', '.O....', 'OO....', '..O...', '......', '......', 'OO....', 'OO....'],
  },
  { name: 'Pond', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '8 cells', cells: ['.OO.', 'O..O', 'O..O', '.OO.'] },
  { name: 'Snake', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '6 cells', cells: ['OO.O', 'O.OO'] },
  { name: 'Long boat', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '7 cells', cells: ['OO..', 'O.O.', '.O.O', '..O.'] },
  { name: 'Barge', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '6 cells', cells: ['.O..', 'O.O.', '.O.O', '..O.'] },
  { name: 'Aircraft carrier', category: 'Still life', rules: LIFE_AND_HIGHLIFE, note: '6 cells', cells: ['OO..', 'O..O', '..OO'] },

  // HighLife only (names from Catagolue)
  {
    name: 'Bomber', category: 'Spaceship', rules: [HIGHLIFE], note: 'c/6 diagonal, period 48',
    cells: ['.O.......', '.O.......', '.O.......', '.........', '.........', '...O.....', '..OO.....', '.O.O.....', 'OOO......', '.........', '......OOO', '.....O.O.', '.....OO..', '.....O...'],
  },
  { name: 'HighLife p7', category: 'Oscillator', rules: [HIGHLIFE], note: 'period 7', cells: ['OO.O...', '.O.....', '.....O.', '...O.OO'] },
  { name: 'HighLife p10', category: 'Oscillator', rules: [HIGHLIFE], note: 'period 10', cells: ['OOO', '..O', '...', 'O.O', '.OO'] },
  {
    name: 'Replicator shuttle', category: 'Oscillator', rules: [HIGHLIFE], note: 'period 96, two blocks bounce a replicator',
    cells: ['OO.................................', 'OO..........O......................', '...........OO......................', '..........O.O......................', '.........OOO.......................', '...................................', '...............OOO.................', '..............O.O..................', '..............OO...................', '..............O....................', '...................................', '...................................', '...................................', '...................................', '...................................', '...................................', '...................................', '.................................OO', '.................................OO'],
  },

  // Day & Night: more spaceships and oscillators from Catagolue's soup census. Butterfly and snail are
  // its names; the rest are unnamed there, so they go by their period.
  {
    name: 'Butterfly', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/3 diagonal, period 3',
    cells: ['.OOO.', 'OOO.O', '...OO', '...OO', '...O.'],
  },
  {
    name: 'Snail', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/7 orthogonal, period 14',
    cells: ['.OOO.', '..O..', 'OOOOO', '.OOO.', '..O..'],
  },
  {
    name: 'p2 spaceship', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/2 orthogonal, period 2',
    cells: ['..O.O..', '...O...', 'O.OOO.O', 'OOOOOOO', 'OOOOOOO', '..OOO..', '.OOOOO.', '..OOO..', '...O...'],
  },
  {
    name: 'p4 spaceship', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/2 orthogonal, period 4',
    cells: ['...O...', '..OOO..', '.OOOOO.', '..OOO..', 'OO.O.OO', '.......', '...O...'],
  },
  {
    name: 'p12 spaceship', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/2 orthogonal, period 12',
    cells: ['.OO.OO.', '.O.OO.O', '.OOOOOO', '.OOOOOO', 'O.OOO.O', '...O.O.', '..OOO..'],
  },
  {
    name: 'p24 spaceship', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/2 orthogonal, period 24',
    cells: ['..OOO.', '...OO.', 'O.OOOO', '..OOO.', '..OO..', '..OO..', '.OOOO.', 'OOOOOO', 'O.OO.O', '.OOOO.'],
  },
  {
    name: 'p32 spaceship', category: 'Spaceship', rules: [DAY_AND_NIGHT], note: 'c/2 orthogonal, period 32',
    cells: ['..O......', '.OOOOO..O', 'OOOOO.OOO', '.OOOOO..O', '..O......'],
  },
  { name: 'p3 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 3', cells: ['OOOO', '.OO.', '.OO.', '.OO.', 'OOOO'] },
  {
    name: 'p5 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 5',
    cells: ['.OO.OO.', '.OOOOO.', 'OOOOOOO', '.OOOO.O', '.OOOO..', '...O...'],
  },
  {
    name: 'p7 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 7',
    cells: ['.O.O..', 'OOOOOO', 'OOOOOO', 'O..OO.', '...OOO', '..OOO.'],
  },
  {
    name: 'p8 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 8',
    cells: ['..OOOOO..', 'OOOOOOOOO', 'OOO...OOO', '..OO.OO..'],
  },
  {
    name: 'p10 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 10',
    cells: ['.OO...', '.OOOOO', 'OOOOO.', 'O.OOOO', '..OOOO', '...O..'],
  },
  {
    name: 'p12 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 12',
    cells: ['.O.O...', 'OOOO.O.', '.O...O.', '.O.OOOO', '...O.O.'],
  },
  { name: 'p13 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 13', cells: ['.O...', 'OOOO.', '.O.O.', '.OOOO', '...O.'] },
  {
    name: 'p14 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 14',
    cells: ['OOO....', '.OO....', '.O...O.', '.....OO', '.....OO'],
  },
  {
    name: 'p24 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 24',
    cells: ['...O..', '.OOOO.', 'OO..O.', '.O..OO', '.OOOO.', '..O...'],
  },
  {
    name: 'p28 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 28',
    cells: ['...OO..', '.OO.OO.', 'OOO.OO.', 'O..O..O', '.OO.OOO', '.OO.OO.', '..OO...'],
  },
  {
    name: 'p30 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 30',
    cells: ['..O.O.', '.OOO.O', 'OOOOOO', '.OOOO.', '.OOOOO', 'OOOOO.', 'OOOO..', '..O.O.'],
  },
  {
    name: 'p35 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 35',
    cells: ['..OOO..', 'O.OO...', 'OOOO..O', 'O.OOOOO', '..OOOOO', '....O..', '...OOO.'],
  },
  { name: 'p36 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 36', cells: ['O....', '.OO..', '.O.OO', '..OOO', '..OO.'] },
  {
    name: 'p42 oscillator', category: 'Oscillator', rules: [DAY_AND_NIGHT], note: 'period 42',
    cells: ['.OOO..', 'OOO...', '.OO..O', 'OOOOOO', '.OOOOO', '..O.O.'],
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
