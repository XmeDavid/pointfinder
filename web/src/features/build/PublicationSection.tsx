import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  GamePublicationRequest,
  GamePublicationResponse,
  PublicationCategory,
} from "@pointfinder/api";
import type { Game } from "@/types/game";
import { OrgPermission, hasPermission } from "@/types/organization";
import { useAuthStore } from "@/lib/auth/store";
import apiClient from "@/lib/api/client";
import { useWorkspaces } from "@/hooks/queries/useWorkspaces";
import { useTeams } from "@/hooks/queries/useTeams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Switch } from "@/components/ui/switch";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function PublicationSection({ game }: { game: Game }) {
  const { t } = useTranslation(undefined, { keyPrefix: "publication" });
  const user = useAuthStore((s) => s.user);
  const online = useOnlineStatus();
  const workspaces = useWorkspaces();
  const org = workspaces.data?.organizations.find(
    (org) => org.id === game.orgId,
  );
  const canPublish =
    user?.role === "admin" ||
    user?.id === game.createdBy ||
    (!!org && hasPermission(org.permissions, OrgPermission.DELETE_GAMES));
  const publication = useQuery({
    queryKey: ["publication", game.id, user?.id],
    queryFn: async () => {
      try {
        return (
          await apiClient.get<GamePublicationResponse>(
            `/games/${game.id}/publication`,
          )
        ).data;
      } catch (error) {
        if (
          (error as { response?: { status?: number } }).response?.status === 404
        )
          return null;
        throw error;
      }
    },
    enabled: !!user && !game.tutorialScenario,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (game.tutorialScenario || !user) return null;
  return (
    <section className="border-t border-border mt-4 pt-4">
      {publication.isPending ? (
        online ? (
          <LoadingState />
        ) : (
          <p className="text-sm" role="status">
            {t("offline")}
          </p>
        )
      ) : publication.isError ? (
        <div role="alert">
          <p>{t("loadError")}</p>
          <Button variant="outline" onClick={() => void publication.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          {canPublish ? (
            <PublicationEditor
              key={`${game.id}-${publication.data?.updatedAt ?? "new"}`}
              game={game}
              saved={publication.data ?? null}
              userId={user.id}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )}
        </>
      )}
    </section>
  );
}

function PublicationEditor({
  game,
  saved,
  userId,
}: {
  game: Game;
  saved: GamePublicationResponse | null;
  userId: string;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "publication" });
  const { t: experience } = useTranslation(undefined, {
    keyPrefix: "experience",
  });
  const teams = useTeams(game.id);
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [listed, setListed] = useState(saved?.listed ?? false);
  const [summary, setSummary] = useState(saved?.summary ?? "");
  const [place, setPlace] = useState(saved?.place ?? "");
  const [category, setCategory] = useState<PublicationCategory>(
    saved?.category ?? "other",
  );
  const [teamId, setTeamId] = useState(saved?.admissionTeamId ?? "");
  const request: GamePublicationRequest = {
    title: game.name,
    summary: summary.trim(),
    place: place.trim(),
    category,
    admissionTeamId: teamId || null,
    lat: null,
    lng: null,
  };
  const valid = !!request.title && !!request.summary && !!request.place;
  const mutation = useMutation({
    mutationFn: async (action: "save" | "publish" | "unpublish") => {
      if (action === "unpublish")
        return (
          await apiClient.post<GamePublicationResponse>(
            `/games/${game.id}/publication/unpublish`,
          )
        ).data;
      const response = (
        await apiClient.put<GamePublicationResponse>(
          `/games/${game.id}/publication`,
          request,
        )
      ).data;
      return action === "publish"
        ? (
            await apiClient.post<GamePublicationResponse>(
              `/games/${game.id}/publication/publish`,
            )
          ).data
        : response;
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["publication", game.id, userId], response);
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes("explore"),
      });
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (online && (listed || saved?.listed) && (!listed || valid))
          mutation.mutate(
            listed ? (saved?.listed ? "save" : "publish") : "unpublish",
          );
      }}
      data-testid="publication-form"
    >
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor={`public-${game.id}`} className="text-sm font-medium">
            {t("heading")}
          </label>
          <Switch
            id={`public-${game.id}`}
            checked={listed}
            onCheckedChange={setListed}
            disabled={!online || (game.status === "ended" && !listed)}
          />
        </div>
        {listed && (
          <>
            <label className="block space-y-1 text-sm">
              {t("summary")}
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={2000}
                rows={4}
                required
              />
            </label>
            <p className="text-xs text-muted-foreground">{t("summaryHint")}</p>
            <label className="block space-y-1 text-sm">
              {t("place")}
              <Input
                className="min-h-11"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label className="block space-y-1 text-sm">
              {t("category")}
              <Select
                className="min-h-11"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as PublicationCategory)
                }
              >
                {(["coast", "forest", "city", "other"] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {experience(`category.${value}`)}
                    </option>
                  ),
                )}
              </Select>
            </label>
            <label className="block space-y-1 text-sm">
              {t("admission")}
              <Select
                className="min-h-11"
                value={teamId}
                disabled={teams.isPending || teams.isError}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">{t("codeOnly")}</option>
                {teams.data?.map((team) => (
                  <option key={team.id} value={team.id}>
                    {t("joinTeam", { name: team.name })}
                  </option>
                ))}
              </Select>
            </label>
            {teams.isError && (
              <p role="alert" className="text-sm">
                {t("teamsError")}{" "}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void teams.refetch()}
                >
                  {t("retry")}
                </Button>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t(teamId ? "admissionHint" : "codeHint")}
            </p>
          </>
        )}
        {(listed || saved?.listed) && (
          <Button type="submit" disabled={!online || (listed && !valid)}>
            {t("saveChanges")}
          </Button>
        )}
      </fieldset>
      {!online && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("offline")}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("saveError")}
        </p>
      )}
    </form>
  );
}
