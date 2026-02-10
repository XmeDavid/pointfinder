import { Badge } from "@/components/ui/badge";
import type { GameStatus } from "@/types";
import { useTranslation } from "react-i18next";

const STATUS_MAP: Record<
  GameStatus,
  { i18nKey: string; variant: "default" | "secondary" | "warning" | "success" }
> = {
  setup: { i18nKey: "status.setup", variant: "secondary" },
  live: { i18nKey: "status.live", variant: "success" },
  ended: { i18nKey: "status.ended", variant: "default" },
};

export function StatusBadge({ status }: { status: GameStatus }) {
  const { t } = useTranslation();
  const config = STATUS_MAP[status];
  return <Badge variant={config.variant}>{t(config.i18nKey)}</Badge>;
}
