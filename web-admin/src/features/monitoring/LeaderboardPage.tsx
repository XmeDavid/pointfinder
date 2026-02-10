import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { monitoringApi } from "@/lib/api/monitoring";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

export function LeaderboardPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const websocketError = useGameWebSocket(gameId);
  const { data: leaderboard = [] } = useQuery({ queryKey: ["leaderboard", gameId], queryFn: () => monitoringApi.getLeaderboard(gameId!) });
  const topPoints = leaderboard[0]?.points || 1;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t("leaderboard.title")}</h1><p className="text-muted-foreground">{t("leaderboard.description")}</p></div>
      {websocketError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{websocketError}</div>}
      {leaderboard.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("leaderboard.noScores")}</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {leaderboard.length >= 1 && (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 0, 2].map((idx) => {
                const entry = leaderboard[idx]; if (!entry) return <div key={idx} />;
                const rank = idx + 1;
                const medals = ["", "text-yellow-500", "text-gray-400", "text-orange-400"];
                return (
                  <Card key={entry.teamId} className={rank === 1 ? "md:order-2 border-yellow-500/50" : rank === 2 ? "md:order-1" : "md:order-3"}>
                    <CardContent className="p-6 text-center">
                      <Trophy className={`mx-auto h-8 w-8 ${medals[rank]}`} />
                      <p className="text-lg font-bold mt-2">{entry.teamName}</p>
                      <div className="h-3 w-3 rounded-full mx-auto mt-1" style={{ backgroundColor: entry.color }} />
                      <p className="text-3xl font-bold mt-3">{entry.points}</p>
                      <p className="text-sm text-muted-foreground">{t("common.points")}</p>
                      <p className="text-xs text-muted-foreground mt-2">{t("leaderboard.challengesCompleted", { count: entry.completedChallenges })}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <Card>
            <CardHeader><CardTitle className="text-lg">{t("leaderboard.fullRankings")}</CardTitle></CardHeader>
            <CardContent><div className="space-y-3">{leaderboard.map((entry, i) => (
              <div key={entry.teamId} className="flex items-center gap-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold shrink-0">{i + 1}</span>
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="flex-1 font-medium">{entry.teamName}</span>
                <div className="flex-1 mx-4"><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(entry.points / topPoints) * 100}%`, backgroundColor: entry.color }} /></div></div>
                <span className="text-sm text-muted-foreground">{entry.completedChallenges} {t("leaderboard.done")}</span>
                <span className="font-bold tabular-nums w-16 text-right">{entry.points} {t("common.pts")}</span>
              </div>
            ))}</div></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
