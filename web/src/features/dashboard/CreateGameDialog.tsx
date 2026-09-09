import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTourStore } from '@/features/tutorials/store'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api/errors'
import { useCreateGame } from '@/hooks/mutations/useGameMutations'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import type { Game } from '@/types'

export function CreateGameDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /**
   * Called instead of navigating to the new game. The tutorials library needs
   * the game to bind a scenario to before it decides where to go.
   */
  onCreated?: (game: Game) => void
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const createGame = useCreateGame()
  const firstGameRun = useTourStore((s) => s.activeScenario === 'first-game')
  const { active } = useWorkspaceContext()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    let game: Game
    try {
      game = await createGame.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        // Inside the first-game tutorial the server marks this as a practice
        // game; outside a run the flag is simply ignored. Practice games are
        // always personal, so the org is not offered during a run.
        ...(firstGameRun
          ? { tutorialScenario: 'first-game' }
          : active.type === 'org'
            ? { orgId: active.orgId }
            : {}),
      })
    } catch (err) {
      // At the active-game limit the answer is a plan, not a retry.
      if (getApiErrorCode(err) === 'QUOTA_ACTIVE_GAMES_EXCEEDED') {
        onClose()
        navigate('/billing')
        return
      }
      setError(getApiErrorMessage(err, t('common.unknownError')))
      return
    }
    onClose()
    if (onCreated) {
      onCreated(game)
      return
    }
    navigate(`/game/${game.id}`)
  }

  function handleCancel() {
    setName('')
    setDescription('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--pf-color-surface-scrim)]"
        onClick={handleCancel}
        data-testid="dialog-backdrop"
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-label="Create new game"
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-modal"
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Create New Game
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="game-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Name
            </label>
            <input
              id="game-name"
              data-testid="game-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Scout Rally 2026"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor="game-description"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="game-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert" data-testid="create-game-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="game-save-btn"
              disabled={createGame.isPending || !name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createGame.isPending ? 'Creating...' : 'Create Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
