import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  UserMinus,
  LogIn,
  Unlock,
  Lock,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { teamsApi, type BaseUnlockOverrideResponse } from "@/lib/api/teams";
import { submissionsApi } from "@/lib/api/submissions";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { monitoringApi } from "@/lib/api/monitoring";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import type { SubmissionStatus } from "@/types";

const REASON_MAX_LENGTH = 500;

export function TeamDetailPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId, teamId } = useParams<{ gameId: string; teamId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const [checkInBaseId, setCheckInBaseId] = useState<string | null>(null);
  const [checkInReason, setCheckInReason] = useState("");
  const [unlockDialogBaseId, setUnlockDialogBaseId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [removeOverrideDialog, setRemoveOverrideDialog] = useState<BaseUnlockOverrideResponse | null>(null);
  const [markCompletedBaseId, setMarkCompletedBaseId] = useState<string | null>(null);
  const [markCompletedReason, setMarkCompletedReason] = useState("");
  const [markCompletedPointsOverride, setMarkCompletedPointsOverride] = useState<string>("");

  // Focus restoration refs — WCAG 2.4.3: return focus to the triggering button
  // when each dialog closes so keyboard users don't lose their position.
  const checkInTriggerRef = useRef<HTMLButtonElement | null>(null);
  const unlockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const removeOverrideTriggerRef = useRef<HTMLButtonElement | null>(null);

  // rAF gives the DOM time to unmount the dialog before shifting focus.
  const restoreFocus = useCallback((ref: React.MutableRefObject<HTMLButtonElement | null>) => {
    requestAnimationFrame(() => ref.current?.focus());
  }, []);

  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const team = teams.find((t) => t.id === teamId);
  const { data: players = [] } = useQuery({ queryKey: ["players", teamId], queryFn: () => teamsApi.getPlayers(teamId!, gameId), enabled: !!gameId });
  const { data: submissions = [] } = useQuery({ queryKey: ["team-submissions", teamId], queryFn: () => submissionsApi.listByTeam(teamId!, gameId!), enabled: !!gameId });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: progress = [] } = useQuery({ queryKey: ["team-progress", gameId, teamId], queryFn: async () => { const all = await monitoringApi.getProgress(gameId!); return all.filter((p) => p.teamId === teamId); }, enabled: !!gameId && !!teamId });
  const { data: unlockOverrides = [] } = useQuery({
    queryKey: ["team-unlock-overrides", gameId, teamId],
    queryFn: () => teamsApi.listUnlockOverrides(gameId!, teamId!),
    enabled: !!gameId && !!teamId,
  });

  const overridesByBaseId = useMemo(() => {
    const map = new Map<string, BaseUnlockOverrideResponse>();
    unlockOverrides.forEach((o) => map.set(o.baseId, o));
    return map;
  }, [unlockOverrides]);

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
    mutationFn: ({ baseId, reason }: { baseId: string; reason?: string }) =>
      teamsApi.manualCheckIn(gameId!, teamId!, baseId, reason ? { reason } : undefined),
    onSuccess: () => {
      setCheckInBaseId(null);
      setCheckInReason("");
      queryClient.invalidateQueries({ queryKey: ["team-progress", gameId, teamId] });
      toast.success(t("teamDetail.checkInSuccess"));
    },
    onError: (error: unknown) => {
      const msg = getApiErrorMessage(error);
      setCheckInBaseId(null);
      setCheckInReason("");
      if (msg.toLowerCase().includes("already")) {
        toast.info(t("teamDetail.checkInAlreadyDone"));
      } else {
        toast.error(msg);
      }
    },
  });

  const createUnlock = useMutation({
    mutationFn: ({ baseId, reason }: { baseId: string; reason?: string }) =>
      teamsApi.createUnlockOverride(gameId!, teamId!, baseId, reason ? { reason } : undefined),
    onSuccess: () => {
      setUnlockDialogBaseId(null);
      setUnlockReason("");
      queryClient.invalidateQueries({ queryKey: ["team-unlock-overrides", gameId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-progress", gameId, teamId] });
      toast.success(t("teams.unlockOverrideSuccess"));
    },
    onError: (error: unknown) => {
      setUnlockDialogBaseId(null);
      setUnlockReason("");
      toast.error(getApiErrorMessage(error));
    },
  });

  const removeUnlock = useMutation({
    mutationFn: (baseId: string) => teamsApi.removeUnlockOverride(gameId!, teamId!, baseId),
    onSuccess: () => {
      setRemoveOverrideDialog(null);
      queryClient.invalidateQueries({ queryKey: ["team-unlock-overrides", gameId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-progress", gameId, teamId] });
      toast.success(t("teams.unlockOverrideRemoveSuccess"));
    },
    onError: (error: unknown) => {
      setRemoveOverrideDialog(null);
      toast.error(getApiErrorMessage(error));
    },
  });

  const closeMarkCompleted = () => {
    setMarkCompletedBaseId(null);
    setMarkCompletedReason("");
    setMarkCompletedPointsOverride("");
  };

  const markCompleted = useMutation({
    mutationFn: ({ baseId, challengeId }: { baseId: string; challengeId: string }) => {
      const parsedOverride =
        markCompletedPointsOverride.trim() === ""
          ? undefined
          : parseInt(markCompletedPointsOverride, 10);
      return teamsApi.markCompleted(gameId!, teamId!, baseId, {
        challengeId,
        reason: markCompletedReason.trim() || undefined,
        pointsOverride: parsedOverride,
      });
    },
    onSuccess: () => {
      closeMarkCompleted();
      queryClient.invalidateQueries({ queryKey: ["team-progress", gameId, teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-submissions", teamId] });
      toast.success(t("teamDetail.markCompletedSuccess"));
    },
    onError: (error: unknown) => {
      closeMarkCompleted();
      toast.error(getApiErrorMessage(error));
    },
  });

  const challengeMap = useMemo(() => new Map(challenges.map((c) => [c.id, c])), [challenges]);
  const baseMap = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);

  const totalPoints = useMemo(
    () => submissions
      .filter((s) => s.status === "correct" || s.status === "approved")
      .reduce((acc, s) => acc + (s.points ?? challengeMap.get(s.challengeId)?.points ?? 0), 0),
    [submissions, challengeMap],
  );

  const statusIcon = useMemo<Record<SubmissionStatus, React.ReactNode>>(
    () => ({
      pending: <Clock className="h-4 w-4 text-yellow-500" />,
      approved: <CheckCircle className="h-4 w-4 text-green-500" />,
      rejected: <XCircle className="h-4 w-4 text-red-500" />,
      correct: <CheckCircle className="h-4 w-4 text-green-500" />,
    }),
    [],
  );

  const statusLabel = useMemo<Record<SubmissionStatus, string>>(
    () => ({
      pending: t("common.pending"),
      approved: t("submissions.statusApproved"),
      rejected: t("common.rejected"),
      correct: t("submissions.statusCorrect"),
    }),
    [t],
  );

  const completedCount = useMemo(
    () => submissions.filter((s) => s.status === "correct" || s.status === "approved").length,
    [submissions],
  );

  if (!team) return null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/games/${gameId}/monitor/leaderboard`)}><ArrowLeft className="mr-2 h-4 w-4" /> {t("teamDetail.backToLeaderboard")}</Button>
      {actionError && <Alert onDismiss={() => setActionError("")}>{actionError}</Alert>}
      <div className="flex items-center gap-4">
        <div className="h-6 w-6 rounded-full" aria-hidden="true" style={{ backgroundColor: team.color }} />
        <div><h1 className="text-2xl font-bold">{team.name}</h1><p className="text-muted-foreground">{t("teams.member", { count: players.length })} &middot; {totalPoints} {t("common.points")}</p></div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold">{totalPoints}</p><p className="text-sm text-muted-foreground">{t("teamDetail.totalPoints")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold">{completedCount}</p><p className="text-sm text-muted-foreground">{t("teamDetail.completedChallenges")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold">{submissions.length}</p><p className="text-sm text-muted-foreground">{t("common.totalSubmissions")}</p></CardContent></Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("teams.members")}</CardTitle></CardHeader>
          <CardContent>{players.length === 0 ? <p className="text-sm text-muted-foreground">{t("teams.noMembers")}</p> : <div className="space-y-2">{players.map((p) => (<div key={p.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{p.displayName}</span><span className="max-w-44 truncate text-xs text-muted-foreground font-mono text-right" title={p.deviceId}>{p.deviceId}</span><Button variant="ghost" size="icon" className="h-7 w-7" disabled={removePlayer.isPending} onClick={() => { if (window.confirm(t("teams.removeMemberConfirm", { name: p.displayName }))) { removePlayer.mutate(p.id); } }} aria-label={t("teams.removeMember")}><UserMinus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /></Button></div>))}</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("teamDetail.submissionHistory")}</CardTitle></CardHeader>
          <CardContent>{submissions.length === 0 ? <p className="text-sm text-muted-foreground">{t("common.noSubmissions")}</p> : <div className="space-y-3">{[...submissions].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).map((sub) => { const ch = challenges.find((c) => c.id === sub.challengeId); const base = bases.find((b) => b.id === sub.baseId); return (<div key={sub.id} className="flex items-start gap-3">{statusIcon[sub.status]}<div className="flex-1 min-w-0"><p className="text-sm font-medium">{ch?.title}</p>{base && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" /> {base.name}</p>}<p className="text-xs text-muted-foreground">{formatDateTime(sub.submittedAt)}</p></div><Badge variant="outline" className="text-xs">{statusLabel[sub.status]}</Badge></div>); })}</div>}</CardContent>
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
                const activeOverride = overridesByBaseId.get(base.id);
                return (
                  <div
                    key={base.id}
                    className="flex flex-wrap items-center justify-between gap-3 text-sm"
                    data-testid={`team-base-row-${base.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate font-medium">{base.name}</span>
                      {base.hidden && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          {t("teams.hiddenBaseBadge")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {visited ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600">{t("teamDetail.checkedIn")}</Badge>
                      ) : (
                        <>
                          <Badge variant="outline" className="text-xs text-muted-foreground">{t("teamDetail.notVisited")}</Badge>
                          <Button
                            ref={(el) => {
                              // Store the check-in trigger for this base so we can
                              // restore focus after the dialog closes.
                              if (el && checkInBaseId === null) checkInTriggerRef.current = el;
                            }}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => { checkInTriggerRef.current = document.activeElement as HTMLButtonElement; setCheckInBaseId(base.id); }}
                          >
                            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />{t("teamDetail.manualCheckIn")}
                          </Button>
                        </>
                      )}
                      {bp?.status !== "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-amber-600 border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950"
                          disabled={!bp?.challengeId}
                          onClick={() => {
                            if (!bp?.challengeId) {
                              toast.error(t("teamDetail.noChallengeForBase"));
                              return;
                            }
                            setMarkCompletedBaseId(base.id);
                          }}
                          data-testid={`mark-completed-btn-${base.id}`}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          {t("teamDetail.markCompleted")}
                        </Button>
                      )}
                      {activeOverride ? (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 border-blue-500 text-blue-600"
                            data-testid={`unlock-override-active-${base.id}`}
                            title={activeOverride.reason ?? undefined}
                          >
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            {t("teams.unlockOverrideActiveBadge", {
                              operator: activeOverride.createdByDisplayName ?? t("common.unknown"),
                              time: new Date(activeOverride.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              }),
                            })}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="default"
                            className="h-10 text-xs gap-1 px-3"
                            onClick={() => { removeOverrideTriggerRef.current = document.activeElement as HTMLButtonElement; setRemoveOverrideDialog(activeOverride); }}
                            data-testid={`unlock-override-remove-btn-${base.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("teams.unlockOverrideRemove")}
                          </Button>
                        </div>
                      ) : (
                        base.hidden && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => { unlockTriggerRef.current = document.activeElement as HTMLButtonElement; setUnlockDialogBaseId(base.id); }}
                            data-testid={`unlock-override-btn-${base.id}`}
                          >
                            <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("teams.unlockOverrideAction")}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!checkInBaseId}
        onOpenChange={(open) => {
          if (!open) {
            setCheckInBaseId(null);
            setCheckInReason("");
            restoreFocus(checkInTriggerRef);
          }
        }}
      >
        <DialogContent
          onClose={() => {
            setCheckInBaseId(null);
            setCheckInReason("");
            restoreFocus(checkInTriggerRef);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("teamDetail.manualCheckInTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("teamDetail.manualCheckInConfirm", {
              team: team.name,
              base: baseMap.get(checkInBaseId ?? "")?.name ?? "",
            })}
          </p>
          <div className="mt-4 space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="manual-check-in-reason"
            >
              {t("teams.manualCheckInReasonLabel")}
            </label>
            <Textarea
              id="manual-check-in-reason"
              data-testid="manual-check-in-reason"
              value={checkInReason}
              onChange={(e) => setCheckInReason(e.target.value.slice(0, REASON_MAX_LENGTH))}
              placeholder={t("teams.manualCheckInReasonPlaceholder")}
              maxLength={REASON_MAX_LENGTH}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCheckInBaseId(null); setCheckInReason(""); restoreFocus(checkInTriggerRef); }}>{t("common.cancel")}</Button>
            <Button
              disabled={manualCheckIn.isPending}
              data-testid="manual-check-in-submit"
              onClick={() => {
                if (checkInBaseId) {
                  const trimmed = checkInReason.trim();
                  manualCheckIn.mutate({ baseId: checkInBaseId, reason: trimmed || undefined });
                }
              }}
            >
              {manualCheckIn.isPending ? t("common.sending") : t("teamDetail.manualCheckIn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!unlockDialogBaseId}
        onOpenChange={(open) => {
          if (!open) {
            setUnlockDialogBaseId(null);
            setUnlockReason("");
            restoreFocus(unlockTriggerRef);
          }
        }}
      >
        <DialogContent
          onClose={() => {
            setUnlockDialogBaseId(null);
            setUnlockReason("");
            restoreFocus(unlockTriggerRef);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("teams.unlockOverrideDialogTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("teams.unlockOverrideDialogDescription", {
              team: team.name,
              base: baseMap.get(unlockDialogBaseId ?? "")?.name ?? "",
            })}
          </p>
          <div className="mt-4 space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="unlock-override-reason"
            >
              {t("teams.unlockOverrideReasonLabel")}
            </label>
            <Textarea
              id="unlock-override-reason"
              data-testid="unlock-override-reason"
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value.slice(0, REASON_MAX_LENGTH))}
              placeholder={t("teams.unlockOverrideReasonPlaceholder")}
              maxLength={REASON_MAX_LENGTH}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnlockDialogBaseId(null); setUnlockReason(""); restoreFocus(unlockTriggerRef); }}>{t("common.cancel")}</Button>
            <Button
              disabled={createUnlock.isPending}
              data-testid="unlock-override-submit"
              onClick={() => {
                if (unlockDialogBaseId) {
                  const trimmed = unlockReason.trim();
                  createUnlock.mutate({ baseId: unlockDialogBaseId, reason: trimmed || undefined });
                }
              }}
            >
              {createUnlock.isPending ? t("common.sending") : t("teams.unlockOverrideAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!removeOverrideDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveOverrideDialog(null);
            restoreFocus(removeOverrideTriggerRef);
          }
        }}
      >
        <DialogContent
          onClose={() => {
            setRemoveOverrideDialog(null);
            restoreFocus(removeOverrideTriggerRef);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("teams.unlockOverrideRemoveConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("teams.unlockOverrideRemoveConfirmDescription", {
              base: baseMap.get(removeOverrideDialog?.baseId ?? "")?.name ?? "",
            })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemoveOverrideDialog(null); restoreFocus(removeOverrideTriggerRef); }}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              disabled={removeUnlock.isPending}
              data-testid="unlock-override-remove-submit"
              onClick={() => {
                if (removeOverrideDialog) removeUnlock.mutate(removeOverrideDialog.baseId);
              }}
            >
              {removeUnlock.isPending ? t("common.sending") : t("teams.unlockOverrideRemove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark-completed dialog — operator manually marks a base as done */}
      <Dialog open={!!markCompletedBaseId} onOpenChange={(open) => { if (!open) closeMarkCompleted(); }}>
        {markCompletedBaseId && (() => {
          const bp = progress.find((p) => p.baseId === markCompletedBaseId);
          const base = bases.find((b) => b.id === markCompletedBaseId);
          return (
            <DialogContent onClose={closeMarkCompleted}>
              <DialogHeader>
                <DialogTitle>{t("teamDetail.markCompletedDialogTitle")}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {t("teamDetail.markCompletedDialogDescription", { base: base?.name ?? "" })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("submissions.markCompletedHelper")}
              </p>
              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="mark-completed-reason">
                    {t("teamDetail.markCompletedReasonLabel")}
                  </label>
                  <Textarea
                    id="mark-completed-reason"
                    data-testid="mark-completed-reason-input"
                    value={markCompletedReason}
                    onChange={(e) => setMarkCompletedReason(e.target.value.slice(0, REASON_MAX_LENGTH))}
                    placeholder={t("teamDetail.markCompletedReasonPlaceholder")}
                    maxLength={REASON_MAX_LENGTH}
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="mark-completed-points">
                    {t("teamDetail.markCompletedPointsLabel")}
                  </label>
                  <Input
                    id="mark-completed-points"
                    data-testid="mark-completed-points-input"
                    type="number"
                    value={markCompletedPointsOverride}
                    onChange={(e) => setMarkCompletedPointsOverride(e.target.value)}
                    placeholder={t("teamDetail.markCompletedPointsPlaceholder")}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMarkCompleted}>{t("common.cancel")}</Button>
                <Button
                  disabled={markCompleted.isPending}
                  loading={markCompleted.isPending}
                  data-testid="mark-completed-submit"
                  onClick={() => {
                    if (markCompletedBaseId && bp?.challengeId) {
                      markCompleted.mutate({ baseId: markCompletedBaseId, challengeId: bp.challengeId });
                    }
                  }}
                >
                  {markCompleted.isPending ? t("common.sending") : t("teamDetail.markCompletedAction")}
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>
    </div>
  );
}
