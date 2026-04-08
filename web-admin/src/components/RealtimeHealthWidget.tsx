import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { monitoringApi, type RealtimeStats } from "@/lib/api/monitoring";
import type { GameStatus } from "@/types";
import { classifyHealth } from "@/lib/realtimeHealth";

/**
 * Realtime Health widget for the operator dashboard.
 *
 * P0 Track 2 Slice 5 — the observability layer on top of the recovery
 * contract. Polls `/api/games/{gameId}/realtime-stats` every 30 seconds
 * and renders a small tile showing:
 *
 *   - Total active clients (mobile + web split)
 *   - Reconnects in the last hour
 *   - A color indicator:
 *       green  -> healthy (sessions > 0, reconnect rate low)
 *       yellow -> reconnect rate high for the active population
 *       red    -> game is live but nothing is connected
 *
 * During `setup`/`ended` the zero-sessions case is ignored (no live event
 * means no expectation of live clients). During `live` a zero-sessions
 * response is the red alert state this whole slice was built to surface.
 */

interface Props {
  gameId: string | undefined;
  gameStatus: GameStatus | undefined;
}

export function RealtimeHealthWidget({ gameId, gameStatus }: Props) {
  const { t } = useTranslation();

  const { data: stats, isLoading, isError } = useQuery<RealtimeStats>({
    queryKey: ["realtime-stats", gameId],
    queryFn: () => monitoringApi.getRealtimeStats(gameId!),
    enabled: !!gameId,
    // No refetchInterval — fresh data arrives via WebSocket (activity /
    // submission_status events trigger invalidation in useGameWebSocket).
    // staleTime keeps the last-fetched value fresh for 30 s to avoid an
    // unnecessary refetch when the component first mounts on a tab that
    // already has data in cache.
    staleTime: 30_000,
  });

  if (!gameId) return null;

  if (isLoading || isError || !stats) {
    return (
      <Card data-testid="realtime-health-widget">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> {t("realtimeHealth.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isError ? t("realtimeHealth.loadError") : t("common.loading")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const status = classifyHealth(stats, gameStatus);
  const dotColor =
    status === "green"
      ? "bg-green-500"
      : status === "yellow"
        ? "bg-yellow-500"
        : status === "red"
          ? "bg-red-500"
          : "bg-muted";

  const statusLabel =
    status === "green"
      ? t("realtimeHealth.statusHealthy")
      : status === "yellow"
        ? t("realtimeHealth.statusDegraded")
        : status === "red"
          ? t("realtimeHealth.statusNoClients")
          : t("realtimeHealth.statusIdle");

  const Icon = status === "red" ? WifiOff : status === "yellow" ? AlertTriangle : Wifi;

  return (
    <Card data-testid="realtime-health-widget" data-status={status}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" /> {t("realtimeHealth.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor}`}
            data-testid="realtime-health-dot"
            aria-label={statusLabel}
            role="img"
          />
          <span className="text-sm font-medium" data-testid="realtime-health-status">
            {statusLabel}
          </span>
        </div>
        <div className="text-sm">
          <span className="font-bold" data-testid="realtime-health-active-total">
            {stats.totalActiveSessions}
          </span>{" "}
          <span className="text-muted-foreground">
            {t("realtimeHealth.activeClients", {
              mobile: stats.mobileActiveSessions,
              web: stats.stompActiveSessions,
            })}
          </span>
        </div>
        <div className="text-xs text-muted-foreground" data-testid="realtime-health-reconnects">
          {t("realtimeHealth.reconnectsLastHour", { count: stats.estimatedReconnectsLastHour })}
        </div>
      </CardContent>
    </Card>
  );
}
