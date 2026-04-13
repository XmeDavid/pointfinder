import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'

export function BillingSuccessPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const isNewOrg = params.get('new_org') === 'true'

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['workspaces'] })
  }, [qc])

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="max-w-md w-full text-center px-6">
        <div className="flex justify-center mb-4">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {isNewOrg
            ? t('billing.orgCreated', 'Organization created!')
            : t('billing.successTitle', 'Subscription activated!')}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t('billing.successDesc', 'Your subscription is now active.')}
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t('billing.goToDashboard', 'Go to Dashboard')}
        </button>
      </div>
    </div>
  )
}
