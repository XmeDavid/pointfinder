import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { useDeleteGame, useKeepGame } from '@/hooks/mutations/useGameMutations'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api/errors'

/**
 * Keep or delete a practice game. Keep clears the marker under the normal
 * quota; at the limit the operator is sent to billing. Delete confirms, then
 * returns to the dashboard. Used by the closing coach mark and game settings.
 */
export function PracticeGameChoices({
  gameId,
  onDone,
  compact = false,
}: {
  gameId: string
  /** Called after a successful keep or delete. */
  onDone?: () => void
  /** Smaller buttons for the coach bubble. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const keep = useKeepGame()
  const remove = useDeleteGame()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const size = compact ? 'sm' : 'default'

  function handleKeep() {
    setMessage(null)
    keep.mutate(gameId, {
      onSuccess: () => {
        setMessage(t('tutorials.practice.kept'))
        onDone?.()
      },
      onError: (error) => {
        if (getApiErrorCode(error) === 'QUOTA_ACTIVE_GAMES_EXCEEDED') {
          navigate('/billing')
          return
        }
        setMessage(getApiErrorMessage(error, t('common.unknownError')))
      },
    })
  }

  function handleDelete() {
    setConfirming(false)
    setMessage(null)
    remove.mutate(gameId, {
      onSuccess: () => {
        onDone?.()
        navigate('/dashboard')
      },
      onError: (error) => setMessage(getApiErrorMessage(error, t('common.unknownError'))),
    })
  }

  return (
    <div className="space-y-2" data-testid="practice-game-choices">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size={size}
          onClick={handleKeep}
          disabled={keep.isPending || remove.isPending}
          data-testid="practice-keep-btn"
          className="h-auto min-h-9 whitespace-normal"
        >
          {t('tutorials.practice.keep')}
        </Button>
        <Button
          type="button"
          size={size}
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={keep.isPending || remove.isPending}
          data-testid="practice-delete-btn"
          className="h-auto min-h-9 whitespace-normal"
        >
          {t('tutorials.practice.delete')}
        </Button>
      </div>
      {message && (
        <p className="text-xs text-muted-foreground" data-testid="practice-game-message" role="status">
          {message}
        </p>
      )}
      <ConfirmDeleteDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
        title={t('tutorials.practice.deleteTitle')}
        description={t('tutorials.practice.deleteBody')}
        confirmLabel={t('tutorials.practice.delete')}
      />
    </div>
  )
}
