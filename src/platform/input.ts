import { Q } from '../game/constants';
function trunc0(value: number): number { return value < 0 ? Math.ceil(value) : Math.floor(value); }
function isqrt(value: number): number { return Math.floor(Math.sqrt(value)); }
export function quantizeThumbVector(dx: number, dy: number): { x: number; y: number } {
  if (dx * dx + dy * dy <= (12 * 256) ** 2) return { x: 0, y: 0 };
  let x = dx; let y = dy; const length = isqrt(x * x + y * y); const maximum = 44 * 256;
  if (length > maximum) { x = trunc0((x * maximum) / length); y = trunc0((y * maximum) / length); }
  const normalized = isqrt(x * x + y * y);
  return { x: trunc0((x * Q) / normalized), y: trunc0((y * Q) / normalized) };
}
