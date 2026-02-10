import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Mail, Clock, CheckCircle, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usersApi } from "@/lib/api/users";
import { invitesApi } from "@/lib/api/invites";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function OperatorsPage() {
  const { t } = useTranslation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const queryClient = useQueryClient();

  const { data: operators = [] } = useQuery({ queryKey: ["operators"], queryFn: usersApi.listOperators });
  const { data: invites = [] } = useQuery({ queryKey: ["invites"], queryFn: invitesApi.list });
  const globalInvites = invites.filter((i) => !i.gameId);

  const sendInvite = useMutation({
    mutationFn: (email: string) => invitesApi.create({ email }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invites"] }); setInviteOpen(false); setInviteEmail(""); setInviteError(""); },
    onError: (error: unknown) => setInviteError(getApiErrorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
          <p className="text-muted-foreground">{t("admin.description")}</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />{t("admin.inviteOperator")}
        </Button>
      </div>
      {inviteError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{inviteError}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {operators.map((op) => (
          <Card key={op.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><UserCog className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{op.name}</p>
                <p className="text-sm text-muted-foreground truncate">{op.email}</p>
              </div>
              <Badge variant="secondary">{t("common.active")}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {globalInvites.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("admin.pendingInvitations")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {globalInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">{t("admin.invited")} {formatDate(invite.createdAt)}</p>
                    </div>
                  </div>
                  <Badge variant={invite.status === "accepted" ? "success" : "warning"}>
                    {invite.status === "accepted" ? (<><CheckCircle className="mr-1 h-3 w-3" /> {t("admin.accepted")}</>) : (<><Clock className="mr-1 h-3 w-3" /> {t("admin.pending")}</>)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent onClose={() => setInviteOpen(false)}>
          <DialogHeader>
            <DialogTitle>{t("admin.inviteTitle")}</DialogTitle>
            <DialogDescription>{t("admin.inviteDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); sendInvite.mutate(inviteEmail); }}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">{t("admin.emailAddress")}</Label>
                <Input id="invite-email" type="email" placeholder={t("admin.emailPlaceholder")} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
                {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={sendInvite.isPending}>{sendInvite.isPending ? t("common.sending") : t("admin.sendInvite")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
