import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { broadcastApi } from "@/lib/api/broadcast";
import { useBroadcastWebSocket } from "@/hooks/useBroadcastWebSocket";
import { BroadcastPodium } from "./components/BroadcastPodium";
import { BroadcastMap } from "./components/BroadcastMap";
import { BroadcastTeamList } from "./components/BroadcastTeamList";
import { BroadcastBasesList } from "./components/BroadcastBasesList";
import { LoadingState } from "@/components/feedback/LoadingState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/button";

const BROADCAST_REFETCH_MS = 15000;

export function LiveBroadcastPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const upperCode = code?.toUpperCase() ?? "";

  const {
    data: initialData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["broadcast-data", upperCode],
    queryFn: () => broadcastApi.getData(upperCode),
    enabled: !!upperCode,
    retry: false,
  });

  const gameId = initialData?.gameId;

  // Each sub-query runs on demand, but we drive cache invalidation from a single
  // interval instead of three independent timers. This preserves independent
  // fetch semantics while cutting timer count from 3 -> 1.
  const { data: leaderboard = initialData?.leaderboard ?? [] } = useQuery({
    queryKey: ["broadcast-leaderboard", upperCode],
    queryFn: () => broadcastApi.getLeaderboard(upperCode),
    enabled: !!gameId,
    initialData: initialData?.leaderboard,
  });

  const { data: locations = initialData?.locations ?? [] } = useQuery({
    queryKey: ["broadcast-locations", upperCode],
    queryFn: () => broadcastApi.getLocations(upperCode),
    enabled: !!gameId,
    initialData: initialData?.locations,
  });

  const { data: progress = initialData?.progress ?? [] } = useQuery({
    queryKey: ["broadcast-progress", upperCode],
    queryFn: () => broadcastApi.getProgress(upperCode),
    enabled: !!gameId,
    initialData: initialData?.progress,
  });

  // Single interval drives invalidation for all three broadcast sub-queries.
  useEffect(() => {
    if (!gameId) return;
    const id = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["broadcast-leaderboard", upperCode] });
      queryClient.invalidateQueries({ queryKey: ["broadcast-locations", upperCode] });
      queryClient.invalidateQueries({ queryKey: ["broadcast-progress", upperCode] });
    }, BROADCAST_REFETCH_MS);
    return () => window.clearInterval(id);
  }, [gameId, upperCode, queryClient]);

  useBroadcastWebSocket(gameId, upperCode);

  if (isLoading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground"><LoadingState label={t("common.loading")} className="min-h-screen" /></div>
    );
  }

  if (isError || !initialData) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <EmptyState className="min-h-screen" title={t("live.notFound")} description={t("live.notFoundDescription")} action={<Button variant="secondary" onClick={() => navigate("/live")}>{t("live.backToEntry")}</Button>} />
      </div>
    );
  }

  const teams = initialData.teams;
  const bases = initialData.bases;

  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-success" />
          <span className="font-semibold text-sm">PointFinder</span>
        </div>
        <span className="text-sm font-medium truncate mx-4">{initialData.gameName}</span>
        <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs tracking-wider text-muted-foreground">
          {upperCode}
        </code>
      </div>

      {/* Main layout: left 1/3 | right 2/3 */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-visible p-3 lg:grid-cols-3 lg:overflow-hidden">
        {/* Left column: 1/3 width — podium (1/3 height) + team list (2/3 height) */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-1">
          <div className="h-72 min-h-0 lg:h-1/3">
            <BroadcastPodium leaderboard={leaderboard} />
          </div>
          <div className="h-96 min-h-0 lg:h-2/3">
            <BroadcastTeamList teams={teams} leaderboard={leaderboard} />
          </div>
        </div>

        {/* Right column: 2/3 width — map (2/3 height) + bases grid (1/3 height) */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-2">
          <div className="h-[28rem] min-h-0 lg:h-2/3">
            <BroadcastMap
              bases={bases}
              teams={teams}
              locations={locations}
              progress={progress}
              tileSource={initialData?.tileSource}
            />
          </div>
          <div className="h-80 min-h-0 lg:h-1/3">
            <BroadcastBasesList bases={bases} teams={teams} progress={progress} />
          </div>
        </div>
      </div>
    </div>
  );
}
