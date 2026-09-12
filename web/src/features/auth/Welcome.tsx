import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { buttonVariants, cn } from '@/components'
import { BrandMark } from '@/components/brand'
import { Screen } from '@/features/player/components/Screen'

/** The native home for anonymous visitors: join a game, or sign in to an account. */
export default function Welcome() {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp' })
  return (
    <Screen className="justify-center">
      <div className="my-auto flex flex-col items-center gap-6 py-8 text-center">
        <BrandMark size={56} />
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{t('welcome.title')}</h1>
          <p className="mt-2 max-w-[34ch] text-muted-foreground">{t('welcome.subtitle')}</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Link to="/join" className={cn(buttonVariants({ size: 'lg' }), 'text-base')} data-testid="welcome-join">{t('welcome.joinGame')}</Link>
          <Link to="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'text-base')} data-testid="welcome-sign-in">{t('welcome.operatorLogin')}</Link>
        </div>
      </div>
    </Screen>
  )
}
