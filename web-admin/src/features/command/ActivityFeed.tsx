import { useState, useMemo, useCallback } from 'react'
import { CheckCircle, XCircle, Download, ChevronDown, Activity } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import {
  ActivityEventBadge,
  StatusBadge,
  activityEventBorderClass,
  activityEventLabel,
  activityEventTone,
} from '@/components/status'
import { useActivityFeed } from '@/hooks/queries/useMonitoring'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { useIsMobile } from '@/hooks/ui/useMediaQuery'
import { relativeTime } from '@/lib/utils/dates'
import type { ActivityEvent } from '@/types'

type EventType = ActivityEvent['type']

const allEventTypes: EventType[] = ['check_in', 'submission', 'approval', 'rejection']

function EventCard({
  event,
  gameId,
}: {
  event: ActivityEvent
  gameId: string
}) {
  const [acted, setActed] = useState(false)
  const { data: submissions } = useSubmissions(gameId)
  const reviewMutation = useReviewSubmission(gameId)

  const matchingPending = useMemo(() => {
    if (event.type !== 'submission' || !submissions) return null
    return submissions.find(
      (s) =>
        s.status === 'pending' &&
        s.teamId === event.teamId &&
        s.baseId === event.baseId &&
        s.challengeId === event.challengeId,
    )
  }, [submissions, event])

  const showActions = matchingPending && !acted

  return (
    <div
      data-testid="activity-event"
      className={`border-b border-l-2 border-border/30 px-3 py-2 ${activityEventBorderClass[event.type]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <ActivityEventBadge status={event.type} />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {relativeTime(event.timestamp)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
        {event.message}
      </p>
      {showActions && (
        <div className="flex items-center gap-2 mt-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="inline-approve"
            onClick={() => {
              reviewMutation.mutate({
                submissionId: matchingPending.id,
                status: 'approved',
                points: matchingPending.points,
              })
              setActed(true)
            }}
            className="h-auto gap-1 border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success hover:bg-success/20 hover:text-success"
          >
            <CheckCircle size={12} />
            Approve
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="inline-reject"
            onClick={() => {
              reviewMutation.mutate({
                submissionId: matchingPending.id,
                status: 'rejected',
              })
              setActed(true)
            }}
            className="h-auto gap-1 border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/20 hover:text-destructive"
          >
            <XCircle size={12} />
            Reject
          </Button>
        </div>
      )}
      {acted && (
        <span className="text-xs text-muted-foreground mt-1 inline-block">
          Done
        </span>
      )}
    </div>
  )
}

export function ActivityFeed({ gameId }: { gameId: string }) {
  const { data: events = [] } = useActivityFeed(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const isMobile = useIsMobile()
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set())
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<number>(0)

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (typeFilter.size > 0 && !typeFilter.has(evt.type)) return false
      if (teamFilter && evt.teamId !== teamFilter) return false
      if (timeFilter > 0) {
        // eslint-disable-next-line react-hooks/purity
        const cutoff = Date.now() - timeFilter * 60 * 1000
        if (new Date(evt.timestamp).getTime() < cutoff) return false
      }
      return true
    })
  }, [events, typeFilter, teamFilter, timeFilter])

  const pendingCount = useMemo(() => {
    return events.filter((e) => e.type === 'submission').length
  }, [events])

  const toggleType = useCallback((type: EventType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const exportCsv = useCallback(() => {
    const header = 'timestamp,type,team,message\n'
    const rows = filteredEvents
      .map((e) => {
        const team = teams.find((t) => t.id === e.teamId)
        return `"${e.timestamp}","${e.type}","${team?.name || ''}","${e.message.replace(/"/g, '""')}"`
      })
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'activity-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredEvents, teams])

  // Mobile: collapsed badge to toggle bottom sheet
  if (isMobile && !mobileExpanded) {
    return (
      <OverlayPanel
        as="button"
        data-testid="activity-feed-toggle"
        onClick={() => setMobileExpanded(true)}
        padding="none"
        shape="pill"
        className="absolute bottom-20 right-3 z-20 flex cursor-pointer items-center gap-1.5 px-3 py-2"
      >
        <Activity size={16} className="text-primary" />
        <span className="text-xs font-semibold">Activity</span>
        {pendingCount > 0 && (
          <StatusBadge tone="info" label={pendingCount} size="sm" className="ml-1" />
        )}
      </OverlayPanel>
    )
  }

  return (
    <OverlayPanel
      data-testid="activity-feed"
      padding="none"
      shape={isMobile ? 'sheet' : 'default'}
      className={
        isMobile
          ? 'absolute left-0 right-0 bottom-14 max-h-[50vh] z-20 flex flex-col overflow-hidden'
          : 'absolute top-14 right-3 bottom-3 w-[250px] z-20 flex flex-col overflow-hidden'
      }
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2 shrink-0">
        {/* Mobile drag handle */}
        {isMobile && (
          <button
            data-testid="activity-feed-collapse"
            onClick={() => setMobileExpanded(false)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronDown size={16} />
          </button>
        )}
        <span className="text-sm font-semibold flex-1">Live Activity</span>
        <button
          data-testid="export-csv"
          onClick={exportCsv}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Export CSV"
        >
          <Download size={14} />
        </button>
      </div>

      {/* Filters */}
      <div className="px-3 py-2 border-b border-border/30 space-y-2 shrink-0">
        {/* Type filter pills */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button
            data-testid="filter-all"
            onClick={() => setTypeFilter(new Set())}
            className="cursor-pointer whitespace-nowrap"
          >
            <StatusBadge
              tone={typeFilter.size === 0 ? 'info' : 'muted'}
              label="All"
              size="sm"
            />
          </button>
          {allEventTypes.map((type) => {
            const isActive = typeFilter.has(type)
            return (
              <button
                key={type}
                data-testid={`filter-${type}`}
                onClick={() => toggleType(type)}
                className="cursor-pointer whitespace-nowrap"
              >
                <StatusBadge
                  tone={isActive ? activityEventTone[type] : 'muted'}
                  label={activityEventLabel[type]}
                  size="sm"
                />
              </button>
            )
          })}
        </div>

        {/* Team filter */}
        <select
          data-testid="team-filter"
          value={teamFilter ?? ''}
          onChange={(e) => setTeamFilter(e.target.value || null)}
          className="bg-muted border-border text-muted-foreground text-xs rounded px-2 py-1 w-full"
        >
          <option value="">All teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        {/* Time filter */}
        <div className="flex items-center gap-1">
          {([
            { label: 'All', value: 0 },
            { label: '30m', value: 30 },
            { label: '1h', value: 60 },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              data-testid={`time-filter-${opt.label.toLowerCase()}`}
              onClick={() => setTimeFilter(opt.value)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                timeFilter === opt.value
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <EmptyState
            data-testid="empty-activity"
            density="compact"
            title={
              typeFilter.size > 0 || teamFilter || timeFilter > 0
                ? 'No events match your filters. Try broadening your selection.'
                : 'No activity yet. Events will appear here once teams start playing.'
            }
          />
        ) : (
          filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} gameId={gameId} />
          ))
        )}
      </div>
    </OverlayPanel>
  )
}
