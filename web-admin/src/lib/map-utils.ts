import type { BaseStatus } from "@/types";

export const STATUS_COLORS: Record<BaseStatus, string> = {
  not_visited: "#9ca3af",
  checked_in: "#3b82f6",
  submitted: "#f59e0b",
  completed: "#22c55e",
  rejected: "#ef4444",
};

export const STATUS_PRIORITY: Record<BaseStatus, number> = {
  not_visited: 0,
  checked_in: 1,
  submitted: 2,
  rejected: 3,
  completed: 4,
};

function isBaseStatus(value: unknown): value is BaseStatus {
  return typeof value === "string" && value in STATUS_PRIORITY;
}

export function getAggregateStatus(
  baseId: string,
  progressIndex: Map<string, Map<string, { status: string }>>,
): BaseStatus {
  const baseProgress = progressIndex.get(baseId);
  if (!baseProgress || baseProgress.size === 0) return "not_visited";

  let minPriority = Infinity;
  baseProgress.forEach((p) => {
    const status = isBaseStatus(p.status) ? p.status : "not_visited";
    const priority = STATUS_PRIORITY[status] ?? 0;
    if (priority < minPriority) minPriority = priority;
  });

  const entry = Object.entries(STATUS_PRIORITY).find(([, v]) => v === minPriority);
  return (entry?.[0] as BaseStatus) ?? "not_visited";
}

export function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Compute LngLatBounds from a list of coordinates */
export function computeBounds(points: { lat: number; lng: number }[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}
