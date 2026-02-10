import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, RotateCcw, Play, AlertTriangle, Database, Eraser, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { gamesApi } from "@/lib/api/games";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTimeInputValue, parseDateTimeInputValue } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { GameStatus } from "@/types";

const statusColors: Record<GameStatus, string> = {
  setup: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  live: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  ended: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function SettingsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });

  const [form, setForm] = useState({ name: "", description: "", startDate: "", endDate: "", uniformAssignment: false });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState("");

  // State override dialog
  const [stateTarget, setStateTarget] = useState<GameStatus | null>(null);
  const [progressChoice, setProgressChoice] = useState<"keep" | "erase" | null>(null);

  useEffect(() => {
    if (game) {
      setForm({
        name: game.name,
        description: game.description,
        startDate: formatDateTimeInputValue(game.startDate),
        endDate: formatDateTimeInputValue(game.endDate),
        uniformAssignment: game.uniformAssignment ?? false,
      });
    }
  }, [game]);

  const updateGame = useMutation({
    mutationFn: () => {
      const parsedStartDate = parseDateTimeInputValue(form.startDate);
      const parsedEndDate = parseDateTimeInputValue(form.endDate);

      if (form.startDate.trim() && !parsedStartDate) {
        throw new Error(t("games.invalidDateFormat"));
      }
      if (form.endDate.trim() && !parsedEndDate) {
        throw new Error(t("games.invalidDateFormat"));
      }

      return gamesApi.update(gameId!, {
        ...form,
        startDate: parsedStartDate ? parsedStartDate.toISOString() : "",
        endDate: parsedEndDate ? parsedEndDate.toISOString() : "",
      });
    },
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["game", gameId] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (error: unknown) => setActionError(error instanceof Error ? error.message : getApiErrorMessage(error)),
  });

  const deleteGame = useMutation({
    mutationFn: () => gamesApi.delete(gameId!),
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["games"] });
      navigate("/games");
    },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const changeStatus = useMutation({
    mutationFn: ({ status, resetProgress }: { status: GameStatus; resetProgress: boolean }) =>
      gamesApi.updateStatus(gameId!, status, resetProgress),
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["game", gameId] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setStateTarget(null);
      setProgressChoice(null);
    },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await gamesApi.exportGame(gameId!);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${game!.name.replace(/[^a-z0-9]/gi, "-")}-export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(getApiErrorMessage(error, t("game.exportError")));
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  if (!game) return null;

  const currentStatus = game.status as GameStatus;

  // Determine which backward transitions are available
  const canRevertToSetup = currentStatus === "live" || currentStatus === "ended";
  const canRevertToLive = currentStatus === "ended";

  // Does going to this target require asking about progress?
  // live/ended -> setup: ask about progress
  // ended -> live: always keep progress
  function handleStateChange(target: GameStatus) {
    if (target === "setup") {
      setStateTarget(target);
      setProgressChoice(null); // User must choose
    } else if (target === "live" && currentStatus === "ended") {
      setStateTarget(target);
      setProgressChoice("keep"); // Always keep when ended -> live
    }
  }

  function confirmStateChange() {
    if (!stateTarget) return;
    const resetProgress = stateTarget === "setup" && progressChoice === "erase";
    changeStatus.mutate({ status: stateTarget, resetProgress });
  }

  // For the setup dialog: need to pick keep or erase before confirming
  const needsProgressChoice = stateTarget === "setup";
  const canConfirm = needsProgressChoice ? progressChoice !== null : true;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.description")}</p>
      </div>
      {actionError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div>}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.gameDetails")}</CardTitle>
          <CardDescription>{t("settings.gameDetailsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); updateGame.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("games.gameName")}</Label>
              <Input id="name" placeholder={t("games.gameNamePlaceholder")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("games.gameDescription")}</Label>
              <Textarea id="description" placeholder={t("games.gameDescriptionPlaceholder")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t("games.startDate")}</Label>
                <Input
                  id="startDate"
                  type="text"
                  inputMode="numeric"
                  placeholder={t("games.dateFormatPlaceholder")}
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">{t("games.endDate")}</Label>
                <Input
                  id="endDate"
                  type="text"
                  inputMode="numeric"
                  placeholder={t("games.dateFormatPlaceholder")}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("games.dateFormatHint")}</p>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>{t("settings.uniformAssignment")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.uniformAssignmentDescription")}</p>
              </div>
              <Switch checked={form.uniformAssignment} onCheckedChange={(v) => setForm((f) => ({ ...f, uniformAssignment: v }))} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              {saved && <span className="text-sm text-green-500">{t("settings.saved")}</span>}
              <Button type="submit" disabled={updateGame.isPending || !form.name}>
                {updateGame.isPending ? t("common.saving") : t("settings.saveChanges")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle>{t("game.export")}</CardTitle>
          <CardDescription>{t("settings.exportDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? t("game.exporting") : t("game.export")}
          </Button>
        </CardContent>
      </Card>

      {/* Game State Override */}
      {(canRevertToSetup || canRevertToLive) && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              {t("settings.gameState")}
            </CardTitle>
            <CardDescription>{t("settings.gameStateDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("settings.currentStatus")}:</span>
              <Badge className={statusColors[currentStatus]}>{t(`status.${currentStatus}`)}</Badge>
            </div>

            <div className="space-y-3">
              {canRevertToLive && (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t("settings.revertToLive")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.revertToLiveDesc")}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleStateChange("live")}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    {t("status.live")}
                  </Button>
                </div>
              )}

              {canRevertToSetup && (
                <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t("settings.revertToSetup")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.revertToSetupDesc")}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleStateChange("setup")}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {t("status.setup")}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* State Change Confirmation Dialog */}
      <Dialog open={!!stateTarget} onOpenChange={() => { setStateTarget(null); setProgressChoice(null); }}>
        {stateTarget && (
          <DialogContent onClose={() => { setStateTarget(null); setProgressChoice(null); }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {t("settings.changeStateTo")} {t(`status.${stateTarget}`)}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {needsProgressChoice ? (
                <>
                  <p className="text-sm text-muted-foreground">{t("settings.progressQuestion")}</p>
                  <div className="space-y-3">
                    <button
                      onClick={() => setProgressChoice("keep")}
                      className={`w-full rounded-lg border p-4 text-left transition-colors ${
                        progressChoice === "keep"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Database className="h-5 w-5 mt-0.5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">{t("settings.keepProgress")}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("settings.keepProgressDesc")}</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setProgressChoice("erase")}
                      className={`w-full rounded-lg border p-4 text-left transition-colors ${
                        progressChoice === "erase"
                          ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Eraser className="h-5 w-5 mt-0.5 text-red-500" />
                        <div>
                          <p className="text-sm font-medium">{t("settings.eraseProgress")}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("settings.eraseProgressDesc")}</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("settings.revertToLiveDesc")}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setStateTarget(null); setProgressChoice(null); }}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={confirmStateChange}
                disabled={!canConfirm || changeStatus.isPending}
                variant={progressChoice === "erase" ? "destructive" : "default"}
              >
                {changeStatus.isPending
                  ? t("common.loading")
                  : stateTarget === "setup"
                    ? t("settings.confirmRevertSetup")
                    : t("settings.confirmRevertLive")}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t("settings.dangerZone")}</CardTitle>
          <CardDescription>{t("settings.dangerZoneDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!showDeleteConfirm ? (
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("settings.deleteGame")}
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-4">
              <p className="text-sm font-medium">{t("settings.deleteConfirmTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("settings.deleteConfirmDescription")}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t("common.cancel")}</Button>
                <Button variant="destructive" onClick={() => deleteGame.mutate()} disabled={deleteGame.isPending}>
                  {deleteGame.isPending ? t("common.loading") : t("settings.confirmDelete")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
