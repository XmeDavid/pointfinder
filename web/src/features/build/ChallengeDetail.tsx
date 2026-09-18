import { useState, useMemo, useCallback, useRef } from 'react'
import { RuleSection } from './RuleSection'
import { useAuthStore } from '@/lib/auth/store'
import { getApiErrorMessage } from '@/lib/api/errors'
import { SaveStatusIndicator } from '@/components/status'
import { draftKey } from './drafts/draftStore'
import { useEntityDraft } from './drafts/useEntityDraft'
import { challengeDraftFields, challengeDraftIsValid, type ChallengeDraftFields } from './drafts/challengeDraft'
import { Switch } from '@/components/ui/switch'
import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { TagPicker } from '@/components/data/TagPicker'
import { TeamVariablesEditor } from '@/components/data/TeamVariablesEditor'
import { CreateVariableDialog } from '@/components/data/CreateVariableDialog'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import {
  useGameVariables,
  useChallengeVariables,
} from '@/hooks/queries/useVariables'
import {
  useUpdateChallenge,
  useDeleteChallenge,
} from '@/hooks/mutations/useChallengeMutations'
import { ChallengeAssignmentSection } from './ChallengeAssignmentSection'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspaceContext } from '@/stores/workspaceContext'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { ResourcePicker } from '@/components/editor/ResourcePicker'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-dialog'
import { VariableAwareChipInput, type VariableAwareChipInputHandle } from '@/components/inputs/VariableAwareChipInput'
import {
  resolveTemplate,
  type VariableMap,
} from '@/lib/variables/resolveTemplate'
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
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)
  const { active } = useWorkspaceContext()
  const orgId = active.type === 'org' ? active.orgId : undefined

  // Resource picker state
  const [showResourcePicker, setShowResourcePicker] = useState(false)
  const [activeEditorField, setActiveEditorField] = useState<
    'content' | 'completion' | null
  >(null)
  const contentEditorRef = useRef<
    | ((resource: {
        id: string
        name: string
        sizeBytes: number
        contentType: string
      }) => void)
    | null
  >(null)
  const completionEditorRef = useRef<
    | ((resource: {
        id: string
        name: string
        sizeBytes: number
        contentType: string
      }) => void)
    | null
  >(null)

  // Refs for programmatic pill insertion after the create-variable dialog
  // resolves — one per editor so we can insert into the originating field.
  const contentInsertVariableRef = useRef<((key: string) => void) | null>(null)
  const answerInputRef = useRef<VariableAwareChipInputHandle>(null)
  const completionInsertVariableRef = useRef<((key: string) => void) | null>(
    null,
  )

  // Create-variable dialog state — opened from the `{{foo` autocomplete.
  const [createVarDialogOpen, setCreateVarDialogOpen] = useState(false)
  const [createVarInitialKey, setCreateVarInitialKey] = useState('')
  const [createVarTargetField, setCreateVarTargetField] = useState<
    'content' | 'completion'
  >('content')

  const challenge = challenges.find((c) => c.id === challengeId)

  // Preview-as-team state — toggles the editors from authoring to read-only
  // rendering with `{{key}}` references resolved for the selected team.
  const [previewMode, setPreviewMode] = useState(false)
  const [previewTeamId, setPreviewTeamId] = useState<string | null>(null)

  // Local form state lives in a persisted, account-scoped draft (see
  // drafts/useEntityDraft): a refetch never overwrites what the operator
  // typed, and the draft survives leaving the editor or a killed WebView.
  const accountId = useAuthStore((s) => s.user?.id)
  const correctAnswerKey = challenge?.correctAnswer?.join('\u0000')
  const unlocksKey = challenge?.unlocksBaseIds?.join('\u0000')
  const serverFields = useMemo(
    () => (challenge ? challengeDraftFields(challenge) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      challenge?.id,
      challenge?.title,
      challenge?.answerType,
      challenge?.autoValidate,
      challenge?.description,
      challenge?.content,
      correctAnswerKey,
      challenge?.points,
      challenge?.operatorNotes,
      challenge?.locationBound,
      unlocksKey,
      challenge?.completionContent,
    ],
  )
  const saveFields = useCallback(
    async (fields: ChallengeDraftFields) => {
      const current = challenges.find((c) => c.id === challengeId)
      if (!current) throw new Error(t('build.challengeNotFound'))
      const updated = await updateChallenge.mutateAsync({
        challengeId,
        dto: {
          title: fields.title,
          answerType: fields.answerType,
          autoValidate: fields.autoValidate,
          description: fields.description,
          content: fields.content,
          correctAnswer: fields.correctAnswer.length > 0 ? fields.correctAnswer : undefined,
          points: Number(fields.points) || 0,
          operatorNotes: fields.operatorNotes || undefined,
          locationBound: fields.locationBound,
          completionContent: fields.completionContent,
          // Unlock targets need a pinned, location-bound challenge; the server
          // ignores them otherwise, so send exactly what the editor shows.
          unlocksBaseIds: fields.locationBound && current.fixedBaseId ? fields.unlocks : [],
          // The update replaces the whole row: fields this form does not edit
          // are carried over, or the server would clear them.
          tagIds: current.tagIds ?? [],
          requirePresenceToSubmit: current.requirePresenceToSubmit ?? false,
        },
      })
      return challengeDraftFields(updated)
    },
    [challenges, challengeId, updateChallenge, t],
  )
  const describeSaveError = useCallback(
    (error: unknown) => getApiErrorMessage(error, t('common.unknownError')),
    [t],
  )
  // Unknown {{variables}} are only a warning, but they are worth a look before
  // the row goes out, so the background save waits until they are resolved.
  const [autosaveAllowed, setAutosaveAllowed] = useState(true)
  const draft = useEntityDraft<ChallengeDraftFields>({
    key: draftKey(accountId, gameId, 'challenge', challengeId),
    server: serverFields,
    validate: challengeDraftIsValid,
    save: saveFields,
    autosave: autosaveAllowed,
    describeError: describeSaveError,
  })
  const fields = draft.fields ?? serverFields
  const localTitle = fields?.title ?? ''
  const localAnswerType: AnswerType = fields?.answerType ?? 'text'
  const localAutoValidate = fields?.autoValidate ?? false
  const localDescription = fields?.description ?? ''
  const localContent = fields?.content ?? ''
  const localCorrectAnswer = useMemo(() => fields?.correctAnswer ?? [], [fields?.correctAnswer])
  const localPoints = fields?.points ?? '0'
  const localOperatorNotes = fields?.operatorNotes ?? ''
  const localLocationBound = fields?.locationBound ?? false
  const localUnlocks = useMemo(() => fields?.unlocks ?? [], [fields?.unlocks])
  const localCompletionContent = fields?.completionContent ?? ''
  const update = draft.update
  const setLocalTitle = (title: string) => update({ title })
  const setLocalAnswerType = (answerType: AnswerType) => update({ answerType })
  const setLocalAutoValidate = (autoValidate: boolean) => update({ autoValidate })
  const setLocalDescription = (description: string) => update({ description })
  const setLocalContent = useCallback((content: string) => update({ content }), [update])
  const setLocalCorrectAnswer = useCallback((correctAnswer: string[]) => update({ correctAnswer }), [update])
  const setLocalPoints = (points: string) => update({ points })
  const setLocalOperatorNotes = (operatorNotes: string) => update({ operatorNotes })
  const setLocalLocationBound = (locationBound: boolean) => update({ locationBound })
  const setLocalUnlocks = (unlocks: string[]) => update({ unlocks })
  const setLocalCompletionContent = useCallback((completionContent: string) => update({ completionContent }), [update])

  // For delete cascade count
  // Hidden bases this challenge may reveal; never its own pinned base.
  const hiddenTargets = useMemo(
    () =>
      bases.filter((base) => base.hidden && base.id !== challenge?.fixedBaseId),
    [bases, challenge?.fixedBaseId],
  )
  // A base opens from exactly one challenge (the server rejects a second),
  // so a target another challenge already reveals is shown but not offered.
  const claimedBy = useMemo(() => {
    const map = new Map<string, string>()
    for (const other of challenges) {
      if (other.id === challengeId) continue
      for (const baseId of other.unlocksBaseIds ?? [])
        map.set(baseId, other.title)
    }
    return map
  }, [challenges, challengeId])

  const challengeAssignments = useMemo(
    () => assignments.filter((a) => a.challengeId === challengeId),
    [assignments, challengeId],
  )

  const showAnswerConfig = localAnswerType === 'text' && localAutoValidate

  // Undefined-key guard: collect every `{{key}}` referenced in authoring
  // fields and flag any that aren't defined as game/challenge variables.
  const undefinedKeys = useMemo(
    () =>
      findUndefinedReferences(
        [
          localContent,
          localCompletionContent,
          ...(showAnswerConfig ? localCorrectAnswer : []),
        ],
        new Set(availableKeys),
      ),
    [
      localContent,
      localCompletionContent,
      localCorrectAnswer,
      availableKeys,
      showAnswerConfig,
    ],
  )
  const wantAutosave = undefinedKeys.length === 0
  if (wantAutosave !== autosaveAllowed) setAutosaveAllowed(wantAutosave)

  const handleSave = useCallback(() => {
    if (undefinedKeys.length > 0) {
      const ok = window.confirm(
        `Undefined variables: ${undefinedKeys
          .map((k) => `{{${k}}}`)
          .join(
            ', ',
          )}\n\nThese references won't resolve for any team. Save anyway?`,
      )
      if (!ok) return
    }
    // The explicit button always sends the row, edited or not.
    void draft.saveNow({ force: true })
  }, [undefinedKeys, draft])

  // Preview-team resolution: merge game + challenge vars, challenge wins.
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  )
  const previewTeam = useMemo(
    () =>
      sortedTeams.find((tm) => tm.id === previewTeamId) ??
      sortedTeams[0] ??
      null,
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
  // The rich text editors take their initial content once, so the form waits
  // for the draft (a recovered one included) before it mounts them.
  if (!draft.fields) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm" data-testid="challenge-detail-loading">
        {t('common.loading')}
      </div>
    )
  }

  const deleteCascadeCount = challengeAssignments.length
  const deleteDescription =
    t('common.confirm.deleteChallengeDescription') +
    (deleteCascadeCount > 0
      ? ' ' +
        t('common.confirm.deleteChallengeCascade', {
          count: deleteCascadeCount,
        })
      : '')

  return (
    <div className="p-4 space-y-0" data-testid="challenge-detail">
      {/* Identity section */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('build.editor.identity')}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.title')}
            </label>
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              data-testid="challenge-title-input"
              className="min-h-11 text-base"
            />
          </div>

          {/* The short description is metadata: it sits with the title and
              type, and players still see it as today. */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.description')}
            </label>
            <Textarea
              rows={3}
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              data-testid="challenge-description"
              className="text-sm resize-none"
            />
          </div>

          {/* Answer type selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.answerType')}
            </label>
            <div
              className="flex flex-wrap gap-1.5"
              data-testid="answer-type-group"
            >
              {ANSWER_TYPES.map((at) => (
                <button
                  key={at.value}
                  type="button"
                  onClick={() => setLocalAnswerType(at.value)}
                  aria-pressed={localAnswerType === at.value}
                  data-testid={`answer-type-${at.value}`}
                  className={cn(
                    'min-h-11 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border',
                    localAnswerType === at.value
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground',
                  )}
                >
                  {t(`build.editor.${at.value}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Matching answers is only applicable to text submissions. */}
          {localAnswerType === 'text' && (
            <div className="flex min-h-11 items-center justify-between gap-3">
              <label
                htmlFor="challenge-auto-validate"
                className="flex-1 cursor-pointer py-2 text-sm"
              >
                {t('build.editor.autoValidate')}
              </label>
              <Switch
                id="challenge-auto-validate"
                checked={localAutoValidate}
                onCheckedChange={setLocalAutoValidate}
                data-testid="auto-validate-toggle"
              />
            </div>
          )}

          {/* Accepted answers belong to the switch: they show while checking
              is on and keep their values while it is off. */}
          {showAnswerConfig && (
            <div className="space-y-2" data-testid="answer-configuration">
              <label className="block text-xs text-muted-foreground">
                {t('build.editor.answerConfiguration')}
              </label>
              {previewMode ? (
                <div
                  data-testid="correct-answer-preview"
                  className="flex flex-wrap gap-2 rounded-md border border-input bg-muted/30 px-2 py-1.5 min-h-[34px]"
                >
                  {localCorrectAnswer.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      {t('build.editor.noAnswers')}
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
                  ref={answerInputRef}
                  chips={localCorrectAnswer}
                  onChange={setLocalCorrectAnswer}
                  availableKeys={availableKeys}
                  placeholder={t('build.correctAnswerPlaceholder')}
                  data-testid="correct-answer-input"
                />
              )}
              {undefinedKeys.length > 0 && (
                <p
                  className="text-[10px] text-destructive"
                  data-testid="undefined-key-warning"
                >
                  {t('build.editor.unknownVariables')}{' '}
                  {undefinedKeys.map((k) => `{{${k}}}`).join(', ')}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {t('build.editor.answerHint')}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Content section */}
      <section className="border-t border-border pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('build.editor.content')}
          </h3>
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label={t('build.editor.editorMode')}
              className="inline-flex rounded-md border border-border p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!previewMode}
                onClick={() => setPreviewMode(false)}
                data-testid="preview-edit-btn"
                className={cn(
                  'min-h-11 px-2 py-0.5 text-sm rounded cursor-pointer transition-colors',
                  !previewMode
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('build.editor.edit')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={previewMode}
                onClick={() => setPreviewMode(true)}
                disabled={sortedTeams.length === 0}
                data-testid="preview-preview-btn"
                className={cn(
                  'min-h-11 px-2 py-0.5 text-sm rounded cursor-pointer transition-colors',
                  previewMode
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                  sortedTeams.length === 0 && 'opacity-40 cursor-not-allowed',
                )}
                title={
                  sortedTeams.length === 0
                    ? t('build.previewNeedsTeam')
                    : undefined
                }
              >
                {t('build.editor.preview')}
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
          <div data-testid="challenge-content">
            <label className="block text-xs text-muted-foreground mb-1">
              {t('build.editor.content')}
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
                key={`content-${draft.generation}`}
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

      {/* Points stay visible as a single row. */}
      <section className="flex items-center justify-between gap-3 border-t border-border pt-3 mt-3">
        <div className="contents">
          <label htmlFor="challenge-points" className="text-sm">
            {t('build.editor.points')}
          </label>
          <Input
            type="number"
            value={localPoints}
            onChange={(e) => setLocalPoints(e.target.value)}
            id="challenge-points"
            data-testid="points-input"
            className="w-24 h-10 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </section>

      {/* Assignment section */}
      <ChallengeAssignmentSection
        gameId={gameId}
        challengeId={challengeId}
        assignments={assignments}
        bases={bases}
        teams={teams}
        onNavigateToBase={selectBase}
        challenges={challenges}
      />

      {/* Operator notes */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('build.editor.notes')}
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
          {t('build.editor.location')}
        </h3>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label
            htmlFor="challenge-location-bound"
            className="flex-1 cursor-pointer py-2 text-sm"
          >
            {t('build.editor.physicalPresence')}
          </label>
          <Switch
            id="challenge-location-bound"
            checked={localLocationBound}
            onCheckedChange={setLocalLocationBound}
            data-testid="location-bound-toggle"
          />
        </div>
      </section>

      {/* Reveals bases: an unlock chain */}
      <section className="space-y-2" data-testid="unlocks-section">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('build.unlocks.title')}
        </h3>
        {!challenge.fixedBaseId || !localLocationBound ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="unlocks-hint"
          >
            {t('build.unlocks.needsPinAndLocation')}
          </p>
        ) : hiddenTargets.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="unlocks-hint"
          >
            {t('build.unlocks.noHiddenBases')}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t('build.unlocks.hint')}
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={t('build.unlocks.title')}
              data-testid="unlocks-bases"
            >
              {hiddenTargets.map((base) => {
                const on = localUnlocks.includes(base.id)
                const claimant = on ? undefined : claimedBy.get(base.id)
                return (
                  <button
                    key={base.id}
                    type="button"
                    aria-pressed={on}
                    disabled={Boolean(claimant)}
                    title={
                      claimant
                        ? t('build.unlocks.claimedBy', { challenge: claimant })
                        : undefined
                    }
                    onClick={() =>
                      setLocalUnlocks(
                        on
                          ? localUnlocks.filter((id) => id !== base.id)
                          : [...localUnlocks, base.id],
                      )
                    }
                    data-testid={`unlocks-base-${base.id}`}
                    className={cn(
                      'min-h-11 px-3 py-1.5 text-sm font-medium rounded-md transition-colors border',
                      claimant
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer',
                      on
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-background text-muted-foreground border-border hover:text-foreground',
                    )}
                  >
                    {base.name}
                    {claimant && (
                      <span className="sr-only">
                        {' '}
                        ·{' '}
                        {t('build.unlocks.claimedBy', { challenge: claimant })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Tags section */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('build.editor.tags')}
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
                unlocksBaseIds: challenge.unlocksBaseIds ?? [],
                requirePresenceToSubmit: challenge.requirePresenceToSubmit,
                tagIds,
              },
            })
          }}
        />
      </section>

      <RuleSection
        key={`variables-${challengeId}`}
        title={t('build.rules.variables')}
        configured={challengeVars.length > 0}
      >
        {/* Challenge Variables */}
        <section>
          <TeamVariablesEditor
            gameId={gameId}
            challengeId={challengeId}
            teams={teams}
          />
        </section>
      </RuleSection>
      <RuleSection
        key={`afterCompletion-${challengeId}`}
        title={t('build.editor.afterCompletion')}
        configured={Boolean(challenge.completionContent)}
      >
        {/* Post-completion content */}
        <section>
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
                key={`completion-${draft.generation}`}
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
      </RuleSection>
      {/* Resource picker modal */}
      {showResourcePicker && (
        <ResourcePicker
          gameId={gameId}
          orgId={orgId}
          onSelect={(resource) => {
            const ref =
              activeEditorField === 'content'
                ? contentEditorRef
                : completionEditorRef
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

      {/* Save button: valid edits also save on their own after a pause. */}
      <div className="sticky bottom-0 z-10 border-t border-border bg-card py-3 mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSave}
          loading={draft.status.state === 'saving'}
          disabled={draft.conflict}
          data-testid="save-challenge"
          size="sm"
        >
          <Save className="h-4 w-4" />
          {t('common.save')}
        </Button>
        <SaveStatusIndicator
          state={draft.status.state}
          error={draft.status.error}
          onRetry={() => void draft.saveNow()}
          onDiscard={() => { answerInputRef.current?.discardPending(); draft.discard() }}
          onKeepMine={draft.keepMine}
          onUseLatest={() => { answerInputRef.current?.discardPending(); draft.discard() }}
          data-testid="challenge-save-status"
        />
      </div>

      {/* Delete */}
      <div className="border-t border-border pt-4 mt-4">
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="delete-challenge-btn"
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          {t('build.editor.delete')}
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false)
          deleteChallenge.mutate(challengeId, {
            onSuccess: () => selectChallenge(null),
          })
        }}
        title={t('common.confirm.deleteChallengeTitle')}
        description={deleteDescription}
      />
    </div>
  )
}
