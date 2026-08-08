import { describe, expect, it } from 'vitest';
import { Q } from '../../src/game/constants';
import { createInputController } from '../../src/game/input';
import { quantizeThumbVector } from '../../src/platform/input';

const zero = { x: 0, y: 0 };

describe('shared keyboard/touch input arbitration', () => {
  it('normalizes WASD and arrows to fixed cardinal and diagonal Q16.16 vectors', () => {
    const input = createInputController();

    input.keyDown('ArrowRight');
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
    input.keyDown('ArrowDown');
    expect(input.movementForTick()).toEqual({ x: 46_341, y: 46_341 });
    input.keyUp('ArrowRight');
    expect(input.movementForTick()).toEqual({ x: 0, y: Q });
    input.keyUp('ArrowDown');
    expect(input.movementForTick()).toEqual(zero);
  });

  it('lets the most recently changed non-zero source win and falls back on release', () => {
    const input = createInputController();

    input.keyDown('KeyA');
    input.setTouch({ x: Q, y: 0 });
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
    input.releaseTouch();
    expect(input.movementForTick()).toEqual({ x: -Q, y: 0 });
    input.clear();
    expect(input.movementForTick()).toEqual(zero);
  });

  it('clears held input on pause, visibility, focus loss, and terminal transitions', () => {
    const input = createInputController();
    input.keyDown('KeyW');
    input.setTouch({ x: Q, y: 0 });

    for (const interruption of ['pause', 'visibility', 'blur', 'terminal'] as const) {
      input.interrupt(interruption);
      expect(input.movementForTick()).toEqual(zero);
      input.keyDown('KeyW');
    }
  });

  it('ignores key repeat and opposite-axis cancellation remains deterministic', () => {
    const input = createInputController();
    input.keyDown('KeyD');
    input.keyDown('KeyD');
    input.keyDown('KeyA');
    expect(input.movementForTick()).toEqual(zero);
    input.keyUp('KeyA');
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
  });
});

describe('quantized thumb control', () => {
  it('keeps the 12px dead zone inclusive and emits zero inside it', () => {
    expect(quantizeThumbVector(12 * 256, 0)).toEqual(zero);
    expect(quantizeThumbVector(12 * 256 + 1, 0)).not.toEqual(zero);
  });

  it('clamps to 44 CSS pixels before exact Q16.16 normalization', () => {
    const vector = quantizeThumbVector(100 * 256, 0);

    expect(vector.x).toBe(Q);
    expect(vector.y).toBe(0);
  });

  it('uses truncation toward zero for negative quantized pointer coordinates', () => {
    expect(quantizeThumbVector(-12 * 256 - 1, 0).x).toBeLessThan(0);
    expect(quantizeThumbVector(0, -12 * 256 - 1).y).toBeLessThan(0);
  });
});
