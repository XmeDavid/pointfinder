import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useServices, useAccountSession, useAuth } from "@/app/player/services";
import { getDeviceId } from "@/app/player/device";
import { LoadingState } from "@/components/feedback/LoadingState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { SurfacePanel } from "@/components/layout/SurfacePanel";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/store";
import apiClient from "@/lib/api/client";
import type { AccountMeResponse, PlayerAuthResponse } from "@pointfinder/api";
import { useState } from "react";
import { UserGameRow } from "./UserGameCards";
export function PlayingGames({ past }: { past: boolean }) {
  const { t } = useTranslation(undefined, { keyPrefix: "experience" });
  const services = useServices();
  const account = useAccountSession();
  const player = useAuth();
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const query = useQuery({
    queryKey: [
      "account",
      account.kind === "operator" ? account.userId : userId,
      "participations",
    ],
    queryFn: async () =>
      account.kind === "operator"
        ? services.account.api.account.me()
        : (await apiClient.get<AccountMeResponse>("/account/me")).data,
    enabled: account.kind === "operator" || authenticated,
  });
  async function open(id: string) {
    try {
      const deviceId = await getDeviceId();
      const auth =
        account.kind === "operator"
          ? await services.account.api.account.recover(id, deviceId)
          : (
              await apiClient.post<PlayerAuthResponse>(
                `/account/participations/${id}/recover`,
                { deviceId },
              )
            ).data;
      await services.client.session.setPlayer(auth);
      navigate("/map");
    } catch {
      setFailed(true);
    }
  }
  if (account.kind !== "operator" && !authenticated)
    return (
      <SurfacePanel padding="md">
        {player.kind === "player" && !past && (
          <UserGameRow
            game={{
              id: player.gameId,
              name: player.gameName,
              team: player.teamName,
              place: "",
              status: player.gameStatus,
              context: "player",
            }}
            onOpen={() => navigate("/map")}
          />
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          {t("saveProgressHint")}
        </p>
        <Button className="mt-4" onClick={() => navigate("/account")}>
          {t("saveProgress")}
        </Button>
      </SurfacePanel>
    );
  if (query.isPending) return <LoadingState />;
  if (query.isError || failed)
    return (
      <div role="alert">
        {t("connectionError")}
        <Button
          onClick={() => {
            setFailed(false);
            void query.refetch();
          }}
        >
          {t("retry")}
        </Button>
      </div>
    );
  const games = query.data.participations.filter(
    (p) => (p.gameStatus === "ended") === past,
  );
  if (!games.length)
    return (
      <EmptyState
        title={t("noGames")}
        action={
          <Button onClick={() => navigate("/home")}>
            {t("startExploring")}
          </Button>
        }
      />
    );
  return (
    <SurfacePanel padding="none">
      {games.map((g) => (
        <UserGameRow
          key={g.gameId}
          game={{
            id: g.gameId,
            name: g.gameName,
            team: g.teamName,
            place: "",
            status: g.gameStatus,
            context: "player",
          }}
          onOpen={() =>
            g.gameStatus === "ended"
              ? navigate(
                  `/profile?game=${encodeURIComponent(g.gameId)}&from=play#game-${encodeURIComponent(g.gameId)}`,
                )
              : void open(g.gameId)
          }
        />
      ))}
    </SurfacePanel>
  );
}
