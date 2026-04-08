import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, MapPin, ClipboardCheck, CheckCircle, XCircle, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { monitoringApi, type AuditExportFilters } from "@/lib/api/monitoring";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { formatDateTime } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  check_in: <MapPin className="h-4 w-4 text-chart-1" />,
  submission: <ClipboardCheck className="h-4 w-4 text-chart-2" />,
  approval: <CheckCircle className="h-4 w-4 text-chart-3" />,
  rejection: <XCircle className="h-4 w-4 text-destructive" />,
};

/**
 * Action types available in the audit export filter. Mirrors the
 * {@code ActivityEventType} enum values from V36 on the backend. Keep
 * this list in sync with the backend enum — adding a value here without
 * adding it to the backend will produce a 400 on submit.
 */
const AUDIT_ACTION_TYPES = [
  "check_in",
  "submission",
  "approval",
  "rejection",
  "operator_override",
  "team_join",
  "team_switch",
] as const;

const AUDIT_SOURCE_SURFACES = ["player_app", "web_admin", "operator_rescue"] as const;

export function ActivityPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const websocketError = useGameWebSocket(gameId);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [challengeFilter, setChallengeFilter] = useState<string>("all");
  const [baseFilter, setBaseFilter] = useState<string>("all");

  // ── Audit export dialog state ───────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportTeamId, setExportTeamId] = useState<string>("");
  const [exportActionTypes, setExportActionTypes] = useState<Set<string>>(new Set());
  const [exportSourceSurface, setExportSourceSurface] = useState<string>("");
  const [exportIncludeArchived, setExportIncludeArchived] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: events = [], isLoading: eventsLoading, isError: eventsError } = useQuery({ queryKey: ["activity", gameId], queryFn: () => monitoringApi.getActivityEvents(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!), enabled: !!gameId });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!), enabled: !!gameId });

  const EVENT_TYPES = ["check_in", "submission", "approval", "rejection"] as const;

  const filtered = useMemo(() => {
    let result = events;
    if (typeFilter !== "all") result = result.filter((e) => e.type === typeFilter);
    if (teamFilter !== "all") result = result.filter((e) => e.teamId === teamFilter);
    if (challengeFilter !== "all") result = result.filter((e) => e.challengeId === challengeFilter);
    if (baseFilter !== "all") result = result.filter((e) => e.baseId === baseFilter);
    return result;
  }, [events, typeFilter, teamFilter, challengeFilter, baseFilter]);

  const toggleActionType = (type: string) => {
    setExportActionTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const resetExportDialog = () => {
    setExportFormat("json");
    setExportFrom("");
    setExportTo("");
    setExportTeamId("");
    setExportActionTypes(new Set());
    setExportSourceSurface("");
    setExportIncludeArchived(false);
  };

  const closeExportDialog = () => {
    setExportOpen(false);
    resetExportDialog();
  };

  /**
   * Convert a local-datetime input value (which has no timezone) into an
   * ISO-8601 string the backend will parse. We use `new Date(value)` which
   * interprets the value in the browser's local timezone, then format it
   * to the standard ISO string.
   */
  const toIsoOrUndefined = (value: string): string | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  };

  const handleExportSubmit = async () => {
    if (!gameId) return;
    const filters: AuditExportFilters = {
      format: exportFormat,
      from: toIsoOrUndefined(exportFrom),
      to: toIsoOrUndefined(exportTo),
      teamId: exportTeamId || undefined,
      actionType: exportActionTypes.size > 0 ? Array.from(exportActionTypes).join(",") : undefined,
      sourceSurface: exportSourceSurface || undefined,
      includeArchived: exportIncludeArchived || undefined,
    };
    setExporting(true);
    try {
      const blob = await monitoringApi.exportAuditLog(gameId, filters);
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      anchor.download = `audit-${gameId}-${ts}.${exportFormat}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
      toast.success(t("activityFeed.exportAuditSuccess"));
      closeExportDialog();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">{t("activityFeed.title")}</h1><p className="text-muted-foreground">{t("activityFeed.description")}</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select className="h-8 w-auto text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">{t("common.allTypes")}</option>
            {EVENT_TYPES.map((type) => (<option key={type} value={type}>{t(`activityFeed.eventType.${type}`)}</option>))}
          </Select>
          <Select className="h-8 w-auto text-sm" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">{t("common.allTeams")}</option>
            {teams.map((team) => (<option key={team.id} value={team.id}>{team.name}</option>))}
          </Select>
          <Select className="h-8 w-auto text-sm" value={challengeFilter} onChange={(e) => setChallengeFilter(e.target.value)}>
            <option value="all">{t("common.allChallenges")}</option>
            {challenges.map((ch) => (<option key={ch.id} value={ch.id}>{ch.title}</option>))}
          </Select>
          <Select className="h-8 w-auto text-sm" value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)}>
            <option value="all">{t("common.allBases")}</option>
            {bases.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm gap-1"
            onClick={() => setExportOpen(true)}
            data-testid="activity-export-btn"
          >
            <Download className="h-3.5 w-3.5" /> {t("activityFeed.exportAuditAction")}
          </Button>
        </div>
      </div>
      {websocketError && <Alert>{websocketError}</Alert>}
      {eventsError && <Alert>{t("common.serverError")}</Alert>}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" /> {t("activityFeed.recentEvents")}</CardTitle></CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center"><Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("activityFeed.noActivity")}</p></div>
          ) : (
            <div className="space-y-4">{filtered.map((event) => { const team = teams.find((tm) => tm.id === event.teamId); return (
              <div key={event.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">{EVENT_ICONS[event.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {team && <Badge variant="secondary" className="text-xs"><div className="h-2 w-2 rounded-full mr-1" style={{ backgroundColor: team.color }} />{team.name}</Badge>}
                    <Badge variant="outline" className="text-xs">{t(`activityFeed.eventType.${event.type}`, { defaultValue: event.type.replace("_", " ") })}</Badge>
                  </div>
                  <p className="text-sm mt-1">{event.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(event.timestamp)}</p>
                </div>
              </div>
            ); })}</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={exportOpen} onOpenChange={(open) => { if (!open) closeExportDialog(); }}>
        <DialogContent onClose={closeExportDialog} data-testid="activity-export-dialog">
          <DialogHeader>
            <DialogTitle>{t("activityFeed.exportAuditDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-2">{t("activityFeed.exportAuditFormatLabel")}</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audit-export-format"
                    value="json"
                    checked={exportFormat === "json"}
                    onChange={() => setExportFormat("json")}
                    data-testid="audit-export-format-json"
                  />
                  {t("activityFeed.exportAuditFormatJson")}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audit-export-format"
                    value="csv"
                    checked={exportFormat === "csv"}
                    onChange={() => setExportFormat("csv")}
                    data-testid="audit-export-format-csv"
                  />
                  {t("activityFeed.exportAuditFormatCsv")}
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="audit-export-from" className="font-medium block mb-1">
                  {t("activityFeed.exportAuditFromLabel")}
                </label>
                <Input
                  id="audit-export-from"
                  type="datetime-local"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  data-testid="audit-export-from"
                />
              </div>
              <div>
                <label htmlFor="audit-export-to" className="font-medium block mb-1">
                  {t("activityFeed.exportAuditToLabel")}
                </label>
                <Input
                  id="audit-export-to"
                  type="datetime-local"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  data-testid="audit-export-to"
                />
              </div>
            </div>

            <div>
              <label htmlFor="audit-export-team" className="font-medium block mb-1">
                {t("activityFeed.exportAuditTeamFilter")}
              </label>
              <Select
                id="audit-export-team"
                value={exportTeamId}
                onChange={(e) => setExportTeamId(e.target.value)}
                data-testid="audit-export-team"
              >
                <option value="">{t("common.allTeams")}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <p className="font-medium mb-2">{t("activityFeed.exportAuditActionTypeFilter")}</p>
              <div className="flex flex-wrap gap-2">
                {AUDIT_ACTION_TYPES.map((type) => {
                  const selected = exportActionTypes.has(type);
                  return (
                    <button
                      type="button"
                      key={type}
                      onClick={() => toggleActionType(type)}
                      data-testid={`audit-export-action-${type}`}
                      className={
                        "rounded-full border px-3 py-1 text-xs transition-colors " +
                        (selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-accent")
                      }
                    >
                      {t(`activityFeed.exportAuditActionType.${type}`, { defaultValue: type.replace("_", " ") })}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="audit-export-source" className="font-medium block mb-1">
                {t("activityFeed.exportAuditSourceSurfaceFilter")}
              </label>
              <Select
                id="audit-export-source"
                value={exportSourceSurface}
                onChange={(e) => setExportSourceSurface(e.target.value)}
                data-testid="audit-export-source"
              >
                <option value="">{t("common.all")}</option>
                {AUDIT_SOURCE_SURFACES.map((surface) => (
                  <option key={surface} value={surface}>
                    {t(`activityFeed.exportAuditSourceSurface.${surface}`, { defaultValue: surface })}
                  </option>
                ))}
              </Select>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportIncludeArchived}
                onChange={(e) => setExportIncludeArchived(e.target.checked)}
                data-testid="audit-export-include-archived"
              />
              {t("activityFeed.exportAuditIncludeArchived")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeExportDialog}>{t("common.cancel")}</Button>
            <Button
              onClick={handleExportSubmit}
              loading={exporting}
              disabled={!gameId}
              data-testid="audit-export-submit"
            >
              <Download className="mr-1 h-4 w-4" /> {t("activityFeed.exportAuditSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
