import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, Nfc } from 'lucide-react'
import type { SubmissionResponse } from '@pointfinder/api'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Skeleton, Textarea } from '@pointfinder/core'
import { usePlayerGame, type ActionResult } from '../player/usePlayerGame'
import { challengeForBase } from '../player/logbook'
import { nfcErrorMessage, scanTag } from '../native/nfc'
import { isNative } from '../platform'
import { Screen } from '../components/Screen'
import { BaseStatusBadge } from '../components/BaseStatusBadge'
import { RichContent } from '../components/RichContent'

type Notice = { tone: 'success' | 'info' | 'warning' | 'destructive'; text: string }

/** One base: check in by tag, then solve its challenge. Reached from the logbook or straight from a tag tap. */
export default function BaseScreen() {
  const { t } = useTranslation()
  const { baseId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const game = usePlayerGame()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [answer, setAnswer] = useState('')
  const [lastSubmission, setLastSubmission] = useState<SubmissionResponse | null>(null)
  const autoToken = useRef<string | null>(params.get('token'))

  const entry = game.logbook?.entries.find((e) => e.baseId === baseId) ?? null
  const view = entry?.kind === 'open' ? entry.view : null
  const challenge = game.data && game.teamId ? challengeForBase(game.data, baseId, game.teamId) : null
  const status = view?.effectiveStatus ?? 'not_visited'

  function report(result: ActionResult, kind: 'check_in' | 'submit') {
    if (result.state === 'queued') return setNotice({ tone: 'warning', text: t('base.queued') })
    if (result.state === 'failed') return setNotice({ tone: 'destructive', text: result.error })
    if (result.state === 'auth') return setNotice({ tone: 'destructive', text: t('sync.needsLogin') })
    if (kind === 'check_in') return setNotice({ tone: 'success', text: t('checkIn.success') })
    const res = result.response as SubmissionResponse | undefined
    if (res) setLastSubmission(res)
    switch (res?.status) {
      case 'correct': return setNotice({ tone: 'success', text: t('challenge.correct') })
      case 'approved': return setNotice({ tone: 'success', text: t('challenge.approved') })
      case 'rejected': return setNotice({ tone: 'destructive', text: res.feedback ? t('challenge.rejectedWith', { reason: res.feedback }) : t('challenge.rejected') })
      default: return setNotice({ tone: 'info', text: t('challenge.pending') })
    }
  }

  async function checkInWith(token: string) {
    setBusy(true)
    setNotice(null)
    try {
      report(await game.checkIn(baseId, token), 'check_in')
    } finally {
      setBusy(false)
    }
  }

  // Arrived straight from a tag: check in without another tap.
  useEffect(() => {
    const token = autoToken.current
    if (token === null || !view || status !== 'not_visited') return
    autoToken.current = null
    setParams({}, { replace: true })
    void checkInWith(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status])

  // Check-in-only challenges complete themselves once the team is checked in (old app behaviour).
  const autoSubmitted = useRef(false)
  useEffect(() => {
    if (!challenge || challenge.answerType !== 'none' || status !== 'checked_in' || autoSubmitted.current || busy) return
    autoSubmitted.current = true
    setBusy(true)
    game.submit(baseId, challenge.id, '').then((r) => report(r, 'submit')).finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id, status])

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

  async function sendAnswer(e: FormEvent) {
    e.preventDefault()
    if (!challenge) return
    setBusy(true)
    setNotice(null)
    try {
      report(await game.submit(baseId, challenge.id, answer.trim()), 'submit')
    } finally {
      setBusy(false)
    }
  }

  const unlockedCount = game.unlocked.length

  return (
    <Screen>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground" onClick={() => game.clearUnlocked()}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> {t('common.back')}
      </Link>

      {game.isLoading && !game.logbook && <Skeleton className="h-24 w-full" aria-busy />}

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
          {unlockedCount > 0 && <Alert variant="info" className="bg-success/10 text-success">{t('base.unlocked', { count: unlockedCount })}</Alert>}
          {view.syncError && <Alert variant="destructive">{view.syncError}</Alert>}

          {status === 'not_visited' && (
            <Card>
              <CardHeader>
                <CardTitle>{t('checkIn.title')}</CardTitle>
                <CardDescription>{view.nfcLinked ? t('base.tapToCheckIn') : t('base.noNfc')}</CardDescription>
              </CardHeader>
              {view.nfcLinked && isNative() && (
                <CardContent>
                  <Button size="lg" className="w-full text-base" disabled={busy} onClick={tapTag}>
                    <Nfc className="mr-2 h-5 w-5" aria-hidden /> {busy ? t('checkIn.scanning') : t('checkIn.tapTag')}
                  </Button>
                </CardContent>
              )}
            </Card>
          )}

          {status !== 'not_visited' && challenge && (
            <Card>
              <CardHeader>
                <CardTitle>{challenge.title}</CardTitle>
                {challenge.description && <CardDescription>{challenge.description}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {challenge.content && <RichContent html={challenge.content} className="prose prose-sm max-w-none text-foreground" />}

                {(status === 'checked_in' || status === 'rejected') && challenge.answerType === 'text' && (
                  <form className="flex flex-col gap-3" onSubmit={sendAnswer}>
                    <Label htmlFor="answer">{t('challenge.answerLabel')}</Label>
                    <Textarea id="answer" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t('challenge.answerPlaceholder')} required />
                    <Button size="lg" type="submit" disabled={busy || !answer.trim()}>{t('challenge.send')}</Button>
                  </form>
                )}
                {status === 'rejected' && challenge.answerType === 'none' && (
                  <Button size="lg" disabled={busy} onClick={() => void game.submit(baseId, challenge.id, '').then((r) => report(r, 'submit'))}>{t('challenge.markDone')}</Button>
                )}
                {(status === 'checked_in' || status === 'rejected') && challenge.answerType === 'file' && (
                  <>
                    <Alert variant="info">{t('challenge.photoSoon')}</Alert>
                    <Button size="lg" disabled>{t('challenge.sendPhoto')}</Button>
                  </>
                )}
                {status === 'submitted' && <Alert variant="info">{t('challenge.pending')}</Alert>}
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
