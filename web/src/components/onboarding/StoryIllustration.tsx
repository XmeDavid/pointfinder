import { useState } from 'react'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** Decorative art never gates story navigation or account actions. */
export function StoryIllustration({ src }: { src: string }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'playerApp.onboarding' })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  return <div className="onboarding-art" data-testid="onboarding-scene" data-state={status}>
    <div className="onboarding-art-placeholder" aria-hidden="true"><Compass size={56} strokeWidth={1} /></div>
    {status !== 'error' && <img key={attempt} className="onboarding-still" src={src} alt="" width={1254} height={1254} draggable={false} decoding="async" fetchPriority="high"
      onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
    {status === 'error' && <div className="onboarding-art-error" role="status">
      <p>{t('unavailable')}</p>
      <Button variant="outline" size="sm" onClick={() => { setStatus('loading'); setAttempt(attempt + 1) }}>{t('retry')}</Button>
    </div>}
  </div>
}
