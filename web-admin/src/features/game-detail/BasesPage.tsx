import { useMemo, useState, useEffect } from "react";
import { filterAvailableFixedChallenges } from "./dropdown-filters";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Wifi, WifiOff, Trash2, Pencil, List, Map as MapIcon, EyeOff, Tag, Link2 } from "lucide-react";
import { useTagColorFilter } from "./useTagColorFilter";
import { FilterBar } from "./FilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { basesApi, type CreateBaseDto } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { assignmentsApi } from "@/lib/api/assignments";
import { gamesApi } from "@/lib/api/games";
import { getApiErrorMessage } from "@/lib/api/errors";
import { MapPicker, BaseMapView, type UnlockConnection } from "@/components/common/MapPicker";
import { getDefaultCenter } from "@/lib/tile-sources";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { ColorPicker } from "@/components/ColorPicker";
import { TagInput } from "@/components/TagInput";
import type { Base } from "@/types";
import { buildLinkedChallengesMap } from "./useLinkedCounterpart";

type ViewMode = "list" | "map";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BasesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Base | null>(null);
  const [form, setForm] = useState<Partial<CreateBaseDto>>({});
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!), enabled: !!gameId });

  const tileSourceCenter = getDefaultCenter(game?.tileSource);
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        () => {
          // Geolocation failed, tile source default will be used
        }
      );
    }
  }, []);

  const defaultLocation = geoLocation ?? tileSourceCenter;
  const navigate = useNavigate();
  const { data: bases = [], isLoading } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!), enabled: !!gameId });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!), enabled: !!gameId });
  // Sub-wave A: pre-fetch assignments into React Query cache; Sub-wave B wires into card UI via useLinkedCounterpart
  const { data: assignments = [] } = useQuery({ queryKey: ["assignments", gameId], queryFn: () => assignmentsApi.listByGame(gameId!), enabled: !!gameId });

  // Sub-wave B: build linked-challenges map once at page level (O(1) per-card lookup)
  const linkedChallengesMap = useMemo(
    () => buildLinkedChallengesMap(bases, challenges, assignments),
    [bases, challenges, assignments],
  );
  const challengeById = useMemo(() => new Map(challenges.map((challenge) => [challenge.id, challenge])), [challenges]);
  const availableFixedChallenges = useMemo(
    () => filterAvailableFixedChallenges(challenges, bases, editing?.id, form.fixedChallengeId),
    [challenges, bases, editing?.id, form.fixedChallengeId],
  );

  const unlockConnections = useMemo<UnlockConnection[]>(() => {
    return challenges
      .filter((ch) => ch.unlocksBaseIds && ch.unlocksBaseIds.length > 0)
      .flatMap((ch) => {
        const sourceBase = bases.find((b) => b.fixedChallengeId === ch.id);
        if (!sourceBase) return [];
        return ch.unlocksBaseIds!.map((toBaseId) => ({ fromBaseId: sourceBase.id, toBaseId }));
      });
  }, [challenges, bases]);

  // useTagColorFilter: AND-within-tags, OR-within-colors, AND across dimensions
  const {
    filtered: filteredBases,
    allTags,
    allColors,
    tagCounts,
    selectedTags,
    selectedColors,
    toggleTag,
    toggleColor,
    clearFilters,
    hasActive: filterHasActive,
    isVisible: filterIsVisible,
  } = useTagColorFilter(bases, "bases");

  const createBase = useMutation({
    mutationFn: (data: CreateBaseDto) => basesApi.create({ ...data, gameId: gameId! }),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["bases", gameId] }); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); closeDialog(); toast.success(t("common.saved")); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const updateBase = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateBaseDto> }) => basesApi.update(id, { ...data, gameId: gameId! }),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["bases", gameId] }); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); closeDialog(); toast.success(t("common.saved")); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const deleteBase = useMutation({
    mutationFn: (id: string) => basesApi.delete(id, gameId!),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["bases", gameId] }); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); toast.success(t("common.deleted")); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  function openCreate() {
    setEditing(null);
    // Use last base location, or fallback to current location/default
    const lastBase = bases.length > 0 ? bases[bases.length - 1] : null;
    const lat = lastBase ? lastBase.lat : defaultLocation.lat;
    const lng = lastBase ? lastBase.lng : defaultLocation.lng;
    setForm({ name: "", description: "", lat, lng, hidden: false, tags: undefined, color: undefined });
    setDialogOpen(true);
  }

  function openEdit(base: Base) {
    setEditing(base);
    setForm({
      name: base.name,
      description: base.description,
      lat: base.lat,
      lng: base.lng,
      fixedChallengeId: base.fixedChallengeId,
      hidden: base.hidden,
      tags: base.tags,
      color: base.color,
    });
    setDialogOpen(true);
  }

  function closeDialog() { setDialogOpen(false); setEditing(null); setForm({}); }

  function navigateToChallenge(challengeId: string) {
    navigate(`/games/${gameId}/challenges?edit=${challengeId}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = (form.name ?? "").trim();
    if (!trimmedName) return;
    const trimmedForm = { ...form, name: trimmedName };
    if (editing) { updateBase.mutate({ id: editing.id, data: trimmedForm }); }
    else { createBase.mutate(trimmedForm as CreateBaseDto); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.bases")}</h1>
          <p className="text-muted-foreground">{t("bases.summary", { count: bases.length, linked: bases.filter((b) => b.nfcLinked).length })}</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex rounded-md border border-border">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}><List className="h-4 w-4" /></Button>
            <Button variant={view === "map" ? "secondary" : "ghost"} size="sm" onClick={() => setView("map")}><MapIcon className="h-4 w-4" /></Button>
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("bases.addBase")}</Button>
        </div>
      </div>
      {actionError && <Alert onDismiss={() => setActionError("")}>{actionError}</Alert>}

      {/* Sticky filter bar — only shown when tags/colors exist */}
      <FilterBar
        allTags={allTags}
        allColors={allColors}
        tagCounts={tagCounts}
        selectedTags={selectedTags}
        selectedColors={selectedColors}
        toggleTag={toggleTag}
        toggleColor={toggleColor}
        clearFilters={clearFilters}
        hasActive={filterHasActive}
        isVisible={filterIsVisible}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : view === "list" ? (
        <div className="space-y-3">
          {filteredBases.length === 0 && bases.length > 0 ? (
            <Card className="py-12"><CardContent className="text-center"><p className="text-muted-foreground">{t("bases.noResults")}</p><button type="button" onClick={clearFilters} className="mt-3 text-xs text-primary hover:underline" data-testid="bases-no-results-clear">{t("filterBar.clear")}</button></CardContent></Card>
          ) : bases.length === 0 ? (
            <Card className="py-12"><CardContent className="text-center"><MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("bases.noBasesDescription")}</p></CardContent></Card>
          ) : (
            filteredBases.map((base) => (
              <Card key={base.id} className="overflow-hidden">
                {/* Color stripe on card top */}
                {base.color && (
                  <div className="h-2 w-full" style={{ backgroundColor: base.color }} />
                )}
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10"><MapPin className="h-5 w-5 text-chart-1" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{base.name}</p>
                      {base.fixedChallengeId && (() => {
                        const fixedChallenge = challengeById.get(base.fixedChallengeId);
                        return fixedChallenge ? (
                          <button
                            type="button"
                            onClick={() => navigateToChallenge(fixedChallenge.id)}
                            className="inline-flex items-center hover:ring-1 hover:ring-primary/50 rounded-full"
                            aria-label={t("bases.fixedChallengeNamed", { challenge: fixedChallenge.title })}
                            data-testid={`base-fixed-challenge-btn-${base.id}`}
                          >
                            <Badge variant="secondary" className="text-xs max-w-[260px] cursor-pointer">
                              <span className="truncate">
                                {t("bases.fixedChallengeNamed", { challenge: fixedChallenge.title })}
                              </span>
                            </Badge>
                          </button>
                        ) : (
                          <Badge variant="outline" className="text-xs">{t("bases.fixedChallengeTag")}</Badge>
                        );
                      })()}
                      {base.hidden && <Badge variant="outline" className="text-xs gap-1"><EyeOff className="h-3 w-3" />{t("bases.hiddenTag")}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate" title={base.description}>{base.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{base.lat.toFixed(4)}, {base.lng.toFixed(4)}</p>
                    {/* Linked challenges — assignment-based links (fixed links already surfaced via badge above) */}
                    {(() => {
                      const allLinked = linkedChallengesMap.get(base.id) ?? [];
                      const assignmentLinked = allLinked.filter((lc) => lc.source === "assignment");
                      if (assignmentLinked.length === 0) return null;
                      if (assignmentLinked.length === 1) {
                        return (
                          <button
                            type="button"
                            onClick={() => navigateToChallenge(assignmentLinked[0].id)}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            data-testid={`base-linked-challenge-${base.id}`}
                          >
                            <Link2 className="h-3 w-3" />
                            {t("bases.linkedChallenge", { name: assignmentLinked[0].title })}
                          </button>
                        );
                      }
                      return (
                        <LinkedChallengesPill
                          baseId={base.id}
                          linkedChallenges={assignmentLinked}
                          onNavigate={navigateToChallenge}
                          label={t("bases.linkedChallengesN", { count: assignmentLinked.length })}
                          t={t}
                        />
                      );
                    })()}
                    {/* Tag chips — show up to 5 before "+N more" */}
                    {base.tags && base.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
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
                  <div className="flex items-center gap-2 ml-auto">
                    {/* NFC status is read-only -- set by mobile app when tag is written */}
                    <Badge variant={base.nfcLinked ? "success" : "destructive"} className="gap-1">
                      {base.nfcLinked ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      <span className="hidden sm:inline">{base.nfcLinked ? t("bases.nfcLinked") : t("bases.nfcNotLinked")}</span>
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(base)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(base.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <BaseMapView
              bases={filteredBases.map((base) => ({
                ...base,
                fixedChallengeName: base.fixedChallengeId
                  ? challengeById.get(base.fixedChallengeId)?.title
                  : undefined,
              }))}
              connections={unlockConnections}
              className="h-[500px]"
              onEdit={(baseId) => {
                const base = bases.find((b) => b.id === baseId);
                if (base) openEdit(base);
              }}
              tileSource={game?.tileSource}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={closeDialog} className="max-w-3xl">
          <DialogHeader><DialogTitle>{editing ? t("bases.editBase") : t("bases.createBase")}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <FormLabel htmlFor="baseName" required>
                {t("bases.name")}
              </FormLabel>
              <Input id="baseName" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("bases.namePlaceholder")} required data-testid="base-name-input" />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="baseDescription" optional>
                {t("common.description")}
              </FormLabel>
              <Textarea id="baseDescription" value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("bases.descriptionPlaceholder")} rows={3} />
            </div>
            {/* Map picker for coordinates */}
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">{t("bases.clickMapToSelect")}</p>
              <MapPicker
                value={{ lat: form.lat ?? defaultLocation.lat, lng: form.lng ?? defaultLocation.lng }}
                onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                className="h-[250px] rounded-md overflow-hidden border border-input"
                tileSource={game?.tileSource}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <FormLabel htmlFor="baseLatitude" className="text-xs text-muted-foreground" required>
                    {t("bases.latitude")}
                  </FormLabel>
                  <Input id="baseLatitude" type="number" step="any" value={form.lat ?? ""} onChange={(e) => { const val = parseFloat(e.target.value); setForm((f) => ({ ...f, lat: Number.isNaN(val) ? undefined : val })); }} required data-testid="base-lat-input" />
                </div>
                <div className="space-y-1">
                  <FormLabel htmlFor="baseLongitude" className="text-xs text-muted-foreground" required>
                    {t("bases.longitude")}
                  </FormLabel>
                  <Input id="baseLongitude" type="number" step="any" value={form.lng ?? ""} onChange={(e) => { const val = parseFloat(e.target.value); setForm((f) => ({ ...f, lng: Number.isNaN(val) ? undefined : val })); }} required data-testid="base-lng-input" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="baseFixedChallenge" optional>
                {t("bases.fixedChallenge")}
              </FormLabel>
              <Select id="baseFixedChallenge" value={form.fixedChallengeId ?? ""} onChange={(e) => setForm((f) => ({ ...f, fixedChallengeId: e.target.value || undefined }))}>
                <option value="">{t("bases.randomAssignment")}</option>
                {availableFixedChallenges.map((ch) => <option key={ch.id} value={ch.id}>{ch.title} ({ch.points} {t("common.pts")})</option>)}
              </Select>
              {availableFixedChallenges.length === 0 && <p className="text-xs text-muted-foreground">{t("bases.noFixedChallengesAvailable")}</p>}
              <p className="text-xs text-muted-foreground">{t("bases.fixedChallengeHint")}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel htmlFor="hidden">{t("bases.hidden")}</FormLabel>
                <p className="text-xs text-muted-foreground">{t("bases.hiddenHint")}</p>
              </div>
              <Switch
                id="hidden"
                checked={form.hidden ?? false}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, hidden: checked }))}
              />
            </div>
            {/*
              P1 Phase 4 W3 — operator-only tags and color. These fields are
              never surfaced to players. See PlayerBaseResponse for the
              player-safe DTO and PlayerControllerTest for the enforcing
              JSON-path / full-body substring assertions.
            */}
            <div className="space-y-2">
              <FormLabel htmlFor="baseColor" optional>
                {t("bases.colorLabel")}
              </FormLabel>
              <ColorPicker
                value={form.color ?? null}
                onChange={(next) => setForm((f) => ({ ...f, color: next ?? undefined }))}
                data-testid="base-color-picker"
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="baseTags" optional>
                {t("bases.tagsLabel")}
              </FormLabel>
              <TagInput
                value={form.tags}
                onChange={(next) => setForm((f) => ({ ...f, tags: next }))}
                placeholder={t("bases.tagsPlaceholder")}
                data-testid="base-tags-input"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
              <Button type="submit" loading={createBase.isPending || updateBase.isPending} data-testid="base-save-btn">{editing ? t("bases.editBase") : t("bases.createBase")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onConfirm={() => { if (deleteTarget) deleteBase.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title={t("bases.deleteConfirmTitle")}
        description={t("bases.deleteConfirmDescription")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedChallengesPill — inline expand for N>1 linked challenges
// ---------------------------------------------------------------------------

import type { LinkedChallenge } from "./useLinkedCounterpart";
import type { TFunction } from "i18next";

interface LinkedChallengesPillProps {
  baseId: string;
  linkedChallenges: LinkedChallenge[];
  onNavigate: (challengeId: string) => void;
  label: string;
  t: TFunction;
}

function LinkedChallengesPill({ baseId, linkedChallenges, onNavigate, label }: LinkedChallengesPillProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1 inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        data-testid={`base-linked-challenges-${baseId}`}
        aria-expanded={open}
      >
        <Link2 className="h-3 w-3" />
        {label}
      </button>
      {open && (
        <ul className="mt-1 ml-4 space-y-0.5" data-testid={`base-linked-challenges-list-${baseId}`}>
          {linkedChallenges.map((lc) => (
            <li key={lc.id}>
              <button
                type="button"
                onClick={() => { setOpen(false); onNavigate(lc.id); }}
                className="text-xs text-primary hover:underline"
                data-testid={`base-linked-challenge-item-${lc.id}`}
              >
                {lc.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
