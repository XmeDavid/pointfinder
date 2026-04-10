import { useState, useMemo } from 'react'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useWorkspaceStore } from '@/stores/workspace'
import { relativeTime } from '@/lib/utils/dates'
import type { SubmissionStatus } from '@/types'

type FilterOption = 'pending' | 'all' | 'approved' | 'rejected'

const filterOptions: Array<{ value: FilterOption; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function filterColor(filter: FilterOption, active: boolean): string {
  if (!active) return 'text-text-muted hover:text-text-secondary'
  switch (filter) {
    case 'pending':
      return 'bg-warning/20 text-warning'
    case 'approved':
      return 'bg-accent/20 text-accent'
    case 'rejected':
      return 'bg-danger/20 text-danger'
    case 'all':
      return 'bg-info/20 text-info'
  }
}

function statusBorderClass(status: SubmissionStatus): string {
  switch (status) {
    case 'pending':
      return 'border-l-2 border-warning'
    case 'approved':
    case 'correct':
      return 'border-l-2 border-accent'
    case 'rejected':
      return 'border-l-2 border-danger'
  }
}

interface SubmissionListProps {
  gameId: string
}

export default function SubmissionList({ gameId }: SubmissionListProps) {
  const { data: submissions = [] } = useSubmissions(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const selectedSubmissionId = useWorkspaceStore((s) => s.selectedSubmissionId)
  const selectSubmission = useWorkspaceStore((s) => s.selectSubmission)

  const [filter, setFilter] = useState<FilterOption>('pending')
  const [teamFilter, setTeamFilter] = useState<string>('')

  const filteredSubmissions = useMemo(() => {
    let subs = [...submissions]
    if (filter !== 'all') {
      subs = subs.filter((s) => s.status === filter)
    }
    if (teamFilter) {
      subs = subs.filter((s) => s.teamId === teamFilter)
    }
    // newest first
    return subs.sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    )
  }, [submissions, filter, teamFilter])

  return (
    <div className="w-[280px] border-r border-border flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-text-primary">
            Submissions
          </span>
          <span className="text-xs text-text-muted">
            {filteredSubmissions.length}
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 mb-2">
          {filterOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              data-testid={`filter-${value}`}
              className={`px-2 py-0.5 text-[11px] rounded-full transition-colors cursor-pointer ${filterColor(value, filter === value)}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Team filter */}
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          data-testid="team-filter"
          className="w-full px-2 py-1 text-xs bg-surface border border-border rounded text-text-primary"
        >
          <option value="">All teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredSubmissions.length === 0 && (
          <div className="text-center text-text-muted text-xs py-8">
            No submissions match this filter.
          </div>
        )}

        {filteredSubmissions.map((sub) => {
          const team = teams.find((t) => t.id === sub.teamId)
          const challenge = challenges.find((c) => c.id === sub.challengeId)
          const isSelected = selectedSubmissionId === sub.id

          return (
            <button
              key={sub.id}
              onClick={() => selectSubmission(sub.id)}
              data-testid={`submission-card-${sub.id}`}
              className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${statusBorderClass(sub.status)} ${
                isSelected
                  ? 'bg-accent/10 border border-accent/30'
                  : 'hover:bg-elevated/50'
              }`}
            >
              {/* Team row */}
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: team?.color ?? '#888' }}
                />
                <span className="text-xs font-medium text-text-primary truncate">
                  {team?.name ?? 'Unknown'}
                </span>
              </div>

              {/* Challenge name */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] text-text-secondary truncate">
                  {challenge?.title ?? 'Unknown'}
                </span>
              </div>

              {/* Timestamp */}
              <span className="text-[10px] text-text-muted">
                {relativeTime(sub.submittedAt)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
