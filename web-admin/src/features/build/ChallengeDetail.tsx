import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Save, ChevronDown, X, Plus, Users } from 'lucide-react'
import { TagPicker } from '@/components/data/TagPicker'
import { TeamVariablesEditor } from '@/components/data/TeamVariablesEditor'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import { useUpdateChallenge, useDeleteChallenge } from '@/hooks/mutations/useChallengeMutations'
import { useCreateAssignment, useDeleteAssignment } from '@/hooks/mutations/useAssignmentMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { cn } from '@/lib/utils'
import type { AnswerType } from '@/types/v2'

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
  const { data: challenges = [] } = useChallenges(gameId)
  const { data: assignments = [] } = useAssignments(gameId)
  const { data: bases = [] } = useBases(gameId)
  const { data: teams = [] } = useTeams(gameId)
  const updateChallenge = useUpdateChallenge(gameId)
  const deleteChallenge = useDeleteChallenge(gameId)
  const createAssignment = useCreateAssignment(gameId)
  const deleteAssignmentMut = useDeleteAssignment(gameId)
  const selectBase = useWorkspaceStore((s) => s.selectBase)
  const selectChallenge = useWorkspaceStore((s) => s.selectChallenge)

  const [showBaseDropdown, setShowBaseDropdown] = useState(false)
  const baseDropdownRef = useRef<HTMLDivElement>(null)

  const challenge = challenges.find((c) => c.id === challengeId)

  // Local form state
  const [localTitle, setLocalTitle] = useState('')
  const [localAnswerType, setLocalAnswerType] = useState<AnswerType>('text')
  const [localAutoValidate, setLocalAutoValidate] = useState(false)
  const [localDescription, setLocalDescription] = useState('')
  const [localContent, setLocalContent] = useState('')
  const [localCorrectAnswer, setLocalCorrectAnswer] = useState('')
  const [localPoints, setLocalPoints] = useState('0')
  const [localOperatorNotes, setLocalOperatorNotes] = useState('')
  const [localLocationBound, setLocalLocationBound] = useState(false)
  const [localCompletionContent, setLocalCompletionContent] = useState('')

  // Sync local state when challenge data loads or challengeId changes
  const syncedRef = useRef<string | null>(null)
  useEffect(() => {
    if (challenge && syncedRef.current !== challengeId) {
      syncedRef.current = challengeId
      setLocalTitle(challenge.title)
      setLocalAnswerType(challenge.answerType)
      setLocalAutoValidate(challenge.autoValidate)
      setLocalDescription(challenge.description)
      setLocalContent(challenge.content)
      setLocalCorrectAnswer(challenge.correctAnswer?.join(', ') ?? '')
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
  const assignedTeamIds = new Set(
    challengeAssignments.filter((a) => a.teamId).map((a) => a.teamId),
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

  const handleSave = useCallback(() => {
    const correctAnswerArray = localCorrectAnswer.trim()
      ? localCorrectAnswer.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

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
    updateChallenge,
  ])

  if (!challenge) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Challenge not found
      </div>
    )
  }

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
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Content
        </h3>
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
            <RichTextEditor
              content={localContent}
              onChange={setLocalContent}
              placeholder="Challenge content..."
            />
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
              <Input
                value={localCorrectAnswer}
                onChange={(e) => setLocalCorrectAnswer(e.target.value)}
                placeholder="Comma-separated accepted answers"
                data-testid="correct-answer-input"
                className="h-8 text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              When auto-validate is on, submissions matching any of these
              answers are automatically approved.
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
          placeholder="Internal notes visible only to operators..."
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
          <RichTextEditor
            content={localCompletionContent}
            onChange={setLocalCompletionContent}
            placeholder="What teams see after completing this challenge..."
          />
        </div>
      </section>

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
          onClick={() => {
            if (confirm('Delete this challenge?')) {
              deleteChallenge.mutate(challengeId, { onSuccess: () => selectChallenge(null) })
            }
          }}
          data-testid="delete-challenge-btn"
          className="text-xs text-destructive hover:underline cursor-pointer"
        >
          Delete challenge
        </button>
      </div>
    </div>
  )
}
