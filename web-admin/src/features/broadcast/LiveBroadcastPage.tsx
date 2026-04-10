import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { broadcastApi } from "@/lib/api/broadcast";
import { useBroadcastWebSocket } from "@/hooks/useBroadcastWebSocket";
import { BroadcastPodium } from "./components/BroadcastPodium";
import { BroadcastMap } from "./components/BroadcastMap";
import { BroadcastTeamList } from "./components/BroadcastTeamList";
import { BroadcastBasesList } from "./components/BroadcastBasesList";

export function LiveBroadcastPage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
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

  const { data: leaderboard = initialData?.leaderboard ?? [] } = useQuery({
    queryKey: ["broadcast-leaderboard", upperCode],
    queryFn: () => broadcastApi.getLeaderboard(upperCode),
    enabled: !!gameId,
    refetchInterval: 15000,
    initialData: initialData?.leaderboard,
  });

  const { data: locations = initialData?.locations ?? [] } = useQuery({
    queryKey: ["broadcast-locations", upperCode],
    queryFn: () => broadcastApi.getLocations(upperCode),
    enabled: !!gameId,
    refetchInterval: 15000,
    initialData: initialData?.locations,
  });

  const { data: progress = initialData?.progress ?? [] } = useQuery({
    queryKey: ["broadcast-progress", upperCode],
    queryFn: () => broadcastApi.getProgress(upperCode),
    enabled: !!gameId,
    refetchInterval: 15000,
    initialData: initialData?.progress,
  });

  useBroadcastWebSocket(gameId, upperCode);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p className="text-lg text-white/50">{t("common.loading")}</p>
      </div>
    );
  }

  if (isError || !initialData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
        <p className="text-xl font-semibold">{t("live.notFound")}</p>
        <p className="text-white/50">{t("live.notFoundDescription")}</p>
        <button
          onClick={() => navigate("/live")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
        >
          {t("live.backToEntry")}
        </button>
      </div>
    );
  }

  const teams = initialData.teams;
  const bases = initialData.bases;

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-green-400" />
          <span className="font-semibold text-sm">PointFinder</span>
        </div>
        <span className="text-sm font-medium truncate mx-4">{initialData.gameName}</span>
        <code className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs tracking-wider">
          {upperCode}
        </code>
      </div>

      {/* Main layout: left 1/3 | right 2/3 */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">
        {/* Left column: 1/3 width — podium (1/3 height) + team list (2/3 height) */}
        <div className="w-1/3 flex flex-col gap-3 min-w-0">
          <div className="h-1/3 min-h-0">
            <BroadcastPodium leaderboard={leaderboard} />
          </div>
          <div className="h-2/3 min-h-0">
            <BroadcastTeamList teams={teams} leaderboard={leaderboard} />
          </div>
        </div>

        {/* Right column: 2/3 width — map (2/3 height) + bases grid (1/3 height) */}
        <div className="w-2/3 flex flex-col gap-3 min-w-0">
          <div className="h-2/3 min-h-0">
            <BroadcastMap
              bases={bases}
              teams={teams}
              locations={locations}
              progress={progress}
              tileSource={initialData?.tileSource}
            />
          </div>
          <div className="h-1/3 min-h-0">
            <BroadcastBasesList bases={bases} teams={teams} progress={progress} />
          </div>
        </div>
      </div>
    </div>
  );
}
