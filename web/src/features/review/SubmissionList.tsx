import { useState, useMemo } from 'react'
import { FileText, Image, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useWorkspaceStore } from '@/stores/workspace'
import { Spinner } from '@/components/feedback/Spinner'
import { relativeTime } from '@/lib/utils/dates'
import type { Submission, SubmissionStatus } from '@/types'

type FilterOption = 'pending' | 'all' | 'approved' | 'rejected'

function filterColor(filter: FilterOption, active: boolean): string {
  if (!active) return 'text-muted-foreground hover:text-foreground'
  switch (filter) {
    case 'pending':
      return 'bg-warning/20 text-warning'
    case 'approved':
      return 'bg-success/20 text-success'
    case 'rejected':
      return 'bg-destructive/20 text-destructive'
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
      return 'border-l-2 border-success'
    case 'rejected':
      return 'border-l-2 border-destructive'
  }
}

function SubmissionTypeIcon({ submission }: { submission: Submission }) {
  const urls = submission.fileUrls?.length
    ? submission.fileUrls
    : submission.fileUrl
      ? [submission.fileUrl]
      : []
  const hasVideo = urls.some((u) => /\.(mp4|mov)$/i.test(u))
  const hasImage = urls.some((u) => /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(u))
  const hasText = !!submission.answer

  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      {hasText && <FileText className="h-3 w-3" />}
      {hasImage && <Image className="h-3 w-3" />}
      {hasVideo && <Video className="h-3 w-3" />}
    </span>
  )
}

interface SubmissionListProps {
  gameId: string
}

export default function SubmissionList({ gameId }: SubmissionListProps) {
  const { t } = useTranslation()
  const {
    data: submissions = [],
    isLoading,
    isError,
    refetch,
  } = useSubmissions(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: challenges = [] } = useChallenges(gameId)
  const selectedSubmissionId = useWorkspaceStore((s) => s.selectedSubmissionId)
  const selectSubmission = useWorkspaceStore((s) => s.selectSubmission)

  const [filter, setFilter] = useState<FilterOption>('pending')
  const [teamFilter, setTeamFilter] = useState<string>('')

  const filterOptions: Array<{ value: FilterOption; label: string }> = useMemo(
    () => [
      { value: 'pending', label: t('review.filters.pending') },
      { value: 'all', label: t('review.filters.all') },
      { value: 'approved', label: t('review.filters.approved') },
      { value: 'rejected', label: t('review.filters.rejected') },
    ],
    [t],
  )

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
    <div className="w-full md:w-[280px] h-full min-h-0 border-r border-border flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">
            {t('review.title')}
          </span>
          <span className="text-xs text-muted-foreground">
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
          className="w-full px-2 py-1 text-xs bg-muted border border-border rounded text-foreground"
        >
          <option value="">{t('review.allTeams')}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <div className="py-6">
            <Spinner />
          </div>
        )}

        {!isLoading && isError && (
          <div className="text-center text-destructive text-xs py-8 space-y-2">
            <p>{t('review.loadError')}</p>
            <button
              onClick={() => refetch()}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              {t('review.retry')}
            </button>
          </div>
        )}

        {!isLoading && !isError && filteredSubmissions.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-8">
            {filter === 'pending'
              ? t('review.emptyPending')
              : t('review.emptyFilter')}
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
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted/50'
              }`}
            >
              {/* Team row */}
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: team?.color ?? '#888' }}
                />
                <span className="text-xs font-medium text-foreground truncate">
                  {team?.name ?? t('review.unknownTeam')}
                </span>
              </div>

              {/* Challenge name */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] text-muted-foreground truncate">
                  {challenge?.title ?? t('review.unknownChallenge')}
                </span>
              </div>

              {/* Type + Timestamp */}
              <div className="flex items-center gap-1.5">
                <SubmissionTypeIcon submission={sub} />
                <span className="text-[10px] text-muted-foreground">
                  {relativeTime(sub.submittedAt)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
