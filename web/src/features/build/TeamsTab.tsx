import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTeams } from '@/hooks/queries/useTeams'
import { useWorkspaceStore } from '@/stores/workspace'
import { Spinner } from '@/components/feedback/Spinner'
import { TeamDetail } from './TeamDetail'
import type { Team } from '@/types/v2'

function TeamListItem({
  team,
  isSelected,
  onSelect,
}: {
  team: Team
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      data-testid={`team-item-${team.id}`}
      className={`w-full text-left px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
        isSelected
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-muted/50 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: team.color }}
        />
        <span className="text-sm font-medium text-foreground truncate">
          {team.name}
        </span>
      </div>
      <div className="mt-0.5 ml-5 text-xs text-muted-foreground font-mono">
        {team.joinCode}
      </div>
    </button>
  )
}

interface TeamsTabProps {
  gameId: string
}

export function TeamsTab({ gameId }: TeamsTabProps) {
  const { t } = useTranslation()
  const { data: teams = [], isLoading, isError, refetch } = useTeams(gameId)

  const selectedTeamId = useWorkspaceStore((s) => s.selectedTeamId)
  const selectTeam = useWorkspaceStore((s) => s.selectTeam)

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  )

  return (
    <div className="flex flex-1 min-h-0" data-testid="teams-tab">
      {/* Left panel -- team list */}
      <div className="w-56 border-r border-border flex flex-col shrink-0">
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {isLoading && <Spinner />}
          {!isLoading && isError && (
            <div className="px-3 py-6 text-xs text-destructive text-center space-y-2">
              <p>{t('common.error')}</p>
              <button
                onClick={() => refetch()}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
          {!isLoading && !isError && sortedTeams.map((team) => (
            <TeamListItem
              key={team.id}
              team={team}
              isSelected={selectedTeamId === team.id}
              onSelect={() => selectTeam(team.id)}
            />
          ))}
          {!isLoading && !isError && sortedTeams.length === 0 && (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              {t('build.noTeamsYet')}
            </div>
          )}
        </div>
      </div>

      {/* Right panel -- detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedTeamId ? (
          <TeamDetail teamId={selectedTeamId} gameId={gameId} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('build.selectTeamPrompt')}
          </div>
        )}
      </div>
    </div>
  )
}
