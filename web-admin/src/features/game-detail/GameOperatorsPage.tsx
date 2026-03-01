import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Mail, Clock, CheckCircle, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { gamesApi } from "@/lib/api/games";
import { invitesApi } from "@/lib/api/invites";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuthStore } from "@/hooks/useAuth";

export function GameOperatorsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: game } = useQuery({ queryKey: ["game", gameId], queryFn: () => gamesApi.getById(gameId!) });
  const { data: operators = [] } = useQuery({ queryKey: ["game-operators", gameId], queryFn: () => gamesApi.getOperators(gameId!), enabled: !!gameId });
  const { data: invites = [] } = useQuery({ queryKey: ["game-invites", gameId], queryFn: () => invitesApi.listByGame(gameId!) });

  const sendInvite = useMutation({
    mutationFn: (email: string) => invitesApi.create({ email, gameId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["game-invites", gameId] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteError("");
    },
    onError: (error: unknown) => {
      setInviteError(getApiErrorMessage(error, t("gameOperators.inviteError")));
    },
  });

  const removeOperator = useMutation({
    mutationFn: (userId: string) => gamesApi.removeOperator(gameId!, userId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["game", gameId] }); queryClient.invalidateQueries({ queryKey: ["game-operators", gameId] }); },
  });

  const { user } = useAuthStore();

  if (!game) return null;

  const canKick = user?.role === "admin" || user?.id === game.createdBy;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t("gameOperators.title")}</h1><p className="text-muted-foreground">{t("gameOperators.description")}</p></div>
        <Button onClick={() => setInviteOpen(true)}><Plus className="mr-2 h-4 w-4" />{t("gameOperators.inviteOperator")}</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {operators.map((op) => (
          <Card key={op.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><UserCog className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0"><p className="font-medium truncate">{op.name}</p><p className="text-sm text-muted-foreground truncate">{op.email}</p></div>
              {op.id === game.createdBy ? <Badge variant="default">{t("gameOperators.owner")}</Badge> : canKick ? <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(op.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {invites.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("gameOperators.pendingInvitations")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium">{invite.email}</p><p className="text-xs text-muted-foreground">{t("admin.invited")} {formatDate(invite.createdAt)}</p></div></div>
                  <Badge variant={invite.status === "accepted" ? "success" : "warning"}>{invite.status === "accepted" ? (<><CheckCircle className="mr-1 h-3 w-3" /> {t("admin.accepted")}</>) : (<><Clock className="mr-1 h-3 w-3" /> {t("admin.pending")}</>)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setInviteError(""); setInviteEmail(""); } }}>
        <DialogContent onClose={() => { setInviteOpen(false); setInviteError(""); setInviteEmail(""); }}>
          <DialogHeader><DialogTitle>{t("gameOperators.inviteTitle")}</DialogTitle><DialogDescription>{t("gameOperators.inviteDescription")}</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); setInviteError(""); sendInvite.mutate(inviteEmail); }}>
            <div className="space-y-2">
              <FormLabel htmlFor="game-invite-email" required>
                {t("admin.emailAddress")}
              </FormLabel>
              <Input id="game-invite-email" type="email" placeholder={t("admin.emailPlaceholder")} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={sendInvite.isPending}>{sendInvite.isPending ? t("common.sending") : t("admin.sendInvite")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onConfirm={() => { if (deleteTarget) removeOperator.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title={t("gameOperators.removeConfirmTitle")}
        description={t("gameOperators.removeConfirmDescription")}
      />
    </div>
  );
}
