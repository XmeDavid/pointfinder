import { useMemo, useState, lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { filterAvailableBases, filterAvailableUnlockBases } from "./dropdown-filters";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus, Puzzle, Trash2, Pencil, FileText, Image, CheckCircle, Eye, MapPin, Unlock, Variable, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { Collapsible } from "@/components/ui/collapsible";
import { TeamVariablesEditor } from "@/components/common/TeamVariablesEditor";
import { Alert } from "@/components/ui/alert";
import { challengesApi, type CreateChallengeDto } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { teamVariablesApi, type TeamVariableEntry } from "@/lib/api/team-variables";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import DOMPurify from "dompurify";
import type { Challenge } from "@/types";

const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({ default: m.RichTextEditor }))
);

export function ChallengesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [form, setForm] = useState<Partial<CreateChallengeDto>>({});
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const [varsSaving, setVarsSaving] = useState(false);
  const [previewTeamId, setPreviewTeamId] = useState<string>("");
  const fixedBaseByChallengeId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    bases.forEach((base) => {
      if (base.fixedChallengeId) {
        map.set(base.fixedChallengeId, { id: base.id, name: base.name });
      }
    });
    return map;
  }, [bases]);

  const availableBases = useMemo(
    () => filterAvailableBases(bases, editing?.id),
    [bases, editing?.id],
  );

  const baseById = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);

  const hiddenBases = useMemo(
    () => filterAvailableUnlockBases(bases, challenges, editing?.id, form.fixedBaseId),
    [bases, challenges, editing?.id, form.fixedBaseId],
  );
  const effectiveUnlocksBaseId = useMemo(() => {
    if (!form.unlocksBaseId) return undefined;
    return hiddenBases.some((base) => base.id === form.unlocksBaseId) ? form.unlocksBaseId : undefined;
  }, [hiddenBases, form.unlocksBaseId]);

  const { data: challengeVarsData } = useQuery({
    queryKey: ["challenge-variables", gameId, editing?.id],
    queryFn: () => teamVariablesApi.getChallengeVariables(gameId!, editing!.id),
    enabled: !!editing,
  });
  const { data: gameVarsData } = useQuery({
    queryKey: ["game-variables", gameId],
    queryFn: () => teamVariablesApi.getGameVariables(gameId!),
    enabled: teams.length > 0,
  });

  // All available variable names for the toolbar insert button
  const availableVariables = useMemo(() => {
    const keys = new Set<string>();
    gameVarsData?.variables?.forEach((v) => keys.add(v.key));
    challengeVarsData?.variables?.forEach((v) => keys.add(v.key));
    return Array.from(keys);
  }, [gameVarsData, challengeVarsData]);

  const invalidateChallengesAndBases = () => {
    queryClient.invalidateQueries({ queryKey: ["challenges", gameId] });
    queryClient.invalidateQueries({ queryKey: ["bases", gameId] });
  };

  const createChallenge = useMutation({
    mutationFn: (data: CreateChallengeDto) => challengesApi.create({ ...data, gameId: gameId! }),
    onSuccess: () => { setActionError(""); invalidateChallengesAndBases(); closeDialog(); toast.success(t("common.saved")); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const updateChallenge = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateChallengeDto> }) => challengesApi.update(id, { ...data, gameId: gameId! }),
    onSuccess: () => { setActionError(""); invalidateChallengesAndBases(); closeDialog(); toast.success(t("common.saved")); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const deleteChallenge = useMutation({
    mutationFn: (id: string) => challengesApi.delete(id, gameId!),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); toast.success(t("common.deleted")); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  function openCreate() {
    setEditing(null);
    setForm({
      title: "",
      description: "",
      content: "",
      completionContent: "",
      answerType: "text",
      autoValidate: false,
      points: 100,
      locationBound: false,
      requirePresenceToSubmit: false,
    });
    setDialogOpen(true);
  }

  function openEdit(ch: Challenge) {
    setEditing(ch);
    const fixedBase = fixedBaseByChallengeId.get(ch.id);
    setForm({ ...ch, fixedBaseId: fixedBase?.id, unlocksBaseId: ch.unlocksBaseId });
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditing(null); }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = (form.title ?? "").trim();
    if (!trimmedTitle) return;
    const payload = { ...form, title: trimmedTitle };
    if (payload.answerType === "none") {
      payload.requirePresenceToSubmit = false;
    }
    if (!payload.locationBound) {
      delete payload.fixedBaseId;
      delete payload.unlocksBaseId;
    }
    if (!payload.fixedBaseId) {
      delete payload.unlocksBaseId;
    }
    if (payload.unlocksBaseId && !hiddenBases.some((base) => base.id === payload.unlocksBaseId)) {
      delete payload.unlocksBaseId;
    }
    if (editing) updateChallenge.mutate({ id: editing.id, data: payload });
    else createChallenge.mutate(payload as CreateChallengeDto);
  }

  const totalPoints = challenges.reduce((sum, c) => sum + c.points, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.challenges")}</h1>
          <p className="text-muted-foreground">{t("challenges.summary", { count: challenges.length })} &middot; {t("challenges.totalPoints", { total: totalPoints })}</p>
        </div>
        <Button className="self-end sm:self-auto" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("challenges.addChallenge")}</Button>
      </div>
      {actionError && <Alert onDismiss={() => setActionError("")}>{actionError}</Alert>}

      {challenges.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><Puzzle className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("challenges.noChallengesDescription")}</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {challenges.map((ch) => (
            <Card key={ch.id}>
              {(() => {
                const fixedBase = fixedBaseByChallengeId.get(ch.id);
                return (
                  <>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0"><CardTitle className="text-base">{ch.title}</CardTitle><CardDescription className="line-clamp-1" title={ch.description}>{ch.description}</CardDescription></div>
                        <div className="flex gap-1 ml-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(ch)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(ch.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{ch.points} {t("common.pts")}</Badge>
                        <Badge variant="secondary">{ch.answerType === "none" ? <><CircleCheck className="mr-1 h-3 w-3" /> {t("challenges.checkIn")}</> : ch.answerType === "text" ? <><FileText className="mr-1 h-3 w-3" /> {t("challenges.text")}</> : <><Image className="mr-1 h-3 w-3" /> {t("challenges.fileUpload")}</>}</Badge>
                        {ch.answerType !== "none" && (ch.autoValidate ? <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" /> {t("challenges.autoValidate")}</Badge> : <Badge variant="warning"><Eye className="mr-1 h-3 w-3" /> {t("challenges.manualReview")}</Badge>)}
                        {ch.locationBound && <Badge variant="outline" className={fixedBase ? "opacity-60" : undefined}><MapPin className="mr-1 h-3 w-3" /> {t("challenges.locationBound")}</Badge>}
                        {fixedBase && (
                          <Badge variant="secondary" className="max-w-full">
                            <MapPin className="mr-1 h-3 w-3 shrink-0" />
                            <span className="truncate">{t("challenges.fixedToBase", { base: fixedBase.name })}</span>
                          </Badge>
                        )}
                        {ch.unlocksBaseId && (() => {
                          const unlockTarget = baseById.get(ch.unlocksBaseId);
                          return unlockTarget ? (
                            <Badge variant="outline" className="max-w-full">
                              <Unlock className="mr-1 h-3 w-3 shrink-0" />
                              <span className="truncate">{t("challenges.unlocksBaseLabel", { base: unlockTarget.name })}</span>
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                    </CardContent>
                  </>
                );
              })()}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={closeDialog} className="max-w-3xl">
          <DialogHeader><DialogTitle>{editing ? t("challenges.editChallenge") : t("challenges.createChallenge")}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FormLabel htmlFor="challengeTitle" required>
                  {t("challenges.challengeTitle")}
                </FormLabel>
                <Input
                  id="challengeTitle"
                  value={form.title ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t("challenges.titlePlaceholder")}
                  required
                  data-testid="challenge-title-input"
                />
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="challengePoints" required>
                  {t("common.points_label")}
                </FormLabel>
                <Input
                  id="challengePoints"
                  type="number"
                  min={0}
                  value={form.points ?? 100}
                  onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 0 }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="challengeDescription" optional>
                {t("challenges.shortDescription")}
              </FormLabel>
              <Input
                id="challengeDescription"
                value={form.description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("challenges.shortDescriptionPlaceholder")}
              />
            </div>
            {form.answerType !== "none" && (
              <Collapsible
                title={<>{t("challenges.content")}<span className="text-muted-foreground font-normal"> ({t("common.optional")})</span></>}
                defaultOpen={true}
              >
                <ErrorBoundary>
                  <Suspense fallback={<div className="h-[200px] animate-pulse rounded-md border border-input bg-muted/30" />}>
                    <RichTextEditor value={form.content ?? ""} onChange={(html) => setForm((f) => ({ ...f, content: html }))} placeholder={t("challenges.contentPlaceholder")} availableVariables={availableVariables.length > 0 ? availableVariables : undefined} />
                  </Suspense>
                </ErrorBoundary>
              </Collapsible>
            )}
            <Collapsible
              title={<>{t("challenges.completionContent")}<span className="text-muted-foreground font-normal"> ({t("common.optional")})</span></>}
              defaultOpen={false}
            >
              <ErrorBoundary>
                <Suspense fallback={<div className="h-[200px] animate-pulse rounded-md border border-input bg-muted/30" />}>
                  <RichTextEditor
                    value={form.completionContent ?? ""}
                    onChange={(html) => setForm((f) => ({ ...f, completionContent: html }))}
                    placeholder={t("challenges.completionContentPlaceholder")}
                    availableVariables={availableVariables.length > 0 ? availableVariables : undefined}
                  />
                </Suspense>
              </ErrorBoundary>
            </Collapsible>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium leading-none">{t("challenges.answerType")}</p>
                <div className="flex gap-2" data-testid="challenge-type-select">
                  <Button type="button" variant={form.answerType === "text" ? "default" : "outline"} size="sm" onClick={() => setForm((f) => ({ ...f, answerType: "text" }))}><FileText className="mr-1 h-4 w-4" /> {t("challenges.text")}</Button>
                  <Button type="button" variant={form.answerType === "file" ? "default" : "outline"} size="sm" onClick={() => setForm((f) => ({ ...f, answerType: "file", autoValidate: false }))}><Image className="mr-1 h-4 w-4" /> {t("challenges.fileUpload")}</Button>
                  <Button type="button" variant={form.answerType === "none" ? "default" : "outline"} size="sm" onClick={() => setForm((f) => ({ ...f, answerType: "none", autoValidate: false, requirePresenceToSubmit: false }))} disabled={form.requirePresenceToSubmit}><CircleCheck className="mr-1 h-4 w-4" /> {t("challenges.checkIn")}</Button>
                </div>
                {form.answerType === "none" && (
                  <p className="text-xs text-muted-foreground">{t("challenges.checkInDescription")}</p>
                )}
                {form.answerType !== "none" && (
                  <div className="flex items-center justify-between">
                    <FormLabel htmlFor="challengeAutoValidate">{t("challenges.autoValidate")}</FormLabel>
                    <Switch
                      id="challengeAutoValidate"
                      checked={form.autoValidate ?? false}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, autoValidate: v }))}
                      disabled={form.answerType === "file"}
                    />
                  </div>
                )}
                {form.answerType !== "none" && (
                  <div className="flex items-center justify-between">
                    <FormLabel htmlFor="challengeRequirePresence">{t("challenges.requirePresence")}</FormLabel>
                    <Switch
                      id="challengeRequirePresence"
                      checked={form.requirePresenceToSubmit ?? false}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, requirePresenceToSubmit: v }))}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel htmlFor="challengeLocationBound">{t("challenges.locationBound")}</FormLabel>
                  <Switch
                    id="challengeLocationBound"
                    checked={form.locationBound ?? false}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, locationBound: v }))}
                  />
                </div>
                {form.locationBound && (
                  <div className="space-y-2">
                    <FormLabel htmlFor="challengeFixedBase" optional>
                      {t("challenges.selectBase")}
                    </FormLabel>
                    <Select
                      id="challengeFixedBase"
                      value={form.fixedBaseId ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, fixedBaseId: e.target.value || undefined, unlocksBaseId: undefined }))}
                    >
                      <option value="">{t("challenges.selectBasePlaceholder")}</option>
                      {availableBases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
                    </Select>
                    {availableBases.length === 0 && <p className="text-xs text-muted-foreground">{t("challenges.noBasesAvailable")}</p>}
                  </div>
                )}
                {form.locationBound && form.fixedBaseId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <FormLabel htmlFor="challengeUnlocksBase">{t("challenges.unlocksBaseToggle")}</FormLabel>
                      <Switch
                        id="challengeUnlocksBase"
                        checked={!!effectiveUnlocksBaseId}
                        disabled={hiddenBases.length === 0}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, unlocksBaseId: v ? (hiddenBases[0]?.id ?? undefined) : undefined }))}
                      />
                    </div>
                    {hiddenBases.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("challenges.noHiddenBasesAvailable")}</p>
                    )}
                    {effectiveUnlocksBaseId && hiddenBases.length > 0 && (
                      <>
                        <Select
                          id="challengeUnlocksBaseSelect"
                          value={effectiveUnlocksBaseId}
                          onChange={(e) => setForm((f) => ({ ...f, unlocksBaseId: e.target.value || undefined }))}
                        >
                          {hiddenBases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
                        </Select>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {form.autoValidate && form.answerType === "text" && (
              <div className="space-y-2">
                <FormLabel required>
                  {t("challenges.correctAnswer")}
                </FormLabel>
                {(form.correctAnswer ?? [""]).map((ans, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={ans}
                      onChange={(e) => {
                        const updated = [...(form.correctAnswer ?? [""])];
                        updated[idx] = e.target.value;
                        setForm((f) => ({ ...f, correctAnswer: updated }));
                      }}
                      placeholder={t("challenges.correctAnswerPlaceholder")}
                      required
                    />
                    {(form.correctAnswer ?? [""]).length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const updated = (form.correctAnswer ?? [""]).filter((_, i) => i !== idx);
                          setForm((f) => ({ ...f, correctAnswer: updated }));
                        }}
                      >
                        <Minus className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, correctAnswer: [...(f.correctAnswer ?? [""]), ""] }))}
                >
                  <Plus className="mr-1 h-4 w-4" /> {t("challenges.addAnswer")}
                </Button>
              </div>
            )}
            {teams.length > 0 && (
              <Collapsible
                title={t("teamVariables.challengeVariables")}
                icon={<Variable className="h-4 w-4 text-muted-foreground" />}
                description={t("teamVariables.challengeVariablesDescription")}
                className="border-t border-border pt-2"
              >
                {editing ? (
                  <TeamVariablesEditor
                    teams={teams}
                    variables={challengeVarsData?.variables ?? []}
                    saving={varsSaving}
                    onSave={async (vars) => {
                      setVarsSaving(true);
                      try {
                        await teamVariablesApi.saveChallengeVariables(gameId!, editing.id, { variables: vars });
                        queryClient.invalidateQueries({ queryKey: ["challenge-variables", gameId, editing.id] });
                        queryClient.invalidateQueries({ queryKey: ["team-variables-completeness", gameId] });
                        setActionError("");
                      } catch (error) {
                        setActionError(getApiErrorMessage(error));
                      } finally {
                        setVarsSaving(false);
                      }
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("teamVariables.saveFirstToAddChallengeVariables")}</p>
                )}
              </Collapsible>
            )}
            {editing && availableVariables.length > 0 && teams.length > 0 && (
              <Collapsible
                title={t("teamVariables.previewAsTeam")}
                icon={<Eye className="h-4 w-4 text-muted-foreground" />}
                className="border-t border-border pt-2"
              >
                <Select value={previewTeamId} onChange={(e) => setPreviewTeamId(e.target.value)}>
                  <option value="">{t("teamVariables.selectTeamPreview")}</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </Select>
                {previewTeamId && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 mt-2">
                    {form.answerType !== "none" && (<>
                    <p className="text-xs font-medium text-muted-foreground">{t("challenges.content")}</p>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resolveVariablesClient(form.content ?? "", gameVarsData?.variables ?? [], challengeVarsData?.variables ?? [], previewTeamId)) }} />
                    </>)}
                    <p className="text-xs font-medium text-muted-foreground mt-3">{t("challenges.completionContent")}</p>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resolveVariablesClient(form.completionContent ?? "", gameVarsData?.variables ?? [], challengeVarsData?.variables ?? [], previewTeamId)) }} />
                  </div>
                )}
              </Collapsible>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
              <Button type="submit" loading={createChallenge.isPending || updateChallenge.isPending} data-testid="challenge-save-btn">{editing ? t("challenges.editChallenge") : t("challenges.createChallenge")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onConfirm={() => { if (deleteTarget) deleteChallenge.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title={t("challenges.deleteConfirmTitle")}
        description={t("challenges.deleteConfirmDescription")}
      />
    </div>
  );
}

function resolveVariablesClient(
  template: string,
  gameVariables: TeamVariableEntry[],
  challengeVariables: TeamVariableEntry[],
  teamId: string,
): string {
  const vars: Record<string, string> = {};
  for (const v of gameVariables) {
    if (v.teamValues[teamId] !== undefined) vars[v.key] = v.teamValues[teamId];
  }
  for (const v of challengeVariables) {
    if (v.teamValues[teamId] !== undefined) vars[v.key] = v.teamValues[teamId];
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
