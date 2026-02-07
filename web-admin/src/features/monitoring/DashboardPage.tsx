import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, MapPin, Puzzle, ClipboardCheck, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { monitoringApi } from "@/lib/api/monitoring";
import { gamesApi } from "@/lib/api/games";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

export function DashboardPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  useGameWebSocket(gameId);
  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats", gameId], queryFn: () => monitoringApi.getDashboardStats(gameId!) });
  const { data: leaderboard = [] } = useQuery({ queryKey: ["leaderboard", gameId], queryFn: () => monitoringApi.getLeaderboard(gameId!) });

  if (!stats || !game) return null;

  const now = new Date();
  const endDate = new Date(game.endDate);
  const timeRemaining = game.status === "live" ? Math.max(0, endDate.getTime() - now.getTime()) : 0;
  const hoursLeft = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t("monitor.liveDashboard")}</h1><p className="text-muted-foreground">{game.name}</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-500" /></div><div><p className="text-2xl font-bold">{stats.totalTeams}</p><p className="text-sm text-muted-foreground">{t("monitor.activeTeams")}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10"><ClipboardCheck className="h-5 w-5 text-yellow-500" /></div><div><p className="text-2xl font-bold">{stats.pendingSubmissions}</p><p className="text-sm text-muted-foreground">{t("monitor.pendingReview")}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10"><CheckCircle2 className="h-5 w-5 text-green-500" /></div><div><p className="text-2xl font-bold">{stats.completedSubmissions}/{stats.totalSubmissions}</p><p className="text-sm text-muted-foreground">{t("monitor.completed")}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10"><Clock className="h-5 w-5 text-purple-500" /></div><div><p className="text-2xl font-bold">{game.status === "live" ? `${hoursLeft}h ${minsLeft}m` : "—"}</p><p className="text-sm text-muted-foreground">{t("monitor.timeRemaining")}</p></div></CardContent></Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("monitor.quickLeaderboard")}</CardTitle></CardHeader>
          <CardContent>{leaderboard.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{t("monitor.noScores")}</p> : <div className="space-y-3">{leaderboard.map((entry, i) => (<div key={entry.teamId} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-bold">{i + 1}</span><div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} /><span className="flex-1 text-sm font-medium">{entry.teamName}</span><span className="text-sm font-bold">{entry.points} {t("common.pts")}</span></div>))}</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("monitor.gameSummary")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> {t("nav.bases")}</span><span className="font-medium">{stats.totalBases}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><Puzzle className="h-4 w-4" /> {t("nav.challenges")}</span><span className="font-medium">{stats.totalChallenges}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /> {t("nav.teams")}</span><span className="font-medium">{stats.totalTeams}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><ClipboardCheck className="h-4 w-4" /> {t("monitor.totalSubmissions")}</span><span className="font-medium">{stats.totalSubmissions}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
