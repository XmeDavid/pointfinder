import { useState, useCallback } from 'react'
import { useLeaderboard, useResultsExport } from '@/hooks/queries/useMonitoring'
import { monitoringApi } from '@/lib/api/monitoring'
import { cn } from '@/lib/utils'
import Standings from './Standings'
import TeamBreakdown from './TeamBreakdown'
import GameStatistics from './GameStatistics'

type ResultsTab = 'standings' | 'breakdown' | 'statistics'

const tabs: Array<{ key: ResultsTab; label: string }> = [
  { key: 'standings', label: 'Standings' },
  { key: 'breakdown', label: 'Breakdown' },
  { key: 'statistics', label: 'Statistics' },
]

interface Props {
  gameId: string
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResultsOverlay({ gameId }: Props) {
  const [activeTab, setActiveTab] = useState<ResultsTab>('standings')
  const { data: leaderboard } = useLeaderboard(gameId)
  const { data: resultsExport } = useResultsExport(gameId)

  const exportStandings = useCallback(() => {
    if (!leaderboard) return

    const ranked = leaderboard.slice().sort((a, b) => b.points - a.points)
    const header = 'rank,team,score,completed_challenges\n'
    const rows = ranked
      .map(
        (t, i) =>
          `${i + 1},"${t.teamName}",${t.points},${t.completedChallenges}`,
      )
      .join('\n')

    downloadBlob(new Blob([header + rows], { type: 'text/csv' }), 'standings.csv')
  }, [leaderboard])

  const exportDetailed = useCallback(() => {
    if (!resultsExport) return

    const { challenges, teams } = resultsExport
    const header =
      ['team', ...challenges.map((c) => `"${c.title}"`), 'Total'].join(',') +
      '\n'
    const rows = teams
      .map((team) => {
        const pointsPerChallenge = challenges.map(
          (ch) => team.challengePoints[ch.id] ?? 0,
        )
        const total = team.totalPoints
        return [`"${team.teamName}"`, ...pointsPerChallenge, total].join(',')
      })
      .join('\n')
    const maxRow =
      [
        'Max Points',
        ...challenges.map((c) => c.maxPoints),
        challenges.reduce((a, c) => a + c.maxPoints, 0),
      ].join(',') + '\n'

    downloadBlob(
      new Blob([header + rows + '\n' + maxRow], { type: 'text/csv' }),
      'detailed-results.csv',
    )
  }, [resultsExport])

  const exportAuditLog = useCallback(async () => {
    try {
      const blob = await monitoringApi.exportAuditLog(gameId, { format: 'csv' })
      downloadBlob(blob, 'audit-log.csv')
    } catch {
      // Errors are surfaced by the API layer; no-op here
    }
  }, [gameId])

  return (
    <div
      className="absolute top-14 left-3 right-3 bottom-3 z-20 bg-card/95 backdrop-blur-xl border border-border rounded-xl flex flex-col overflow-hidden"
      data-testid="results-overlay"
    >
      {/* Tab bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border/50">
        {/* Tab pills */}
        <div className="flex items-center gap-1">
          {tabs.map(({ key, label }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                data-testid={`tab-${key}`}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Export buttons */}
        <button
          onClick={exportStandings}
          data-testid="export-csv"
          className="px-3 py-1.5 text-sm rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Export CSV
        </button>
        <button
          onClick={exportDetailed}
          data-testid="export-detailed"
          className="px-3 py-1.5 text-sm rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Export Detailed
        </button>
        <button
          onClick={exportAuditLog}
          data-testid="export-audit"
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Export Audit Log
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'standings' && <Standings gameId={gameId} />}
        {activeTab === 'breakdown' && <TeamBreakdown gameId={gameId} />}
        {activeTab === 'statistics' && <GameStatistics gameId={gameId} />}
      </div>
    </div>
  )
}
