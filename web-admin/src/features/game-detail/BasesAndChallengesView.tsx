import { useMemo, useState, useCallback, lazy, Suspense } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useTagColorFilter, resolveTagsForFilter } from "./useTagColorFilter";
import { FilterBar } from "./FilterBar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  MapPin,
  Puzzle,
  Wifi,
  WifiOff,
  Pencil,
  EyeOff,
  Link2,
  FileText,
  Image,
  CircleCheck,
  CheckCircle,
  Eye,
  Info,
  Tag as TagIcon,
  Tags,
  StickyNote,
  Plus,
  Minus,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { basesApi, type CreateBaseDto } from "@/lib/api/bases";
import { challengesApi, type CreateChallengeDto } from "@/lib/api/challenges";
import { gamesApi } from "@/lib/api/games";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { ManageTagsDialog } from "@/components/ManageTagsDialog";
import { useGameTagsMap } from "./useGameTagsMap";
import type { Base, Tag } from "@/types";
import {
  aggregateBasesAndChallenges,
  type BaseChallengePair,
} from "./aggregate-bases-challenges";
import { getDefaultCenter } from "@/lib/tile-sources";

// ---------------------------------------------------------------------------
// Lazy-loaded heavy components (MapPicker pulls in MapLibre GL; RichTextEditor
// pulls in Tiptap). Both are only needed when the edit dialog is open.
// ---------------------------------------------------------------------------

const MapPicker = lazy(() =>
  import("@/components/common/MapPicker").then((m) => ({ default: m.MapPicker })),
);

const RichTextEditor = lazy(() =>
  import("@/components/common/RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

// ---------------------------------------------------------------------------
// Edit-dialog form state (local to the view).
// ---------------------------------------------------------------------------

interface UnifiedForm {
  // base fields
  baseName: string;
  baseDescription: string;
  baseLat: number;
  baseLng: number;
  baseHidden: boolean;
  // Wave B — operator-only tag IDs on the base.
  // Never surfaced to players; see PlayerBaseResponse.
  baseTagIds: string[] | undefined;
  // challenge fields
  challengeTitle: string;
  challengeDescription: string;
  challengeContent: string;
  challengeCompletionContent: string;
  challengeAnswerType: "text" | "file" | "none";
  challengePoints: number;
  challengeLocationBound: boolean;
  challengeRequirePresence: boolean;
  challengeAutoValidate: boolean;
  challengeCorrectAnswer: string[];
  // P1 Phase 4 W2 — operator-only notes. Never surfaced to players.
  challengeOperatorNotes: string;
  // Wave B — operator-only tag IDs on the challenge.
  // Same privacy contract as challengeOperatorNotes.
  challengeTagIds: string[] | undefined;
}

function formFromPair(pair: BaseChallengePair): UnifiedForm {
  return {
    baseName: pair.base.name,
    baseDescription: pair.base.description,
    baseLat: pair.base.lat,
    baseLng: pair.base.lng,
    baseHidden: pair.base.hidden,
    baseTagIds: pair.base.tagIds,
    challengeTitle: pair.challenge.title,
    challengeDescription: pair.challenge.description,
    challengeContent: pair.challenge.content,
    challengeCompletionContent: pair.challenge.completionContent,
    challengeAnswerType: pair.challenge.answerType,
    challengePoints: pair.challenge.points,
    challengeLocationBound: pair.challenge.locationBound,
    challengeRequirePresence: pair.challenge.requirePresenceToSubmit,
    challengeAutoValidate: pair.challenge.autoValidate,
    challengeCorrectAnswer: pair.challenge.correctAnswer ?? [],
    challengeOperatorNotes: pair.challenge.operatorNotes ?? "",
    challengeTagIds: pair.challenge.tagIds,
  };
}

function baseDtoFromForm(form: UnifiedForm, pair: BaseChallengePair): Partial<CreateBaseDto> {
  return {
    name: form.baseName.trim(),
    description: form.baseDescription,
    lat: form.baseLat,
    lng: form.baseLng,
    hidden: form.baseHidden,
    // Keep the existing fixed-challenge pairing intact; this dialog doesn't
    // change the link between base and challenge, only their contents.
    fixedChallengeId: pair.base.fixedChallengeId,
    // Wave B — operator-only tag IDs.
    tagIds: form.baseTagIds,
  };
}

function challengeDtoFromForm(form: UnifiedForm): Partial<CreateChallengeDto> {
  const answerType = form.challengeAnswerType;
  const payload: Partial<CreateChallengeDto> = {
    title: form.challengeTitle.trim(),
    description: form.challengeDescription,
    content: form.challengeContent,
    completionContent: form.challengeCompletionContent,
    answerType,
    points: Math.max(0, Number.isFinite(form.challengePoints) ? form.challengePoints : 0),
    locationBound: form.challengeLocationBound,
    autoValidate: answerType === "text" ? form.challengeAutoValidate : false,
    requirePresenceToSubmit: answerType === "none" ? false : form.challengeRequirePresence,
  };
  if (payload.autoValidate && answerType === "text") {
    const answers = form.challengeCorrectAnswer.map((a) => a.trim()).filter(Boolean);
    if (answers.length > 0) {
      payload.correctAnswer = answers;
    }
  }
  // Operator-only notes: send trimmed value, or explicit empty string to
  // clear previous notes. Backend normalizes blank → null.
  payload.operatorNotes = form.challengeOperatorNotes.trim();
  // Wave B — operator-only tag IDs.
  payload.tagIds = form.challengeTagIds;
  return payload;
}

// ---------------------------------------------------------------------------
// Main view component.
// ---------------------------------------------------------------------------

export function BasesAndChallengesView() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();

  const [manageTagsOpen, setManageTagsOpen] = useState(false);

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  });
  const { tagsMap, tags: gameTags } = useGameTagsMap(gameId);

  const { data: bases = [], isLoading: basesLoading } = useQuery({
    queryKey: ["bases", gameId],
    queryFn: () => basesApi.listByGame(gameId!),
    enabled: !!gameId,
  });
  const { data: challenges = [], isLoading: challengesLoading } = useQuery({
    queryKey: ["challenges", gameId],
    queryFn: () => challengesApi.listByGame(gameId!),
    enabled: !!gameId,
  });

  const aggregate = useMemo(
    () => aggregateBasesAndChallenges(bases, challenges),
    [bases, challenges],
  );

  const [editingPair, setEditingPair] = useState<BaseChallengePair | null>(null);
  const [form, setForm] = useState<UnifiedForm | null>(null);
  const [actionError, setActionError] = useState<string>("");

  // Inline "assign challenge to base" flow for orphaned challenges.
  const [assignTargetByChallenge, setAssignTargetByChallenge] = useState<Record<string, string>>({});
  const [assignError, setAssignError] = useState<string>("");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["bases", gameId] });
    queryClient.invalidateQueries({ queryKey: ["challenges", gameId] });
  };

  const updateBase = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateBaseDto> }) =>
      basesApi.update(id, { ...data, gameId: gameId! }),
  });

  const updateChallenge = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateChallengeDto> }) =>
      challengesApi.update(id, { ...data, gameId: gameId! }),
  });

  const assignChallengeToBase = useMutation({
    mutationFn: ({ baseId, challengeId }: { baseId: string; challengeId: string }) =>
      basesApi.update(baseId, { fixedChallengeId: challengeId, gameId: gameId! }),
    onSuccess: (_, { challengeId }) => {
      setAssignError("");
      setAssignTargetByChallenge((prev) => {
        const next = { ...prev };
        delete next[challengeId];
        return next;
      });
      invalidateAll();
      toast.success(t("common.saved"));
    },
    onError: (error) => {
      setAssignError(getApiErrorMessage(error));
    },
  });

  const openEdit = useCallback((pair: BaseChallengePair) => {
    setActionError("");
    setEditingPair(pair);
    setForm(formFromPair(pair));
  }, []);

  const closeDialog = useCallback(() => {
    setEditingPair(null);
    setForm(null);
    setActionError("");
  }, []);

  async function handleSaveBoth(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPair || !form) return;
    const trimmedBaseName = form.baseName.trim();
    const trimmedChallengeTitle = form.challengeTitle.trim();
    if (!trimmedBaseName || !trimmedChallengeTitle) return;

    setActionError("");

    // Sequential mutation: base first, then challenge. If base fails, we
    // abort before touching the challenge. If base succeeds but challenge
    // fails, the base update is NOT rolled back — we surface the error so
    // the operator can retry the challenge half.
    try {
      await updateBase.mutateAsync({
        id: editingPair.base.id,
        data: baseDtoFromForm(form, editingPair),
      });
    } catch (error) {
      setActionError(`${t("basesAndChallenges.baseSaveFailed")} ${getApiErrorMessage(error)}`);
      return;
    }

    try {
      await updateChallenge.mutateAsync({
        id: editingPair.challenge.id,
        data: challengeDtoFromForm(form),
      });
    } catch (error) {
      // Base already saved — keep the dialog open so the operator can retry.
      invalidateAll();
      setActionError(`${t("basesAndChallenges.challengeSaveFailed")} ${getApiErrorMessage(error)}`);
      return;
    }

    invalidateAll();
    toast.success(t("common.saved"));
    closeDialog();
  }

  const isLoading = basesLoading || challengesLoading;

  // For the filter bar, the "items" are pairs. A pair matches if EITHER its
  // base OR its challenge satisfies the tag predicates.
  // We build a synthetic flat representation so the hook can aggregate tagIds
  // from both sides, then use a custom matchFn for pair-level logic.
  const pairFilterItems = useMemo(
    () =>
      aggregate.pairs.map((pair) => ({
        // Merge tagIds from both base and challenge for aggregation
        tagIds: [
          ...(pair.base.tagIds ?? []),
          ...(pair.challenge.tagIds ?? []),
        ],
        _pair: pair,
      })),
    [aggregate.pairs],
  );

  const pairMatchFn = useCallback(
    (
      item: (typeof pairFilterItems)[number],
      selectedTagIds: string[],
    ) => {
      const { base, challenge } = item._pair;

      // Tags AND: base matches if it has ALL selected tagIds, challenge same —
      // pair matches if base OR challenge passes
      const baseTagIds = base.tagIds ?? [];
      const challengeTagIds = challenge.tagIds ?? [];
      const tagPass =
        selectedTagIds.length === 0 ||
        selectedTagIds.every((id) => baseTagIds.includes(id)) ||
        selectedTagIds.every((id) => challengeTagIds.includes(id));

      return tagPass;
    },
    [],
  );

  const {
    filtered: filteredPairItems,
    allTagIds: pairAllTagIds,
    tagCounts: pairTagCounts,
    selectedTagIds: pairSelectedTagIds,
    toggleTag: pairToggleTag,
    clearFilters: pairClearFilters,
    hasActive: pairFilterHasActive,
    isVisible: pairFilterIsVisible,
  } = useTagColorFilter(pairFilterItems, "pairs", pairMatchFn);
  const pairResolvedFilterTags = resolveTagsForFilter(pairAllTagIds, tagsMap);

  const filteredPairs = useMemo(
    () => filteredPairItems.map((item) => item._pair),
    [filteredPairItems],
  );

  // Bases that don't yet have a fixed challenge — used as the "target pool"
  // when linking an orphaned challenge to a base from this view.
  const availableBasesForOrphans = useMemo(
    () => aggregate.unpairedBases,
    [aggregate.unpairedBases],
  );

  return (
    <div className="space-y-6" data-testid="bases-and-challenges-view">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("basesAndChallenges.title")}</h1>
          <p className="text-muted-foreground">{t("basesAndChallenges.subtitle")}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              {t("basesAndChallenges.summary", { count: aggregate.pairs.length })}
            </Badge>
            {aggregate.unpairedBases.length > 0 && (
              <Badge variant="outline">
                {t("basesAndChallenges.summaryUnassigned", { count: aggregate.unpairedBases.length })}
              </Badge>
            )}
            {aggregate.orphanedChallenges.length > 0 && (
              <Badge variant="outline">
                {t("basesAndChallenges.summaryOrphanedChallenges", {
                  count: aggregate.orphanedChallenges.length,
                })}
              </Badge>
            )}
          </div>
        </div>
        {gameId && (
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <RouterLink
              to={`/games/${gameId}/bases`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MapPin className="mr-1 h-4 w-4" /> {t("basesAndChallenges.openInBasesPage")}
            </RouterLink>
            <RouterLink
              to={`/games/${gameId}/challenges`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Puzzle className="mr-1 h-4 w-4" /> {t("basesAndChallenges.openInChallengesPage")}
            </RouterLink>
            <RouterLink
              to={`/games/${gameId}/assignments`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Link2 className="mr-1 h-4 w-4" /> {t("basesAndChallenges.openInAssignmentsPage")}
            </RouterLink>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageTagsOpen(true)}
              data-testid="manage-tags-btn"
            >
              <Tags className="mr-1 h-4 w-4" /> {t("common.manageTags")}
            </Button>
          </div>
        )}
      </div>

      <Alert variant="info">
        <span className="text-xs">{t("basesAndChallenges.aggregateNote")}</span>
      </Alert>

      {/* Sticky filter bar — only shown when pairs have tags */}
      <FilterBar
        allTagIds={pairAllTagIds}
        tagCounts={pairTagCounts}
        selectedTagIds={pairSelectedTagIds}
        toggleTag={pairToggleTag}
        clearFilters={pairClearFilters}
        hasActive={pairFilterHasActive}
        isVisible={pairFilterIsVisible}
        resolvedTags={pairResolvedFilterTags}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : bases.length === 0 && challenges.length === 0 ? (
        <Card className="py-12" data-testid="bases-and-challenges-empty">
          <CardContent className="text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="font-medium">{t("basesAndChallenges.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("basesAndChallenges.emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ---- Pair section ---- */}
          {aggregate.pairs.length > 0 && (
            <section className="space-y-3" data-testid="pair-section">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("basesAndChallenges.sectionPairs")}
              </h2>
              {filteredPairs.length === 0 && pairFilterHasActive ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground text-sm">{t("basesAndChallenges.noResults")}</p>
                  <button
                    type="button"
                    onClick={pairClearFilters}
                    className="mt-3 text-xs text-primary hover:underline"
                    data-testid="pairs-no-results-clear"
                  >
                    {t("filterBar.clear")}
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredPairs.map((pair) => (
                    <PairCard
                      key={pair.base.id}
                      pair={pair}
                      onEdit={() => openEdit(pair)}
                      tagsMap={tagsMap}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ---- Unpaired bases section ---- */}
          {aggregate.unpairedBases.length > 0 && (
            <section className="space-y-3" data-testid="unpaired-bases-section">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("basesAndChallenges.sectionUnpairedBases")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("basesAndChallenges.sectionUnpairedBasesHint")}
                </p>
              </div>
              <div className="space-y-2">
                {aggregate.unpairedBases.map((base) => (
                  <UnpairedBaseRow key={base.id} base={base} gameId={gameId} />
                ))}
              </div>
            </section>
          )}

          {/* ---- Orphaned challenges section ---- */}
          {aggregate.orphanedChallenges.length > 0 && (
            <section className="space-y-3" data-testid="orphaned-challenges-section">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("basesAndChallenges.sectionOrphanedChallenges")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("basesAndChallenges.sectionOrphanedChallengesHint")}
                </p>
              </div>
              {assignError && <Alert onDismiss={() => setAssignError("")}>{assignError}</Alert>}
              <div className="space-y-2">
                {aggregate.orphanedChallenges.map((ch) => {
                  const draftBaseId = assignTargetByChallenge[ch.id] ?? "";
                  const isAssigningThis =
                    assignChallengeToBase.isPending &&
                    assignChallengeToBase.variables?.challengeId === ch.id;
                  return (
                    <Card key={ch.id}>
                      <CardContent className="flex flex-wrap items-center gap-3 p-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-2/10">
                          <Puzzle className="h-4 w-4 text-chart-2" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{ch.title}</p>
                          <p className="text-xs text-muted-foreground truncate" title={ch.description}>
                            {ch.description}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {ch.points} {t("common.pts")}
                        </Badge>
                        {availableBasesForOrphans.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`orphan-assign-select-${ch.id}`}
                              className="text-xs font-medium text-muted-foreground"
                            >
                              {t("basesAndChallenges.assignToBase")}
                            </label>
                            <div className="flex items-center gap-2">
                            <Select
                              id={`orphan-assign-select-${ch.id}`}
                              value={draftBaseId}
                              onChange={(e) =>
                                setAssignTargetByChallenge((prev) => ({
                                  ...prev,
                                  [ch.id]: e.target.value,
                                }))
                              }
                              data-testid={`orphan-assign-select-${ch.id}`}
                            >
                              <option value="">{t("basesAndChallenges.selectBasePlaceholder")}</option>
                              {availableBasesForOrphans.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="sm"
                              disabled={!draftBaseId || isAssigningThis}
                              loading={isAssigningThis}
                              onClick={() =>
                                assignChallengeToBase.mutate({
                                  baseId: draftBaseId,
                                  challengeId: ch.id,
                                })
                              }
                              data-testid={`orphan-assign-btn-${ch.id}`}
                            >
                              {t("basesAndChallenges.assignButton")}
                            </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {t("basesAndChallenges.noAvailableBases")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---- Dangling bases (fixedChallengeId points at a missing challenge) ---- */}
          {aggregate.danglingBases.length > 0 && (
            <section className="space-y-2" data-testid="dangling-bases-section">
              <Alert variant="warning">
                <div>
                  <p className="font-medium">{t("basesAndChallenges.linkedChallengeMissing")}</p>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {aggregate.danglingBases.map((b) => (
                      <li key={b.id}>{b.name}</li>
                    ))}
                  </ul>
                </div>
              </Alert>
            </section>
          )}
        </div>
      )}

      {/* ---- Unified edit dialog ---- */}
      <Dialog open={editingPair !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        {editingPair && form && (
          <DialogContent onClose={closeDialog} className="max-w-3xl" data-testid="unified-edit-dialog">
            <DialogHeader>
              <DialogTitle>{t("basesAndChallenges.dialogTitle")}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {t("basesAndChallenges.dialogSubtitle")}
              </p>
            </DialogHeader>
            <form onSubmit={handleSaveBoth} className="space-y-6">
              {actionError && <Alert onDismiss={() => setActionError("")}>{actionError}</Alert>}

              {/* Base section */}
              <fieldset className="space-y-3 rounded-md border border-border p-4">
                <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  {t("basesAndChallenges.baseSection")}
                </legend>
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedBaseName" required>
                    {t("bases.name")}
                  </FormLabel>
                  <Input
                    id="unifiedBaseName"
                    value={form.baseName}
                    onChange={(e) => setForm((f) => (f ? { ...f, baseName: e.target.value } : f))}
                    required
                    data-testid="unified-base-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedBaseDescription" optional>
                    {t("common.description")}
                  </FormLabel>
                  <Textarea
                    id="unifiedBaseDescription"
                    value={form.baseDescription}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, baseDescription: e.target.value } : f))
                    }
                    rows={2}
                  />
                </div>
                {/* Map picker for coordinates — lazy-loaded so MapLibre GL
                    only enters the bundle when the dialog is opened. The
                    plain number inputs below remain as a keyboard fallback,
                    matching the pattern in BasesPage.tsx. */}
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-none">{t("bases.clickMapToSelect")}</p>
                  <ErrorBoundary>
                    <Suspense fallback={<div className="h-[250px] animate-pulse rounded-md border border-input bg-muted/30" data-testid="map-picker-fallback" />}>
                      <MapPicker
                        value={{ lat: Number.isFinite(form.baseLat) ? form.baseLat : getDefaultCenter(game?.tileSource).lat, lng: Number.isFinite(form.baseLng) ? form.baseLng : getDefaultCenter(game?.tileSource).lng }}
                        onChange={(lat, lng) => setForm((f) => (f ? { ...f, baseLat: lat, baseLng: lng } : f))}
                        className="h-[250px] rounded-md overflow-hidden border border-input"
                        tileSource={game?.tileSource}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <FormLabel htmlFor="unifiedBaseLat" className="text-xs text-muted-foreground" required>
                      {t("bases.latitude")}
                    </FormLabel>
                    <Input
                      id="unifiedBaseLat"
                      type="number"
                      step="any"
                      value={Number.isFinite(form.baseLat) ? form.baseLat : ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setForm((f) => (f ? { ...f, baseLat: Number.isNaN(val) ? 0 : val } : f));
                      }}
                      required
                      data-testid="unified-base-lat-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <FormLabel htmlFor="unifiedBaseLng" className="text-xs text-muted-foreground" required>
                      {t("bases.longitude")}
                    </FormLabel>
                    <Input
                      id="unifiedBaseLng"
                      type="number"
                      step="any"
                      value={Number.isFinite(form.baseLng) ? form.baseLng : ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setForm((f) => (f ? { ...f, baseLng: Number.isNaN(val) ? 0 : val } : f));
                      }}
                      required
                      data-testid="unified-base-lng-input"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-dashed p-2">
                  <div>
                    <FormLabel htmlFor="unifiedBaseHidden">{t("bases.hidden")}</FormLabel>
                    <p className="text-xs text-muted-foreground">{t("bases.hiddenHint")}</p>
                  </div>
                  <Switch
                    id="unifiedBaseHidden"
                    checked={form.baseHidden}
                    onCheckedChange={(v) => setForm((f) => (f ? { ...f, baseHidden: v } : f))}
                  />
                </div>
                {/*
                  Wave B — operator-only tag IDs on the base.
                  Never surfaced to players. See PlayerBaseResponse.
                */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FormLabel optional>{t("bases.tagsLabel")}</FormLabel>
                    <button
                      type="button"
                      onClick={() => setManageTagsOpen(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("common.manageTags")}
                    </button>
                  </div>
                  <PairTagMultiSelect
                    gameTagIds={form.baseTagIds ?? []}
                    onChange={(ids) =>
                      setForm((f) => (f ? { ...f, baseTagIds: ids } : f))
                    }
                    gameTags={gameTags}
                    testIdPrefix="unified-base"
                  />
                </div>
              </fieldset>

              {/* Challenge section */}
              <fieldset className="space-y-3 rounded-md border border-border p-4">
                <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Puzzle className="mr-1 inline h-3 w-3" />
                  {t("basesAndChallenges.challengeSection")}
                </legend>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <FormLabel htmlFor="unifiedChallengeTitle" required>
                      {t("challenges.challengeTitle")}
                    </FormLabel>
                    <Input
                      id="unifiedChallengeTitle"
                      value={form.challengeTitle}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, challengeTitle: e.target.value } : f))
                      }
                      required
                      data-testid="unified-challenge-title-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel htmlFor="unifiedChallengePoints" required>
                      {t("common.points_label")}
                    </FormLabel>
                    <Input
                      id="unifiedChallengePoints"
                      type="number"
                      min={0}
                      value={form.challengePoints}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                challengePoints: Math.max(0, parseInt(e.target.value) || 0),
                              }
                            : f,
                        )
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedChallengeDescription" optional>
                    {t("challenges.shortDescription")}
                  </FormLabel>
                  <Input
                    id="unifiedChallengeDescription"
                    value={form.challengeDescription}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, challengeDescription: e.target.value } : f))
                    }
                  />
                </div>
                {/* Challenge content — lazy-loaded RichTextEditor (Tiptap)
                    matching the pattern in ChallengesPage.tsx. */}
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedChallengeContent" optional>
                    {t("challenges.content")}
                  </FormLabel>
                  <ErrorBoundary>
                    <Suspense fallback={<div className="h-[200px] animate-pulse rounded-md border border-input bg-muted/30" data-testid="rich-text-editor-fallback" />}>
                      <RichTextEditor
                        value={form.challengeContent}
                        onChange={(html) => setForm((f) => (f ? { ...f, challengeContent: html } : f))}
                        placeholder={t("challenges.contentPlaceholder")}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedChallengeCompletion" optional>
                    {t("challenges.completionContent")}
                  </FormLabel>
                  <p className="text-xs text-muted-foreground">{t("challenges.completionContentHelper")}</p>
                  <ErrorBoundary>
                    <Suspense fallback={<div className="h-[150px] animate-pulse rounded-md border border-input bg-muted/30" data-testid="rich-text-editor-completion-fallback" />}>
                      <RichTextEditor
                        value={form.challengeCompletionContent}
                        onChange={(html) => setForm((f) => (f ? { ...f, challengeCompletionContent: html } : f))}
                        placeholder={t("challenges.completionContentPlaceholder")}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-none">{t("challenges.answerType")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={form.challengeAnswerType === "text" ? "default" : "outline"}
                      onClick={() =>
                        setForm((f) => (f ? { ...f, challengeAnswerType: "text" } : f))
                      }
                    >
                      <FileText className="mr-1 h-4 w-4" /> {t("challenges.text")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.challengeAnswerType === "file" ? "default" : "outline"}
                      onClick={() =>
                        setForm((f) =>
                          f ? { ...f, challengeAnswerType: "file", challengeAutoValidate: false } : f,
                        )
                      }
                    >
                      <Image className="mr-1 h-4 w-4" /> {t("challenges.fileUpload")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.challengeAnswerType === "none" ? "default" : "outline"}
                      onClick={() =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                challengeAnswerType: "none",
                                challengeAutoValidate: false,
                                challengeRequirePresence: false,
                              }
                            : f,
                        )
                      }
                    >
                      <CircleCheck className="mr-1 h-4 w-4" /> {t("challenges.checkIn")}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <FormLabel htmlFor="unifiedLocationBound">{t("challenges.locationBound")}</FormLabel>
                    <Switch
                      id="unifiedLocationBound"
                      checked={form.challengeLocationBound}
                      onCheckedChange={(v) =>
                        setForm((f) => (f ? { ...f, challengeLocationBound: v } : f))
                      }
                    />
                  </div>
                  {form.challengeAnswerType !== "none" && (
                    <div className="flex items-center gap-2">
                      <FormLabel htmlFor="unifiedRequirePresence">
                        {t("challenges.requirePresence")}
                      </FormLabel>
                      <Switch
                        id="unifiedRequirePresence"
                        checked={form.challengeRequirePresence}
                        onCheckedChange={(v) =>
                          setForm((f) => (f ? { ...f, challengeRequirePresence: v } : f))
                        }
                      />
                    </div>
                  )}
                  {form.challengeAnswerType === "text" && (
                    <div className="flex items-center gap-2">
                      <FormLabel htmlFor="unifiedAutoValidate">{t("challenges.autoValidate")}</FormLabel>
                      <Switch
                        id="unifiedAutoValidate"
                        checked={form.challengeAutoValidate}
                        onCheckedChange={(v) =>
                          setForm((f) => (f ? { ...f, challengeAutoValidate: v } : f))
                        }
                      />
                    </div>
                  )}
                </div>
                {form.challengeAutoValidate && form.challengeAnswerType === "text" && (
                  <div className="space-y-2">
                    <FormLabel required>
                      {t("challenges.correctAnswer")}
                    </FormLabel>
                    {(form.challengeCorrectAnswer.length > 0 ? form.challengeCorrectAnswer : [""]).map((ans, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={ans}
                          onChange={(e) => {
                            const updated = [...(form.challengeCorrectAnswer.length > 0 ? form.challengeCorrectAnswer : [""])];
                            updated[idx] = e.target.value;
                            setForm((f) => (f ? { ...f, challengeCorrectAnswer: updated } : f));
                          }}
                          placeholder={t("challenges.correctAnswerPlaceholder")}
                          required
                          data-testid={`unified-correct-answer-input-${idx}`}
                        />
                        {(form.challengeCorrectAnswer.length > 0 ? form.challengeCorrectAnswer : [""]).length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const updated = (form.challengeCorrectAnswer.length > 0 ? form.challengeCorrectAnswer : [""]).filter((_, i) => i !== idx);
                              setForm((f) => (f ? { ...f, challengeCorrectAnswer: updated } : f));
                            }}
                            data-testid={`unified-correct-answer-remove-${idx}`}
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
                      onClick={() =>
                        setForm((f) =>
                          f
                            ? { ...f, challengeCorrectAnswer: [...(f.challengeCorrectAnswer.length > 0 ? f.challengeCorrectAnswer : [""]), ""] }
                            : f,
                        )
                      }
                      data-testid="unified-correct-answer-add-btn"
                    >
                      <Plus className="mr-1 h-4 w-4" /> {t("challenges.addAnswer")}
                    </Button>
                  </div>
                )}
                {/*
                  P1 Phase 4 W2 — operator-only notes. This textarea mirrors
                  the one on ChallengesPage and uses the same i18n keys. The
                  backend never returns this field on player-facing endpoints
                  (enforced by PlayerControllerTest).
                */}
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedChallengeOperatorNotes" optional>
                    {t("challenges.operatorNotesLabel")}
                  </FormLabel>
                  <Textarea
                    id="unifiedChallengeOperatorNotes"
                    value={form.challengeOperatorNotes}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, challengeOperatorNotes: e.target.value } : f))
                    }
                    placeholder={t("challenges.operatorNotesPlaceholder")}
                    rows={3}
                    maxLength={5000}
                    data-testid="unified-challenge-operator-notes-input"
                  />
                </div>
                {/*
                  Wave B — operator-only tag IDs on the challenge.
                  Same privacy contract as operatorNotes. See
                  PlayerChallengeResponse.
                */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FormLabel optional>{t("challenges.tagsLabel")}</FormLabel>
                    <button
                      type="button"
                      onClick={() => setManageTagsOpen(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("common.manageTags")}
                    </button>
                  </div>
                  <PairTagMultiSelect
                    gameTagIds={form.challengeTagIds ?? []}
                    onChange={(ids) =>
                      setForm((f) => (f ? { ...f, challengeTagIds: ids } : f))
                    }
                    gameTags={gameTags}
                    testIdPrefix="unified-challenge"
                  />
                </div>
              </fieldset>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  loading={updateBase.isPending || updateChallenge.isPending}
                  data-testid="unified-save-btn"
                >
                  {t("basesAndChallenges.saveBoth")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* Manage Tags dialog */}
      {gameId && (
        <ManageTagsDialog
          open={manageTagsOpen}
          onOpenChange={setManageTagsOpen}
          gameId={gameId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PairTagMultiSelect — inline multi-select for game-scoped tags
// ---------------------------------------------------------------------------

interface PairTagMultiSelectProps {
  gameTagIds: string[];
  onChange: (ids: string[]) => void;
  gameTags: Tag[];
  testIdPrefix?: string;
}

function PairTagMultiSelect({ gameTagIds, onChange, gameTags, testIdPrefix }: PairTagMultiSelectProps) {
  const { t } = useTranslation();

  if (gameTags.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("manageTagsDialog.noTags")}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {gameTags.map((tag) => {
        const selected = gameTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              const next = selected
                ? gameTagIds.filter((id) => id !== tag.id)
                : [...gameTagIds, tag.id];
              onChange(next);
            }}
            className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-all",
              selected
                ? "text-white border-transparent"
                : "bg-background text-foreground border-border hover:bg-muted",
            ].join(" ")}
            style={selected ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
            data-testid={testIdPrefix ? `${testIdPrefix}-tag-toggle-${tag.id}` : undefined}
          >
            {tag.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small internal card components kept in-file for locality.
// ---------------------------------------------------------------------------

function PairCard({ pair, onEdit, tagsMap }: { pair: BaseChallengePair; onEdit: () => void; tagsMap: Map<string, Tag> }) {
  const { t } = useTranslation();
  const { base, challenge } = pair;

  return (
    <Card data-testid={`pair-card-${base.id}`} aria-label={t("basesAndChallenges.pairCardAriaLabel")} className="overflow-hidden">
      {/* Color stripe — first tag's color on base; fall back to challenge's first tag */}
      {(() => {
        const baseFirstTag = (base.tagIds ?? []).map((id) => tagsMap.get(id)).filter(Boolean)[0];
        const challengeFirstTag = (challenge.tagIds ?? []).map((id) => tagsMap.get(id)).filter(Boolean)[0];
        const stripeColor = baseFirstTag?.color ?? challengeFirstTag?.color;
        return stripeColor ? (
          <div
            className="h-2 w-full"
            style={{ backgroundColor: stripeColor }}
            data-testid="pair-color-stripe"
          />
        ) : null;
      })()}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-chart-1 shrink-0" />
              <CardTitle className="text-base truncate">{base.name}</CardTitle>
              {base.hidden && (
                <Badge variant="outline" className="text-xs gap-1">
                  <EyeOff className="h-3 w-3" />
                  {t("bases.hiddenTag")}
                </Badge>
              )}
            </div>
            {base.description && (
              <CardDescription className="line-clamp-1" title={base.description}>
                {base.description}
              </CardDescription>
            )}
            {/* Base tag chips — show up to 5 before "+N more" */}
            {base.tagIds && base.tagIds.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {base.tagIds.slice(0, 5).map((tagId) => {
                  const resolved = tagsMap.get(tagId);
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: resolved?.color ?? "#64748b" }}
                    >
                      <TagIcon className="h-2.5 w-2.5" />
                      {resolved?.label ?? tagId}
                    </span>
                  );
                })}
                {base.tagIds.length > 5 && (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    +{base.tagIds.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={t("basesAndChallenges.editPair")}
            data-testid={`pair-edit-btn-${base.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="rounded-md border bg-muted/30 p-3"
          style={(() => {
            const firstTag = (challenge.tagIds ?? []).map((id) => tagsMap.get(id)).filter(Boolean)[0];
            return firstTag ? { borderColor: firstTag.color } : undefined;
          })()}
        >
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-chart-2 shrink-0" />
            <p className="font-medium truncate" title={challenge.title}>
              {challenge.title}
            </p>
            {/* Has reviewer hints indicator */}
            {challenge.operatorNotes?.trim() && (
              <span
                role="img"
                aria-label={t("challenges.hasReviewerHints")}
                title={t("challenges.hasReviewerHints")}
                className="inline-flex items-center text-muted-foreground shrink-0"
                data-testid={`pair-challenge-has-notes-${base.id}`}
              >
                <StickyNote className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          {challenge.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1" title={challenge.description}>
              {challenge.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">
              {challenge.points} {t("common.pts")}
            </Badge>
            <Badge variant="secondary">
              {challenge.answerType === "none" ? (
                <>
                  <CircleCheck className="mr-1 h-3 w-3" /> {t("challenges.checkIn")}
                </>
              ) : challenge.answerType === "text" ? (
                <>
                  <FileText className="mr-1 h-3 w-3" /> {t("challenges.text")}
                </>
              ) : (
                <>
                  <Image className="mr-1 h-3 w-3" /> {t("challenges.fileUpload")}
                </>
              )}
            </Badge>
            {challenge.answerType !== "none" &&
              (challenge.autoValidate ? (
                <Badge variant="success">
                  <CheckCircle className="mr-1 h-3 w-3" /> {t("challenges.autoValidate")}
                </Badge>
              ) : (
                <Badge variant="warning">
                  <Eye className="mr-1 h-3 w-3" /> {t("challenges.manualReview")}
                </Badge>
              ))}
            {challenge.locationBound && (
              <Badge variant="outline">
                <MapPin className="mr-1 h-3 w-3" /> {t("challenges.locationBound")}
              </Badge>
            )}
          </div>
          {/* Challenge tag chips — show up to 5 before "+N more" */}
          {challenge.tagIds && challenge.tagIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {challenge.tagIds.slice(0, 5).map((tagId) => {
                const resolved = tagsMap.get(tagId);
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: resolved?.color ?? "#64748b" }}
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    {resolved?.label ?? tagId}
                  </span>
                );
              })}
              {challenge.tagIds.length > 5 && (
                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  +{challenge.tagIds.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={base.nfcLinked ? "success" : "destructive"} className="gap-1">
            {base.nfcLinked ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {base.nfcLinked
              ? t("basesAndChallenges.nfcLinkedTag")
              : t("basesAndChallenges.nfcNotLinkedTag")}
          </Badge>
          <span className="text-muted-foreground">
            {base.lat.toFixed(4)}, {base.lng.toFixed(4)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function UnpairedBaseRow({ base, gameId }: { base: Base; gameId: string | undefined }) {
  const { t } = useTranslation();
  return (
    <Card data-testid={`unpaired-base-${base.id}`}>
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-1/10">
          <MapPin className="h-4 w-4 text-chart-1" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{base.name}</p>
            {base.hidden && (
              <Badge variant="outline" className="text-xs gap-1">
                <EyeOff className="h-3 w-3" />
                {t("bases.hiddenTag")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate" title={base.description}>
            {base.description}
          </p>
        </div>
        <Badge variant={base.nfcLinked ? "success" : "destructive"} className="gap-1">
          {base.nfcLinked ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {base.nfcLinked
            ? t("basesAndChallenges.nfcLinkedTag")
            : t("basesAndChallenges.nfcNotLinkedTag")}
        </Badge>
        {gameId && (
          <RouterLink
            to={`/games/${gameId}/assignments`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Info className="h-3 w-3" />
            {t("basesAndChallenges.openInAssignmentsPage")}
          </RouterLink>
        )}
      </CardContent>
    </Card>
  );
}
