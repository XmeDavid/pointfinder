import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Calendar, MapPin, Puzzle, Users, Play, Square, Settings, AlertTriangle, CheckCircle2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { gamesApi } from "@/lib/api/games";
import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { teamsApi } from "@/lib/api/teams";
import { assignmentsApi } from "@/lib/api/assignments";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { GameStatus } from "@/types";

export function OverviewPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();

  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: assignments = [] } = useQuery({ queryKey: ["assignments", gameId], queryFn: () => assignmentsApi.listByGame(gameId!) });

  const transition = useMutation({
    mutationFn: (status: GameStatus) => gamesApi.updateStatus(gameId!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game", gameId] }),
  });

  if (!game) return null;

  const statusVariant: Record<GameStatus, "default" | "secondary" | "warning" | "success"> = { draft: "secondary", setup: "warning", live: "success", ended: "default" };
  const transitions: Record<GameStatus, { next: GameStatus; label: string; icon: React.ReactNode } | null> = {
    draft: { next: "setup", label: t("lifecycle.startSetup"), icon: <Settings className="mr-2 h-4 w-4" /> },
    setup: { next: "live", label: t("lifecycle.goLive"), icon: <Play className="mr-2 h-4 w-4" /> },
    live: { next: "ended", label: t("lifecycle.endGame"), icon: <Square className="mr-2 h-4 w-4" /> },
    ended: null,
  };

  const nextStep = transitions[game.status];
  const basesWithoutNfc = bases.filter((b) => !b.nfcLinked);
  const unassignedBases = bases.filter((b) => !b.fixedChallengeId && !assignments.some((a) => a.baseId === b.id));

  const readinessChecks = [
    { ok: bases.length > 0, label: t("overview.basesCreated", { count: bases.length }) },
    { ok: challenges.length > 0, label: t("overview.challengesCreated", { count: challenges.length }) },
    { ok: teams.length > 0, label: t("overview.teamsCreated", { count: teams.length }) },
    { ok: basesWithoutNfc.length === 0, label: basesWithoutNfc.length === 0 ? t("overview.allNfcLinked") : t("overview.nfcMissing", { count: basesWithoutNfc.length }) },
    { ok: unassignedBases.length === 0, label: unassignedBases.length === 0 ? t("overview.allBasesHaveChallenges") : t("overview.basesWithoutChallenges", { count: unassignedBases.length }) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{game.name}</h1>
            <Badge variant={statusVariant[game.status]}>{t(`status.${game.status}`)}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{game.description}</p>
        </div>
        {nextStep && (
          <Button onClick={() => transition.mutate(nextStep.next)} disabled={transition.isPending} variant={nextStep.next === "ended" ? "destructive" : "default"}>
            {nextStep.icon}{nextStep.label}
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><MapPin className="h-5 w-5 text-blue-500" /></div><div><p className="text-2xl font-bold">{bases.length}</p><p className="text-sm text-muted-foreground">{t("nav.bases")}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10"><Puzzle className="h-5 w-5 text-purple-500" /></div><div><p className="text-2xl font-bold">{challenges.length}</p><p className="text-sm text-muted-foreground">{t("nav.challenges")}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10"><Users className="h-5 w-5 text-green-500" /></div><div><p className="text-2xl font-bold">{teams.length}</p><p className="text-sm text-muted-foreground">{t("nav.teams")}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10"><Wifi className="h-5 w-5 text-orange-500" /></div><div><p className="text-2xl font-bold">{bases.filter((b) => b.nfcLinked).length}/{bases.length}</p><p className="text-sm text-muted-foreground">{t("overview.nfcLinked")}</p></div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("overview.details")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">{t("overview.starts")}</span><span>{formatDateTime(game.startDate)}</span></div>
            <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">{t("overview.ends")}</span><span>{formatDateTime(game.endDate)}</span></div>
          </CardContent>
        </Card>

        {(game.status === "setup" || game.status === "draft") && (
          <Card>
            <CardHeader><CardTitle className="text-lg">{t("overview.readinessChecklist")}</CardTitle><CardDescription>{t("overview.readinessDescription")}</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {readinessChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {check.ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                    <span className={check.ok ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
