import { useTranslation } from "react-i18next";
import type { BroadcastTeam, BroadcastLeaderboardEntry } from "@/lib/api/broadcast";
import { BroadcastPanel } from "@/components/broadcast/BroadcastPanel";
import { EmptyState } from "@/components/feedback/EmptyState";

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
    <BroadcastPanel title={t("nav.teams")} contentClassName="overflow-y-auto">
      {teams.length === 0 ? <EmptyState density="compact" title={t("nav.teams")} /> : <div className="flex flex-col gap-1">
        {leaderboard.map((entry, i) => {
          const rank = i + 1;
          const widthPct = Math.max(4, (entry.points / topPoints) * 100);
          return (
            <div
              key={entry.teamId}
              className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5"
            >
              <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                {rank}
              </span>
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-medium flex-1 truncate">{entry.teamName}</span>
              <div className="flex-[1.5] hidden xl:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${widthPct}%`, backgroundColor: entry.color }}
                  />
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
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
            className="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 opacity-60"
          >
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">-</span>
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="text-sm flex-1 truncate">{team.name}</span>
            <span className="text-sm font-bold tabular-nums w-14 text-right shrink-0">0</span>
          </div>
        ))}
      </div>}
    </BroadcastPanel>
  );
}
