import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2, Plus, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { teamsApi } from "@/lib/api/teams";
import { assignmentsApi } from "@/lib/api/assignments";
import { useTranslation } from "react-i18next";

export function AssignmentsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [newBaseId, setNewBaseId] = useState("");
  const [newChallengeId, setNewChallengeId] = useState("");
  const [newTeamId, setNewTeamId] = useState("");

  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: assignments = [] } = useQuery({ queryKey: ["assignments", gameId], queryFn: () => assignmentsApi.listByGame(gameId!) });

  const createAssignment = useMutation({
    mutationFn: () => assignmentsApi.create({ gameId: gameId!, baseId: newBaseId, challengeId: newChallengeId, teamId: newTeamId || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assignments", gameId] }); setNewBaseId(""); setNewChallengeId(""); setNewTeamId(""); },
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(id, gameId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments", gameId] }),
  });

  const fixedBases = bases.filter((b) => b.fixedChallengeId);
  const assignableBases = bases.filter((b) => !b.fixedChallengeId);
  const basesWithoutAssignment = assignableBases.filter((b) => !assignments.some((a) => a.baseId === b.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t("assignments.title")}</h1><p className="text-muted-foreground">{t("assignments.description")}</p></div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{fixedBases.length}</p><p className="text-sm text-muted-foreground">{t("assignments.fixedOnBase")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{assignments.length}</p><p className="text-sm text-muted-foreground">{t("assignments.manualAssignments")}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-500">{basesWithoutAssignment.length}</p><p className="text-sm text-muted-foreground">{t("assignments.basesUnassigned")}</p></CardContent></Card>
      </div>

      {fixedBases.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Link2 className="h-4 w-4" /> {t("assignments.fixedTitle")}</CardTitle><CardDescription>{t("assignments.fixedDescription")}</CardDescription></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fixedBases.map((base) => {
                const ch = challenges.find((c) => c.id === base.fixedChallengeId);
                return (
                  <div key={base.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="flex items-center gap-3"><Badge variant="secondary">{base.name}</Badge><span className="text-muted-foreground">&rarr;</span><span className="text-sm font-medium">{ch?.title ?? "?"}</span></div>
                    <Badge variant="outline">{t("assignments.fixed")}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shuffle className="h-4 w-4" /> {t("assignments.manualTitle")}</CardTitle><CardDescription>{t("assignments.manualDescription")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {assignments.map((a) => {
            const base = bases.find((b) => b.id === a.baseId);
            const ch = challenges.find((c) => c.id === a.challengeId);
            const team = a.teamId ? teams.find((tm) => tm.id === a.teamId) : null;
            return (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{base?.name ?? "?"}</Badge>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="text-sm font-medium">{ch?.title ?? "?"}</span>
                  <Badge variant="outline">{ch?.points} {t("common.pts")}</Badge>
                  {team ? (
                    <Badge variant="secondary" className="gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: team.color }} />
                      {team.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("assignments.allTeams")}</Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteAssignment.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            );
          })}
          <div className="flex items-end gap-3 rounded-md border border-dashed border-border p-3">
            <div className="flex-1 space-y-1"><label className="text-xs text-muted-foreground">{t("assignments.base")}</label><Select value={newBaseId} onChange={(e) => setNewBaseId(e.target.value)}><option value="">{t("assignments.selectBase")}</option>{assignableBases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></div>
            <div className="flex-1 space-y-1"><label className="text-xs text-muted-foreground">{t("assignments.challenge")}</label><Select value={newChallengeId} onChange={(e) => setNewChallengeId(e.target.value)}><option value="">{t("assignments.selectChallenge")}</option>{challenges.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.points} {t("common.pts")})</option>)}</Select></div>
            <div className="flex-1 space-y-1"><label className="text-xs text-muted-foreground">{t("assignments.team")}</label><Select value={newTeamId} onChange={(e) => setNewTeamId(e.target.value)}><option value="">{t("assignments.allTeams")}</option>{teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</Select></div>
            <Button onClick={() => createAssignment.mutate()} disabled={!newBaseId || !newChallengeId || createAssignment.isPending}><Plus className="mr-1 h-4 w-4" /> {t("assignments.assign")}</Button>
          </div>
          {basesWithoutAssignment.length > 0 && <p className="text-sm text-muted-foreground">{t("assignments.unassignedNote", { count: basesWithoutAssignment.length })}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
