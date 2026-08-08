// Optional Web Audio synthesis. No samples, no network. Short oscillator/noise
// envelopes for the game's cues. Created/resumed only after a user gesture. Any
// platform failure disables the controller, emits one public notice, and the game
// continues silently. Audio never mutates game state.

type CueName = 'pickup' | 'deposit' | 'repel' | 'danger' | 'win' | 'lose';

export type AudioController = {
  activate: () => void;
  play: (cue: CueName) => void;
  setMuted: (value: boolean) => void;
  setPaused: (value: boolean) => void;
  isAvailable: () => boolean;
  notices: () => readonly string[];
};

type Dependencies = {
  createContext?: () => AudioContext;
};

export function createAudioController(deps: Dependencies = {}): AudioController {
  let context: AudioContext | undefined;
  let available = true;
  let muted = false;
  let paused = false;
  let master: GainNode | undefined;
  const notices: string[] = [];
  let activeVoices = 0;

  const disable = () => {
    if (!available) return;
    available = false;
    if (!notices.includes('audio-unavailable')) notices.push('audio-unavailable');
    try { context?.close(); } catch { /* boundary cleanup */ }
    context = undefined;
    master = undefined;
  };

  const activate = () => {
    if (context || !available) return;
    try {
      if (deps.createContext) {
        context = deps.createContext();
      } else {
        const Native = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Native) { disable(); return; }
        context = new Native();
      }
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      disable();
    }
  };

  const resume = () => {
    try { void context?.resume(); } catch { disable(); }
  };

  const play = (cue: CueName) => {
    if (!available || !context || !master || muted || paused) return;
    try {
      if (context.state === 'suspended') resume();
      if (activeVoices > 8) return; // drop lowest-priority cosmetic cues under load
      synthesize(context, master, cue, () => { activeVoices = Math.max(0, activeVoices - 1); });
      activeVoices += 1;
    } catch {
      disable();
    }
  };

  return {
    activate,
    play,
    setMuted: (value: boolean) => {
      muted = value;
      if (master && context) {
        const now = context.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(value ? 0 : 0.5, now, 0.02);
      }
    },
    setPaused: (value: boolean) => {
      paused = value;
      try {
        if (value) void context?.suspend();
        else if (context?.state === 'suspended') resume();
      } catch { disable(); }
    },
    isAvailable: () => available,
    notices: () => [...notices],
  };
}

function synthesize(ctx: AudioContext, out: GainNode, cue: CueName, done: () => void): void {
  const now = ctx.currentTime;
  const voice = ctx.createGain();
  voice.connect(out);
  voice.gain.setValueAtTime(0, now);

  const finish = (at: number) => {
    voice.gain.setValueAtTime(voice.gain.value, at);
    voice.gain.linearRampToValueAtTime(0, at + 0.12);
    setTimeout(done, ((at + 0.13 - now) * 1000) + 50);
  };

  switch (cue) {
    case 'pickup': {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      voice.gain.linearRampToValueAtTime(0.3, now + 0.02);
      osc.connect(voice);
      osc.start(now);
      finish(now + 0.12);
      osc.stop(now + 0.26);
      break;
    }
    case 'deposit': {
      const freqs = [523, 659, 784];
      freqs.forEach((f, i) => {
        const t = now + i * 0.07;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.32);
      });
      finish(now + 0.3);
      break;
    }
    case 'repel': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
      voice.gain.linearRampToValueAtTime(0.18, now + 0.02);
      osc.connect(voice);
      osc.start(now);
      finish(now + 0.18);
      osc.stop(now + 0.24);
      break;
    }
    case 'danger': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 180;
      voice.gain.linearRampToValueAtTime(0.1, now + 0.02);
      osc.connect(voice);
      osc.start(now);
      finish(now + 0.1);
      osc.stop(now + 0.16);
      break;
    }
    case 'win': {
      const freqs = [523, 659, 784, 1046];
      freqs.forEach((f, i) => {
        const t = now + i * 0.12;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.52);
      });
      finish(now + 0.6);
      break;
    }
    case 'lose': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.7);
      voice.gain.linearRampToValueAtTime(0.3, now + 0.04);
      osc.connect(voice);
      osc.start(now);
      finish(now + 0.7);
      osc.stop(now + 0.8);
      break;
    }
  }
}
