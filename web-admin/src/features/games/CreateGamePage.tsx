import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { gamesApi } from "@/lib/api/games";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";

export function CreateGamePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", startDate: "", endDate: "" });
  const [actionError, setActionError] = useState("");

  const createGame = useMutation({
    mutationFn: () => gamesApi.create(form),
    onSuccess: (game) => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["games"] }); navigate(`/games/${game.id}/overview`); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" onClick={() => navigate("/games")}><ArrowLeft className="mr-2 h-4 w-4" /> {t("games.backToGames")}</Button>
      {actionError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div>}
      <Card>
        <CardHeader>
          <CardTitle>{t("games.createTitle")}</CardTitle>
          <CardDescription>{t("games.createDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); createGame.mutate(); }} className="space-y-4">
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
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/games")}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={createGame.isPending}>{createGame.isPending ? t("games.creating") : t("games.createGame")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
