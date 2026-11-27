/** The pattern library: classic Life patterns, 'O' = live cell. */
export type PatternCategory = 'Spaceship' | 'Oscillator' | 'Methuselah';

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
  {
    name: 'Pulsar', category: 'Oscillator', note: 'period 3',
    cells: ['..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............', '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..'],
  },
  { name: 'Pentadecathlon', category: 'Oscillator', note: 'period 15', cells: ['..O....O..', 'OO.OOOO.OO', '..O....O..'] },
  { name: 'Beacon', category: 'Oscillator', note: 'period 2', cells: ['OO..', 'OO..', '..OO', '..OO'] },
  { name: 'R-pentomino', category: 'Methuselah', note: 'settles at 1,103', cells: ['.OO', 'OO.', '.O.'] },
  { name: 'Acorn', category: 'Methuselah', note: 'settles at 5,206', cells: ['.O.....', '...O...', 'OO..OOO'] },
  { name: 'Diehard', category: 'Methuselah', note: 'vanishes at 130', cells: ['......O.', 'OO......', '.O...OOO'] },
];
