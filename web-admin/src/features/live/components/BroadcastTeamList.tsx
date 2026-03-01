import { useTranslation } from "react-i18next";
import type { BroadcastTeam, BroadcastLeaderboardEntry } from "@/lib/api/broadcast";

interface Props {
  teams: BroadcastTeam[];
  leaderboard: BroadcastLeaderboardEntry[];
}

export function BroadcastTeamList({ teams, leaderboard }: Props) {
  const { t } = useTranslation();

  // Merge: use leaderboard order (ranked), fall back to teams not yet on the board
  const rankedTeamIds = new Set(leaderboard.map((e) => e.teamId));
  const unranked = teams.filter((t) => !rankedTeamIds.has(t.id));
  const topPoints = leaderboard[0]?.points || 1;

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-3 overflow-hidden">
      <h2 className="mb-2 text-sm font-semibold text-white/70">{t("nav.teams")}</h2>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {leaderboard.map((entry, i) => {
          const rank = i + 1;
          const widthPct = Math.max(4, (entry.points / topPoints) * 100);
          return (
            <div
              key={entry.teamId}
              className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5"
            >
              <span className="w-5 text-center text-xs font-bold text-white/40 shrink-0">
                {rank}
              </span>
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-medium flex-1 truncate">{entry.teamName}</span>
              <div className="flex-[1.5] hidden xl:block">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${widthPct}%`, backgroundColor: entry.color }}
                  />
                </div>
              </div>
              <span className="text-xs text-white/40 tabular-nums shrink-0">
                {entry.completedChallenges} {t("leaderboard.done")}
              </span>
              <span className="text-sm font-bold tabular-nums w-14 text-right shrink-0">
                {entry.points}
              </span>
            </div>
          );
        })}
        {unranked.map((team) => (
          <div
            key={team.id}
            className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5 opacity-50"
          >
            <span className="w-5 text-center text-xs text-white/30 shrink-0">-</span>
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="text-sm flex-1 truncate">{team.name}</span>
            <span className="text-sm font-bold tabular-nums w-14 text-right shrink-0">0</span>
          </div>
        ))}
      </div>
    </div>
  );
}
