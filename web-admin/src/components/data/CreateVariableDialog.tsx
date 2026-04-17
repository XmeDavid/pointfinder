import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useSaveGameVariables,
  useSaveChallengeVariables,
} from '@/hooks/mutations/useVariableMutations'
import {
  useGameVariables,
  useChallengeVariables,
} from '@/hooks/queries/useVariables'
import type { Team } from '@/types'
import type { TeamVariableEntry } from '@/lib/api/team-variables'

export type CreateVariableScope = 'game' | 'challenge'

export interface CreateVariableDialogProps {
  open: boolean
  /** Initial key to seed the key field (the partial the user typed after `{{`). */
  initialKey: string
  gameId: string
  /** When set, values save at challenge scope; otherwise at game scope. */
  challengeId?: string
  scope: CreateVariableScope
  teams: Team[]
  onCancel: () => void
  /** Called after the new variable is persisted. Parent may use it to insert
   *  the pill into the editor at the current caret. */
  onCreated: (key: string) => void
}

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

/**
 * Inline dialog for creating a new `{{key}}` variable — used by the
 * editor's autocomplete "Create variable…" path.
 *
 * Single text field per team (subset of the full TeamVariablesEditor UX),
 * since we're only authoring ONE key at a time. Values default to empty
 * strings so the operator can fill them later; the go-live readiness
 * check will still flag any missing team values.
 */
export function CreateVariableDialog({
  open,
  initialKey,
  gameId,
  challengeId,
  scope,
  teams,
  onCancel,
  onCreated,
}: CreateVariableDialogProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState(initialKey)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  // Fetch existing variables so we can append rather than overwrite.
  const gameVarsQuery = useGameVariables(scope === 'game' ? gameId : undefined)
  const challengeVarsQuery = useChallengeVariables(
    scope === 'challenge' ? gameId : undefined,
    scope === 'challenge' ? challengeId : undefined,
  )
  const existingVars = useMemo<TeamVariableEntry[]>(() => {
    if (scope === 'game') return gameVarsQuery.data?.variables ?? []
    return challengeVarsQuery.data?.variables ?? []
  }, [scope, gameVarsQuery.data, challengeVarsQuery.data])

  const saveGameVars = useSaveGameVariables(gameId)
  const saveChallengeVars = useSaveChallengeVariables(gameId, challengeId ?? '')
  const saving =
    scope === 'game' ? saveGameVars.isPending : saveChallengeVars.isPending

  // Reset local state whenever the dialog opens with a new seed key.
  const [syncedForOpen, setSyncedForOpen] = useState(false)
  if (open && !syncedForOpen) {
    setKey(initialKey)
    setError('')
    setValues({})
    setSyncedForOpen(true)
  } else if (!open && syncedForOpen) {
    setSyncedForOpen(false)
  }

  const handleCreate = useCallback(() => {
    const trimmed = key.trim()
    if (!trimmed) {
      setError(t('build.variableKeyRequired', 'Key is required'))
      return
    }
    if (!KEY_RE.test(trimmed)) {
      setError(
        t(
          'build.variableKeyInvalid',
          'Key must start with a letter and contain only letters, numbers, and underscores',
        ),
      )
      return
    }
    if (existingVars.some((v) => v.key === trimmed)) {
      setError(
        t(
          'build.variableKeyDuplicate',
          'A variable with this key already exists',
        ),
      )
      return
    }

    const teamValues: Record<string, string> = {}
    teams.forEach((tm) => {
      teamValues[tm.id] = values[tm.id] ?? ''
    })

    const next: TeamVariableEntry[] = [
      ...existingVars,
      { key: trimmed, teamValues },
    ]

    const mutation =
      scope === 'game' ? saveGameVars : saveChallengeVars
    mutation.mutate(
      { variables: next },
      {
        onSuccess: () => {
          onCreated(trimmed)
        },
      },
    )
  }, [
    key,
    existingVars,
    teams,
    values,
    scope,
    saveGameVars,
    saveChallengeVars,
    onCreated,
    t,
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel()
      }}
    >
      <DialogContent data-testid="create-variable-dialog" onClose={onCancel}>
        <DialogHeader>
          <DialogTitle>
            {t('build.createVariableTitle', 'Create variable')}
          </DialogTitle>
          <DialogDescription>
            {scope === 'challenge'
              ? t(
                  'build.createVariableDescriptionChallenge',
                  'Define a new per-team variable for this challenge.',
                )
              : t(
                  'build.createVariableDescriptionGame',
                  'Define a new per-team variable for this game.',
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t('build.variableKeyLabel', 'Key')}
            </label>
            <Input
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setError('')
              }}
              placeholder="my_variable"
              className="h-8 text-sm font-mono"
              data-testid="create-variable-key-input"
              autoFocus
            />
            {error && (
              <p
                className="text-xs text-destructive mt-1"
                data-testid="create-variable-error"
              >
                {error}
              </p>
            )}
          </div>

          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'build.createVariableNoTeams',
                'Create at least one team to define per-team values.',
              )}
            </p>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">
                {t('build.variableValuesLabel', 'Per-team values (optional)')}
              </label>
              {teams.map((team) => (
                <div key={team.id} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 shrink-0">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="text-sm truncate">{team.name}</span>
                  </div>
                  <Input
                    value={values[team.id] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [team.id]: e.target.value,
                      }))
                    }
                    placeholder={t(
                      'build.variableValuePlaceholder',
                      'Value for this team',
                    )}
                    className="h-8 text-sm"
                    data-testid={`create-variable-value-${team.id}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            data-testid="create-variable-cancel-btn"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            data-testid="create-variable-confirm-btn"
          >
            {saving
              ? t('common.saving', 'Saving…')
              : t('common.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
