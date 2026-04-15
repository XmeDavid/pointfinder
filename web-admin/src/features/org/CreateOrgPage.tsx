import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../lib/api/client'
import type { CheckoutResponse } from '../../types/billing'

export function CreateOrgPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [plan, setPlan] = useState<'org-base' | 'org-high'>('org-base')

  const checkout = useMutation({
    mutationFn: () =>
      apiClient
        .post<CheckoutResponse>('/billing/org-checkout', {
          orgName: orgName.trim(),
          plan,
          cycle: 'annual',
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })

  return (
    <div className="h-screen bg-background p-8 overflow-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 transition-colors"
      >
        ← {t('common.back', 'Back')}
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-2">
        {t('workspace.createOrg', 'Create organization')}
      </h1>
      <p className="text-muted-foreground mb-8">
        {t('org.createDesc', 'Create an organization to collaborate with your team.')}
      </p>

      <div className="max-w-lg space-y-6">
        {/* Org name */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('workspace.orgName', 'Organization name')}
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={t('org.namePlaceholder', 'Scout Group 42')}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            onKeyDown={(e) => e.key === 'Enter' && orgName.trim() && checkout.mutate()}
            autoFocus
          />
        </div>

        {/* Plan selection */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">
            {t('billing.selectPlan', 'Select a plan')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setPlan('org-base')}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                plan === 'org-base' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <p className="font-semibold text-foreground">{t('billing.clubPlan', 'Club')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('billing.clubDesc', '10 members, 10 live games')}</p>
              <p className="text-lg font-bold text-foreground mt-2">
                €25<span className="text-sm font-normal text-muted-foreground">/{t('billing.year', 'yr')}</span>
              </p>
            </button>
            <button
              onClick={() => setPlan('org-high')}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                plan === 'org-high' ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <p className="font-semibold text-foreground">{t('billing.institutionPlan', 'Institution')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('billing.institutionDesc', '25 members, unlimited games')}</p>
              <p className="text-lg font-bold text-foreground mt-2">
                €99.99<span className="text-sm font-normal text-muted-foreground">/{t('billing.year', 'yr')}</span>
              </p>
            </button>
          </div>
        </div>

        {/* Error */}
        {checkout.isError && (
          <p className="text-sm text-destructive">
            {t('common.serverError', 'An error occurred. Please try again.')}
          </p>
        )}

        {/* Submit */}
        <button
          onClick={() => checkout.mutate()}
          disabled={!orgName.trim() || checkout.isPending}
          className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 transition-opacity"
        >
          {checkout.isPending ? '...' : t('org.createAndSubscribe', 'Create & Subscribe')}
        </button>
      </div>
    </div>
  )
}
