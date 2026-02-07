import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Copy, Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { teamsApi } from "@/lib/api/teams";
import { useTranslation } from "react-i18next";
import type { Team } from "@/types";

export function TeamsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });

  const createTeam = useMutation({
    mutationFn: () => teamsApi.create({ gameId: gameId!, name: teamName }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teams", gameId] }); setCreateOpen(false); setTeamName(""); },
  });

  const updateTeam = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => teamsApi.update(id, gameId!, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams", gameId] }),
  });

  const deleteTeam = useMutation({
    mutationFn: (id: string) => teamsApi.delete(id, gameId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams", gameId] }),
  });

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("teams.title")}</h1>
          <p className="text-muted-foreground">{t("teams.member", { count: teams.length })}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />{t("teams.createTeam")}</Button>
      </div>

      {teams.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("teams.noTeamsDescription")}</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onCopy={copyCode} copiedCode={copiedCode} onDelete={() => deleteTeam.mutate(team.id)} onUpdate={(name) => updateTeam.mutate({ id: team.id, name })} />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent onClose={() => setCreateOpen(false)}>
          <DialogHeader><DialogTitle>{t("teams.createTitle")}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTeam.mutate(); }}>
            <div className="space-y-2">
              <Label>{t("teams.teamName")}</Label>
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={t("teams.teamNamePlaceholder")} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={createTeam.isPending}>{t("common.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamCard({ team, onCopy, copiedCode, onDelete, onUpdate }: { team: Team; onCopy: (code: string) => void; copiedCode: string | null; onDelete: () => void; onUpdate: (name: string) => void }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(team.name);

  // Always fetch players -- no expand/collapse
  const { data: players = [] } = useQuery({
    queryKey: ["players", team.id],
    queryFn: () => teamsApi.getPlayers(team.id, team.gameId),
  });

  const handleSave = () => {
    if (editName.trim() && editName !== team.name) {
      onUpdate(editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditName(team.name);
      setIsEditing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="h-7 text-base font-semibold"
                autoFocus
              />
            ) : (
              <CardTitle className="text-base flex items-center gap-1 group cursor-pointer" onClick={() => setIsEditing(true)}>
                <span className="truncate">{team.name}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
              </CardTitle>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        <CardDescription>
          <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />{t("teams.member", { count: players.length })}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider">{team.joinCode}</div>
          <Button variant="outline" size="icon" onClick={(e) => { e.stopPropagation(); onCopy(team.joinCode); }}>
            {copiedCode === team.joinCode ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {/* Always show members */}
        {players.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t("teams.members")}</p>
            {players.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span>{p.displayName}</span>
                <span className="text-xs text-muted-foreground font-mono">{p.deviceId}</span>
              </div>
            ))}
          </div>
        )}
        {players.length === 0 && (
          <p className="text-xs text-muted-foreground border-t border-border pt-3">{t("teams.noMembers")}</p>
        )}
      </CardContent>
    </Card>
  );
}
