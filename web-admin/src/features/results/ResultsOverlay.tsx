import { useState, useCallback } from 'react'
import { useLeaderboard, useResultsExport } from '@/hooks/queries/useMonitoring'
import { monitoringApi } from '@/lib/api/monitoring'
import Standings from './Standings'
import TeamBreakdown from './TeamBreakdown'
import GameStatistics from './GameStatistics'
import { OverlayPanel } from '@/components/layout/OverlayPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
    <OverlayPanel
      padding="none"
      className="absolute bottom-14 left-0 right-0 top-12 z-20 flex flex-col overflow-hidden rounded-none md:bottom-3 md:left-3 md:right-3 md:top-14 md:rounded-lg"
      data-testid="results-overlay"
    >
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 md:px-6 py-2 md:py-3 border-b border-border/50">
        {/* Tab pills */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ResultsTab)}>
          <TabsList>
            {tabs.map(({ key, label }) => <TabsTrigger key={key} value={key} data-testid={`tab-${key}`}>{label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        <div className="flex-1" />

        {/* Export buttons */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <Button
            onClick={exportStandings}
            data-testid="export-csv"
            variant="secondary"
            size="sm"
          >
            Export CSV
          </Button>
          <Button
            onClick={exportDetailed}
            data-testid="export-detailed"
            variant="secondary"
            size="sm"
          >
            Export Detailed
          </Button>
          <Button
            onClick={exportAuditLog}
            data-testid="export-audit"
            size="sm"
          >
            Audit Log
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        {activeTab === 'standings' && <Standings gameId={gameId} />}
        {activeTab === 'breakdown' && <TeamBreakdown gameId={gameId} />}
        {activeTab === 'statistics' && <GameStatistics gameId={gameId} />}
      </div>
    </OverlayPanel>
  )
}
