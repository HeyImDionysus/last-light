import { Q } from './constants';
type Vector = { x: number; y: number };
const codes = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const zero = (): Vector => ({ x: 0, y: 0 });
function keyboardVector(held: Set<string>): Vector {
  const x = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
  const y = (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0);
  if (!x && !y) return zero();
  return x && y ? { x: x * 46_341, y: y * 46_341 } : { x: x * Q, y: y * Q };
}
export function createInputController() {
  const held = new Set<string>(); let touch = zero(); let keyboardSequence = 0; let touchSequence = 0; let sequence = 0;
  const keyboardChanged = () => { keyboardSequence = ++sequence; };
  return {
    keyDown(code: string) { if (codes.has(code) && !held.has(code)) { held.add(code); keyboardChanged(); } },
    keyUp(code: string) { if (codes.has(code) && held.delete(code)) keyboardChanged(); },
    setTouch(vector: Vector) { touch = vector; touchSequence = ++sequence; },
    releaseTouch() { if (touch.x || touch.y) { touch = zero(); touchSequence = ++sequence; } },
    clear() { held.clear(); touch = zero(); keyboardSequence = ++sequence; touchSequence = sequence; },
    interrupt(reason: 'pause' | 'visibility' | 'blur' | 'terminal') { void reason; held.clear(); touch = zero(); keyboardSequence = ++sequence; touchSequence = sequence; },
    movementForTick(): Vector { const keyboard = keyboardVector(held); if (!keyboard.x && !keyboard.y) return touch; if (!touch.x && !touch.y) return keyboard; return touchSequence > keyboardSequence ? touch : keyboard; },
  };
}
