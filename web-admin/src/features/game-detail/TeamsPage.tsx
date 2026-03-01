import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Copy, Trash2, Check, Pencil, QrCode, UserMinus } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { teamsApi } from "@/lib/api/teams";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useTranslation } from "react-i18next";
import type { Team } from "@/types";

export function TeamsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });

  const createTeam = useMutation({
    mutationFn: () => teamsApi.create({ gameId: gameId!, name: teamName }),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["teams", gameId] }); setCreateOpen(false); setTeamName(""); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const updateTeam = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color?: string }) =>
      teamsApi.update(id, gameId!, { name, color }),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["teams", gameId] }); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
  });

  const deleteTeam = useMutation({
    mutationFn: (id: string) => teamsApi.delete(id, gameId!),
    onSuccess: () => { setActionError(""); queryClient.invalidateQueries({ queryKey: ["teams", gameId] }); },
    onError: (error: unknown) => setActionError(getApiErrorMessage(error)),
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
      {actionError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div>}

      {teams.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{t("teams.noTeamsDescription")}</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onCopy={copyCode}
              copiedCode={copiedCode}
              onDelete={() => setDeleteTarget(team.id)}
              onUpdate={(payload) => updateTeam.mutate({ id: team.id, ...payload })}
              onActionError={setActionError}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent onClose={() => setCreateOpen(false)}>
          <DialogHeader><DialogTitle>{t("teams.createTitle")}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTeam.mutate(); }}>
            <div className="space-y-2">
              <FormLabel htmlFor="teamName" required>
                {t("teams.teamName")}
              </FormLabel>
              <Input id="teamName" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={t("teams.teamNamePlaceholder")} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={createTeam.isPending}>{t("common.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onConfirm={() => { if (deleteTarget) deleteTeam.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title={t("teams.deleteConfirmTitle")}
        description={t("teams.deleteConfirmDescription")}
      />
    </div>
  );
}

function TeamCard({
  team,
  onCopy,
  copiedCode,
  onDelete,
  onUpdate,
  onActionError,
}: {
  team: Team;
  onCopy: (code: string) => void;
  copiedCode: string | null;
  onDelete: () => void;
  onUpdate: (payload: { name: string; color?: string }) => void;
  onActionError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [removePlayerId, setRemovePlayerId] = useState<string | null>(null);
  const removingPlayer = players.find((p) => p.id === removePlayerId);

  // Always fetch players -- no expand/collapse
  const { data: players = [] } = useQuery({
    queryKey: ["players", team.id],
    queryFn: () => teamsApi.getPlayers(team.id, team.gameId),
  });

  const removePlayer = useMutation({
    mutationFn: (playerId: string) => teamsApi.removePlayer(team.id, playerId, team.gameId),
    onSuccess: () => {
      onActionError("");
      queryClient.invalidateQueries({ queryKey: ["players", team.id] });
    },
    onError: (error: unknown) => onActionError(getApiErrorMessage(error)),
  });

  const handleSave = () => {
    if (editName.trim() && editName !== team.name) {
      onUpdate({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  const handleColorChange = (nextColor: string) => {
    if (nextColor !== team.color) {
      onUpdate({ name: team.name, color: nextColor });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditName(team.name);
      setIsEditing(false);
    }
  };

  const downloadQr = async () => {
    const url = await QRCode.toDataURL(team.joinCode, { width: 512, margin: 2 });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${team.name}-qr.png`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="color"
              value={team.color}
              onChange={(e) => handleColorChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-5 flex-shrink-0 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0"
              title={t("teams.teamColor") ?? undefined}
              aria-label={t("teams.teamColor")}
            />
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
          <Button variant="outline" size="icon" onClick={(e) => { e.stopPropagation(); onCopy(team.joinCode); }} title={t("common.copy") ?? undefined}>
            {copiedCode === team.joinCode ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={(e) => { e.stopPropagation(); downloadQr(); }} title={t("teams.downloadQr") ?? undefined}>
            <QrCode className="h-4 w-4" />
          </Button>
        </div>

        {/* Always show members */}
        {players.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t("teams.members")}</p>
            {players.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.displayName}</span>
                <span className="max-w-40 truncate text-xs text-muted-foreground font-mono text-right" title={p.deviceId}>
                  {p.deviceId}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={removePlayer.isPending}
                  onClick={() => setRemovePlayerId(p.id)}
                  title={t("teams.removeMember")}
                >
                  <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {players.length === 0 && (
          <p className="text-xs text-muted-foreground border-t border-border pt-3">{t("teams.noMembers")}</p>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={removePlayerId !== null}
        onConfirm={() => { if (removePlayerId) removePlayer.mutate(removePlayerId); setRemovePlayerId(null); }}
        onCancel={() => setRemovePlayerId(null)}
        title={t("teams.removeMember")}
        description={removingPlayer ? t("teams.removeMemberConfirm", { name: removingPlayer.displayName }) : ""}
      />
    </Card>
  );
}
