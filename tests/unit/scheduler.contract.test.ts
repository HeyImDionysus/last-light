import { describe, expect, it, vi } from 'vitest';
import { createFixedStepScheduler } from '../../src/platform/scheduler';

describe('fixed-step scheduler contract', () => {
  it('runs one reducer tick per 1/60 second and caps a frame at five ticks', () => {
    const onTick = vi.fn();
    const scheduler = createFixedStepScheduler({ onTick });

    scheduler.frame(1 / 60);
    expect(onTick).toHaveBeenCalledTimes(1);
    scheduler.frame(0.25);
    expect(onTick).toHaveBeenCalledTimes(6);
  });

  it('clamps one frame delta to 250ms and discards excess catch-up after the cap', () => {
    const onTick = vi.fn();
    const scheduler = createFixedStepScheduler({ onTick });

    scheduler.frame(5);
    expect(onTick).toHaveBeenCalledTimes(5);
    scheduler.frame(0);
    expect(onTick).toHaveBeenCalledTimes(5);
  });

  it('stops scheduling while paused or hidden and resumes only from a fresh visible frame', () => {
    const onTick = vi.fn();
    const scheduler = createFixedStepScheduler({ onTick });

    scheduler.frame(1 / 60);
    scheduler.setRunning(false);
    scheduler.frame(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    scheduler.setRunning(true);
    scheduler.frame(1 / 60);
    expect(onTick).toHaveBeenCalledTimes(2);
  });
});
