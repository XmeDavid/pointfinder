import type { RealtimeStats } from "@/lib/api/monitoring";
import type { GameStatus } from "@/types";

export type HealthStatus = "green" | "yellow" | "red" | "idle";

export function classifyHealth(
  stats: RealtimeStats,
  gameStatus: GameStatus | undefined,
): HealthStatus {
  const active = stats.totalActiveSessions;
  const reconnects = stats.estimatedReconnectsLastHour;

  if (gameStatus === "live" && active === 0) {
    return "red";
  }
  if (active === 0) {
    return "idle";
  }
  // Burn rate heuristic: if the hub is churning more than one reconnect
  // per 3 active sessions per hour, something in the field is unstable
  // (weak wifi, backgrounded apps, token refresh issues). Raise a yellow
  // warning without hiding the actual numbers.
  if (reconnects > 0 && reconnects * 3 >= active) {
    return "yellow";
  }
  return "green";
}
