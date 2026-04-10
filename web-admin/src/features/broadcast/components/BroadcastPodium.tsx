import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BroadcastLeaderboardEntry } from "@/lib/api/broadcast";

interface Props {
  leaderboard: BroadcastLeaderboardEntry[];
}

const PODIUM_CONFIG = [
  { rank: 2, height: "h-16", bg: "bg-gray-400/20", border: "border-gray-400/30", medal: "\u{1F948}" },
  { rank: 1, height: "h-24", bg: "bg-yellow-500/20", border: "border-yellow-500/40", medal: "\u{1F947}" },
  { rank: 3, height: "h-12", bg: "bg-orange-400/15", border: "border-orange-400/30", medal: "\u{1F949}" },
];

export function BroadcastPodium({ leaderboard }: Props) {
  const { t } = useTranslation();

  if (leaderboard.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <div className="text-center space-y-1">
          <Trophy className="h-6 w-6 text-white/20 mx-auto" />
          <p className="text-sm text-white/30">{t("leaderboard.noScores")}</p>
        </div>
      </div>
    );
  }

  // Order for display: 2nd, 1st, 3rd
  const podiumOrder = [1, 0, 2];

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-3 overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="h-4 w-4 text-yellow-400" />
        <h2 className="text-sm font-semibold text-white/70">{t("nav.leaderboard")}</h2>
      </div>

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
              <span className="text-xs font-bold text-white/80 tabular-nums">
                {entry.points} {t("common.pts")}
              </span>
              <div
                className={`w-full ${config.height} rounded-t-lg border ${config.border} ${config.bg}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
