import { useTranslation } from "react-i18next";
import type { BroadcastLeaderboardEntry } from "@/lib/api/broadcast";

const RANK_MEDALS = ["", "\u{1F947}", "\u{1F948}", "\u{1F949}"];

interface Props {
  leaderboard: BroadcastLeaderboardEntry[];
}

export function BroadcastLeaderboard({ leaderboard }: Props) {
  const { t } = useTranslation();
  const topPoints = leaderboard[0]?.points || 1;

  if (leaderboard.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <p className="text-lg text-white/40">{t("leaderboard.noScores")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 overflow-hidden">
      <h2 className="mb-3 text-lg font-semibold text-white/80">{t("leaderboard.title")}</h2>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {leaderboard.map((entry, i) => {
          const widthPct = Math.max(4, (entry.points / topPoints) * 100);
          const rank = i + 1;
          return (
            <div
              key={entry.teamId}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                rank === 1
                  ? "bg-yellow-500/15 border border-yellow-500/30"
                  : rank === 2
                    ? "bg-gray-400/10 border border-gray-400/15"
                    : rank === 3
                      ? "bg-orange-400/10 border border-orange-400/15"
                      : "bg-white/[0.03]"
              }`}
            >
              <span className="w-8 text-center text-xl shrink-0">
                {rank <= 3 ? (
                  RANK_MEDALS[rank]
                ) : (
                  <span className="text-sm text-white/40 font-bold">{rank}</span>
                )}
              </span>
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-semibold flex-1 truncate">{entry.teamName}</span>
              <div className="flex-[2] hidden lg:block">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${widthPct}%`, backgroundColor: entry.color }}
                  />
                </div>
              </div>
              <span className="text-xs text-white/40 hidden sm:block shrink-0">
                {entry.completedChallenges} {t("leaderboard.done")}
              </span>
              <span className="text-lg font-bold tabular-nums w-20 text-right shrink-0">
                {entry.points}{" "}
                <span className="text-xs font-normal text-white/40">{t("common.pts")}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
