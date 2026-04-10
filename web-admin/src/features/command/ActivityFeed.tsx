import { useState, useMemo, useCallback } from 'react'
import { CheckCircle, XCircle, Download } from 'lucide-react'
import { GlassPanel } from '@/components/layout/GlassPanel'
import { useActivityFeed } from '@/hooks/queries/useMonitoring'
import { useSubmissions } from '@/hooks/queries/useSubmissions'
import { useTeams } from '@/hooks/queries/useTeams'
import { useReviewSubmission } from '@/hooks/mutations/useSubmissionMutations'
import { relativeTime } from '@/lib/utils/dates'
import type { ActivityEvent } from '@/types'

type EventType = ActivityEvent['type']

const typeColors: Record<string, string> = {
  check_in: '#22c55e',
  submission: '#f59e0b',
  approval: '#a855f6',
  rejection: '#ef4444',
}

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

  const color = typeColors[event.type] ?? '#71717a'

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
      className="px-3 py-2 border-b border-border/30"
      style={{
        borderLeftWidth: 2,
        borderLeftColor: color,
        borderLeftStyle: 'solid',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-semibold uppercase"
          style={{ color }}
        >
          {event.type.replace('_', ' ')}
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {relativeTime(event.timestamp)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
        {event.message}
      </p>
      {showActions && (
        <div className="flex items-center gap-2 mt-1.5">
          <button
            data-testid="inline-approve"
            onClick={() => {
              reviewMutation.mutate({
                submissionId: matchingPending.id,
                status: 'approved',
                points: matchingPending.points,
              })
              setActed(true)
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 transition-colors cursor-pointer"
          >
            <CheckCircle size={12} />
            Approve
          </button>
          <button
            data-testid="inline-reject"
            onClick={() => {
              reviewMutation.mutate({
                submissionId: matchingPending.id,
                status: 'rejected',
              })
              setActed(true)
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors cursor-pointer"
          >
            <XCircle size={12} />
            Reject
          </button>
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
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set())
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<number>(0)

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (typeFilter.size > 0 && !typeFilter.has(evt.type)) return false
      if (teamFilter && evt.teamId !== teamFilter) return false
      if (timeFilter > 0) {
        const cutoff = Date.now() - timeFilter * 60 * 1000
        if (new Date(evt.timestamp).getTime() < cutoff) return false
      }
      return true
    })
  }, [events, typeFilter, teamFilter, timeFilter])

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

  return (
    <GlassPanel
      data-testid="activity-feed"
      className="absolute top-14 right-3 bottom-3 w-[250px] z-20 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2 shrink-0">
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
            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
              typeFilter.size === 0
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            All
          </button>
          {allEventTypes.map((type) => {
            const c = typeColors[type] ?? '#71717a'
            const isActive = typeFilter.has(type)
            return (
              <button
                key={type}
                data-testid={`filter-${type}`}
                onClick={() => toggleType(type)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  isActive ? '' : 'bg-muted text-muted-foreground'
                }`}
                style={
                  isActive
                    ? { backgroundColor: `${c}33`, color: c }
                    : undefined
                }
              >
                {type.replace('_', ' ')}
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
          <p
            data-testid="empty-activity"
            className="text-xs text-muted-foreground px-3 py-4 text-center"
          >
            No events to show.
          </p>
        ) : (
          filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} gameId={gameId} />
          ))
        )}
      </div>
    </GlassPanel>
  )
}
