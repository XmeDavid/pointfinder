import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { gamesApi } from "@/lib/api/games";
import { useTranslation } from "react-i18next";

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });

  const [form, setForm] = useState({ name: "", description: "", startDate: "", endDate: "" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (game) {
      setForm({
        name: game.name,
        description: game.description,
        startDate: toLocalDatetime(game.startDate),
        endDate: toLocalDatetime(game.endDate),
      });
    }
  }, [game]);

  const updateGame = useMutation({
    mutationFn: () => gamesApi.update(gameId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["game", gameId] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const deleteGame = useMutation({
    mutationFn: () => gamesApi.delete(gameId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      navigate("/games");
    },
  });

  if (!game) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.gameDetails")}</CardTitle>
          <CardDescription>{t("settings.gameDetailsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); updateGame.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("games.gameName")}</Label>
              <Input id="name" placeholder={t("games.gameNamePlaceholder")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("games.gameDescription")}</Label>
              <Textarea id="description" placeholder={t("games.gameDescriptionPlaceholder")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t("games.startDate")}</Label>
                <Input id="startDate" type="datetime-local" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">{t("games.endDate")}</Label>
                <Input id="endDate" type="datetime-local" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              {saved && <span className="text-sm text-green-500">{t("settings.saved")}</span>}
              <Button type="submit" disabled={updateGame.isPending || !form.name}>
                {updateGame.isPending ? t("common.saving") : t("settings.saveChanges")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t("settings.dangerZone")}</CardTitle>
          <CardDescription>{t("settings.dangerZoneDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!showDeleteConfirm ? (
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("settings.deleteGame")}
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-4">
              <p className="text-sm font-medium">{t("settings.deleteConfirmTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("settings.deleteConfirmDescription")}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t("common.cancel")}</Button>
                <Button variant="destructive" onClick={() => deleteGame.mutate()} disabled={deleteGame.isPending}>
                  {deleteGame.isPending ? t("common.loading") : t("settings.confirmDelete")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
