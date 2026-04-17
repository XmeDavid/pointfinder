import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Save, ChevronDown, X, Plus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { TagPicker } from '@/components/data/TagPicker'
import { TeamVariablesEditor } from '@/components/data/TeamVariablesEditor'
import { CreateVariableDialog } from '@/components/data/CreateVariableDialog'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import { useGameVariables, useChallengeVariables } from '@/hooks/queries/useVariables'
import { useUpdateChallenge, useDeleteChallenge } from '@/hooks/mutations/useChallengeMutations'
import { useCreateAssignment, useDeleteAssignment } from '@/hooks/mutations/useAssignmentMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { ResourcePicker } from '@/components/editor/ResourcePicker'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { VariableAwareChipInput } from '@/components/inputs/VariableAwareChipInput'
import { resolveTemplate, type VariableMap } from '@/lib/variables/resolveTemplate'
import { findUndefinedReferences } from '@/lib/variables/scanReferences'
import { cn } from '@/lib/utils'
import type { AnswerType } from '@/types/v2'

// Allowlist mirrored from RichTextEditor#sanitize; the resolved preview is
// rendered via dangerouslySetInnerHTML after variable substitution, and a
// variable VALUE could contain `<script>` — so we re-sanitize here too.
const PREVIEW_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'h1',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'img',
    'audio',
    'a',
    'div',
    'span',
  ],
  ALLOWED_ATTR: [
    'src',
    'alt',
    'href',
    'target',
    'rel',
    'controls',
    'preload',
    'style',
    'class',
    'data-type',
    'data-resource-id',
    'data-resource-name',
    'data-resource-size',
    'data-resource-type',
    'data-variable-key',
    'contenteditable',
  ],
}

const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' },
  { value: 'none', label: 'None' },
]

interface ChallengeDetailProps {
  challengeId: string
  gameId: string
}

export function ChallengeDetail({ challengeId, gameId }: ChallengeDetailProps) {
  const { t } = useTranslation()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: bases = [] } = useBases(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const { data: gameVarsData } = useGameVariables(gameId)
  const { data: challengeVarsData } = useChallengeVariables(gameId, challengeId)
  const gameVars = useMemo(() => gameVarsData?.variables ?? [], [gameVarsData])
  const challengeVars = useMemo(
    () => challengeVarsData?.variables ?? [],
    [challengeVarsData],
  )
  const availableKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...gameVars.map((v) => v.key),
          ...challengeVars.map((v) => v.key),
        ]),
      ),
    [gameVars, challengeVars],
  )
  const updateChallenge = useUpdateChallenge(gameId)
  const deleteChallenge = useDeleteChallenge(gameId)
  const createAssignment = useCreateAssignment(gameId)
  const deleteAssignmentMut = useDeleteAssignment(gameId)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)
  const { active } = useWorkspaceContext()
  const orgId = active.type === 'org' ? active.orgId : undefined

  const [showBaseDropdown, setShowBaseDropdown] = useState(false)
  const baseDropdownRef = useRef<HTMLDivElement>(null)

  // Resource picker state
  const [showResourcePicker, setShowResourcePicker] = useState(false)
  const [activeEditorField, setActiveEditorField] = useState<'content' | 'completion' | null>(null)
  const contentEditorRef = useRef<((resource: { id: string; name: string; sizeBytes: number; contentType: string }) => void) | null>(null)
  const completionEditorRef = useRef<((resource: { id: string; name: string; sizeBytes: number; contentType: string }) => void) | null>(null)

  // Refs for programmatic pill insertion after the create-variable dialog
  // resolves — one per editor so we can insert into the originating field.
  const contentInsertVariableRef = useRef<((key: string) => void) | null>(null)
  const completionInsertVariableRef = useRef<((key: string) => void) | null>(null)

  // Create-variable dialog state — opened from the `{{foo` autocomplete.
  const [createVarDialogOpen, setCreateVarDialogOpen] = useState(false)
  const [createVarInitialKey, setCreateVarInitialKey] = useState('')
  const [createVarTargetField, setCreateVarTargetField] = useState<
    'content' | 'completion'
  >('content')

  const challenge = challenges.find((c) => c.id === challengeId)

  // Local form state
  const [localTitle, setLocalTitle] = useState('')
  const [localAnswerType, setLocalAnswerType] = useState<AnswerType>('text')
  const [localAutoValidate, setLocalAutoValidate] = useState(false)
  const [localDescription, setLocalDescription] = useState('')
  const [localContent, setLocalContent] = useState('')
  const [localCorrectAnswer, setLocalCorrectAnswer] = useState<string[]>([])
  const [localPoints, setLocalPoints] = useState('0')
  const [localOperatorNotes, setLocalOperatorNotes] = useState('')
  const [localLocationBound, setLocalLocationBound] = useState(false)
  const [localCompletionContent, setLocalCompletionContent] = useState('')

  // Preview-as-team state — toggles the editors from authoring to read-only
  // rendering with `{{key}}` references resolved for the selected team.
  const [previewMode, setPreviewMode] = useState(false)
  const [previewTeamId, setPreviewTeamId] = useState<string | null>(null)

  // Sync local state when challenge data loads or challengeId changes
  const syncedRef = useRef<string | null>(null)
  useEffect(() => {
    if (challenge && syncedRef.current !== challengeId) {
      syncedRef.current = challengeId
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalTitle(challenge.title)
      setLocalAnswerType(challenge.answerType)
      setLocalAutoValidate(challenge.autoValidate)
      setLocalDescription(challenge.description)
      setLocalContent(challenge.content)
      setLocalCorrectAnswer(challenge.correctAnswer ?? [])
      setLocalPoints(challenge.points.toString())
      setLocalOperatorNotes(challenge.operatorNotes ?? '')
      setLocalLocationBound(challenge.locationBound)
      setLocalCompletionContent(challenge.completionContent)
    }
  }, [challenge, challengeId])

  // Reset sync tracker when challengeId changes so new data gets synced
  useEffect(() => {
    syncedRef.current = null
  }, [challengeId])

  // Derive assignment info
  const challengeAssignments = useMemo(
    () => assignments.filter((a) => a.challengeId === challengeId),
    [assignments, challengeId],
  )

  const assignedBaseIds = useMemo(
    () => new Set(challengeAssignments.map((a) => a.baseId)),
    [challengeAssignments],
  )

  const assignedBase = useMemo(
    () => bases.find((b) => assignedBaseIds.has(b.id)),
    [bases, assignedBaseIds],
  )

  const isGlobal = challengeAssignments.some((a) => !a.teamId)
  const assignedTeamIds = useMemo(
    () => new Set(challengeAssignments.filter((a) => a.teamId).map((a) => a.teamId)),
    [challengeAssignments],
  )

  const [showTeamPicker, setShowTeamPicker] = useState(false)

  const handleSwitchToSpecific = useCallback(() => {
    if (!assignedBase || teams.length === 0) return
    const globalAssignments = challengeAssignments.filter((a) => !a.teamId)
    globalAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
    teams.forEach((team) => {
      createAssignment.mutate({ baseId: assignedBase.id, challengeId, teamId: team.id })
    })
  }, [challengeAssignments, teams, assignedBase, challengeId, createAssignment, deleteAssignmentMut])

  const handleSwitchToAll = useCallback(() => {
    if (!assignedBase) return
    const teamAssignments = challengeAssignments.filter((a) => a.teamId)
    teamAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
    createAssignment.mutate({ baseId: assignedBase.id, challengeId })
    setShowTeamPicker(false)
  }, [challengeAssignments, assignedBase, challengeId, createAssignment, deleteAssignmentMut])

  const handleToggleTeam = useCallback((teamId: string) => {
    if (!assignedBase) return
    if (assignedTeamIds.has(teamId)) {
      const toRemove = challengeAssignments.find((a) => a.teamId === teamId)
      if (toRemove) deleteAssignmentMut.mutate(toRemove.id)
    } else {
      createAssignment.mutate({ baseId: assignedBase.id, challengeId, teamId })
    }
  }, [assignedTeamIds, challengeAssignments, assignedBase, challengeId, createAssignment, deleteAssignmentMut])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showBaseDropdown) return
    const handler = (e: MouseEvent) => {
      if (baseDropdownRef.current && !baseDropdownRef.current.contains(e.target as Node)) {
        setShowBaseDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBaseDropdown])

  const handleAssignToBase = (baseId: string) => {
    // Remove existing assignments for this challenge first, then create new one
    challengeAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
    createAssignment.mutate({ baseId, challengeId })
    setShowBaseDropdown(false)
  }

  const handleRemoveBaseAssignment = () => {
    challengeAssignments.forEach((a) => deleteAssignmentMut.mutate(a.id))
  }

  const showAnswerConfig = localAnswerType === 'text'

  // Undefined-key guard: collect every `{{key}}` referenced in authoring
  // fields and flag any that aren't defined as game/challenge variables.
  const undefinedKeys = useMemo(
    () =>
      findUndefinedReferences(
        [localContent, localCompletionContent, ...localCorrectAnswer],
        new Set(availableKeys),
      ),
    [localContent, localCompletionContent, localCorrectAnswer, availableKeys],
  )

  const handleSave = useCallback(() => {
    if (undefinedKeys.length > 0) {
      const ok = window.confirm(
        `Undefined variables: ${undefinedKeys
          .map((k) => `{{${k}}}`)
          .join(', ')}\n\nThese references won't resolve for any team. Save anyway?`,
      )
      if (!ok) return
    }
    const correctAnswerArray =
      localCorrectAnswer.length > 0 ? localCorrectAnswer : undefined

    updateChallenge.mutate({
      challengeId,
      dto: {
        title: localTitle,
        answerType: localAnswerType,
        autoValidate: localAutoValidate,
        description: localDescription,
        content: localContent,
        correctAnswer: correctAnswerArray,
        points: Number(localPoints) || 0,
        operatorNotes: localOperatorNotes || undefined,
        locationBound: localLocationBound,
        completionContent: localCompletionContent,
      },
    })
  }, [
    challengeId,
    localTitle,
    localAnswerType,
    localAutoValidate,
    localDescription,
    localContent,
    localCorrectAnswer,
    localPoints,
    localOperatorNotes,
    localLocationBound,
    localCompletionContent,
    undefinedKeys,
    updateChallenge,
  ])

  // Preview-team resolution: merge game + challenge vars, challenge wins.
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  )
  const previewTeam = useMemo(
    () =>
      sortedTeams.find((tm) => tm.id === previewTeamId) ?? sortedTeams[0] ?? null,
    [sortedTeams, previewTeamId],
  )
  const previewVars = useMemo<VariableMap>(() => {
    const map = new Map<string, string>()
    if (!previewTeam) return map
    for (const v of gameVars) {
      const val = v.teamValues?.[previewTeam.id]
      if (val != null) map.set(v.key, val)
    }
    for (const v of challengeVars) {
      const val = v.teamValues?.[previewTeam.id]
      if (val != null) map.set(v.key, val)
    }
    return map
  }, [gameVars, challengeVars, previewTeam])

  // "Create variable..." autocomplete action — opens a dialog prefilled
  // with the partial key the user typed after `{{`. On confirm, the new
  // variable is persisted (challenge-scoped) and the pill is inserted into
  // the originating editor at the current caret.
  const handleCreateContentVariable = useCallback((partial: string) => {
    setCreateVarTargetField('content')
    setCreateVarInitialKey(partial)
    setCreateVarDialogOpen(true)
  }, [])
  const handleCreateCompletionVariable = useCallback((partial: string) => {
    setCreateVarTargetField('completion')
    setCreateVarInitialKey(partial)
    setCreateVarDialogOpen(true)
  }, [])

  const handleVariableCreated = useCallback(
    (newKey: string) => {
      setCreateVarDialogOpen(false)
      // Insert the pill into the editor that triggered the dialog. The
      // original trigger caret is gone after the dialog round-trip, but
      // the editor still has its last known selection; `.focus()` restores
      // it before we insert.
      const ref =
        createVarTargetField === 'content'
          ? contentInsertVariableRef
          : completionInsertVariableRef
      ref.current?.(newKey)
    },
    [createVarTargetField],
  )

  // Resolved preview HTML — sanitized AFTER variable substitution so a
  // team-variable VALUE can't smuggle `<script>` through the editor's
  // authoring-time sanitize pass.
  const resolvedContentHtml = useMemo(
    () =>
      DOMPurify.sanitize(
        resolveTemplate(localContent, previewVars),
        PREVIEW_SANITIZE_CONFIG,
      ),
    [localContent, previewVars],
  )
  const resolvedCompletionHtml = useMemo(
    () =>
      DOMPurify.sanitize(
        resolveTemplate(localCompletionContent, previewVars),
        PREVIEW_SANITIZE_CONFIG,
      ),
    [localCompletionContent, previewVars],
  )

  if (!challenge) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {t('build.challengeNotFound')}
      </div>
    )
  }

  const deleteCascadeCount = challengeAssignments.length
  const deleteDescription =
    t('common.confirm.deleteChallengeDescription') +
    (deleteCascadeCount > 0
      ? ' ' + t('common.confirm.deleteChallengeCascade', { count: deleteCascadeCount })
      : '')

  return (
    <div className="p-4 space-y-0" data-testid="challenge-detail">
      {/* Identity section */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Identity
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Title
            </label>
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              data-testid="challenge-title-input"
              className="h-8 text-sm"
            />
          </div>

          {/* Answer type selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Answer Type
            </label>
            <div className="flex gap-1.5">
              {ANSWER_TYPES.map((at) => (
                <button
                  key={at.value}
                  type="button"
                  onClick={() => setLocalAnswerType(at.value)}
                  data-testid={`answer-type-${at.value}`}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border',
                    localAnswerType === at.value
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground',
                  )}
                >
                  {at.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-validate toggle */}
          <div>
            <button
              type="button"
              onClick={() => setLocalAutoValidate(!localAutoValidate)}
              data-testid="auto-validate-toggle"
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border',
                localAutoValidate
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground',
              )}
            >
              Auto-validate
            </button>
          </div>
        </div>
      </section>

      {/* Content section */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Content
          </h3>
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Editor mode"
              className="inline-flex rounded-md border border-border p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!previewMode}
                onClick={() => setPreviewMode(false)}
                data-testid="preview-edit-btn"
                className={cn(
                  'px-2 py-0.5 text-xs rounded cursor-pointer transition-colors',
                  !previewMode
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Edit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={previewMode}
                onClick={() => setPreviewMode(true)}
                disabled={sortedTeams.length === 0}
                data-testid="preview-preview-btn"
                className={cn(
                  'px-2 py-0.5 text-xs rounded cursor-pointer transition-colors',
                  previewMode
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                  sortedTeams.length === 0 && 'opacity-40 cursor-not-allowed',
                )}
                title={
                  sortedTeams.length === 0
                    ? 'Create at least one team to preview'
                    : undefined
                }
              >
                Preview
              </button>
            </div>
            {previewMode && sortedTeams.length > 0 && (
              <select
                value={previewTeam?.id ?? ''}
                onChange={(e) => setPreviewTeamId(e.target.value)}
                data-testid="preview-team-select"
                className="text-xs rounded border border-border bg-background px-2 py-0.5"
              >
                {sortedTeams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Description
            </label>
            <Textarea
              rows={3}
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              data-testid="challenge-description"
              className="text-sm resize-none"
            />
          </div>
          <div data-testid="challenge-content">
            <label className="block text-xs text-muted-foreground mb-1">
              Content
            </label>
            {previewMode ? (
              <div
                data-testid="content-preview"
                className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-input bg-muted/30 px-3 py-2 min-h-[150px]"
                // Preview HTML has been DOMPurify-sanitized AFTER variable
                // substitution (see resolvedContentHtml memo) so values
                // containing `<script>` can't escape.
                dangerouslySetInnerHTML={{ __html: resolvedContentHtml }}
              />
            ) : (
              <RichTextEditor
                content={localContent}
                onChange={setLocalContent}
                placeholder={t('build.challengeContentPlaceholder')}
                onInsertFileEmbed={() => {
                  setActiveEditorField('content')
                  setShowResourcePicker(true)
                }}
                insertFileEmbedRef={contentEditorRef}
                variableKeys={availableKeys}
                onCreateVariable={handleCreateContentVariable}
                insertVariableRef={contentInsertVariableRef}
              />
            )}
          </div>
        </div>
      </section>

      {/* Answer configuration (text types only) */}
      {showAnswerConfig && (
        <section className="border-t border-border pt-4 mt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Answer Configuration
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Correct answer(s)
              </label>
              {previewMode ? (
                <div
                  data-testid="correct-answer-preview"
                  className="flex flex-wrap gap-2 rounded-md border border-input bg-muted/30 px-2 py-1.5 min-h-[34px]"
                >
                  {localCorrectAnswer.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      No answers configured
                    </span>
                  ) : (
                    localCorrectAnswer.map((chip, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-sm"
                      >
                        {resolveTemplate(chip, previewVars)}
                      </span>
                    ))
                  )}
                </div>
              ) : (
                <VariableAwareChipInput
                  chips={localCorrectAnswer}
                  onChange={setLocalCorrectAnswer}
                  availableKeys={availableKeys}
                  placeholder={t('build.correctAnswerPlaceholder')}
                  data-testid="correct-answer-input"
                />
              )}
            </div>
            {undefinedKeys.length > 0 && (
              <p
                className="text-[10px] text-destructive"
                data-testid="undefined-key-warning"
              >
                Unknown variable{undefinedKeys.length > 1 ? 's' : ''}:{' '}
                {undefinedKeys.map((k) => `{{${k}}}`).join(', ')}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              When auto-validate is on, submissions matching any of these
              answers are automatically approved. Use {'{{variable}}'} to
              reference per-team values.
            </p>
          </div>
        </section>
      )}

      {/* Scoring section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Scoring
        </h3>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Points
          </label>
          <Input
            type="number"
            value={localPoints}
            onChange={(e) => setLocalPoints(e.target.value)}
            data-testid="points-input"
            className="w-24 h-8 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </section>

      {/* Assignment section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Assignment
        </h3>
        <div className="space-y-3">
          {/* Assigned at base */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Assigned at:
            </label>
            {assignedBase ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectBase(assignedBase.id)}
                  className="text-sm text-primary hover:underline cursor-pointer"
                  data-testid="assigned-base-link"
                >
                  {assignedBase.name}
                </button>
                <div className="relative" ref={baseDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowBaseDropdown((v) => !v)}
                    data-testid="change-base-btn"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Change
                  </button>
                  {showBaseDropdown && (
                    <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                      {bases.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => handleAssignToBase(b.id)}
                          data-testid={`assign-base-option-${b.id}`}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer',
                            b.id === assignedBase.id
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground hover:bg-muted',
                          )}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRemoveBaseAssignment}
                  data-testid="remove-base-assignment-btn"
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="Remove assignment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="relative" ref={!assignedBase ? baseDropdownRef : undefined}>
                <button
                  type="button"
                  onClick={() => setShowBaseDropdown((v) => !v)}
                  disabled={bases.length === 0}
                  data-testid="assign-to-base-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Assign to base
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showBaseDropdown && bases.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {bases.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => handleAssignToBase(b.id)}
                        data-testid={`assign-base-option-${b.id}`}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assigned to teams */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Assigned to:
            </label>
            {challengeAssignments.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                No assignments
              </span>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {isGlobal ? (
                    <button
                      onClick={teams.length > 0 && assignedBase ? handleSwitchToSpecific : undefined}
                      disabled={teams.length === 0 || !assignedBase}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary cursor-pointer hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={teams.length > 0 ? 'Click to assign to specific teams' : 'Create teams first'}
                    >
                      <Users className="h-3 w-3" />
                      All teams
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSwitchToAll}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors"
                        title="Switch to all teams"
                      >
                        <Users className="h-3 w-3" />
                        All
                      </button>
                      {teams
                        .filter((t) => assignedTeamIds.has(t.id))
                        .map((team) => (
                          <button
                            key={team.id}
                            onClick={() => handleToggleTeam(team.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-70 transition-opacity"
                            style={{
                              backgroundColor: `${team.color}15`,
                              color: team.color,
                              border: `1px solid ${team.color}40`,
                            }}
                            title={`Remove ${team.name}`}
                          >
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: team.color }}
                            />
                            {team.name}
                            <X className="h-2.5 w-2.5 ml-0.5" />
                          </button>
                        ))}
                      <button
                        onClick={() => setShowTeamPicker((v) => !v)}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                        title="Add team"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                {showTeamPicker && !isGlobal && (
                  <div className="flex flex-wrap gap-1.5">
                    {teams
                      .filter((t) => !assignedTeamIds.has(t.id))
                      .map((team) => (
                        <button
                          key={team.id}
                          onClick={() => handleToggleTeam(team.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer border border-dashed transition-colors hover:opacity-80"
                          style={{
                            borderColor: `${team.color}60`,
                            color: team.color,
                          }}
                          title={`Add ${team.name}`}
                        >
                          <Plus className="h-2.5 w-2.5" />
                          {team.name}
                        </button>
                      ))}
                    {teams.filter((t) => !assignedTeamIds.has(t.id)).length === 0 && (
                      <span className="text-xs text-muted-foreground italic">All teams assigned</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Operator notes */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Operator Notes
        </h3>
        <Textarea
          rows={3}
          value={localOperatorNotes}
          onChange={(e) => setLocalOperatorNotes(e.target.value)}
          placeholder={t('build.operatorNotesPlaceholder')}
          data-testid="operator-notes"
          className="text-sm resize-none"
        />
      </section>

      {/* Location bound */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Location Bound
        </h3>
        <button
          type="button"
          onClick={() => setLocalLocationBound(!localLocationBound)}
          data-testid="location-bound-toggle"
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border',
            localLocationBound
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-background text-muted-foreground border-border hover:text-foreground',
          )}
        >
          Require physical presence
        </button>
      </section>

      {/* Tags section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Tags
        </h3>
        <TagPicker
          gameId={gameId}
          selectedTagIds={challenge.tagIds ?? []}
          onChange={(tagIds) => {
            updateChallenge.mutate({
              challengeId: challenge.id,
              dto: {
                title: challenge.title,
                description: challenge.description,
                content: challenge.content,
                completionContent: challenge.completionContent,
                answerType: challenge.answerType,
                autoValidate: challenge.autoValidate,
                correctAnswer: challenge.correctAnswer,
                points: challenge.points,
                locationBound: challenge.locationBound,
                operatorNotes: challenge.operatorNotes,
                tagIds,
              },
            })
          }}
        />
      </section>

      {/* Challenge Variables */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Challenge Variables
        </h3>
        <TeamVariablesEditor gameId={gameId} challengeId={challengeId} teams={teams} />
      </section>

      {/* Post-completion content */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Post-completion
        </h3>
        <div data-testid="completion-content">
          {previewMode ? (
            <div
              data-testid="completion-content-preview"
              className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-input bg-muted/30 px-3 py-2 min-h-[150px]"
              // See resolvedCompletionHtml memo — sanitized post-resolve.
              dangerouslySetInnerHTML={{ __html: resolvedCompletionHtml }}
            />
          ) : (
            <RichTextEditor
              content={localCompletionContent}
              onChange={setLocalCompletionContent}
              placeholder={t('build.completionPlaceholder')}
              onInsertFileEmbed={() => {
                setActiveEditorField('completion')
                setShowResourcePicker(true)
              }}
              insertFileEmbedRef={completionEditorRef}
              variableKeys={availableKeys}
              onCreateVariable={handleCreateCompletionVariable}
              insertVariableRef={completionInsertVariableRef}
            />
          )}
        </div>
      </section>

      {/* Resource picker modal */}
      {showResourcePicker && (
        <ResourcePicker
          gameId={gameId}
          orgId={orgId}
          onSelect={(resource) => {
            const ref = activeEditorField === 'content' ? contentEditorRef : completionEditorRef
            ref.current?.(resource)
          }}
          onClose={() => setShowResourcePicker(false)}
        />
      )}

      {/* Create-variable dialog — opened from {{foo}} autocomplete */}
      <CreateVariableDialog
        open={createVarDialogOpen}
        initialKey={createVarInitialKey}
        gameId={gameId}
        challengeId={challengeId}
        scope="challenge"
        teams={teams}
        onCancel={() => setCreateVarDialogOpen(false)}
        onCreated={handleVariableCreated}
      />

      {/* Save button */}
      <div className="border-t border-border pt-4 mt-4">
        <Button
          onClick={handleSave}
          loading={updateChallenge.isPending}
          data-testid="save-challenge"
          size="sm"
        >
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="delete-challenge-btn"
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          Delete challenge
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false)
          deleteChallenge.mutate(challengeId, { onSuccess: () => selectChallenge(null) })
        }}
        title={t('common.confirm.deleteChallengeTitle')}
        description={deleteDescription}
      />
    </div>
  )
}
