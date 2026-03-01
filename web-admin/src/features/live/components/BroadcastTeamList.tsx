import { useTranslation } from "react-i18next";
import type { BroadcastTeam, BroadcastLeaderboardEntry } from "@/lib/api/broadcast";

interface Props {
  teams: BroadcastTeam[];
  leaderboard: BroadcastLeaderboardEntry[];
}

export function BroadcastTeamList({ teams, leaderboard }: Props) {
  const { t } = useTranslation();

  const leaderboardMap = new Map(
    leaderboard.map((e) => [e.teamId, e])
  );

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 overflow-hidden">
      <h2 className="mb-3 text-lg font-semibold text-white/80">{t("nav.teams")}</h2>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {teams.map((team) => {
          const entry = leaderboardMap.get(team.id);
          return (
            <div
              key={team.id}
              className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
            >
              <div
                className="h-3.5 w-3.5 rounded-full shrink-0"
                style={{ backgroundColor: team.color }}
              />
              <span className="text-sm font-medium flex-1 truncate">{team.name}</span>
              {entry && (
                <>
                  <span className="text-xs text-white/40">
                    {entry.completedChallenges} {t("leaderboard.done")}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {entry.points} {t("common.pts")}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
