export type BaseStatus = "not_visited" | "checked_in" | "submitted" | "completed" | "rejected";

export type MarkerTone = "success" | "info" | "warning" | "destructive" | "muted" | "hidden";

/** Status color rule: green done, blue checked in, amber pending, red rejected, gray not visited. */
export const baseStatusMarkerTone: Record<BaseStatus, MarkerTone> = {
  completed: "success",
  checked_in: "info",
  submitted: "warning",
  rejected: "destructive",
  not_visited: "muted",
};

export const markerToneClass: Record<MarkerTone, { fill: string; stroke: string }> = {
  success: { fill: "fill-success", stroke: "stroke-success" },
  info: { fill: "fill-info", stroke: "stroke-info" },
  warning: { fill: "fill-warning", stroke: "stroke-warning" },
  destructive: { fill: "fill-destructive", stroke: "stroke-destructive" },
  muted: { fill: "fill-muted-foreground", stroke: "stroke-muted-foreground" },
  hidden: { fill: "fill-muted", stroke: "stroke-muted-foreground" },
};
