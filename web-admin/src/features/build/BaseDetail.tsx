import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Pin, Plus, Pencil, Save, X, ChevronDown, Users } from 'lucide-react'
import { TagPicker } from '@/components/data/TagPicker'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBases } from '@/hooks/queries/useBases'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useUpdateBase, useDeleteBase } from '@/hooks/mutations/useBaseMutations'
import { useCreateAssignment, useDeleteAssignment } from '@/hooks/mutations/useAssignmentMutations'
import { useTeams } from '@/hooks/queries/useTeams'
import { LocationPicker } from '@/components/map/LocationPicker'
import { useGame } from '@/hooks/queries/useGames'
import { getStyleUrl } from '@/lib/tile-sources'
import type { Assignment, Challenge, Team } from '@/types'

interface BaseDetailProps {
  baseId: string
  gameId: string
}

const ANSWER_TYPE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  text: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Text' },
  file: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'File' },
  none: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Check-in' },
}

export function BaseDetail({ baseId, gameId }: BaseDetailProps) {
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)
  const selectBase = useWorkspaceStore((s) => s.selectBase)

  const { data: game } = useGame(gameId)
  const { data: bases = [] } = useBases(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const updateBase = useUpdateBase(gameId)
  const deleteBase = useDeleteBase(gameId)
  const createAssignment = useCreateAssignment(gameId)
  const deleteAssignment = useDeleteAssignment(gameId)

  const [showLinkDropdown, setShowLinkDropdown] = useState(false)
  const linkDropdownRef = useRef<HTMLDivElement>(null)

  const base = bases.find((b) => b.id === baseId)

  // Local form state
  const [localName, setLocalName] = useState(base?.name ?? '')
  const [localDescription, setLocalDescription] = useState(base?.description ?? '')
  const [localLat, setLocalLat] = useState(base?.lat?.toString() ?? '')
  const [localLng, setLocalLng] = useState(base?.lng?.toString() ?? '')
  const [localHidden, setLocalHidden] = useState(base?.hidden ?? false)

  // Reset local state when base changes
  useEffect(() => {
    setLocalName(base?.name ?? '')
    setLocalDescription(base?.description ?? '')
    setLocalLat(base?.lat?.toString() ?? '')
    setLocalLng(base?.lng?.toString() ?? '')
    setLocalHidden(base?.hidden ?? false)
  }, [baseId, base?.name, base?.description, base?.lat, base?.lng, base?.hidden])

  // Derived data
  const baseAssignments = useMemo(
    () => assignments.filter((a) => a.baseId === baseId),
    [assignments, baseId],
  )

  const baseChallenges = useMemo(() => {
    const challengeIds = new Set(baseAssignments.map((a) => a.challengeId))
    return challenges.filter((c) => challengeIds.has(c.id))
  }, [baseAssignments, challenges])

  // Challenges not yet assigned to this base
  const unlinkedChallenges = useMemo(() => {
    const linkedIds = new Set(baseChallenges.map((c) => c.id))
    return challenges.filter((c) => !linkedIds.has(c.id))
  }, [challenges, baseChallenges])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showLinkDropdown) return
    const handler = (e: MouseEvent) => {
      if (linkDropdownRef.current && !linkDropdownRef.current.contains(e.target as Node)) {
        setShowLinkDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLinkDropdown])

  const handleLinkChallenge = (challengeId: string) => {
    createAssignment.mutate({ baseId: baseId, challengeId })
    setShowLinkDropdown(false)
  }

  const handleUnlinkChallenge = (challengeId: string) => {
    // Find the assignment(s) for this base+challenge that are global (teamId=null)
    // and delete them. If there are team-specific ones, delete all for this base+challenge.
    const toDelete = baseAssignments.filter((a) => a.challengeId === challengeId)
    toDelete.forEach((a) => deleteAssignment.mutate(a.id))
  }

  const fixedChallenge = useMemo(
    () => (base?.fixedChallengeId ? challenges.find((c) => c.id === base.fixedChallengeId) : null),
    [base?.fixedChallengeId, challenges],
  )

  const isDirty =
    localName !== (base?.name ?? '') ||
    localDescription !== (base?.description ?? '') ||
    localLat !== (base?.lat?.toString() ?? '') ||
    localLng !== (base?.lng?.toString() ?? '') ||
    localHidden !== (base?.hidden ?? false)

  const handleSave = () => {
    if (!base) return
    updateBase.mutate({
      baseId: base.id,
      dto: {
        name: localName,
        description: localDescription,
        lat: parseFloat(localLat) || 0,
        lng: parseFloat(localLng) || 0,
        hidden: localHidden,
        tagIds: base.tagIds,
        fixedChallengeId: base.fixedChallengeId,
      },
    })
  }

  if (!base) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Base not found
      </div>
    )
  }

  return (
    <div className="p-4 space-y-0" data-testid="base-detail">
      {/* Identity section */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Identity
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              data-testid="base-name-input"
              className="w-full h-8 px-3 text-sm rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              placeholder="Base description..."
              rows={2}
              data-testid="base-description-input"
              className="w-full px-3 py-2 text-sm rounded-md bg-background border border-border text-foreground resize-none"
            />
          </div>
          <LocationPicker
            lat={parseFloat(localLat) || 0}
            lng={parseFloat(localLng) || 0}
            mapStyle={game?.tileSource ? getStyleUrl(game.tileSource) : undefined}
            onChange={(newLat, newLng) => {
              setLocalLat(newLat.toString())
              setLocalLng(newLng.toString())
            }}
          />
          <div className="flex gap-2 mt-1">
            <span className="text-xs text-muted-foreground font-mono">
              {(parseFloat(localLat) || 0).toFixed(4)}, {(parseFloat(localLng) || 0).toFixed(4)}
            </span>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">NFC</label>
            {base.nfcLinked ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                NFC linked
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/20 text-destructive">
                No NFC tag
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Visibility section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Visibility
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setLocalHidden(false)}
            data-testid="visibility-visible"
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              !localHidden
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            Visible
          </button>
          <button
            onClick={() => setLocalHidden(true)}
            data-testid="visibility-hidden"
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              localHidden
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-background text-muted-foreground border border-border hover:text-foreground'
            }`}
          >
            Hidden
          </button>
        </div>
      </section>

      {/* Tags section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Tags
        </h3>
        <TagPicker
          gameId={gameId}
          selectedTagIds={base.tagIds ?? []}
          onChange={(tagIds) => {
            updateBase.mutate({
              baseId: base.id,
              dto: {
                name: base.name,
                description: base.description,
                lat: base.lat,
                lng: base.lng,
                hidden: base.hidden,
                tagIds,
                fixedChallengeId: base.fixedChallengeId,
              },
            })
          }}
        />
      </section>

      {/* Fixed Challenge */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Fixed Challenge</h3>
          <span className="text-xs text-muted-foreground">Prevents random assignment</span>
        </div>
        {fixedChallenge ? (
          <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              <button
                onClick={() => selectChallenge(fixedChallenge.id)}
                className="text-sm text-primary hover:underline cursor-pointer"
                data-testid="fixed-challenge-link"
              >
                {fixedChallenge.title}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No fixed challenge -- uses assignment rules
          </p>
        )}
      </section>

      {/* Challenges at this base */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Challenges at this base{' '}
            <span className="font-normal">({baseChallenges.length})</span>
          </h3>
          <div className="relative" ref={linkDropdownRef}>
            <button
              onClick={() => setShowLinkDropdown((v) => !v)}
              disabled={unlinkedChallenges.length === 0}
              data-testid="link-challenge-btn"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
              Link Challenge
              <ChevronDown className="h-3 w-3" />
            </button>
            {showLinkDropdown && unlinkedChallenges.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                {unlinkedChallenges.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleLinkChallenge(c.id)}
                    data-testid={`link-challenge-option-${c.id}`}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span className="truncate">{c.title}</span>
                    <span className="shrink-0 ml-2 text-xs text-muted-foreground">
                      {c.points}pts
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {baseChallenges.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No challenges linked to this base
          </p>
        ) : (
          <div className="space-y-2" data-testid="challenges-at-base">
            {baseChallenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                baseId={baseId}
                assignments={baseAssignments}
                teams={teams}
                onSelect={() => selectChallenge(challenge.id)}
                onUnlink={() => handleUnlinkChallenge(challenge.id)}
                onCreateAssignment={(dto) => createAssignment.mutate(dto)}
                onDeleteAssignment={(id) => deleteAssignment.mutate(id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Save button */}
      {isDirty && (
        <div className="border-t border-border pt-4 mt-4">
          <button
            onClick={handleSave}
            disabled={updateBase.isPending}
            data-testid="save-base-btn"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {updateBase.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          onClick={() => {
            if (confirm('Delete this base?')) {
              deleteBase.mutate(baseId, { onSuccess: () => selectBase(null) })
            }
          }}
          data-testid="delete-base-btn"
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          Delete base
        </button>
      </div>
    </div>
  )
}

interface ChallengeCardProps {
  challenge: Challenge
  baseId: string
  assignments: Assignment[]
  teams: Team[]
  onSelect: () => void
  onUnlink: () => void
  onCreateAssignment: (dto: { baseId: string; challengeId: string; teamId?: string }) => void
  onDeleteAssignment: (assignmentId: string) => void
}

function ChallengeCard({ challenge, baseId, assignments, teams, onSelect, onUnlink, onCreateAssignment, onDeleteAssignment }: ChallengeCardProps) {
  const typeBadge = ANSWER_TYPE_BADGE[challenge.answerType] ?? ANSWER_TYPE_BADGE.text
  const [showTeamPicker, setShowTeamPicker] = useState(false)

  const challengeAssignments = assignments.filter((a) => a.challengeId === challenge.id)
  const isGlobal = challengeAssignments.some((a) => !a.teamId)
  const assignedTeamIds = useMemo(
    () => new Set(challengeAssignments.filter((a) => a.teamId).map((a) => a.teamId)),
    [challengeAssignments],
  )
  const assignedTeams = challengeAssignments
    .filter((a) => a.teamId)
    .map((a) => teams.find((t) => t.id === a.teamId))
    .filter(Boolean) as Team[]

  const handleSwitchToSpecific = useCallback(() => {
    // Delete the global (teamId=null) assignment, create one per team
    const globalAssignments = challengeAssignments.filter((a) => !a.teamId)
    globalAssignments.forEach((a) => onDeleteAssignment(a.id))
    teams.forEach((team) => {
      onCreateAssignment({ baseId, challengeId: challenge.id, teamId: team.id })
    })
  }, [challengeAssignments, teams, baseId, challenge.id, onCreateAssignment, onDeleteAssignment])

  const handleSwitchToAll = useCallback(() => {
    // Delete all team-specific assignments, create one global
    const teamAssignments = challengeAssignments.filter((a) => a.teamId)
    teamAssignments.forEach((a) => onDeleteAssignment(a.id))
    onCreateAssignment({ baseId, challengeId: challenge.id })
    setShowTeamPicker(false)
  }, [challengeAssignments, baseId, challenge.id, onCreateAssignment, onDeleteAssignment])

  const handleToggleTeam = useCallback((teamId: string) => {
    if (assignedTeamIds.has(teamId)) {
      // Remove this team's assignment
      const toRemove = challengeAssignments.find((a) => a.teamId === teamId)
      if (toRemove) onDeleteAssignment(toRemove.id)
    } else {
      // Add assignment for this team
      onCreateAssignment({ baseId, challengeId: challenge.id, teamId })
    }
  }, [assignedTeamIds, challengeAssignments, baseId, challenge.id, onCreateAssignment, onDeleteAssignment])

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      {/* Challenge row */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSelect}
          data-testid={`challenge-link-${challenge.id}`}
          className="text-sm font-medium text-primary hover:underline cursor-pointer text-left truncate"
        >
          {challenge.title}
        </button>
        <span
          className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeBadge.bg} ${typeBadge.text}`}
        >
          {typeBadge.label}
        </span>
        <span className="shrink-0 text-xs font-semibold text-primary ml-auto">
          {challenge.points}pts
        </span>
        <button
          onClick={onSelect}
          className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={onUnlink}
          data-testid={`unlink-challenge-${challenge.id}`}
          className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          title="Remove challenge from this base"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Team assignment pills */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-muted-foreground mr-0.5">Assigned to:</span>
        {isGlobal ? (
          <button
            onClick={teams.length > 0 ? handleSwitchToSpecific : undefined}
            disabled={teams.length === 0}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/20 text-primary cursor-pointer hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={teams.length > 0 ? 'Click to assign to specific teams' : 'Create teams first'}
          >
            <Users className="h-2.5 w-2.5" />
            All teams
          </button>
        ) : (
          <>
            <button
              onClick={handleSwitchToAll}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors"
              title="Switch to all teams"
            >
              <Users className="h-2.5 w-2.5" />
              All
            </button>
            {assignedTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => handleToggleTeam(team.id)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:opacity-70 transition-opacity"
                style={{
                  backgroundColor: `${team.color}15`,
                  color: team.color,
                  border: `1px solid ${team.color}40`,
                }}
                title={`Remove ${team.name}`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                {team.name}
                <X className="h-2 w-2 ml-0.5" />
              </button>
            ))}
            <button
              onClick={() => setShowTeamPicker((v) => !v)}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
              title="Add team"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </>
        )}
      </div>

      {/* Team picker dropdown */}
      {showTeamPicker && !isGlobal && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {teams
            .filter((t) => !assignedTeamIds.has(t.id))
            .map((team) => (
              <button
                key={team.id}
                onClick={() => handleToggleTeam(team.id)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium cursor-pointer border border-dashed transition-colors hover:opacity-80"
                style={{
                  borderColor: `${team.color}60`,
                  color: team.color,
                }}
                title={`Add ${team.name}`}
              >
                <Plus className="h-2 w-2" />
                {team.name}
              </button>
            ))}
          {teams.filter((t) => !assignedTeamIds.has(t.id)).length === 0 && (
            <span className="text-[10px] text-muted-foreground italic">All teams assigned</span>
          )}
        </div>
      )}
    </div>
  )
}
