import { describe, expect, it, vi } from 'vitest';
import { createAudioController } from '../../src/platform/audio';
import { createVisibilityController } from '../../src/platform/visibility';

function mockContext() {
  const gain = {
    connect: vi.fn(),
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
  return {
    state: 'running',
    currentTime: 0,
    destination: { connect: vi.fn() },
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => ({
      type: '',
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    close: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
  } as unknown as AudioContext;
}

describe('optional audio boundary', () => {
  it('does not create an AudioContext until a user gesture', () => {
    const factory = vi.fn(() => mockContext());
    const audio = createAudioController({ createContext: factory });

    expect(factory).not.toHaveBeenCalled();
    audio.play('pickup');
    expect(factory).not.toHaveBeenCalled();
    audio.activate();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('disables itself and emits one public notice when context creation fails', () => {
    const audio = createAudioController({
      createContext: () => {
        throw new Error('AudioContext blocked');
      },
    });

    audio.activate();
    audio.activate();
    expect(audio.isAvailable()).toBe(false);
    expect(audio.notices()).toEqual(['audio-unavailable']);
  });

  it('never changes game state and suppresses synthesis while muted or paused', () => {
    const ctx = mockContext();
    const audio = createAudioController({ createContext: () => ctx });

    audio.activate();
    audio.setMuted(true);
    audio.play('win');
    audio.setPaused(true);
    audio.play('lose');
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });
});

describe('visibility and lifecycle boundary', () => {
  it('pauses immediately with visibility reason, clears input, and never auto-resumes', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const lifecycle = createVisibilityController({ onPause, onResume });

    lifecycle.changedTo('hidden');
    lifecycle.changedTo('visible');

    expect(onPause).toHaveBeenCalledWith('visibility');
    expect(onResume).not.toHaveBeenCalled();
  });

  it('rejects Resume while hidden and accepts it only after visible user action', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const lifecycle = createVisibilityController({ onPause, onResume });

    lifecycle.changedTo('hidden');
    expect(lifecycle.requestResume()).toBe(false);
    lifecycle.changedTo('visible');
    expect(lifecycle.requestResume()).toBe(true);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('does not pause for blur alone and suspends audio on pagehide when supported', () => {
    const onPause = vi.fn();
    const suspendAudio = vi.fn();
    const lifecycle = createVisibilityController({ onPause, onResume: vi.fn(), suspendAudio });

    lifecycle.blurred();
    expect(onPause).not.toHaveBeenCalled();
    lifecycle.pageHidden();
    expect(suspendAudio).toHaveBeenCalledTimes(1);
  });
});
