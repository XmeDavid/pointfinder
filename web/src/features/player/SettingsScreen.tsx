import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrandLockup } from '@/components/brand'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type Language } from '@pointfinder/i18n'
import { Alert, Button, ConfirmDeleteDialog, Label, Select } from '@/components'
import { GameStatusBadge } from '@/components/status'
import { useAccountSession, useAuth, useServices } from '@/app/player/services'
import { getDeviceId } from '@/app/player/device'
import { describeError } from '@/app/player/errors'
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme'
import { onPushPermissionChange, pushPermission, requestPushPermission, type PushPermission } from '@/platform/push'
import { usePlayerGame } from '@/features/player/usePlayerGame'
import { Screen } from '@/features/player/components/Screen'
import { usePlayerTour } from '@/features/player/components/PlayerTour'

const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', pt: 'Português', de: 'Deutsch' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">{children}</div>
    </section>
  )
}

function Row({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums" data-testid={testId}>{value}</span>
    </div>
  )
}

/** Preferences, who you are in this game, progress, and the two ways out: leave the game or delete the account. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const auth = useAuth()
  const { client, account: accountServices } = useServices()
  const navigate = useNavigate()
  const game = usePlayerGame()
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference())
  const [deviceId, setDeviceId] = useState('')
  const [push, setPush] = useState<PushPermission>('unavailable')
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => setDeviceId(''))
  }, [])

  useEffect(() => {
    let alive = true
    const refresh = () => pushPermission().then((p) => alive && setPush(p)).catch(() => {})
    void refresh()
    const off = onPushPermissionChange(() => void refresh())
    return () => { alive = false; off() }
  }, [])

  const link = useQuery({ queryKey: ['account', 'link'], queryFn: () => client.api.player.account(), enabled: auth.kind === 'player' })
  const session = useAccountSession()
  const [accountAction, setAccountAction] = useState<'signOut' | 'unlink' | null>(null)
  const [verificationSent, setVerificationSent] = useState(false)

  async function resendVerification() {
    try { await accountServices.api.account.resendVerification(); setVerificationSent(true) } catch (err) { setError(describeError(err, t)) }
  }
  async function unlink() {
    setAccountAction(null)
    try { await client.api.player.unlinkAccount(); await link.refetch() } catch (err) { setError(describeError(err, t)) }
  }

  if (auth.kind !== 'player') return null

  const entries = game.logbook?.entries.filter((e) => e.kind === 'open') ?? []
  const count = (status: string) => entries.filter((e) => e.kind === 'open' && e.view.effectiveStatus === status).length
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2) as Language
  const status = game.snapshot?.game.status ?? auth.gameStatus

  async function leaveGame() {
    setLeaving(false)
    await client.session.logout()
    navigate('/', { replace: true })
  }

  async function deleteAccount() {
    setDeleting(false)
    setBusy(true)
    setError(null)
    try {
      await client.api.player.deleteMe()
      await client.session.logout()
      navigate('/', { replace: true })
    } catch (err) {
      setError(describeError(err, t) || t('settings.deleteAccountFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" aria-hidden /> {t('map.title')}</Link>
      <h1 className="text-2xl font-semibold leading-tight">{t('settings.title')}</h1>

      <Section title={t('settings.language')}>
        <div className="flex flex-col gap-2 px-4 py-3">
          <Label htmlFor="language">{t('settings.language')}</Label>
          <Select id="language" value={language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((code) => <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>)}
          </Select>
          <Label htmlFor="theme">{t('settings.theme')}</Label>
          <Select id="theme" value={theme} onChange={(e) => { const next = e.target.value as ThemePreference; setTheme(next); setThemePreference(next) }}>
            <option value="system">{t('settings.themeSystem')}</option>
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </Select>
        </div>
      </Section>

      <Section title={t('settings.currentGame')}>
        <Row label={t('settings.game')} value={game.snapshot?.game.name ?? auth.gameName} />
        <Row label={t('settings.status')} value={<GameStatusBadge status={status} />} />
        <Row label={t('settings.team')} value={<span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: auth.teamColor }} aria-hidden />{auth.teamName}</span>} />
        <Row label={t('settings.name')} value={auth.displayName} />
      </Section>

      <Section title={t('settings.progress')}>
        <Row label={t('settings.totalBases')} value={game.logbook ? entries.length : '…'} testId="settings-total-bases" />
        <Row label={t('settings.completed')} value={game.logbook ? count('completed') : '…'} testId="settings-completed" />
        <Row label={t('settings.checkedIn')} value={game.logbook ? count('checked_in') : '…'} />
        <Row label={t('settings.pendingReview')} value={game.logbook ? count('submitted') : '…'} />
      </Section>

      <Section title={t('settings.notifications')}>
        <Row
          label={t('settings.notifications')}
          testId="settings-push-status"
          value={push === 'granted' ? t('settings.notificationsOn') : push === 'denied' ? t('settings.notificationsBlocked') : push === 'unavailable' ? t('settings.notificationsUnavailable') : t('settings.notificationsOff')}
        />
        {push === 'prompt' && (
          <div className="flex flex-col gap-2 px-4 py-3">
            <p className="text-sm text-muted-foreground">{t('settings.notificationsHint')}</p>
            <Button type="button" variant="outline" onClick={() => void requestPushPermission().then(setPush).catch(() => {})} data-testid="settings-enable-push-btn">{t('settings.enableNotifications')}</Button>
          </div>
        )}
      </Section>

      <Section title={t('settings.device')}>
        <Row label={t('settings.deviceId')} value={<span className="font-mono text-xs">{deviceId ? `${deviceId.slice(0, 8)}…` : '…'}</span>} />
        <Row label={t('settings.pendingActions')} value={game.pending.length} testId="settings-pending-actions" />
      </Section>

      <Section title={t('settings.account')}>
        {!link.data ? (
          <Row label={t('settings.account')} value={link.isError ? t('common.offline') : '…'} testId="settings-account-unknown" />
        ) : link.data.linked ? (
          <div className="flex flex-col gap-2 px-4 py-3" data-testid="settings-account-linked">
            <p className="text-sm"><span className="text-muted-foreground">{t('settings.savedTo')}</span> <span className="font-medium">{link.data.email}</span></p>
            {!link.data.emailVerified && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="settings-account-unverified">
                <span>{verificationSent ? t('account.verificationSent') : t('settings.emailUnverified')}</span>
                {!verificationSent && session.kind === 'operator' && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void resendVerification()} data-testid="settings-resend-verification">{t('account.resendVerification')}</Button>}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setAccountAction('unlink')} data-testid="settings-unlink">{t('account.unlink')}</Button>
              {session.kind === 'operator' && <Button type="button" variant="outline" size="sm" onClick={() => setAccountAction('signOut')} data-testid="settings-sign-out">{t('account.signOut')}</Button>}
              <Link to="/profile" className="inline-flex min-h-11 items-center px-3 text-sm font-medium">{t("settings.manageAccount")}</Link>
            </div>
          </div>
        ) : session.kind === 'operator' ? (
          <div className="flex flex-col gap-2 px-4 py-3" data-testid="settings-account-signed-in">
            <p className="text-sm"><span className="text-muted-foreground">{t('account.signedInAs')}</span> <span className="font-medium">{session.email}</span></p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/account" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" data-testid="settings-save-progress">{t('account.saveToAccount', { email: session.email })}</Link>
              <Button type="button" variant="outline" size="sm" onClick={() => setAccountAction('signOut')} data-testid="settings-sign-out">{t('account.signOut')}</Button>
            </div>
          </div>
        ) : (
          <Link to="/account" className="flex min-h-12 flex-col justify-center px-4 py-2.5" data-testid="settings-save-progress">
            <span className="text-sm font-medium">{t('settings.saveProgress')}</span>
            <span className="text-xs text-muted-foreground">{t('settings.saveProgressHint')}</span>
          </Link>
        )}
      </Section>

      <Section title={t('settings.help')}>
        <Button variant="ghost" className="w-full min-h-12 justify-start px-4" onClick={()=>{usePlayerTour.getState().start();navigate("/")}} data-testid="settings-how-it-works">{t("settings.howItWorks")}</Button>
      </Section>

      <Section title={t('settings.privacy')}>
        <Link to="/privacy" className="flex min-h-12 items-center px-4 py-2.5 text-sm font-medium">{t('settings.privacyPolicy')}</Link>
      </Section>

      {error && <Alert variant="destructive" role="alert">{error}</Alert>}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Button variant="outline" size="lg" onClick={() => setLeaving(true)} disabled={busy}>{t('settings.leaveGame')}</Button>
        {link.data?.linked === false && session.kind !== "operator" && <Button variant="ghost" size="lg" className="text-destructive" onClick={() => setDeleting(true)} disabled={busy}>
          {busy ? t('settings.deletingAccount') : t('settings.deleteAccount')}
        </Button>}
        <BrandLockup size={20} className="mx-auto pt-2 text-sm text-muted-foreground" textClassName="font-medium" />
      </div>

      <ConfirmDeleteDialog
        open={accountAction === 'signOut'}
        onCancel={() => setAccountAction(null)}
        onConfirm={() => { setAccountAction(null); void accountServices.signOut() }}
        title={t('account.signOutConfirmTitle')}
        description={t('account.signOutConfirm')}
        confirmLabel={t('account.signOut')}
        variant="default"
      />
      <ConfirmDeleteDialog
        open={accountAction === 'unlink'}
        onCancel={() => setAccountAction(null)}
        onConfirm={() => void unlink()}
        title={t('account.unlinkTitle')}
        description={t('account.unlinkConfirm')}
        confirmLabel={t('account.unlink')}
        variant="default"
      />
      <ConfirmDeleteDialog
        open={leaving}
        title={game.pending.length > 0 ? t('settings.leaveGameUnsyncedTitle') : t('settings.leaveGameTitle')}
        description={game.pending.length > 0 ? t('settings.leaveGameUnsyncedMessage', { count: game.pending.length }) : t('settings.leaveGameMessage')}
        confirmLabel={t('settings.leaveGame')}
        variant={game.pending.length > 0 ? 'destructive' : 'default'}
        onCancel={() => setLeaving(false)}
        onConfirm={() => void leaveGame()}
      />
      <ConfirmDeleteDialog
        open={deleting}
        title={t('settings.deleteAccountTitle')}
        description={t('settings.deleteAccountMessage')}
        confirmLabel={t('settings.deleteAccountConfirm')}
        onCancel={() => setDeleting(false)}
        onConfirm={() => void deleteAccount()}
      />
    </Screen>
  )
}
