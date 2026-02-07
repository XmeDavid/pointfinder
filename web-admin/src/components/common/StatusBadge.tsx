import { Badge } from "@/components/ui/badge";
import type { GameStatus } from "@/types";

const STATUS_MAP: Record<
  GameStatus,
  { label: string; variant: "default" | "secondary" | "warning" | "success" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  setup: { label: "Setup", variant: "warning" },
  live: { label: "Live", variant: "success" },
  ended: { label: "Ended", variant: "default" },
};

export function StatusBadge({ status }: { status: GameStatus }) {
  const config = STATUS_MAP[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
