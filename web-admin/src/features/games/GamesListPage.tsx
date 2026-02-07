import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar, Users, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gamesApi } from "@/lib/api/games";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { GameStatus } from "@/types";

export function GamesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: games = [], isLoading } = useQuery({ queryKey: ["games"], queryFn: gamesApi.list });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("games.title")}</h1>
          <p className="text-muted-foreground">{t("games.description")}</p>
        </div>
        <Button onClick={() => navigate("/games/new")}>
          <Plus className="mr-2 h-4 w-4" />{t("games.newGame")}
        </Button>
      </div>

      {games.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">{t("games.noGames")}</p>
            <Button onClick={() => navigate("/games/new")}><Plus className="mr-2 h-4 w-4" />{t("games.createGame")}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => <GameCard key={game.id} gameId={game.id} />)}
        </div>
      )}
    </div>
  );
}

function GameCard({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId) });

  if (!game) return null;

  const statusVariant: Record<GameStatus, "default" | "secondary" | "warning" | "success"> = { draft: "secondary", setup: "warning", live: "success", ended: "default" };

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => navigate(`/games/${game.id}/overview`)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{game.name}</CardTitle>
          <Badge variant={statusVariant[game.status]}>{t(`status.${game.status}`)}</Badge>
        </div>
        <CardDescription className="line-clamp-2">{game.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(game.startDate)}</span>
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t("games.base", { count: bases.length })}</span>
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t("games.team", { count: teams.length })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
