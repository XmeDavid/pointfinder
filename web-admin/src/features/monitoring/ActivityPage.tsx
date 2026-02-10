import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, MapPin, ClipboardCheck, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { monitoringApi } from "@/lib/api/monitoring";
import { teamsApi } from "@/lib/api/teams";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  check_in: <MapPin className="h-4 w-4 text-blue-500" />,
  submission: <ClipboardCheck className="h-4 w-4 text-yellow-500" />,
  approval: <CheckCircle className="h-4 w-4 text-green-500" />,
  rejection: <XCircle className="h-4 w-4 text-red-500" />,
};

export function ActivityPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const websocketError = useGameWebSocket(gameId);
  const { data: events = [] } = useQuery({ queryKey: ["activity", gameId], queryFn: () => monitoringApi.getActivityEvents(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t("activityFeed.title")}</h1><p className="text-muted-foreground">{t("activityFeed.description")}</p></div>
      {websocketError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{websocketError}</div>}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" /> {t("activityFeed.recentEvents")}</CardTitle></CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="py-8 text-center"><Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("activityFeed.noActivity")}</p></div>
          ) : (
            <div className="space-y-4">{events.map((event) => { const team = teams.find((tm) => tm.id === event.teamId); return (
              <div key={event.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">{EVENT_ICONS[event.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {team && <Badge variant="secondary" className="text-xs"><div className="h-2 w-2 rounded-full mr-1" style={{ backgroundColor: team.color }} />{team.name}</Badge>}
                    <Badge variant="outline" className="text-xs capitalize">{event.type.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-sm mt-1">{event.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(event.timestamp)}</p>
                </div>
              </div>
            ); })}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
