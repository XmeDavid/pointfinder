import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar, Users, MapPin, Upload } from "lucide-react";
import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gamesApi } from "@/lib/api/games";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { GameStatus } from "@/types";

export function GamesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: games = [], isLoading } = useQuery({ queryKey: ["games"], queryFn: gamesApi.list });
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />{t("game.import")}
          </Button>
          <Button onClick={() => navigate("/games/new")}>
            <Plus className="mr-2 h-4 w-4" />{t("games.newGame")}
          </Button>
        </div>
      </div>

      <ImportGameDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} navigate={navigate} />

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

interface ImportGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigate: (path: string) => void;
}

function ImportGameDialog({ open, onOpenChange, navigate }: ImportGameDialogProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [importing, setImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.json')) {
        toast.error(t("game.invalidFileType"));
        return;
      }

      // Validate file size (max 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error(t("game.fileTooLarge"));
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleImport = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;

    try {
      setImporting(true);

      // Read and parse file
      const content = await file.text();
      const gameData = JSON.parse(content);

      // Import game
      const result = await gamesApi.importGame({
        gameData,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });

      toast.success(t("game.importSuccess"));
      onOpenChange(false);
      navigate(`/games/${result.id}/overview`);
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        toast.error(t("game.invalidJsonFile"));
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error(t("game.importError"));
      }
      console.error("Import failed:", error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("game.importGame")}</DialogTitle>
          <DialogDescription>{t("game.importDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleImport} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">{t("game.selectFile")}</Label>
            <Input
              id="file"
              type="file"
              accept=".json"
              onChange={handleFileChange}
              required
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                {t("game.selectedFile")}: {file.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">{t("game.startDate")}</Label>
            <Input
              id="startDate"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">{t("game.endDate")}</Label>
            <Input
              id="endDate"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={importing || !file}>
              {importing ? t("game.importing") : t("game.import")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
