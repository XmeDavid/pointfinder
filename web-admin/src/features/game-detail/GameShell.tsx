import { useQuery } from "@tanstack/react-query";
import { useParams, Outlet } from "react-router-dom";
import { gamesApi } from "@/lib/api/games";
import { AppShell } from "@/components/layout/AppShell";
import { useVisibilityRefresh } from "@/hooks/useGameSnapshot";

export function GameShell() {
  const { gameId } = useParams<{ gameId: string }>();

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  });

  // Operator dashboard foreground refresh. Mounted here so every game-detail
  // layout (classic, setup, monitor, review) inherits the behaviour — the
  // web-admin counterpart to iOS `scenePhase == .active` and Android
  // `ON_RESUME` wiring from Slice 2. See docs/realtime-and-mobile.md §7.
  useVisibilityRefresh(gameId);

  return <AppShell gameStatus={game?.status} />;
}

// Re-export Outlet for nested usage
export { Outlet };
