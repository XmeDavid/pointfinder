import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Wifi, WifiOff, Trash2, Pencil, List, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { basesApi, type CreateBaseDto } from "@/lib/api/bases";
import { challengesApi } from "@/lib/api/challenges";
import { MapPicker, BaseMapView } from "@/components/common/MapPicker";
import { useTranslation } from "react-i18next";
import type { Base } from "@/types";

type ViewMode = "list" | "map";

export function BasesPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Base | null>(null);
  const [form, setForm] = useState<Partial<CreateBaseDto>>({});

  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });

  const createBase = useMutation({
    mutationFn: (data: CreateBaseDto) => basesApi.create({ ...data, gameId: gameId! }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bases", gameId] }); closeDialog(); },
  });

  const updateBase = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateBaseDto> }) => basesApi.update(id, { ...data, gameId: gameId! }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bases", gameId] }); closeDialog(); },
  });

  const deleteBase = useMutation({
    mutationFn: basesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bases", gameId] }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ gameId, name: "", description: "", lat: 38.7223, lng: -9.1393 });
    setDialogOpen(true);
  }

  function openEdit(base: Base) {
    setEditing(base);
    setForm({ gameId: base.gameId, name: base.name, description: base.description, lat: base.lat, lng: base.lng, fixedChallengeId: base.fixedChallengeId });
    setDialogOpen(true);
  }

  function closeDialog() { setDialogOpen(false); setEditing(null); setForm({}); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) { updateBase.mutate({ id: editing.id, data: form }); }
    else { createBase.mutate(form as CreateBaseDto); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("bases.title")}</h1>
          <p className="text-muted-foreground">{t("bases.summary", { count: bases.length, linked: bases.filter((b) => b.nfcLinked).length })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}><List className="h-4 w-4" /></Button>
            <Button variant={view === "map" ? "secondary" : "ghost"} size="sm" onClick={() => setView("map")}><MapIcon className="h-4 w-4" /></Button>
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />{t("bases.addBase")}</Button>
        </div>
      </div>

      {view === "list" ? (
        <div className="space-y-3">
          {bases.length === 0 ? (
            <Card className="py-12"><CardContent className="text-center"><MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("bases.noBasesDescription")}</p></CardContent></Card>
          ) : (
            bases.map((base) => (
              <Card key={base.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><MapPin className="h-5 w-5 text-blue-500" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{base.name}</p>
                      {base.fixedChallengeId && <Badge variant="outline" className="text-xs">{t("bases.fixedChallengeTag")}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{base.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{base.lat.toFixed(4)}, {base.lng.toFixed(4)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* NFC status is read-only -- set by mobile app when tag is written */}
                    <Badge variant={base.nfcLinked ? "success" : "destructive"} className="gap-1">
                      {base.nfcLinked ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      {base.nfcLinked ? t("bases.nfcLinked") : t("bases.nfcNotLinked")}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(base)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteBase.mutate(base.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <BaseMapView bases={bases} className="h-[500px]" />
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={closeDialog}>
          <DialogHeader><DialogTitle>{editing ? t("bases.editBase") : t("bases.createBase")}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("bases.name")}</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("bases.namePlaceholder")} required />
            </div>
            <div className="space-y-2">
              <Label>{t("bases.description")}</Label>
              <Textarea value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("bases.descriptionPlaceholder")} rows={3} />
            </div>
            {/* Map picker for coordinates */}
            <div className="space-y-2">
              <Label>{t("bases.clickMapToSelect")}</Label>
              <MapPicker
                value={{ lat: form.lat ?? 38.7223, lng: form.lng ?? -9.1393 }}
                onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                className="h-[250px] rounded-md overflow-hidden border border-input"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("bases.latitude")}</Label>
                  <Input type="number" step="any" value={form.lat ?? ""} onChange={(e) => setForm((f) => ({ ...f, lat: parseFloat(e.target.value) }))} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("bases.longitude")}</Label>
                  <Input type="number" step="any" value={form.lng ?? ""} onChange={(e) => setForm((f) => ({ ...f, lng: parseFloat(e.target.value) }))} required />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("bases.fixedChallenge")}</Label>
              <Select value={form.fixedChallengeId ?? ""} onChange={(e) => setForm((f) => ({ ...f, fixedChallengeId: e.target.value || undefined }))}>
                <option value="">{t("bases.randomAssignment")}</option>
                {challenges.map((ch) => <option key={ch.id} value={ch.id}>{ch.title} ({ch.points} {t("common.pts")})</option>)}
              </Select>
              <p className="text-xs text-muted-foreground">{t("bases.fixedChallengeHint")}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={createBase.isPending || updateBase.isPending}>{editing ? t("bases.editBase") : t("bases.createBase")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
