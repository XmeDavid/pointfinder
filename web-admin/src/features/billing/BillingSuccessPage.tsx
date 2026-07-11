import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SurfacePanel } from '@/components/layout/SurfacePanel'

export function BillingSuccessPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const isNewOrg = params.get('new_org') === 'true'

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['workspaces'] })
    qc.invalidateQueries({ queryKey: ['quota'] })
    qc.invalidateQueries({ queryKey: ['billing-status'] })
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }, [qc])

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <SurfacePanel className="w-full max-w-md text-center" padding="lg" elevation="panel">
        <div className="flex justify-center mb-4">
          <CheckCircle className="h-16 w-16 text-success" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {isNewOrg
            ? t('billing.orgCreated', 'Organization created!')
            : t('billing.successTitle', 'Subscription activated!')}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t('billing.successDesc', 'Your subscription is now active.')}
        </p>
        <Button
          onClick={() => navigate('/dashboard')}
        >
          {t('billing.goToDashboard', 'Go to Dashboard')}
        </Button>
      </SurfacePanel>
    </div>
  )
}
