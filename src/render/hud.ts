// Semantic DOM HUD. Updates score, banked/carried star counts, and a lantern
// energy bar from game snapshots. Mutates only the passed elements; never reads
// or stores game state. Updates are cheap and run every frame, but the live region
// (role=status) only changes text on meaningful transitions to avoid spam.

import { MAX_ENERGY_UNITS } from '../game/constants';
import type { GameState } from '../game/types';

export type HudElements = {
  score: HTMLElement;
  banked: HTMLElement;
  bankTotal: HTMLElement;
  carried: HTMLElement;
  carryMax: HTMLElement;
  lanternFill: HTMLElement;
  lanternLabel: HTMLElement;
  best: HTMLElement;
};

export function createHud(els: HudElements) {
  let lastStatusText = '';
  return {
    update(state: GameState | undefined, bestScore: number, phaseLabel: string, statusText: string) {
      els.best.textContent = String(bestScore);
      if (statusText !== lastStatusText) lastStatusText = statusText;
      if (!state) {
        els.score.textContent = '0';
        els.banked.textContent = '0';
        els.carried.textContent = '0';
        els.lanternFill.style.width = '100%';
        els.lanternLabel.textContent = 'Lantern ready';
        return;
      }
      els.score.textContent = String(state.score);
      els.banked.textContent = String(state.bankedStars);
      els.carried.textContent = String(state.carriedStars.length);
      const fraction = Math.max(0, Math.min(1, state.lantern.energyUnits / MAX_ENERGY_UNITS));
      els.lanternFill.style.width = `${Math.round(fraction * 100)}%`;
      els.lanternFill.dataset.level = fraction > 0.5 ? 'high' : fraction > 0.2 ? 'mid' : 'low';
      els.lanternLabel.textContent =
        fraction > 0.5 ? 'Lantern strong' : fraction > 0.2 ? 'Lantern fading' : fraction > 0 ? 'Lantern failing' : 'Lantern dark';
      void phaseLabel;
    },
  };
}
