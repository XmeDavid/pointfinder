import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react'
import { useServices } from '@/app/player/services'
import { SurfacePanel } from '@/components/layout/SurfacePanel'
import { Button } from '@/components/ui/button'

/** The team's finalized result belongs to every member; game points stay in the game. */
export function GameResultCard({ gameId, stateVersion }: { gameId: string; stateVersion: number }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'experience' })
  const { client } = useServices()
  const reward = useQuery({
    queryKey: ['player-reward', gameId, stateVersion],
    queryFn: () => client.api.player.reward(gameId),
    refetchInterval: query => query.state.data?.state === 'pending' ? 3000 : false,
  })
  const result = reward.data
  return <SurfacePanel padding="md" className="pointer-events-auto" data-testid="player-game-result">
    <p className="flex items-center gap-2 text-sm font-semibold"><Flag size={16}/>{t('gameEnded')}</p>
    {reward.isError ? <div role="alert" className="mt-2 text-sm">{t('resultUnavailable')}<Button variant="ghost" size="sm" onClick={()=>void reward.refetch()}>{t('retry')}</Button></div>
      : !result || result.state === 'pending' ? <p className="mt-2 text-sm text-muted-foreground" role="status">{t('resultPending')}</p>
      : result.state === 'invalidated' ? <p className="mt-2 text-sm text-muted-foreground">{t('resultReset')}</p>
      : <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><strong className="text-2xl">+{result.xp} XP</strong>{result.placement?.placement != null && <span className="text-sm">{t(result.placement.tied ? 'placementTied' : 'placement', {place:result.placement.placement,total:result.placement.teams})}</span>}</div>
        <p className="mt-2 text-sm text-muted-foreground">{t(result.placement?.completed ? 'teamCompleted' : 'teamJourneyEnded')}</p>
        {!result.level && <Link to="/account" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary">{t('saveProgress')}</Link>}
      </>}
  </SurfacePanel>
}
