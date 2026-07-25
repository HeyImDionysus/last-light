import { createRng } from '../../src/game/rng';

describe('gameplay PRNG contract', () => {
  it('emits the exact xorshift32 sequence and exposes serializable state', () => {
    const rng = createRng(0x1234_5678);

    expect([rng.nextU32(), rng.nextU32(), rng.nextU32(), rng.nextU32(), rng.nextU32()]).toEqual([
      2_274_908_837, 358_294_691, 1_210_119_364, 2_176_035_992, 1_882_851_208,
    ]);
    expect(rng.state()).toBe(1_882_851_208);
  });

  it('normalizes a zero seed to the documented nonzero fallback', () => {
    const zero = createRng(0);
    const fallback = createRng(0x6d2b_79f5);

    expect(zero.state()).toBe(fallback.state());
    expect(zero.nextU32()).toBe(fallback.nextU32());
  });

  it('maps inclusive integer ranges without modulo bias', () => {
    const rng = createRng(0xfeed_beef);
    const values = Array.from({ length: 500 }, () => rng.int(-4, 4));

    expect(values.every((value) => value >= -4 && value <= 4)).toBe(true);
    expect(values).toContain(-4);
    expect(values).toContain(4);
  });
});
