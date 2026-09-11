import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { useServices, useAuth } from "@/app/player/services";
import { getDeviceId } from "@/app/player/device";

export interface LocalGame {
  id: string;
  name: string;
  place: string;
  joinCode: string;
  status: "setup" | "live" | "ended";
}
export const localDesign =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DESIGN === true;
let bootstrap: Promise<void> | undefined;
/** Explicit opt-in local server, real sessions and API data. Never runs in a production build. */
export function useLocalDesign() {
  const services = useServices();
  const player = useAuth();
  const snapshot = useQuery({
    queryKey: ["snapshot", player.kind === "player" ? player.gameId : null],
    queryFn: () =>
      services.client.api.player.snapshot(
        player.kind === "player" ? player.gameId : "",
      ),
    enabled: player.kind === "player",
  });
  const [data, setData] = useState<LocalGame[]>();
  const [isError, setError] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!localDesign) return;
    let active = true;
    async function load() {
      try {
        if (!bootstrap)
          bootstrap = (async () => {
            if (!useAuthStore.getState().isAuthenticated)
              await useAuthStore
                .getState()
                .login("david@pointfinder.local", "Trailhead2026!");
            if (services.account.session.current.kind !== "operator")
              await services.account.signIn(
                "david@pointfinder.local",
                "Trailhead2026!",
              );
          })().catch((error) => {
            bootstrap = undefined;
            throw error;
          });
        await bootstrap;
        const response = await fetch("/__local-design/catalog");
        if (!response.ok) throw new Error("Could not load local games");
        const games: LocalGame[] = await response.json();
        if (active) {
          setData(games);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [services, attempt]);
  async function enterGame(game: LocalGame) {
    // Existing account join recovers the same participation instead of creating duplicates.
    const response = await services.account.api.account.join({
      joinCode: game.joinCode,
      displayName: "David",
      deviceId: await getDeviceId(),
    });
    await services.client.session.setPlayer(response);
  }
  const progress = snapshot.data?.progress;
  return {
    data,
    activeName: snapshot.data?.game.name,
    done: progress?.filter((p) => p.status === "completed").length ?? 0,
    total: progress?.length ?? 0,
    hasProgress: progress !== undefined,
    teamName: snapshot.data?.team.name,
    status: snapshot.data?.game.status,
    isError,
    refetch: () => retry((n) => n + 1),
    enterGame,
  };
}
