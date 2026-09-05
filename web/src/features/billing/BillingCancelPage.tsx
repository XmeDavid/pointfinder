import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SurfacePanel } from '@/components/layout/SurfacePanel'

export function BillingCancelPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <SurfacePanel className="w-full max-w-md text-center" padding="lg" elevation="panel">
        <div className="flex justify-center mb-4">
          <XCircle className="h-16 w-16 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t('billing.cancelledTitle', 'Checkout cancelled')}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t('billing.cancelledDesc', 'No charges were made. You can try again anytime.')}
        </p>
        <Button
          onClick={() => navigate('/billing')}
        >
          {t('billing.returnToBilling', 'Return to billing')}
        </Button>
      </SurfacePanel>
    </div>
  )
}
