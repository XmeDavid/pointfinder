import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2, Plus, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormLabel } from "@/components/ui/form-label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { basesApi } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { teamsApi } from "@/lib/api/teams";
import { assignmentsApi } from "@/lib/api/assignments";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";
import type { Assignment } from "@/types";

interface AssignmentDraft {
  challengeId: string;
  teamId: string;
  error?: string;
}

interface CreateAssignmentInput {
  baseId: string;
  challengeId: string;
  teamId?: string;
}

const EMPTY_DRAFT: AssignmentDraft = { challengeId: "", teamId: "" };

export function AssignmentsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, AssignmentDraft>>({});

  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: assignments = [] } = useQuery({ queryKey: ["assignments", gameId], queryFn: () => assignmentsApi.listByGame(gameId!) });

  const updateDraft = (baseId: string, patch: Partial<AssignmentDraft>) => {
    setDrafts((prev) => {
      const current = prev[baseId] ?? EMPTY_DRAFT;
      return {
        ...prev,
        [baseId]: { ...current, ...patch },
      };
    });
  };

  const clearDraft = (baseId: string) => {
    setDrafts((prev) => {
      if (!prev[baseId]) return prev;
      const next = { ...prev };
      delete next[baseId];
      return next;
    });
  };

  const createAssignment = useMutation({
    mutationFn: ({ baseId, challengeId, teamId }: CreateAssignmentInput) =>
      assignmentsApi.create({ gameId: gameId!, baseId, challengeId, teamId }),
    onMutate: ({ baseId }) => {
      updateDraft(baseId, { error: undefined });
    },
    onSuccess: (_, { baseId }) => {
      queryClient.invalidateQueries({ queryKey: ["assignments", gameId] });
      clearDraft(baseId);
    },
    onError: (error, { baseId }) => {
      updateDraft(baseId, { error: getApiErrorMessage(error, t("assignments.conflictGeneric")) });
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(id, gameId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments", gameId] }),
  });

  const fixedBases = bases.filter((b) => b.fixedChallengeId);
  const assignableBases = bases.filter((b) => !b.fixedChallengeId);
  const fixedChallengeIds = new Set(
    bases.map((base) => base.fixedChallengeId).filter((id): id is string => Boolean(id))
  );
  const assignmentsByBase = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    assignments.forEach((assignment) => {
      const existing = map.get(assignment.baseId);
      if (existing) {
        existing.push(assignment);
      } else {
        map.set(assignment.baseId, [assignment]);
      }
    });
    return map;
  }, [assignments]);
  const challengeById = useMemo(() => new Map(challenges.map((challenge) => [challenge.id, challenge])), [challenges]);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const basesWithoutAssignment = assignableBases.filter((b) => !(assignmentsByBase.get(b.id)?.length));

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
          {assignableBases.map((base) => {
            const baseAssignments = assignmentsByBase.get(base.id) ?? [];
            const hasAllTeamsAssignment = baseAssignments.some((assignment) => !assignment.teamId);
            const availableChallenges = challenges.filter((challenge) => !fixedChallengeIds.has(challenge.id));
            const assignedTeamIds = new Set(baseAssignments.map((assignment) => assignment.teamId).filter(Boolean));
            const availableTeams = teams.filter((team) => !assignedTeamIds.has(team.id));
            const isFullyAssigned = hasAllTeamsAssignment || (teams.length > 0 && availableTeams.length === 0);
            const showAllTeamsOption = baseAssignments.length === 0;
            const draft = drafts[base.id] ?? EMPTY_DRAFT;
            const requiresTeamSelection = !showAllTeamsOption;
            const challengeSelectId = `assignment-challenge-${base.id}`;
            const teamSelectId = `assignment-team-${base.id}`;
            const canAssign = availableChallenges.some((challenge) => challenge.id === draft.challengeId)
              && (!requiresTeamSelection || Boolean(draft.teamId));
            const isCreatingThisBase = createAssignment.isPending && createAssignment.variables?.baseId === base.id;

            return (
              <Card key={base.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge variant="secondary">{base.name}</Badge>
                    {hasAllTeamsAssignment && <Badge variant="outline">{t("assignments.allTeams")}</Badge>}
                  </CardTitle>
                  <CardDescription>{t("assignments.addForBase")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {baseAssignments.map((assignment) => {
                    const challenge = challengeById.get(assignment.challengeId);
                    const team = assignment.teamId ? teamById.get(assignment.teamId) : null;
                    return (
                      <div key={assignment.id} className="flex items-center justify-between rounded-md border border-border p-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-medium">{challenge?.title ?? "?"}</span>
                          <Badge variant="outline">{challenge?.points ?? 0} {t("common.pts")}</Badge>
                          {team ? (
                            <Badge variant="secondary" className="gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: team.color }} />
                              {team.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{t("assignments.allTeams")}</Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAssignment.mutate(assignment.id)}
                          disabled={deleteAssignment.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}

                  {!isFullyAssigned && (
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-md border border-dashed border-border p-3">
                      <div className="flex-1 space-y-1">
                        <FormLabel htmlFor={challengeSelectId} className="text-xs text-muted-foreground" required>
                          {t("assignments.challenge")}
                        </FormLabel>
                        <Select
                          id={challengeSelectId}
                          value={draft.challengeId}
                          onChange={(e) => updateDraft(base.id, { challengeId: e.target.value, error: undefined })}
                        >
                          <option value="">{t("assignments.selectChallenge")}</option>
                          {availableChallenges.map((challenge) => (
                            <option key={challenge.id} value={challenge.id}>
                              {challenge.title} ({challenge.points} {t("common.pts")})
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="flex-1 space-y-1">
                        <FormLabel htmlFor={teamSelectId} className="text-xs text-muted-foreground" required={requiresTeamSelection} optional={!requiresTeamSelection}>
                          {t("assignments.team")}
                        </FormLabel>
                        <Select
                          id={teamSelectId}
                          value={draft.teamId}
                          onChange={(e) => updateDraft(base.id, { teamId: e.target.value, error: undefined })}
                        >
                          <option value="">
                            {showAllTeamsOption ? t("assignments.allTeams") : t("assignments.selectTeam")}
                          </option>
                          {availableTeams.map((team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </Select>
                      </div>

                      <Button
                        className="w-full sm:w-auto"
                        onClick={() => createAssignment.mutate({
                          baseId: base.id,
                          challengeId: draft.challengeId,
                          teamId: draft.teamId || undefined,
                        })}
                        disabled={!canAssign || createAssignment.isPending}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {isCreatingThisBase ? t("common.saving") : t("assignments.assign")}
                      </Button>
                    </div>
                  )}

                  {hasAllTeamsAssignment && (
                    <p className="text-sm text-muted-foreground">{t("assignments.modeLockedAllTeams")}</p>
                  )}

                  {!hasAllTeamsAssignment && isFullyAssigned && (
                    <p className="text-sm text-muted-foreground">{t("assignments.fullyAssigned")}</p>
                  )}

                  {!hasAllTeamsAssignment && !isFullyAssigned && !showAllTeamsOption && availableTeams.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("assignments.noTeamsAvailable")}</p>
                  )}

                  {!hasAllTeamsAssignment && availableChallenges.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("assignments.noChallengesAvailable")}</p>
                  )}

                  {draft.error && (
                    <p className="text-sm text-destructive">{draft.error}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {basesWithoutAssignment.length > 0 && <p className="text-sm text-muted-foreground">{t("assignments.unassignedNote", { count: basesWithoutAssignment.length })}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
