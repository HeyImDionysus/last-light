export function scoreDeposit(input: { depositedStars: number; preRefillEnergyUnits: number }): number {
  return 100 * input.depositedStars + 25 * input.depositedStars ** 2 + 10 * Math.floor(input.preRefillEnergyUnits / 600);
}
export function scoreWinBonus(tick: number): number {
  return Math.max(0, 4_200 - 10 * Math.floor(tick / 60));
}
