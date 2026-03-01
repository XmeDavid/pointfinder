import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, X, MapPin, ClipboardCheck, CheckCircle, XCircle } from "lucide-react";
import { useGameLayoutStore } from "@/hooks/useGameLayout";
import { monitoringApi } from "@/lib/api/monitoring";
import { teamsApi } from "@/lib/api/teams";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { GameStatus, ActivityEvent } from "@/types";

interface BroadcastLayoutProps {
  gameId: string;
  gameStatus?: GameStatus;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  check_in: <MapPin className="h-5 w-5 text-blue-400" />,
  submission: <ClipboardCheck className="h-5 w-5 text-yellow-400" />,
  approval: <CheckCircle className="h-5 w-5 text-green-400" />,
  rejection: <XCircle className="h-5 w-5 text-red-400" />,
};

const RANK_MEDALS = ["", "🥇", "🥈", "🥉"];

export function BroadcastLayout({ gameId }: BroadcastLayoutProps) {
  const { t } = useTranslation();
  const { setLayout } = useGameLayoutStore();
  useGameWebSocket(gameId);

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["leaderboard", gameId],
    queryFn: () => monitoringApi.getLeaderboard(gameId),
    refetchInterval: 10000,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["activity", gameId],
    queryFn: () => monitoringApi.getActivityEvents(gameId),
    refetchInterval: 10000,
  });
  const { data: teams = [] } = useQuery({
    queryKey: ["teams", gameId],
    queryFn: () => teamsApi.listByGame(gameId),
  });

  // Ticker animation
  const tickerRef = useRef<HTMLDivElement>(null);
  const [tickerOffset, setTickerOffset] = useState(0);
  const recentEvents = [...events].reverse().slice(0, 20);

  useEffect(() => {
    const el = tickerRef.current;
    if (!el || recentEvents.length === 0) return;
    let frame: number;
    let offset = 0;
    const speed = 0.5; // px per frame
    const totalWidth = el.scrollWidth / 2;

    const animate = () => {
      offset += speed;
      if (offset >= totalWidth) offset = 0;
      setTickerOffset(offset);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [recentEvents.length]);

  const topPoints = leaderboard[0]?.points || 1;

  const renderActivity = (event: ActivityEvent, key: string | number) => {
    const team = teams.find((t) => t.id === event.teamId);
    return (
      <span key={key} className="inline-flex items-center gap-2 mx-6 whitespace-nowrap">
        {EVENT_ICONS[event.type] ?? <ClipboardCheck className="h-5 w-5" />}
        {team && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: team.color }} />
            <span className="font-semibold">{team.name}</span>
          </span>
        )}
        <span className="text-white/70">{event.message}</span>
        <span className="text-white/30">|</span>
      </span>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white overflow-hidden">
      {/* Exit button */}
      <button
        onClick={() => setLayout(gameId, "classic")}
        className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
        aria-label="Exit broadcast"
      >
        <X className="h-4 w-4" />
        Exit
      </button>

      {/* Header */}
      <div className="flex items-center justify-center gap-3 py-6 shrink-0">
        <Trophy className="h-8 w-8 text-yellow-400" />
        <h1 className="text-3xl font-bold tracking-tight">{t("leaderboard.title")}</h1>
      </div>

      {/* Leaderboard */}
      <div className="flex-1 overflow-hidden px-6 pb-4">
        {leaderboard.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-2xl text-white/40">{t("leaderboard.noScores")}</p>
          </div>
        ) : (
          <div className="h-full flex flex-col gap-2 overflow-hidden">
            {leaderboard.slice(0, 10).map((entry, i) => {
              const widthPct = Math.max(4, (entry.points / topPoints) * 100);
              const rank = i + 1;
              return (
                <div
                  key={entry.teamId}
                  className={cn(
                    "flex items-center gap-4 rounded-xl px-5 py-3 transition-all",
                    rank === 1 ? "bg-yellow-500/20 border border-yellow-500/40" :
                    rank === 2 ? "bg-gray-400/10 border border-gray-400/20" :
                    rank === 3 ? "bg-orange-400/10 border border-orange-400/20" :
                    "bg-white/5"
                  )}
                >
                  <span className="text-3xl w-10 text-center shrink-0">
                    {rank <= 3 ? RANK_MEDALS[rank] : <span className="text-xl text-white/40 font-bold">{rank}</span>}
                  </span>
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="text-xl font-bold flex-1 truncate">{entry.teamName}</span>
                  <div className="flex-[2] hidden md:block">
                    <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${widthPct}%`, backgroundColor: entry.color }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-white/50 hidden sm:block shrink-0">
                    {entry.completedChallenges} {t("leaderboard.done")}
                  </span>
                  <span className="text-2xl font-bold tabular-nums w-24 text-right shrink-0">
                    {entry.points} <span className="text-sm font-normal text-white/50">{t("common.pts")}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity ticker */}
      {recentEvents.length > 0 && (
        <div className="shrink-0 bg-white/5 border-t border-white/10 py-3 overflow-hidden">
          <div ref={tickerRef} className="flex items-center text-base" style={{ transform: `translateX(-${tickerOffset}px)` }}>
            {/* Duplicate for seamless loop */}
            {[...recentEvents, ...recentEvents].map((ev, i) => renderActivity(ev, i))}
          </div>
        </div>
      )}
    </div>
  );
}
