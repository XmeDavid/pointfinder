import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { basesApi } from "@/lib/api/bases";
import { teamsApi } from "@/lib/api/teams";
import { monitoringApi } from "@/lib/api/monitoring";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

export function MapPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  useGameWebSocket(gameId);
  const { data: locations = [] } = useQuery({ queryKey: ["team-locations", gameId], queryFn: () => monitoringApi.getTeamLocations(gameId!) });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t("mapPage.title")}</h1><p className="text-muted-foreground">{t("mapPage.description")}</p></div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex h-[500px] items-center justify-center bg-muted/50">
            <div className="text-center space-y-2"><Radio className="mx-auto h-12 w-12 text-muted-foreground" /><p className="text-muted-foreground font-medium">{t("mapPage.liveMapView")}</p><p className="text-sm text-muted-foreground max-w-md">{t("mapPage.mapDescription")}</p></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-4 w-4" /> {t("nav.bases")} ({bases.length})</CardTitle></CardHeader>
          <CardContent><div className="space-y-2">{bases.map((base) => (<div key={base.id} className="flex items-center justify-between text-sm"><span>{base.name}</span><span className="text-xs text-muted-foreground">{base.lat.toFixed(4)}, {base.lng.toFixed(4)}</span></div>))}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Radio className="h-4 w-4" /> {t("mapPage.teamLocations")}</CardTitle></CardHeader>
          <CardContent><div className="space-y-2">{teams.map((team) => { const loc = locations.find((l) => l.teamId === team.id); return (<div key={team.id} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} /><span>{team.name}</span></div>{loc ? <span className="text-xs text-muted-foreground">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span> : <Badge variant="secondary" className="text-xs">{t("common.noSignal")}</Badge>}</div>); })}</div></CardContent>
        </Card>
      </div>
    </div>
  );
}
