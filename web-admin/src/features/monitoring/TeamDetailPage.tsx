import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, XCircle, Clock, MapPin, UserMinus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { teamsApi } from "@/lib/api/teams";
import { submissionsApi } from "@/lib/api/submissions";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { monitoringApi } from "@/lib/api/monitoring";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import type { SubmissionStatus } from "@/types";

export function TeamDetailPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId, teamId } = useParams<{ gameId: string; teamId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const [checkInBaseId, setCheckInBaseId] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const team = teams.find((t) => t.id === teamId);
  const { data: players = [] } = useQuery({ queryKey: ["players", teamId], queryFn: () => teamsApi.getPlayers(teamId!, gameId), enabled: !!gameId });
  const { data: submissions = [] } = useQuery({ queryKey: ["team-submissions", teamId], queryFn: () => submissionsApi.listByTeam(teamId!, gameId!), enabled: !!gameId });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: progress = [] } = useQuery({ queryKey: ["team-progress", gameId, teamId], queryFn: async () => { const all = await monitoringApi.getProgress(gameId!); return all.filter((p) => p.teamId === teamId); }, enabled: !!gameId && !!teamId });

  const removePlayer = useMutation({
    mutationFn: (playerId: string) => teamsApi.removePlayer(teamId!, playerId, gameId),
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["players", teamId] });
      toast.success(t("common.deleted"));
    },
    onError: (error: unknown) => { setActionError(getApiErrorMessage(error)); toast.error(getApiErrorMessage(error)); },
  });

  const manualCheckIn = useMutation({
    mutationFn: (baseId: string) => teamsApi.manualCheckIn(gameId!, teamId!, baseId),
    onSuccess: () => {
      setCheckInBaseId(null);
      queryClient.invalidateQueries({ queryKey: ["team-progress", gameId, teamId] });
      toast.success(t("teamDetail.checkInSuccess"));
    },
    onError: (error: unknown) => {
      const msg = getApiErrorMessage(error);
      setCheckInBaseId(null);
      if (msg.toLowerCase().includes("already")) {
        toast.info(t("teamDetail.checkInAlreadyDone"));
      } else {
        toast.error(msg);
      }
    },
  });

  if (!team) return null;

  const totalPoints = submissions.filter((s) => s.status === "correct" || s.status === "approved").reduce((acc, s) => { const ch = challenges.find((c) => c.id === s.challengeId); return acc + (s.points ?? ch?.points ?? 0); }, 0);
  const statusIcon: Record<SubmissionStatus, React.ReactNode> = { pending: <Clock className="h-4 w-4 text-yellow-500" />, approved: <CheckCircle className="h-4 w-4 text-green-500" />, rejected: <XCircle className="h-4 w-4 text-red-500" />, correct: <CheckCircle className="h-4 w-4 text-green-500" /> };
  const statusLabel: Record<SubmissionStatus, string> = { pending: t("common.pending"), approved: t("submissions.statusApproved"), rejected: t("common.rejected"), correct: t("submissions.statusCorrect") };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/games/${gameId}/monitor/leaderboard`)}><ArrowLeft className="mr-2 h-4 w-4" /> {t("teamDetail.backToLeaderboard")}</Button>
      {actionError && <Alert onDismiss={() => setActionError("")}>{actionError}</Alert>}
      <div className="flex items-center gap-4">
        <div className="h-6 w-6 rounded-full" style={{ backgroundColor: team.color }} />
        <div><h1 className="text-2xl font-bold">{team.name}</h1><p className="text-muted-foreground">{t("teams.member", { count: players.length })} &middot; {totalPoints} {t("common.points")}</p></div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold">{totalPoints}</p><p className="text-sm text-muted-foreground">{t("teamDetail.totalPoints")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold">{submissions.filter((s) => s.status === "correct" || s.status === "approved").length}</p><p className="text-sm text-muted-foreground">{t("teamDetail.completedChallenges")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold">{submissions.length}</p><p className="text-sm text-muted-foreground">{t("common.totalSubmissions")}</p></CardContent></Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("teams.members")}</CardTitle></CardHeader>
          <CardContent>{players.length === 0 ? <p className="text-sm text-muted-foreground">{t("teams.noMembers")}</p> : <div className="space-y-2">{players.map((p) => (<div key={p.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{p.displayName}</span><span className="max-w-44 truncate text-xs text-muted-foreground font-mono text-right" title={p.deviceId}>{p.deviceId}</span><Button variant="ghost" size="icon" className="h-7 w-7" disabled={removePlayer.isPending} onClick={() => { if (window.confirm(t("teams.removeMemberConfirm", { name: p.displayName }))) { removePlayer.mutate(p.id); } }} title={t("teams.removeMember")}><UserMinus className="h-3.5 w-3.5 text-muted-foreground" /></Button></div>))}</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("teamDetail.submissionHistory")}</CardTitle></CardHeader>
          <CardContent>{submissions.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noSubmissions")}</p> : <div className="space-y-3">{[...submissions].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).map((sub) => { const ch = challenges.find((c) => c.id === sub.challengeId); const base = bases.find((b) => b.id === sub.baseId); return (<div key={sub.id} className="flex items-start gap-3">{statusIcon[sub.status]}<div className="flex-1 min-w-0"><p className="text-sm font-medium">{ch?.title}</p>{base && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {base.name}</p>}<p className="text-xs text-muted-foreground">{formatDateTime(sub.submittedAt)}</p></div><Badge variant="outline" className="text-xs">{statusLabel[sub.status]}</Badge></div>); })}</div>}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("teamDetail.baseProgress")}</CardTitle></CardHeader>
        <CardContent>
          {bases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("teamDetail.noBases")}</p>
          ) : (
            <div className="space-y-2">
              {bases.map((base) => {
                const bp = progress.find((p) => p.baseId === base.id);
                const visited = bp && bp.status !== "not_visited";
                return (
                  <div key={base.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{base.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {visited ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600">{t("teamDetail.checkedIn")}</Badge>
                      ) : (
                        <>
                          <Badge variant="outline" className="text-xs text-muted-foreground">{t("teamDetail.notVisited")}</Badge>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCheckInBaseId(base.id)}>
                            <LogIn className="h-3.5 w-3.5" />{t("teamDetail.manualCheckIn")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!checkInBaseId} onOpenChange={(open) => { if (!open) setCheckInBaseId(null); }}>
        <DialogContent onClose={() => setCheckInBaseId(null)}>
          <DialogHeader>
            <DialogTitle>{t("teamDetail.manualCheckInTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("teamDetail.manualCheckInConfirm", {
              team: team.name,
              base: bases.find((b) => b.id === checkInBaseId)?.name ?? "",
            })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInBaseId(null)}>{t("common.cancel")}</Button>
            <Button disabled={manualCheckIn.isPending} onClick={() => { if (checkInBaseId) manualCheckIn.mutate(checkInBaseId); }}>
              {manualCheckIn.isPending ? t("common.sending") : t("teamDetail.manualCheckIn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
