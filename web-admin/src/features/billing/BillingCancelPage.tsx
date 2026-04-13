import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { XCircle } from 'lucide-react'

export function BillingCancelPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="max-w-md w-full text-center px-6">
        <div className="flex justify-center mb-4">
          <XCircle className="h-16 w-16 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t('billing.cancelledTitle', 'Checkout cancelled')}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t('billing.cancelledDesc', 'No charges were made. You can try again anytime.')}
        </p>
        <button
          onClick={() => navigate('/billing')}
          className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t('billing.returnToBilling', 'Return to billing')}
        </button>
      </div>
    </div>
  )
}
