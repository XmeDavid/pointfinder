/** SVG pin marker for base locations */
export function PinMarkerSvg({ color }: { color: string }) {
  return (
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill={color} stroke="#fff" strokeWidth="1.5"/>
      <circle cx="12.5" cy="12.5" r="5" fill="#fff"/>
    </svg>
  );
}

/** Circle dot for team location markers */
export function CircleDot({ color, stale }: { color: string; stale?: boolean }) {
  const size = 20;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 2}
        fill={color}
        fillOpacity={stale ? 0.4 : 0.8}
        stroke={stale ? "#9ca3af" : color}
        strokeWidth={stale ? 1 : 2}
        strokeDasharray={stale ? "4 4" : undefined}
      />
    </svg>
  );
}
