import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandLockup } from '@/components/brand'
import { Screen } from '@/features/player/components/Screen'
import { AccountCredentialsForm } from '@/features/player/components/AccountCredentialsForm'

/** Sign in or create an account before joining; `next` says where to continue. */
export default function AccountSignInScreen() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') && params.get('next')!.startsWith('/') ? params.get('next')! : '/join'
  const initialMode = params.get('mode') === 'signIn' ? 'signIn' : 'create'
  return (
    <Screen>
      <Link className="text-sm text-muted-foreground" to="/join">{t('common.back')}</Link>
      <BrandLockup size={22} className="text-sm" />
      <h1 className="text-2xl font-semibold leading-tight text-balance">{initialMode === 'signIn' ? t('account.signInTitle') : t('account.createAccountTitle')}</h1>
      <p className="text-muted-foreground">{t('account.subtitle')}</p>
      <AccountCredentialsForm initialMode={initialMode} onDone={() => navigate(next, { replace: true })} />
    </Screen>
  )
}
