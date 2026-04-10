import { useState, useCallback } from 'react'
import { Plus, Trash2, Save, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGameVariables, useChallengeVariables } from '@/hooks/queries/useVariables'
import { useSaveGameVariables, useSaveChallengeVariables } from '@/hooks/mutations/useVariableMutations'
import type { Team } from '@/types'
import type { TeamVariableEntry } from '@/lib/api/team-variables'

interface TeamVariablesEditorProps {
  gameId: string
  challengeId?: string
  teams: Team[]
}

export function TeamVariablesEditor({ gameId, challengeId, teams }: TeamVariablesEditorProps) {
  const gameVarsQuery = useGameVariables(challengeId ? undefined : gameId)
  const challengeVarsQuery = useChallengeVariables(
    challengeId ? gameId : undefined,
    challengeId,
  )

  const saveGameVars = useSaveGameVariables(gameId)
  const saveChallengeVars = useSaveChallengeVariables(gameId, challengeId ?? '')

  const sourceQuery = challengeId ? challengeVarsQuery : gameVarsQuery
  const initialVariables = sourceQuery.data?.variables ?? []

  const [edits, setEdits] = useState<TeamVariableEntry[] | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [keyError, setKeyError] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const variables = edits ?? initialVariables
  const dirty = edits !== null

  const saving = challengeId ? saveChallengeVars.isPending : saveGameVars.isPending

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const addVariable = useCallback(() => {
    const key = newKeyName.trim()
    if (!key) return
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      setKeyError('Key must start with a letter and contain only letters, numbers, and underscores')
      return
    }
    if (variables.some((v) => v.key === key)) {
      setKeyError('A variable with this key already exists')
      return
    }
    setKeyError('')
    const teamValues: Record<string, string> = {}
    teams.forEach((team) => {
      teamValues[team.id] = ''
    })
    setEdits([...variables, { key, teamValues }])
    setExpandedKeys((prev) => new Set(prev).add(key))
    setNewKeyName('')
  }, [newKeyName, variables, teams])

  const removeVariable = useCallback(
    (key: string) => {
      setEdits(variables.filter((v) => v.key !== key))
      setExpandedKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    },
    [variables],
  )

  const updateValue = useCallback(
    (key: string, teamId: string, value: string) => {
      setEdits(
        variables.map((v) =>
          v.key === key ? { ...v, teamValues: { ...v.teamValues, [teamId]: value } } : v,
        ),
      )
    },
    [variables],
  )

  const handleSave = () => {
    const body = { variables }
    if (challengeId) {
      saveChallengeVars.mutate(body, { onSuccess: () => setEdits(null) })
    } else {
      saveGameVars.mutate(body, { onSuccess: () => setEdits(null) })
    }
  }

  if (sourceQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  if (teams.length === 0) {
    return <p className="text-sm text-muted-foreground">Create teams first to define variables.</p>
  }

  return (
    <div className="space-y-2" data-testid="team-variables-editor">
      {variables.map((variable) => {
        const expanded = expandedKeys.has(variable.key)
        const filledCount = teams.filter(
          (team) => (variable.teamValues[team.id] ?? '').trim() !== '',
        ).length
        return (
          <div key={variable.key} className="rounded-md border border-border">
            <div className="flex items-center bg-muted/50 px-3 py-2">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left min-w-0 cursor-pointer"
                onClick={() => toggleExpanded(variable.key)}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    expanded ? 'rotate-90' : ''
                  }`}
                />
                <code className="text-sm font-mono font-medium">{`{{${variable.key}}}`}</code>
                {!expanded && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {filledCount}/{teams.length} filled
                  </span>
                )}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 ml-2"
                onClick={(e) => {
                  e.stopPropagation()
                  removeVariable(variable.key)
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-in-out"
              style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="p-1">
                  <div className="p-3 space-y-2">
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
                          value={variable.teamValues[team.id] ?? ''}
                          onChange={(e) => updateValue(variable.key, team.id, e.target.value)}
                          placeholder="Value..."
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            value={newKeyName}
            onChange={(e) => {
              setNewKeyName(e.target.value)
              setKeyError('')
            }}
            placeholder="Variable key (e.g. teamCode)"
            className="h-8 text-sm font-mono"
            data-testid="variable-key-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addVariable()
              }
            }}
          />
          {keyError && <p className="text-xs text-destructive mt-1">{keyError}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addVariable}
          disabled={!newKeyName.trim()}
          data-testid="add-variable-btn"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Variable
        </Button>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-variables-btn">
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Variables'}
          </Button>
        </div>
      )}
    </div>
  )
}
