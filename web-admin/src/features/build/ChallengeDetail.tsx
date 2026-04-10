import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Save } from 'lucide-react'
import { useChallenges } from '@/hooks/queries/useChallenges'
import { useAssignments } from '@/hooks/queries/useAssignments'
import { useBases } from '@/hooks/queries/useBases'
import { useTeams } from '@/hooks/queries/useTeams'
import { useUpdateChallenge } from '@/hooks/mutations/useChallengeMutations'
import { useWorkspaceStore } from '@/stores/workspace'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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
  const selectBase = useWorkspaceStore((s) => s.selectBase)

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
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Content
            </label>
            <Textarea
              rows={4}
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              placeholder="Rich content placeholder (Tiptap editor coming soon)"
              data-testid="challenge-content"
              className="text-sm resize-none"
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
              <button
                type="button"
                onClick={() => selectBase(assignedBase.id)}
                className="text-sm text-primary hover:underline cursor-pointer"
                data-testid="assigned-base-link"
              >
                {assignedBase.name}
              </button>
            ) : (
              <span className="text-sm text-warning font-medium">
                Not assigned to any base
              </span>
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
            ) : isGlobal ? (
              <span className="text-sm text-muted-foreground">All teams</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {teams
                  .filter((t) => assignedTeamIds.has(t.id))
                  .map((team) => (
                    <span
                      key={team.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${team.color}15`,
                        color: team.color,
                        border: `1px solid ${team.color}40`,
                      }}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      {team.name}
                    </span>
                  ))}
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

      {/* Post-completion content */}
      <section className="border-t border-border pt-4 mt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Post-completion
        </h3>
        <Textarea
          rows={2}
          value={localCompletionContent}
          onChange={(e) => setLocalCompletionContent(e.target.value)}
          placeholder="What teams see after completing this challenge..."
          data-testid="completion-content"
          className="text-sm resize-none"
        />
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
    </div>
  )
}
