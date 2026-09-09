import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { contactHref } from '@/lib/contact'

/**
 * Clubs are sales-led. The route stays so the workspace switcher's "+" has
 * somewhere to land, but it explains what a club is and hands the reader a way
 * to reach us instead of offering a self-serve checkout.
 */
export function CreateOrgPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const includes = [
    t('org.clubIncludesMembers'),
    t('org.clubIncludesResources'),
    t('org.clubIncludesLimits'),
    t('org.clubIncludesInvoice'),
  ]

  return (
    <div className="h-screen bg-background p-8 overflow-auto" data-testid="create-org-page">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 transition-colors"
      >
        ← {t('common.back', 'Back')}
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-2">{t('org.clubTitle')}</h1>
      <p className="text-muted-foreground max-w-lg">{t('org.clubIntro')}</p>

      <div className="mt-8 max-w-lg rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('org.clubIncludesTitle')}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-foreground">
          {includes.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <a
          href={contactHref()}
          data-testid="create-org-contact"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('org.clubContact')}
        </a>
        <p className="mt-3 text-sm text-muted-foreground">{t('org.clubContactHint')}</p>
      </div>
    </div>
  )
}
