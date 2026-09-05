import { useTranslation } from 'react-i18next'
import { Bell, Camera, MapPin } from 'lucide-react'
import { Button } from '@/components'
import { Screen } from '@/features/player/components/Screen'

/**
 * Shown once on phones before the first join, ahead of any system permission prompt,
 * so players know why location, notifications and the camera will be requested.
 */
export function PermissionDisclosure({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp.disclosure' })
  const items = [
    { icon: MapPin, title: t('locationTitle'), detail: t('locationDetail') },
    { icon: Bell, title: t('notificationsTitle'), detail: t('notificationsDetail') },
    { icon: Camera, title: t('cameraTitle'), detail: t('cameraDetail') },
  ]
  return (
    <Screen bottomBar={<Button size="lg" className="w-full text-base" onClick={onContinue} data-testid="disclosure-continue-btn">{t('continue')}</Button>}>
      <header className="flex flex-col gap-2 pt-6">
        <h1 className="text-2xl font-semibold leading-tight text-balance">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ul className="flex flex-col gap-3" aria-label={t('title')}>
        {items.map(({ icon: Icon, title, detail }) => (
          <li key={title} className="flex gap-3 rounded-lg border border-border bg-card p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('footer')}</p>
    </Screen>
  )
}
