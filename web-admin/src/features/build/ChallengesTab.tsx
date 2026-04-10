import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useTeams } from '@/hooks/queries/useTeams'
import { useBases } from '@/hooks/queries/useBases'
import { useWorkspaceStore } from '@/stores/workspace'
import { SearchInput } from '@/components/data/SearchInput'
import { Badge } from '@/components/ui/badge'
import { ChallengeDetail } from './ChallengeDetail'
import { cn } from '@/lib/utils'
import type { Challenge, Assignment, Base, Team, AnswerType } from '@/types/v2'

const ANSWER_TYPE_STYLES: Record<AnswerType, { label: string; variant: 'default' | 'secondary' | 'info' | 'warning' }> = {
  text: { label: 'Text', variant: 'info' },
  file: { label: 'File', variant: 'warning' },
  none: { label: 'None', variant: 'secondary' },
}

interface ChallengeListItemProps {
  challenge: Challenge
  isSelected: boolean
  onSelect: () => void
  assignments: Assignment[]
  bases: Base[]
  teams: Team[]
}

function ChallengeListItem({
  challenge,
  isSelected,
  onSelect,
  assignments,
  bases,
  teams,
}: ChallengeListItemProps) {
  const challengeAssignments = assignments.filter(
    (a) => a.challengeId === challenge.id,
  )
  const isUnassigned = challengeAssignments.length === 0
  const isGlobal = challengeAssignments.some((a) => !a.teamId)
  const assignedTeamIds = new Set(
    challengeAssignments.filter((a) => a.teamId).map((a) => a.teamId),
  )

  // Find the base this challenge is assigned to
  const baseIds = new Set(challengeAssignments.map((a) => a.baseId))
  const assignedBase = bases.find((b) => baseIds.has(b.id))

  const badge = ANSWER_TYPE_STYLES[challenge.answerType]

  return (
    <button
      onClick={onSelect}
      data-testid={`challenge-item-${challenge.id}`}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md cursor-pointer transition-colors',
        isSelected
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-muted/50 border border-transparent',
        isUnassigned && 'border-l-2 border-l-warning',
      )}
    >
      {/* Name + type badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground truncate">
          {challenge.title}
        </span>
        <Badge variant={badge.variant} className="shrink-0 text-[10px] px-1.5 py-0">
          {badge.label}
        </Badge>
      </div>

      {/* Points */}
      <div className="mt-0.5">
        <span className="text-xs font-semibold text-primary">
          {challenge.points}pts
        </span>
      </div>

      {/* Base name or unassigned warning */}
      <div className="mt-0.5 text-xs text-muted-foreground">
        {assignedBase ? (
          assignedBase.name
        ) : (
          <span className="text-warning font-medium inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Unassigned
          </span>
        )}
      </div>

      {/* Team summary */}
      <div className="mt-1 flex items-center gap-1">
        {isUnassigned ? null : isGlobal ? (
          <span className="text-[10px] text-muted-foreground">All teams</span>
        ) : (
          <div className="flex items-center gap-0.5">
            {teams
              .filter((t) => assignedTeamIds.has(t.id))
              .map((team) => (
                <span
                  key={team.id}
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: team.color }}
                  title={team.name}
                />
              ))}
            <span className="text-[10px] text-muted-foreground ml-0.5">
              {assignedTeamIds.size} team{assignedTeamIds.size !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

interface ChallengesTabProps {
  gameId: string
}

export function ChallengesTab({ gameId }: ChallengesTabProps) {
  const [search, setSearch] = useState('')

  const { data: challenges = [] } = useChallenges(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: bases = [] } = useBases(gameId)

  const selectedChallengeId = useWorkspaceStore((s) => s.selectedChallengeId)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)

  const filtered = useMemo(() => {
    if (!search.trim()) return challenges
    const q = search.toLowerCase()
    return challenges.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    )
  }, [challenges, search])

  return (
    <div className="flex flex-1 min-h-0" data-testid="challenges-tab">
      {/* Left panel -- challenge list */}
      <div className="w-56 border-r border-border flex flex-col shrink-0">
        {/* Search */}
        <div className="p-2 border-b border-border">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search challenges..."
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.map((challenge) => (
            <ChallengeListItem
              key={challenge.id}
              challenge={challenge}
              isSelected={selectedChallengeId === challenge.id}
              onSelect={() => selectChallenge(challenge.id)}
              assignments={assignments}
              bases={bases}
              teams={teams}
            />
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              {search
                ? 'No challenges match your search'
                : 'No challenges yet'}
            </div>
          )}
        </div>
      </div>

      {/* Right panel -- detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedChallengeId ? (
          <ChallengeDetail
            challengeId={selectedChallengeId}
            gameId={gameId}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Select a challenge to view details
          </div>
        )}
      </div>
    </div>
  )
}
