import type { BaseStatus } from "@/types";
import { dataColors, lightColorValues } from "@/generated/colorValues";

export const STATUS_COLORS: Record<BaseStatus, string> = {
  not_visited: dataColors.statusNotVisited,
  checked_in: lightColorValues["status.checkedIn"],
  submitted: lightColorValues["status.pending"],
  completed: lightColorValues["status.completed"],
  rejected: lightColorValues["status.rejected"],
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
  let minStatus: BaseStatus = "not_visited";
  baseProgress.forEach((p) => {
    const status = isBaseStatus(p.status) ? p.status : "not_visited";
    const priority = STATUS_PRIORITY[status] ?? 0;
    if (priority < minPriority) {
      minPriority = priority;
      minStatus = status;
    }
  });

  return minStatus;
}

/**
 * Same as getAggregateStatus but for a flat progress map where values are
 * status strings directly (used by broadcast components).
 */
export function getAggregateStatusFlat(
  baseId: string,
  progressIndex: Map<string, Map<string, string>>,
): BaseStatus {
  const baseProgress = progressIndex.get(baseId);
  if (!baseProgress || baseProgress.size === 0) return "not_visited";

  let minPriority = Infinity;
  let minStatus: BaseStatus = "not_visited";
  baseProgress.forEach((status) => {
    const s = isBaseStatus(status) ? status : "not_visited";
    const priority = STATUS_PRIORITY[s] ?? 0;
    if (priority < minPriority) {
      minPriority = priority;
      minStatus = s;
    }
  });

  return minStatus;
}

export function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Compute bearing (degrees, 0=north, clockwise) between two lat/lng points */
export function computeBearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
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
