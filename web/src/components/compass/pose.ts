/** Unwrap angles so 359° → 1° travels two degrees, never a full revolution. */
export function nearestAngle(current: number, next: number): number {
  return current + ((next - current + 180) % 360 + 360) % 360 - 180
}

export const clampTilt = (value: number) => Math.max(-25, Math.min(25, value))
