import { describe, expect, it, vi } from 'vitest';
import { loadPreferences, savePreferences } from '../../src/platform/storage';
import { resolveReducedMotion } from '../../src/platform/preferences';

const defaults = {
  version: 1,
  bestScore: 0,
  muted: false,
  highContrast: false,
  reducedMotion: 'system' as const,
};

function storage(overrides: Partial<Storage> = {}): Storage {
  return {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    get length() {
      return 0;
    },
    ...overrides,
  } as Storage;
}

describe('versioned local preferences contract', () => {
  it('uses defaults for a missing key and round-trips only the validated schema', () => {
    const target = storage();

    expect(loadPreferences(target)).toEqual({ ok: true, value: defaults });
    expect(savePreferences(target, { ...defaults, bestScore: 321 })).toBe(true);
    expect(target.setItem).toHaveBeenCalledWith(
      'last-light:preferences:v1',
      JSON.stringify({ ...defaults, bestScore: 321 }),
    );
  });

  it.each([
    ['not-json', 'invalid'],
    ['null', 'invalid'],
    ['[]', 'invalid'],
    [JSON.stringify({ ...defaults, version: 2 }), 'invalid'],
    [JSON.stringify({ ...defaults, bestScore: -1 }), 'invalid'],
    [JSON.stringify({ ...defaults, muted: 'yes' }), 'invalid'],
    [JSON.stringify({ ...defaults, reducedMotion: 'sometimes' }), 'invalid'],
    [`${'x'.repeat(1_025)}`, 'invalid'],
  ])('rejects %s as %s without throwing', (payload, reason) => {
    const target = storage({ getItem: vi.fn(() => payload) });

    expect(loadPreferences(target)).toEqual({ ok: false, value: defaults, reason });
  });

  it('treats get access failure as unavailable, not corrupt data', () => {
    const target = storage({
      getItem: vi.fn(() => {
        throw new DOMException('blocked');
      }),
    });

    expect(loadPreferences(target)).toEqual({ ok: false, value: defaults, reason: 'unavailable' });
  });

  it('returns false for write failure and never claims a successful save', () => {
    const target = storage({
      setItem: vi.fn(() => {
        throw new DOMException('blocked');
      }),
    });

    expect(savePreferences(target, defaults)).toBe(false);
  });

  it('ignores unknown keys while retaining all known valid values', () => {
    const value = { ...defaults, bestScore: 99, unknown: 'ignored' };
    const target = storage({ getItem: vi.fn(() => JSON.stringify(value)) });

    expect(loadPreferences(target)).toEqual({
      ok: true,
      value: { ...defaults, bestScore: 99 },
    });
  });
});

describe('reduced-motion preference precedence', () => {
  it('uses explicit local overrides before the OS media query', () => {
    expect(resolveReducedMotion('on', () => false)).toBe(true);
    expect(resolveReducedMotion('off', () => true)).toBe(false);
    expect(resolveReducedMotion('system', () => true)).toBe(true);
    expect(resolveReducedMotion('system', () => false)).toBe(false);
  });

  it('falls back to no preference when matchMedia is unavailable or throws', () => {
    expect(resolveReducedMotion('system', undefined)).toBe(false);
    expect(
      resolveReducedMotion('system', () => {
        throw new Error('unsupported');
      }),
    ).toBe(false);
  });
});
