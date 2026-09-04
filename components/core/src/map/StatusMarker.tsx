import { cn } from "../lib/cn";
import { markerToneClass, type MarkerTone } from "./markerStyles";

export interface StatusMarkerProps {
  tone: MarkerTone;
  /** Diameter of the dot in px. */
  size?: number;
  selected?: boolean;
  dashed?: boolean;
  opacity?: number;
  /** Short label drawn under the dot, e.g. the challenge title on the player map. */
  label?: string;
  className?: string;
}

/**
 * The shared map dot for bases. Pure SVG, no map library dependency, so web-admin,
 * the mobile app and Storybook draw exactly the same marker.
 */
export function StatusMarker({ tone, size = 14, selected = false, dashed = false, opacity = 1, label, className }: StatusMarkerProps) {
  const box = size + 8;
  const c = markerToneClass[tone];
  return (
    <div className={cn("flex flex-col items-center", className)} style={{ opacity }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ display: "block" }} aria-hidden>
        {selected && <circle cx={box / 2} cy={box / 2} r={box / 2 - 1} fill="none" className="stroke-background" strokeWidth={2} strokeOpacity={0.9} />}
        <circle cx={box / 2} cy={box / 2} r={size / 2} className={cn(c.fill, c.stroke)} strokeWidth={2} strokeDasharray={dashed ? "4 2" : undefined} />
      </svg>
      {label && (
        <span className="max-w-28 truncate rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-foreground shadow-sm">{label}</span>
      )}
    </div>
  );
}

export function TeamLocationMarker({ stale = false, heading }: { stale?: boolean; heading?: number | null }) {
  return (
    <div className="relative flex h-6 w-6 items-center justify-center" aria-hidden>
      {!stale && <span className="absolute inset-0 rounded-full bg-info/25 motion-safe:animate-ping" />}
      <span className={cn("h-3.5 w-3.5 rounded-full border-2 border-background shadow", stale ? "bg-muted-foreground" : "bg-info")} />
      {typeof heading === "number" && !stale && (
        <span className="absolute -top-1 h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-info" style={{ transform: `rotate(${heading}deg)`, transformOrigin: "50% 160%" }} />
      )}
    </div>
  );
}
