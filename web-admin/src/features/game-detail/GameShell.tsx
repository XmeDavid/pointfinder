import { useQuery } from "@tanstack/react-query";
import { useParams, Outlet } from "react-router-dom";
import { gamesApi } from "@/lib/api/games";
import { AppShell } from "@/components/layout/AppShell";

export function GameShell() {
  const { gameId } = useParams<{ gameId: string }>();

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => gamesApi.getById(gameId!),
    enabled: !!gameId,
  });

  return <AppShell gameStatus={game?.status} />;
}

// Re-export Outlet for nested usage
export { Outlet };
