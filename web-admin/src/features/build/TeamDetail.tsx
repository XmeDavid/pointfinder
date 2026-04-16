import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Copy, Check, Trash2, Save, QrCode, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { TeamVariablesEditor } from '@/components/data/TeamVariablesEditor'
import { useTeams, useTeamPlayers } from '@/hooks/queries/useTeams'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useStages } from '@/hooks/queries/useStages'
import { useUpdateTeam, useDeleteTeam, useRemovePlayer } from '@/hooks/mutations/useTeamMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import type { Assignment } from '@/types/v2'
import type { Base } from '@/types/base'

interface TeamDetailProps {
  teamId: string
  gameId: string
}

export function TeamDetail({ teamId, gameId }: TeamDetailProps) {
  const { t } = useTranslation()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const { data: teams = [] } = useTeams(gameId)
  const { data: players = [] } = useTeamPlayers(gameId, teamId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: bases = [] } = useBases(gameId) as { data: Base[] }
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: stages = [] } = useStages(gameId)
  const updateTeam = useUpdateTeam(gameId)
  const deleteTeam = useDeleteTeam(gameId)
  const removePlayer = useRemovePlayer(gameId, teamId)
  const selectTeam = useWorkspaceStore((s) => s.selectTeam)

  const team = teams.find((t) => t.id === teamId)

  // Local form state
  const [localName, setLocalName] = useState('')
  const [localColor, setLocalColor] = useState(team?.color ?? '#888888')
  const [copied, setCopied] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)

  // Sync local state when team data loads or teamId changes
  const syncedRef = useRef<string | null>(null)
  useEffect(() => {
    if (team && syncedRef.current !== teamId) {
      syncedRef.current = teamId
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalName(team.name)
      setLocalColor(team.color)
      setCopied(false)
      setQrUrl(null)
    }
  }, [team, teamId])

  // Reset sync tracker when teamId changes so new data gets synced
  useEffect(() => {
    syncedRef.current = null
  }, [teamId])

  const handleCopyJoinCode = useCallback(() => {
    if (!team) return
    navigator.clipboard.writeText(team.joinCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [team])

  const handleShowQr = useCallback(async () => {
    if (!team) return
    const url = await QRCode.toDataURL(team.joinCode, { width: 300, margin: 1 })
    setQrUrl(url)
    setQrDialogOpen(true)
  }, [team])

  const handleDownloadQr = useCallback(async () => {
    if (!team) return
    const url = qrUrl ?? await QRCode.toDataURL(team.joinCode, { width: 300, margin: 1 })
    const a = document.createElement('a')
    a.href = url
    a.download = `${team.name}-qr.png`
    a.click()
  }, [team, qrUrl])

  const handleSave = useCallback(() => {
    updateTeam.mutate({
      teamId,
      dto: { name: localName, color: localColor },
    })
  }, [teamId, localName, localColor, updateTeam])

  const handleRemovePlayer = useCallback(
    (playerId: string) => {
      removePlayer.mutate(playerId)
    },
    [removePlayer],
  )

  // Derive journey preview: assignments for this team, grouped by stage
  const teamAssignments = useMemo(() => {
    return assignments.filter((a) => !a.teamId || a.teamId === teamId)
  }, [assignments, teamId])

  const journeyByStage = useMemo(() => {
    const sortedStages = [...stages].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    )

    const challengesMap = new Map(challenges.map((c) => [c.id, c]))

    // Group assignments by base
    const assignmentsByBase = new Map<string, Assignment[]>()
    for (const a of teamAssignments) {
      const list = assignmentsByBase.get(a.baseId) || []
      list.push(a)
      assignmentsByBase.set(a.baseId, list)
    }

    const result: Array<{
      stageName: string
      entries: Array<{
        baseName: string
        challengeTitle: string
        points: number
      }>
    }> = []

    // Group bases by stage
    for (const stage of sortedStages) {
      const stageBases = bases
        .filter((b) => b.stageId === stage.id)
        .sort((a, b) => a.name.localeCompare(b.name))

      const entries: typeof result[number]['entries'] = []

      for (const base of stageBases) {
        const baseAssignments = assignmentsByBase.get(base.id) || []
        for (const a of baseAssignments) {
          const ch = challengesMap.get(a.challengeId)
          if (ch) {
            entries.push({
              baseName: base.name,
              challengeTitle: ch.title,
              points: ch.points,
            })
          }
        }
      }

      if (entries.length > 0) {
        result.push({ stageName: stage.name, entries })
      }
    }

    // Handle bases without a stage (ungrouped)
    const stagedBaseIds = new Set(
      stages.flatMap((s) => bases.filter((b) => b.stageId === s.id).map((b) => b.id)),
    )
    const unstagedBases = bases.filter((b) => !stagedBaseIds.has(b.id))
    const unstagedEntries: typeof result[number]['entries'] = []

    for (const base of unstagedBases) {
      const baseAssignments = assignmentsByBase.get(base.id) || []
      for (const a of baseAssignments) {
        const ch = challengesMap.get(a.challengeId)
        if (ch) {
          unstagedEntries.push({
            baseName: base.name,
            challengeTitle: ch.title,
            points: ch.points,
          })
        }
      }
    }

    if (unstagedEntries.length > 0) {
      result.push({ stageName: 'Ungrouped', entries: unstagedEntries })
    }

    return result
  }, [teamAssignments, stages, bases, challenges])

  if (!team) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {t('build.selectTeamPrompt')}
      </div>
    )
  }

  const memberCount = players.length
  const deleteDescription =
    t('common.confirm.deleteTeamDescription') +
    (memberCount > 0
      ? ' ' + t('common.confirm.deleteTeamMembers', { count: memberCount })
      : '')

  return (
    <div className="p-4 space-y-0" data-testid="team-detail">
      {/* Identity section */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Identity
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Name
            </label>
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              data-testid="team-name-input"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={localColor}
                onChange={(e) => setLocalColor(e.target.value)}
                className="w-8 h-8 rounded-md border border-border cursor-pointer"
                data-testid="team-color"
              />
              <span className="text-sm text-muted-foreground">
                {localColor}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Join Code
            </label>
            <div className="flex items-center gap-2">
              <code
                className="text-sm font-mono bg-muted px-2 py-1 rounded"
                data-testid="team-join-code"
              >
                {team.joinCode}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyJoinCode}
                data-testid="copy-join-code"
                className="h-8 w-8"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShowQr}
                data-testid="show-qr-btn"
                className="h-8 w-8"
                title="Show QR code"
              >
                <QrCode className="h-4 w-4" />
              </Button>
            </div>
            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
              <DialogContent className="max-w-sm" onClose={() => setQrDialogOpen(false)}>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span
                      style={{ background: team.color }}
                      className="w-4 h-4 rounded-full inline-block"
                    />
                    {team.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  {qrUrl && (
                    <img
                      src={qrUrl}
                      alt={`QR code for ${team.joinCode}`}
                      className="w-64 h-64"
                      data-testid="qr-code-img"
                    />
                  )}
                  <code className="text-lg font-mono tracking-widest">
                    {team.joinCode}
                  </code>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadQr}
                      data-testid="download-qr-btn"
                    >
                      <Download className="h-4 w-4" />
                      Download QR
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQrDialogOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      {/* Members section */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Members{' '}
            <span className="font-normal">({players.length})</span>
          </h3>
        </div>
        {players.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members yet</p>
        ) : (
          <div className="space-y-2">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                data-testid={`player-${player.id}`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {player.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {player.deviceId}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePlayer(player.id)}
                  data-testid={`remove-player-${player.id}`}
                  className="text-destructive hover:text-destructive/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Journey Preview */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Journey Preview
        </h3>
        {journeyByStage.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="no-journey">
            No assignments yet
          </p>
        ) : (
          <div className="space-y-4" data-testid="journey-preview">
            {journeyByStage.map((stageGroup) => (
              <div key={stageGroup.stageName}>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground mb-2">
                  {stageGroup.stageName}
                </div>
                <div className="space-y-1 ml-1">
                  {stageGroup.entries.map((entry, idx) => (
                    <div
                      key={`${entry.baseName}-${entry.challengeTitle}-${idx}`}
                      className="flex items-center gap-2 py-1 text-xs"
                    >
                      <span className="inline-block h-3.5 w-3.5 rounded-full border border-border shrink-0" />
                      <span className="text-muted-foreground">
                        {entry.baseName}
                      </span>
                      <span className="text-muted-foreground">&rarr;</span>
                      <span className="font-medium text-foreground">
                        {entry.challengeTitle}
                      </span>
                      <span className="text-muted-foreground ml-auto shrink-0">
                        {entry.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Team Variables */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Team Variables
        </h3>
        <TeamVariablesEditor gameId={gameId} teams={teams} />
      </section>

      {/* Save button */}
      <div className="border-t border-border pt-4 mt-4">
        <Button
          onClick={handleSave}
          loading={updateTeam.isPending}
          data-testid="save-team"
          size="sm"
        >
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="delete-team-btn"
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          Delete team
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false)
          deleteTeam.mutate(teamId, { onSuccess: () => selectTeam(null) })
        }}
        title={t('common.confirm.deleteTeamTitle')}
        description={deleteDescription}
      />
    </div>
  )
}
