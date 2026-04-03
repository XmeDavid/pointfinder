import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, MapPin, ClipboardCheck, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { monitoringApi } from "@/lib/api/monitoring";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  check_in: <MapPin className="h-4 w-4 text-chart-1" />,
  submission: <ClipboardCheck className="h-4 w-4 text-chart-2" />,
  approval: <CheckCircle className="h-4 w-4 text-chart-3" />,
  rejection: <XCircle className="h-4 w-4 text-destructive" />,
};

export function ActivityPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const websocketError = useGameWebSocket(gameId);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [challengeFilter, setChallengeFilter] = useState<string>("all");
  const [baseFilter, setBaseFilter] = useState<string>("all");

  const { data: events = [], isLoading: eventsLoading, isError: eventsError } = useQuery({ queryKey: ["activity", gameId], queryFn: () => monitoringApi.getActivityEvents(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!), enabled: !!gameId });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!), enabled: !!gameId });

  const EVENT_TYPES = ["check_in", "submission", "approval", "rejection"] as const;

  const filtered = useMemo(() => {
    let result = events;
    if (typeFilter !== "all") result = result.filter((e) => e.type === typeFilter);
    if (teamFilter !== "all") result = result.filter((e) => e.teamId === teamFilter);
    if (challengeFilter !== "all") result = result.filter((e) => e.challengeId === challengeFilter);
    if (baseFilter !== "all") result = result.filter((e) => e.baseId === baseFilter);
    return result;
  }, [events, typeFilter, teamFilter, challengeFilter, baseFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">{t("activityFeed.title")}</h1><p className="text-muted-foreground">{t("activityFeed.description")}</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select className="h-8 w-auto text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">{t("common.allTypes")}</option>
            {EVENT_TYPES.map((type) => (<option key={type} value={type}>{t(`activityFeed.eventType.${type}`)}</option>))}
          </Select>
          <Select className="h-8 w-auto text-sm" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">{t("common.allTeams")}</option>
            {teams.map((team) => (<option key={team.id} value={team.id}>{team.name}</option>))}
          </Select>
          <Select className="h-8 w-auto text-sm" value={challengeFilter} onChange={(e) => setChallengeFilter(e.target.value)}>
            <option value="all">{t("common.allChallenges")}</option>
            {challenges.map((ch) => (<option key={ch.id} value={ch.id}>{ch.title}</option>))}
          </Select>
          <Select className="h-8 w-auto text-sm" value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)}>
            <option value="all">{t("common.allBases")}</option>
            {bases.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </Select>
        </div>
      </div>
      {websocketError && <Alert>{websocketError}</Alert>}
      {eventsError && <Alert>{t("common.serverError")}</Alert>}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" /> {t("activityFeed.recentEvents")}</CardTitle></CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center"><Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("activityFeed.noActivity")}</p></div>
          ) : (
            <div className="space-y-4">{filtered.map((event) => { const team = teams.find((tm) => tm.id === event.teamId); return (
              <div key={event.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">{EVENT_ICONS[event.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {team && <Badge variant="secondary" className="text-xs"><div className="h-2 w-2 rounded-full mr-1" style={{ backgroundColor: team.color }} />{team.name}</Badge>}
                    <Badge variant="outline" className="text-xs">{t(`activityFeed.eventType.${event.type}`, { defaultValue: event.type.replace("_", " ") })}</Badge>
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
