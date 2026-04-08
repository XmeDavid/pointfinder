import { useMemo, useState, useCallback, lazy, Suspense } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useTagColorFilter } from "./useTagColorFilter";
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
  Tag,
  StickyNote,
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
import { ColorPicker } from "@/components/ColorPicker";
import { TagInput } from "@/components/TagInput";
import type { Base } from "@/types";
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
  // P1 Phase 4 W3 — operator-only tags and color on the base.
  // Never surfaced to players; see PlayerBaseResponse and
  // PlayerControllerTest for the enforcing privacy assertions.
  baseTags: string[] | undefined;
  baseColor: string | undefined;
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
  challengeCorrectAnswer: string;
  // P1 Phase 4 W2 — operator-only notes. Never surfaced to players.
  challengeOperatorNotes: string;
  // P1 Phase 4 W3 — operator-only tags and color on the challenge.
  // Same privacy contract as challengeOperatorNotes.
  challengeTags: string[] | undefined;
  challengeColor: string | undefined;
}

function formFromPair(pair: BaseChallengePair): UnifiedForm {
  return {
    baseName: pair.base.name,
    baseDescription: pair.base.description,
    baseLat: pair.base.lat,
    baseLng: pair.base.lng,
    baseHidden: pair.base.hidden,
    baseTags: pair.base.tags,
    baseColor: pair.base.color,
    challengeTitle: pair.challenge.title,
    challengeDescription: pair.challenge.description,
    challengeContent: pair.challenge.content,
    challengeCompletionContent: pair.challenge.completionContent,
    challengeAnswerType: pair.challenge.answerType,
    challengePoints: pair.challenge.points,
    challengeLocationBound: pair.challenge.locationBound,
    challengeRequirePresence: pair.challenge.requirePresenceToSubmit,
    challengeAutoValidate: pair.challenge.autoValidate,
    challengeCorrectAnswer: pair.challenge.correctAnswer?.[0] ?? "",
    challengeOperatorNotes: pair.challenge.operatorNotes ?? "",
    challengeTags: pair.challenge.tags,
    challengeColor: pair.challenge.color,
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
    // P1 Phase 4 W3 — operator-only tags and color. Send undefined when
    // the operator clears the field so the backend normalizer collapses
    // the column back to NULL.
    tags: form.baseTags,
    color: form.baseColor,
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
  if (payload.autoValidate && answerType === "text" && form.challengeCorrectAnswer.trim()) {
    payload.correctAnswer = [form.challengeCorrectAnswer.trim()];
  }
  // Operator-only notes: send trimmed value, or explicit empty string to
  // clear previous notes. Backend normalizes blank → null.
  payload.operatorNotes = form.challengeOperatorNotes.trim();
  // P1 Phase 4 W3 — operator-only tags and color. Send undefined when
  // the operator clears the field; backend normalizer collapses empty
  // values to NULL.
  payload.tags = form.challengeTags;
  payload.color = form.challengeColor;
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

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  });

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

  function openEdit(pair: BaseChallengePair) {
    setActionError("");
    setEditingPair(pair);
    setForm(formFromPair(pair));
  }

  function closeDialog() {
    setEditingPair(null);
    setForm(null);
    setActionError("");
  }

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
  // base OR its challenge satisfies the tag/color predicates.
  // We build a synthetic flat representation so the hook can aggregate tags
  // and colors from both sides, then use a custom matchFn for pair-level logic.
  const pairFilterItems = useMemo(
    () =>
      aggregate.pairs.map((pair) => ({
        // Merge tags from both base and challenge for aggregation
        tags: [
          ...(pair.base.tags ?? []),
          ...(pair.challenge.tags ?? []),
        ],
        // Use base color as primary; challenge color as fallback for aggregation
        color: pair.base.color ?? pair.challenge.color,
        _pair: pair,
      })),
    [aggregate.pairs],
  );

  const pairMatchFn = useCallback(
    (
      item: (typeof pairFilterItems)[number],
      selectedTags: string[],
      selectedColors: string[],
    ) => {
      const { base, challenge } = item._pair;

      // Tags AND: base matches if it has ALL selected tags, challenge same —
      // pair matches if base OR challenge passes
      const baseTags = (base.tags ?? []).map((t) => t.trim());
      const challengeTags = (challenge.tags ?? []).map((t) => t.trim());
      const tagPass =
        selectedTags.length === 0 ||
        selectedTags.every((st) => baseTags.includes(st)) ||
        selectedTags.every((st) => challengeTags.includes(st));

      // Colors OR: pair matches if base color OR challenge color is selected
      const colorPass =
        selectedColors.length === 0 ||
        (base.color !== undefined && selectedColors.includes(base.color)) ||
        (challenge.color !== undefined && selectedColors.includes(challenge.color));

      return tagPass && colorPass;
    },
    [],
  );

  const {
    filtered: filteredPairItems,
    allTags: pairAllTags,
    allColors: pairAllColors,
    tagCounts: pairTagCounts,
    selectedTags: pairSelectedTags,
    selectedColors: pairSelectedColors,
    toggleTag: pairToggleTag,
    toggleColor: pairToggleColor,
    clearFilters: pairClearFilters,
    hasActive: pairFilterHasActive,
    isVisible: pairFilterIsVisible,
  } = useTagColorFilter(pairFilterItems, "pairs", pairMatchFn);

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
          </div>
        )}
      </div>

      <Alert variant="info">
        <span className="text-xs">{t("basesAndChallenges.aggregateNote")}</span>
      </Alert>

      {/* Sticky filter bar — only shown when pairs have tags/colors */}
      <FilterBar
        allTags={pairAllTags}
        allColors={pairAllColors}
        tagCounts={pairTagCounts}
        selectedTags={pairSelectedTags}
        selectedColors={pairSelectedColors}
        toggleTag={pairToggleTag}
        toggleColor={pairToggleColor}
        clearFilters={pairClearFilters}
        hasActive={pairFilterHasActive}
        isVisible={pairFilterIsVisible}
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
                          <div className="flex items-center gap-2">
                            <Select
                              aria-label={t("basesAndChallenges.assignToBase")}
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
                  P1 Phase 4 W3 — operator-only tags and color on the base.
                  Never surfaced to players. See PlayerBaseResponse and
                  PlayerControllerTest for the enforcing privacy assertions.
                */}
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedBaseColor" optional>
                    {t("bases.colorLabel")}
                  </FormLabel>
                  <ColorPicker
                    value={form.baseColor ?? null}
                    onChange={(next) =>
                      setForm((f) => (f ? { ...f, baseColor: next ?? undefined } : f))
                    }
                    data-testid="unified-base-color-picker"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedBaseTags" optional>
                    {t("bases.tagsLabel")}
                  </FormLabel>
                  <TagInput
                    value={form.baseTags}
                    onChange={(next) =>
                      setForm((f) => (f ? { ...f, baseTags: next } : f))
                    }
                    placeholder={t("bases.tagsPlaceholder")}
                    data-testid="unified-base-tags-input"
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
                    <FormLabel htmlFor="unifiedCorrectAnswer" required>
                      {t("challenges.correctAnswer")}
                    </FormLabel>
                    <Input
                      id="unifiedCorrectAnswer"
                      value={form.challengeCorrectAnswer}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, challengeCorrectAnswer: e.target.value } : f))
                      }
                      placeholder={t("challenges.correctAnswerPlaceholder")}
                    />
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
                  P1 Phase 4 W3 — operator-only tags and color on the
                  challenge. Same privacy contract as operatorNotes. See
                  PlayerChallengeResponse and PlayerControllerTest.
                */}
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedChallengeColor" optional>
                    {t("challenges.colorLabel")}
                  </FormLabel>
                  <ColorPicker
                    value={form.challengeColor ?? null}
                    onChange={(next) =>
                      setForm((f) => (f ? { ...f, challengeColor: next ?? undefined } : f))
                    }
                    data-testid="unified-challenge-color-picker"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel htmlFor="unifiedChallengeTags" optional>
                    {t("challenges.tagsLabel")}
                  </FormLabel>
                  <TagInput
                    value={form.challengeTags}
                    onChange={(next) =>
                      setForm((f) => (f ? { ...f, challengeTags: next } : f))
                    }
                    placeholder={t("challenges.tagsPlaceholder")}
                    data-testid="unified-challenge-tags-input"
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small internal card components kept in-file for locality.
// ---------------------------------------------------------------------------

function PairCard({ pair, onEdit }: { pair: BaseChallengePair; onEdit: () => void }) {
  const { t } = useTranslation();
  const { base, challenge } = pair;

  return (
    <Card data-testid={`pair-card-${base.id}`} aria-label={t("basesAndChallenges.pairCardAriaLabel")} className="overflow-hidden">
      {/* Color stripe — uses base color (base is the primary identity) */}
      {base.color && (
        <div
          className="h-2 w-full"
          style={{ backgroundColor: base.color }}
          data-testid="pair-color-stripe"
        />
      )}
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
            {base.tags && base.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {base.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
                {base.tags.length > 5 && (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    +{base.tags.length - 5}
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
          style={challenge.color ? { borderColor: challenge.color } : undefined}
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
          {challenge.tags && challenge.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {challenge.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
              {challenge.tags.length > 5 && (
                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  +{challenge.tags.length - 5}
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
