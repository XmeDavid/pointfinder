import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { monitoringApi } from "@/lib/api/monitoring";
import { gamesApi } from "@/lib/api/games";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";

export function ResultsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });
  const { data: leaderboard = [] } = useQuery({ queryKey: ["leaderboard", gameId], queryFn: () => monitoringApi.getLeaderboard(gameId!) });
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats", gameId], queryFn: () => monitoringApi.getDashboardStats(gameId!) });

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await gamesApi.exportGame(gameId!);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${game!.name.replace(/[^a-z0-9]/gi, "-")}-results.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      const data = await monitoringApi.getResultsExport(gameId!);

      const header = [t("common.team"), ...data.challenges.map(c => c.title), t("results.totalPoints")];
      const rows = data.teams.map(team => [
        team.teamName,
        ...data.challenges.map(c => team.challengePoints[c.id] ?? 0),
        team.totalPoints,
      ]);

      const maxPointsRow = [
        t("results.maxPoints"),
        ...data.challenges.map(c => c.maxPoints),
        data.challenges.reduce((sum, c) => sum + c.maxPoints, 0),
      ];

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows, [], maxPointsRow]);

      // Auto-size columns
      ws["!cols"] = header.map((h, i) => ({
        wch: Math.max(String(h).length, ...rows.map(r => String(r[i]).length)) + 2,
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("results.title"));
      XLSX.writeFile(wb, `${data.gameName.replace(/[^a-z0-9]/gi, "-")}-results.xlsx`);
    } finally {
      setExportingExcel(false);
    }
  };

  if (!game || !stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{t("results.title")}</h1><p className="text-muted-foreground">{game.name}</p></div>
        <div className="flex gap-2 self-end sm:self-auto">
          <Button variant="outline" onClick={handleExportExcel} disabled={exportingExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />{exportingExcel ? t("game.exporting") : t("results.exportExcel")}</Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}><Download className="mr-2 h-4 w-4" />{exporting ? t("game.exporting") : t("results.exportResults")}</Button>
        </div>
      </div>
      {leaderboard.length > 0 && (
        <Card className="border-yellow-500/50 bg-gradient-to-r from-yellow-500/5 to-transparent">
          <CardContent className="p-8 text-center">
            <Trophy className="mx-auto h-12 w-12 text-yellow-500" />
            <p className="text-sm text-muted-foreground mt-2">{t("results.winner")}</p>
            <p className="text-3xl font-bold mt-1">{leaderboard[0].teamName}</p>
            <p className="text-xl font-medium text-primary mt-1">{leaderboard[0].points} {t("common.points")}</p>
            <p className="text-sm text-muted-foreground">{t("results.challengesCompleted", { count: leaderboard[0].completedChallenges })}</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.totalTeams}</p><p className="text-sm text-muted-foreground">{t("nav.teams")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.totalBases}</p><p className="text-sm text-muted-foreground">{t("nav.bases")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.totalChallenges}</p><p className="text-sm text-muted-foreground">{t("nav.challenges")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.totalSubmissions}</p><p className="text-sm text-muted-foreground">{t("nav.submissions")}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("results.finalStandings")}</CardTitle><CardDescription>{t("results.finalStandingsDesc")}</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {leaderboard.map((entry, i) => (
              <div key={entry.teamId} className="flex items-center gap-4 rounded-md border border-border p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">{i + 1}</span>
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: entry.color }} />
                <div className="flex-1"><p className="font-medium">{entry.teamName}</p><p className="text-xs text-muted-foreground">{t("results.challengesOfTotal", { completed: entry.completedChallenges, total: stats.totalChallenges })}</p></div>
                <span className="text-lg font-bold">{entry.points} {t("common.pts")}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
