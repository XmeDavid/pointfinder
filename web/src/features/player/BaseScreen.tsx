import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Nfc } from 'lucide-react'
import type { SubmissionResponse } from '@pointfinder/api'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Skeleton, Textarea } from '@/components'
import { usePlayerGame, type ActionResult } from '@/features/player/usePlayerGame'
import { challengeForBase } from '@/features/player/logbook'
import { nfcErrorMessage, scanTag } from '@/platform/nfc'
import { isNative } from '@/platform'
import { Screen } from '@/features/player/components/Screen'
import { BaseStatusBadge } from '@/features/player/components/BaseStatusBadge'
import { RichContent } from '@/features/player/components/RichContent'
import { SubmissionResult, type SubmissionOutcome } from '@/features/player/components/SubmissionResult'
import { MediaAnswer } from '@/features/player/components/MediaAnswer'
import { SyncBanner } from '@/features/player/components/SyncBanner'
import { describeError } from '@/app/player/errors'
import { useAuth } from '@/app/player/services'

type Notice = { tone: 'success' | 'info' | 'warning' | 'destructive'; text: string }

/** One base: check in by tag, then solve its challenge. Reached from the logbook or straight from a tag tap. */
export default function BaseScreen() {
  const { baseId } = useParams()
  const auth = useAuth()
  return <BaseContent key={`${auth.kind === 'player' ? auth.playerId : ''}:${baseId}`} />
}

function submissionOutcome(status?: string | null): SubmissionOutcome | null {
  if (status === 'correct' || status === 'approved' || status === 'rejected') return status
  return status === 'pending' || status === 'submitted' ? 'pending' : null
}

function BaseContent() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const { baseId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const game = usePlayerGame()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [answer, setAnswer] = useState('')
  const [lastSubmission, setLastSubmission] = useState<SubmissionResponse | null>(null)
  const [outcome, setOutcome] = useState<SubmissionOutcome | null>(null)
  const autoToken = useRef<string | null>(null)

  const entry = game.logbook?.entries.find((e) => e.baseId === baseId) ?? null
  const view = entry?.kind === 'open' ? entry.view : null
  const challenge = game.data && game.teamId ? challengeForBase(game.data, baseId, game.teamId) : null
  const status = view?.effectiveStatus ?? 'not_visited'
  const gameStatus = game.snapshot?.game.status ?? 'live'
  const gameLive = gameStatus === 'live'
  const needsPresence = Boolean(challenge?.requirePresenceToSubmit) && isNative()
  const pendingSubmission = game.pending.find((a) => a.type === 'submission' && a.baseId === baseId)
  const latestSubmission = game.snapshot?.submissions.filter((s) => s.baseId === baseId).sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))[0]
  const serverSubmission = !lastSubmission || latestSubmission?.id === lastSubmission.id || (latestSubmission?.submittedAt && latestSubmission.submittedAt >= lastSubmission.submittedAt)
    ? latestSubmission : undefined
  // Queue and snapshot updates keep an open result current after reconnect or review.
  const displayedOutcome = pendingSubmission
    ? pendingSubmission.state === 'failed' ? null : 'queued'
    : submissionOutcome(serverSubmission?.status) ?? (outcome === 'queued' ? null : outcome)

  function report(result: ActionResult, kind: 'check_in' | 'submit') {
    if (result.state === 'failed') return setNotice({ tone: 'destructive', text: result.error })
    if (result.state === 'auth') return setNotice({ tone: 'destructive', text: t('sync.needsLogin') })
    if (kind === 'check_in') {
      if (result.state === 'queued') return setNotice({ tone: 'warning', text: t('base.queued') })
      return setNotice({ tone: 'success', text: t('checkIn.success') })
    }
    if (result.state === 'queued') return setOutcome('queued')
    const res = result.response as SubmissionResponse | undefined
    if (res) setLastSubmission(res)
    switch (res?.status) {
      case 'correct': return setOutcome('correct')
      case 'approved': return setOutcome('approved')
      case 'rejected': return setOutcome('rejected')
      default: return setOutcome('pending')
    }
  }

  async function checkInWith(token: string) {
    setBusy(true)
    setNotice(null)
    try {
      report(await game.checkIn(baseId, token), 'check_in')
    } catch (err) {
      setNotice({ tone: 'destructive', text: describeError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  // Arrived straight from a tag: check in without another tap.
  useEffect(() => {
    const token = params.get('token')
    if (token === null || token === autoToken.current || !view || status !== 'not_visited' || !gameLive) return
    autoToken.current = token
    setParams({}, { replace: true })
    void checkInWith(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status, params, gameLive])

  // Check-in-only challenges complete themselves once the team is checked in (old app behaviour).
  const autoSubmitted = useRef(false)
  useEffect(() => {
    if (!gameLive || !challenge || challenge.answerType !== 'none' || status !== 'checked_in' || autoSubmitted.current || busy) return
    autoSubmitted.current = true
    setBusy(true)
    game.submit(baseId, challenge.id, '').then((r) => report(r, 'submit')).catch((err) => setNotice({ tone: 'destructive', text: describeError(err, t) })).finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id, status, gameLive])

  async function tapTag() {
    setNotice(null)
    try {
      const { tag } = await scanTag(t, { baseTitle: entry?.kind === 'open' ? entry.title : undefined })
      if (!tag) return setNotice({ tone: 'destructive', text: t('nfc.invalid') })
      if (tag.baseId !== baseId) return setNotice({ tone: 'destructive', text: t('base.wrongTag') })
      await checkInWith(tag.token ?? '')
    } catch (err) {
      setNotice({ tone: 'destructive', text: nfcErrorMessage(err, t) })
    }
  }

  /** Challenges flagged requirePresenceToSubmit make the team tap the base tag again before sending. */
  async function confirmPresence(): Promise<boolean> {
    if (!needsPresence) return true
    try {
      const { tag } = await scanTag(t, { baseTitle: entry?.kind === 'open' ? entry.title : undefined })
      if (!tag) { setNotice({ tone: 'destructive', text: t('nfc.invalid') }); return false }
      if (tag.baseId !== baseId) { setNotice({ tone: 'destructive', text: t('solve.wrongBase', { name: entry?.kind === 'open' ? entry.title : '' }) }); return false }
      return true
    } catch (err) {
      setNotice({ tone: 'destructive', text: nfcErrorMessage(err, t) })
      return false
    }
  }

  async function sendAnswer(e: FormEvent) {
    e.preventDefault()
    if (!challenge || !gameLive || busy) return
    setNotice(null)
    setBusy(true)
    try {
      if (!(await confirmPresence())) return
      report(await game.submit(baseId, challenge.id, answer.trim()), 'submit')
    } catch (err) {
      setNotice({ tone: 'destructive', text: describeError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  async function sendMedia(files: File[], note: string) {
    if (!challenge || !gameLive || busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (!(await confirmPresence())) return
      report(await game.submitMedia(baseId, challenge.id, note, files), 'submit')
    } catch (err) {
      setNotice({ tone: 'destructive', text: describeError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  async function retryCompletion() {
    if (!challenge || !gameLive || busy) return
    setBusy(true)
    setNotice(null)
    try { report(await game.submit(baseId, challenge.id, ''), 'submit') }
    catch (err) { setNotice({ tone: 'destructive', text: describeError(err, t) }) }
    finally { setBusy(false) }
  }

  const unlockedCount = game.unlocked.length

  return (
    <Screen>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground" onClick={() => game.clearUnlocked()}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> {t('common.back')}
      </Link>

      <SyncBanner fromCache={game.fromCache} pending={game.pending} needsAuth={game.needsAuth} onRetry={(id) => void game.retry(id)} onDiscard={(id) => void game.discard(id)} />

      {game.isLoading && !game.logbook && <Skeleton className="h-24 w-full" aria-busy />}
      {game.error && <Alert variant="destructive" role="alert">{describeError(game.error, t)} <Button variant="link" onClick={game.refetch}>{t('common.retry')}</Button></Alert>}

      {game.logbook && !entry && <Alert variant="destructive">{t('base.unknownTag')}</Alert>}
      {entry?.kind === 'locked' && <Alert variant="info">{t('logbook.lockedHint')}</Alert>}

      {view && (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold leading-tight text-balance">{entry?.kind === 'open' ? entry.title || t('challenge.noChallenge') : ''}</h1>
            <div className="flex items-center gap-2">
              <BaseStatusBadge status={status} pendingSync={view.pendingSync} />
              {view.checkedInAt && <span className="text-sm text-muted-foreground">{t('base.checkedInAt', { time: new Date(view.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>}
            </div>
          </header>

          {notice && <Alert variant={notice.tone === 'success' ? 'info' : notice.tone} className={notice.tone === 'success' ? 'bg-success/10 text-success' : undefined} role="status">{notice.text}</Alert>}
          {unlockedCount > 0 && !outcome && <Alert variant="info" className="bg-success/10 text-success">{t('base.unlocked', { count: unlockedCount })}</Alert>}

          {status === 'not_visited' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('checkIn.title')}</CardTitle>
                <CardDescription>{view.nfcLinked ? t('base.tapToCheckIn') : t('base.noNfc')}</CardDescription>
              </CardHeader>
              {view.nfcLinked && isNative() && gameLive && (
                <CardContent>
                  <Button size="lg" className="w-full text-base" disabled={busy} onClick={tapTag}>
                    <Nfc className="mr-2 h-5 w-5" aria-hidden /> {busy ? t('checkIn.scanning') : t('checkIn.tapTag')}
                  </Button>
                </CardContent>
              )}
            </Card>
          )}

          {displayedOutcome && (
            <SubmissionResult outcome={displayedOutcome} feedback={!serverSubmission || serverSubmission.status === lastSubmission?.status ? lastSubmission?.feedback : undefined} completionContent={lastSubmission?.completionContent ?? challenge?.completionContent} unlockedCount={unlockedCount} />
          )}

          {status !== 'not_visited' && challenge && (!displayedOutcome || displayedOutcome === 'rejected') && (
            <Card>
              <CardHeader>
                <CardTitle>{challenge.title}</CardTitle>
                {challenge.description && <CardDescription>{challenge.description}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {challenge.content && <RichContent html={challenge.content} className="prose prose-sm max-w-none text-foreground" />}

                {!gameLive && (status === 'checked_in' || status === 'rejected') && (
                  <Alert variant="info" data-testid="player-game-not-live">
                    <p className="font-medium">{t('solve.gameNotLive')}</p>
                    <p className="text-sm">{t('solve.gameNotLiveExplanation')}</p>
                  </Alert>
                )}
                {gameLive && (status === 'checked_in' || status === 'rejected') && challenge.answerType === 'text' && (
                  <form className="flex flex-col gap-3" onSubmit={sendAnswer}>
                    <p className="text-sm text-muted-foreground">{needsPresence ? t('solve.presenceInstructions') : t('solve.answerInstructions')}</p>
                    <Label htmlFor="answer">{t('challenge.answerLabel')}</Label>
                    <Textarea id="answer" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t('challenge.answerPlaceholder')} required />
                    <Button size="lg" type="submit" disabled={busy || !answer.trim()} data-testid="player-answer-submit-btn">{needsPresence ? t('solve.confirmAtBase') : t('challenge.send')}</Button>
                    {needsPresence && <p className="text-xs text-muted-foreground">{t('solve.presenceHelp')}</p>}
                  </form>
                )}
                {gameLive && status === 'rejected' && challenge.answerType === 'none' && (
                  <Button size="lg" disabled={busy} onClick={() => void retryCompletion()}>{t('challenge.markDone')}</Button>
                )}
                {gameLive && (status === 'checked_in' || status === 'rejected') && challenge.answerType === 'file' && (
                  <MediaAnswer busy={busy} onSubmit={(files, note) => void sendMedia(files, note)} />
                )}
                {status === 'submitted' && !view.pendingSync && <Alert variant="info">{t('challenge.pending')}</Alert>}
                {status === 'completed' && (
                  <div className="flex flex-col gap-2">
                    <Alert variant="info" className="bg-success/10 text-success">{t('challenge.done')}</Alert>
                    {(lastSubmission?.completionContent ?? challenge.completionContent) && (
                      <RichContent html={lastSubmission?.completionContent ?? challenge.completionContent ?? ''} className="prose prose-sm max-w-none text-foreground" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {status !== 'not_visited' && !challenge && <Alert variant="info">{t('challenge.noChallenge')}</Alert>}
        </>
      )}
    </Screen>
  )
}
