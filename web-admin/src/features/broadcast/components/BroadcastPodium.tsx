import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BroadcastLeaderboardEntry } from "@/lib/api/broadcast";
import { BroadcastPanel } from "@/components/broadcast/BroadcastPanel";
import { EmptyState } from "@/components/feedback/EmptyState";

interface Props {
  leaderboard: BroadcastLeaderboardEntry[];
}

const PODIUM_CONFIG = [
  { rank: 2, height: "h-16", bg: "bg-muted", border: "border-border", medal: "\u{1F948}" },
  { rank: 1, height: "h-24", bg: "bg-warning/20", border: "border-warning/40", medal: "\u{1F947}" },
  { rank: 3, height: "h-12", bg: "bg-override/15", border: "border-override/30", medal: "\u{1F949}" },
];

export function BroadcastPodium({ leaderboard }: Props) {
  const { t } = useTranslation();

  if (leaderboard.length === 0) {
    return (
      <BroadcastPanel><EmptyState density="compact" icon={<Trophy className="h-6 w-6" />} title={t("leaderboard.noScores")} /></BroadcastPanel>
    );
  }

  // Order for display: 2nd, 1st, 3rd
  const podiumOrder = [1, 0, 2];

  return (
    <BroadcastPanel title={t("nav.leaderboard")} leading={<Trophy className="h-4 w-4 text-warning" />}>
      <div className="flex-1 flex items-end justify-center gap-2">
        {podiumOrder.map((idx) => {
          const entry = leaderboard[idx];
          const config = PODIUM_CONFIG[podiumOrder.indexOf(idx)];
          if (!entry) return <div key={idx} className="flex-1" />;

          return (
            <div key={entry.teamId} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-lg">{config.medal}</span>
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs font-medium text-center truncate w-full px-1">
                {entry.teamName}
              </span>
              <span className="text-xs font-bold text-foreground tabular-nums">
                {entry.points} {t("common.pts")}
              </span>
              <div
                className={`w-full ${config.height} rounded-t-lg border ${config.border} ${config.bg}`}
              />
            </div>
          );
        })}
      </div>
    </BroadcastPanel>
  );
}
