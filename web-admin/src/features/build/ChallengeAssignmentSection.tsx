import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, X, Plus, Users } from 'lucide-react'
import { useCreateAssignment, useDeleteAssignment } from '@/hooks/mutations/useAssignmentMutations'
import { cn } from '@/lib/utils'
import type { Assignment, Base, Team } from '@/types/v2'

interface ChallengeAssignmentSectionProps {
  gameId: string
  challengeId: string
  assignments: Assignment[]
  bases: Base[]
  teams: Team[]
  onNavigateToBase: (baseId: string) => void
}

export function ChallengeAssignmentSection({
  gameId,
  challengeId,
  assignments,
  bases,
  teams,
  onNavigateToBase,
}: ChallengeAssignmentSectionProps) {
  const createAssignment = useCreateAssignment(gameId)
  const deleteAssignmentMut = useDeleteAssignment(gameId)

  const [showBaseDropdown, setShowBaseDropdown] = useState(false)
  const [showTeamPicker, setShowTeamPicker] = useState(false)
  const baseDropdownRef = useRef<HTMLDivElement>(null)

  const challengeAssignments = useMemo(
    () => assignments.filter((a) => a.challengeId === challengeId),
    [assignments, challengeId],
  )

  const assignedBaseIds = useMemo(
    () => new Set(challengeAssignments.map((a) => a.baseId)),
    [challengeAssignments],
  )

  const assignedBase = useMemo(
    () => bases.find((b) => assignedBaseIds.has(b.id)),
    [bases, assignedBaseIds],
  )

  const isGlobal = challengeAssignments.some((a) => !a.teamId)
  const assignedTeamIds = useMemo(
    () => new Set(challengeAssignments.filter((a) => a.teamId).map((a) => a.teamId)),
    [challengeAssignments],
  )

  // Close dropdown on outside click
  useEffect(() => {
    if (!showBaseDropdown) return
    const handler = (e: MouseEvent) => {
      if (baseDropdownRef.current && !baseDropdownRef.current.contains(e.target as Node)) {
        setShowBaseDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBaseDropdown])

  const handleAssignToBase = useCallback((baseId: string) => {
    challengeAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
    createAssignment.mutate({ baseId, challengeId })
    setShowBaseDropdown(false)
  }, [challengeAssignments, challengeId, createAssignment, deleteAssignmentMut])

  const handleRemoveBaseAssignment = useCallback(() => {
    challengeAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
  }, [challengeAssignments, deleteAssignmentMut])

  const handleSwitchToSpecific = useCallback(() => {
    if (!assignedBase || teams.length === 0) return
    const globalAssignments = challengeAssignments.filter((a) => !a.teamId)
    globalAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
    teams.forEach((team) => {
      createAssignment.mutate({ baseId: assignedBase.id, challengeId, teamId: team.id })
    })
  }, [challengeAssignments, teams, assignedBase, challengeId, createAssignment, deleteAssignmentMut])

  const handleSwitchToAll = useCallback(() => {
    if (!assignedBase) return
    const teamAssignments = challengeAssignments.filter((a) => a.teamId)
    teamAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
    createAssignment.mutate({ baseId: assignedBase.id, challengeId })
    setShowTeamPicker(false)
  }, [challengeAssignments, assignedBase, challengeId, createAssignment, deleteAssignmentMut])

  const handleToggleTeam = useCallback((teamId: string) => {
    if (!assignedBase) return
    if (assignedTeamIds.has(teamId)) {
      const toRemove = challengeAssignments.find((a) => a.teamId === teamId)
      if (toRemove) deleteAssignmentMut.mutate(toRemove.id)
    } else {
      createAssignment.mutate({ baseId: assignedBase.id, challengeId, teamId })
    }
  }, [assignedTeamIds, challengeAssignments, assignedBase, challengeId, createAssignment, deleteAssignmentMut])

  return (
    <section className="border-t border-border pt-4 mt-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Assignment
      </h3>
      <div className="space-y-3">
        {/* Assigned at base */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Assigned at:
          </label>
          {assignedBase ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToBase(assignedBase.id)}
                className="text-sm text-primary hover:underline cursor-pointer"
                data-testid="assigned-base-link"
              >
                {assignedBase.name}
              </button>
              <div className="relative" ref={baseDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowBaseDropdown((v) => !v)}
                  data-testid="change-base-btn"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Change
                </button>
                {showBaseDropdown && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {bases.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => handleAssignToBase(b.id)}
                        data-testid={`assign-base-option-${b.id}`}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer',
                          b.id === assignedBase.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-muted',
                        )}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRemoveBaseAssignment}
                data-testid="remove-base-assignment-btn"
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="Remove assignment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="relative" ref={!assignedBase ? baseDropdownRef : undefined}>
              <button
                type="button"
                onClick={() => setShowBaseDropdown((v) => !v)}
                disabled={bases.length === 0}
                data-testid="assign-to-base-btn"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Assign to base
                <ChevronDown className="h-3 w-3" />
              </button>
              {showBaseDropdown && bases.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                  {bases.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handleAssignToBase(b.id)}
                      data-testid={`assign-base-option-${b.id}`}
                      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Assigned to teams */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Assigned to:
          </label>
          {challengeAssignments.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No assignments
            </span>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {isGlobal ? (
                  <button
                    onClick={teams.length > 0 && assignedBase ? handleSwitchToSpecific : undefined}
                    disabled={teams.length === 0 || !assignedBase}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary cursor-pointer hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={teams.length > 0 ? 'Click to assign to specific teams' : 'Create teams first'}
                  >
                    <Users className="h-3 w-3" />
                    All teams
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSwitchToAll}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors"
                      title="Switch to all teams"
                    >
                      <Users className="h-3 w-3" />
                      All
                    </button>
                    {teams
                      .filter((t) => assignedTeamIds.has(t.id))
                      .map((team) => (
                        <button
                          key={team.id}
                          onClick={() => handleToggleTeam(team.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-70 transition-opacity"
                          style={{
                            backgroundColor: `${team.color}15`,
                            color: team.color,
                            border: `1px solid ${team.color}40`,
                          }}
                          title={`Remove ${team.name}`}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: team.color }}
                          />
                          {team.name}
                          <X className="h-2.5 w-2.5 ml-0.5" />
                        </button>
                      ))}
                    <button
                      onClick={() => setShowTeamPicker((v) => !v)}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      title="Add team"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              {showTeamPicker && !isGlobal && (
                <div className="flex flex-wrap gap-1.5">
                  {teams
                    .filter((t) => !assignedTeamIds.has(t.id))
                    .map((team) => (
                      <button
                        key={team.id}
                        onClick={() => handleToggleTeam(team.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer border border-dashed transition-colors hover:opacity-80"
                        style={{
                          borderColor: `${team.color}60`,
                          color: team.color,
                        }}
                        title={`Add ${team.name}`}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {team.name}
                      </button>
                    ))}
                  {teams.filter((t) => !assignedTeamIds.has(t.id)).length === 0 && (
                    <span className="text-xs text-muted-foreground italic">All teams assigned</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
