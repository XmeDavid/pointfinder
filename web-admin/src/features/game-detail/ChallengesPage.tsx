import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Puzzle, Trash2, Pencil, FileText, Image, CheckCircle, Eye, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { challengesApi, type CreateChallengeDto } from "@/lib/api/challenges";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";
import type { Challenge } from "@/types";

export function ChallengesPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [form, setForm] = useState<Partial<CreateChallengeDto>>({});
  const [actionError, setActionError] = useState("");

  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });

  const createChallenge = useMutation({
    mutationFn: (data: CreateChallengeDto) => challengesApi.create({ ...data, gameId: gameId! }),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); closeDialog(); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const updateChallenge = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateChallengeDto> }) => challengesApi.update(id, { ...data, gameId: gameId! }),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); closeDialog(); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const deleteChallenge = useMutation({
    mutationFn: (id: string) => challengesApi.delete(id, gameId!),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["challenges", gameId] }); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  function openCreate() {
    setEditing(null);
    setForm({
      gameId,
      title: "",
      description: "",
      content: "",
      completionContent: "",
      answerType: "text",
      autoValidate: false,
      points: 100,
      locationBound: false,
    });
    setDialogOpen(true);
  }

  function openEdit(ch: Challenge) { setEditing(ch); setForm({ ...ch }); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditing(null); }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) updateChallenge.mutate({ id: editing.id, data: form });
    else createChallenge.mutate(form as CreateChallengeDto);
  }

  const totalPoints = challenges.reduce((sum, c) => sum + c.points, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("challenges.title")}</h1>
          <p className="text-muted-foreground">{t("challenges.summary", { count: challenges.length })} &middot; {t("challenges.totalPoints", { total: totalPoints })}</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("challenges.addChallenge")}</Button>
      </div>
      {actionError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div>}

      {challenges.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><Puzzle className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("challenges.noChallengesDescription")}</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {challenges.map((ch) => (
            <Card key={ch.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0"><CardTitle className="text-base">{ch.title}</CardTitle><CardDescription className="line-clamp-1">{ch.description}</CardDescription></div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(ch)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteChallenge.mutate(ch.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{ch.points} {t("common.pts")}</Badge>
                  <Badge variant="secondary">{ch.answerType === "text" ? <><FileText className="mr-1 h-3 w-3" /> {t("challenges.text")}</> : <><Image className="mr-1 h-3 w-3" /> {t("challenges.fileUpload")}</>}</Badge>
                  {ch.autoValidate ? <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" /> {t("challenges.autoValidate")}</Badge> : <Badge variant="warning"><Eye className="mr-1 h-3 w-3" /> {t("challenges.manualReview")}</Badge>}
                  {ch.locationBound && <Badge variant="outline"><MapPin className="mr-1 h-3 w-3" /> {t("challenges.locationBound")}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={closeDialog} className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t("challenges.editChallenge") : t("challenges.createChallenge")}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{t("challenges.challengeTitle")}</Label><Input value={form.title ?? ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("challenges.titlePlaceholder")} required /></div>
              <div className="space-y-2"><Label>{t("challenges.pointsLabel")}</Label><Input type="number" min={0} value={form.points ?? 100} onChange={(e) => setForm((f) => ({ ...f, points: parseInt(e.target.value) || 0 }))} required /></div>
            </div>
            <div className="space-y-2"><Label>{t("challenges.shortDescription")}</Label><Input value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("challenges.shortDescriptionPlaceholder")} /></div>
            <div className="space-y-2">
              <Label>{t("challenges.content")}</Label>
              <RichTextEditor value={form.content ?? ""} onChange={(html) => setForm((f) => ({ ...f, content: html }))} placeholder={t("challenges.contentPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("challenges.completionContent")}</Label>
              <RichTextEditor
                value={form.completionContent ?? ""}
                onChange={(html) => setForm((f) => ({ ...f, completionContent: html }))}
                placeholder={t("challenges.completionContentPlaceholder")}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("challenges.answerType")}</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={form.answerType === "text" ? "default" : "outline"} size="sm" onClick={() => setForm((f) => ({ ...f, answerType: "text" }))}><FileText className="mr-1 h-4 w-4" /> {t("challenges.text")}</Button>
                  <Button type="button" variant={form.answerType === "file" ? "default" : "outline"} size="sm" onClick={() => setForm((f) => ({ ...f, answerType: "file", autoValidate: false }))}><Image className="mr-1 h-4 w-4" /> {t("challenges.fileUpload")}</Button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label>{t("challenges.autoValidate")}</Label><Switch checked={form.autoValidate ?? false} onCheckedChange={(v) => setForm((f) => ({ ...f, autoValidate: v }))} disabled={form.answerType === "file"} /></div>
                <div className="flex items-center justify-between"><Label>{t("challenges.locationBound")}</Label><Switch checked={form.locationBound ?? false} onCheckedChange={(v) => setForm((f) => ({ ...f, locationBound: v }))} /></div>
              </div>
            </div>
            {form.autoValidate && form.answerType === "text" && (
              <div className="space-y-2"><Label>{t("challenges.correctAnswer")}</Label><Input value={form.correctAnswer ?? ""} onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))} placeholder={t("challenges.correctAnswerPlaceholder")} required /></div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={createChallenge.isPending || updateChallenge.isPending}>{editing ? t("challenges.editChallenge") : t("challenges.createChallenge")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
