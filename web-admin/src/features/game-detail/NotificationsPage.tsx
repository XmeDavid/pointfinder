import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Bell, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { notificationsApi } from "@/lib/api/notifications";
import { teamsApi } from "@/lib/api/teams";
import { useAuthStore } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function NotificationsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");

  const { data: notifications = [] } = useQuery({ queryKey: ["notifications", gameId], queryFn: () => notificationsApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });

  const sendNotification = useMutation({
    mutationFn: () => notificationsApi.send({ gameId: gameId!, message, targetTeamId: targetTeamId || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["notifications", gameId] }); setMessage(""); setTargetTeamId(""); },
  });

  const sorted = [...notifications].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t("notifications.title")}</h1><p className="text-muted-foreground">{t("notifications.description")}</p></div>
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("notifications.compose")}</CardTitle><CardDescription>{t("notifications.composeDescription")}</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); sendNotification.mutate(); }} className="space-y-4">
            <div className="space-y-2"><Label>{t("notifications.target")}</Label><Select value={targetTeamId} onChange={(e) => setTargetTeamId(e.target.value)}><option value="">{t("notifications.allTeams")}</option>{teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</Select></div>
            <div className="space-y-2"><Label>{t("notifications.message")}</Label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("notifications.messagePlaceholder")} rows={3} required /></div>
            <Button type="submit" disabled={sendNotification.isPending || !message.trim()}><Send className="mr-2 h-4 w-4" />{sendNotification.isPending ? t("common.sending") : t("notifications.sendNotification")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">{t("notifications.sentNotifications")}</CardTitle></CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="py-8 text-center"><Bell className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("notifications.noNotifications")}</p></div>
          ) : (
            <div className="space-y-3">{sorted.map((n) => { const team = teams.find((tm) => tm.id === n.targetTeamId); return (<div key={n.id} className="rounded-md border border-border p-3"><div className="flex items-start justify-between mb-1"><Badge variant={n.targetTeamId ? "secondary" : "default"}><Users className="mr-1 h-3 w-3" />{team?.name ?? t("notifications.allTeams")}</Badge><span className="text-xs text-muted-foreground">{formatDateTime(n.sentAt)}</span></div><p className="text-sm mt-2">{n.message}</p></div>); })}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
