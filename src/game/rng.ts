import { FALLBACK_SEED } from './constants';

export type Rng = Readonly<{ nextU32: () => number; int: (min: number, max: number) => number; state: () => number }>;

export function createRng(seed: number): Rng {
  let value = (seed >>> 0) || FALLBACK_SEED;
  const nextU32 = (): number => {
    let x = value >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    value = x >>> 0;
    return value;
  };
  const int = (min: number, max: number): number => {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max || max - min >= 2 ** 32) throw new Error('invalid rng range');
    const span = max - min + 1;
    const limit = Math.floor(0x1_0000_0000 / span) * span;
    let output: number;
    do output = nextU32(); while (output >= limit);
    return min + (output % span);
  };
  return Object.freeze({ nextU32, int, state: () => value });
}
