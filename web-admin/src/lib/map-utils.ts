import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
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

const iconCache = new Map<string, L.DivIcon>();

export function createColoredIcon(color: string): L.DivIcon {
  let icon = iconCache.get(color);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      html: `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="5" fill="#fff"/>
    </svg>`,
    });
    iconCache.set(color, icon);
  }
  return icon;
}

export function getAggregateStatus(
  baseId: string,
  progressIndex: Map<string, Map<string, { status: string }>>,
): BaseStatus {
  const baseProgress = progressIndex.get(baseId);
  if (!baseProgress || baseProgress.size === 0) return "not_visited";

  let minPriority = Infinity;
  baseProgress.forEach((p) => {
    const priority = STATUS_PRIORITY[p.status as BaseStatus] ?? 0;
    if (priority < minPriority) minPriority = priority;
  });

  const entry = Object.entries(STATUS_PRIORITY).find(([, v]) => v === minPriority);
  return (entry?.[0] as BaseStatus) ?? "not_visited";
}

export function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Auto-fits map bounds when bases first load */
export function FitBounds({ bases }: { bases: { lat: number; lng: number }[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (bases.length > 0 && !fitted.current) {
      const bounds = L.latLngBounds(bases.map((b) => [b.lat, b.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      fitted.current = true;
    }
  }, [bases, map]);

  return null;
}
