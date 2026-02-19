import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { gamesApi } from "@/lib/api/games";
import { getApiErrorMessage } from "@/lib/api/errors";
import { parseDateTimeInputValue } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function CreateGamePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", startDate: "", endDate: "", uniformAssignment: true });
  const [actionError, setActionError] = useState("");

  const createGame = useMutation({
    mutationFn: () => {
      const parsedStartDate = parseDateTimeInputValue(form.startDate);
      const parsedEndDate = parseDateTimeInputValue(form.endDate);

      if (form.startDate.trim() && !parsedStartDate) {
        throw new Error(t("games.invalidDateFormat"));
      }
      if (form.endDate.trim() && !parsedEndDate) {
        throw new Error(t("games.invalidDateFormat"));
      }

      return gamesApi.create({
        ...form,
        startDate: parsedStartDate ? parsedStartDate.toISOString() : "",
        endDate: parsedEndDate ? parsedEndDate.toISOString() : "",
      });
    },
    onSuccess: (game) => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["games"] }); navigate(`/games/${game.id}/overview`); },
    onError: (error: unknown) => setActionError(error instanceof Error ? error.message : getApiErrorMessage(error)),
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
              <FormLabel htmlFor="name" required>
                {t("games.gameName")}
              </FormLabel>
              <Input id="name" placeholder={t("games.gameNamePlaceholder")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="description" optional>
                {t("games.gameDescription")}
              </FormLabel>
              <Textarea id="description" placeholder={t("games.gameDescriptionPlaceholder")} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FormLabel htmlFor="startDate" optional>
                  {t("games.startDate")}
                </FormLabel>
                <Input
                  id="startDate"
                  type="text"
                  inputMode="numeric"
                  placeholder={t("games.dateFormatPlaceholder")}
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="endDate" optional>
                  {t("games.endDate")}
                </FormLabel>
                <Input
                  id="endDate"
                  type="text"
                  inputMode="numeric"
                  placeholder={t("games.dateFormatPlaceholder")}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("games.dateFormatHint")}</p>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel htmlFor="uniformAssignment">{t("settings.uniformAssignment")}</FormLabel>
                <p className="text-xs text-muted-foreground">{t("settings.uniformAssignmentDescription")}</p>
              </div>
              <Switch
                id="uniformAssignment"
                checked={form.uniformAssignment}
                onCheckedChange={(v) => setForm((f) => ({ ...f, uniformAssignment: v }))}
              />
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
