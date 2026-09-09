import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText } from 'lucide-react'
import { StatusBadge, type StatusBadgeTone } from '@/components/status'
import { EmptyState } from '@/components/feedback/EmptyState'
import { formatCents, formatClubDate } from '@/lib/clubBilling'
import type { OrgInvoice } from '@/types/billing'

const STATUS_TONES: Record<OrgInvoice['status'], StatusBadgeTone> = {
  paid: 'success',
  open: 'warning',
  draft: 'muted',
  void: 'muted',
  uncollectible: 'destructive',
}

interface Props {
  invoices: OrgInvoice[]
  /** Distinguishes the admin copy from the club's own, for tests and anchors. */
  testId?: string
}

/**
 * A club's invoices, as the admin panel and the club's own billing tab both
 * show them: what was billed, whether it is paid, and the two Stripe links a
 * treasurer needs. Rows are read-only — an invoice's life is Stripe's.
 */
export function OrgInvoiceList({ invoices, testId = 'org-invoices' }: Props) {
  const { t, i18n } = useTranslation()

  if (invoices.length === 0) {
    return <EmptyState density="compact" title={t('club.invoices.empty')} />
  }

  return (
    <ul className="space-y-2" data-testid={testId}>
      {invoices.map((invoice) => {
        const paid = formatClubDate(invoice.paidAt, i18n.language)
        const due = formatClubDate(invoice.dueAt, i18n.language)
        return (
          <li
            key={invoice.id}
            data-testid={`${testId}-row`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-4 py-3"
          >
            <StatusBadge
              tone={STATUS_TONES[invoice.status] ?? 'muted'}
              label={t(`billing.invoiceStatus.${invoice.status}`, invoice.status)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{invoice.description}</p>
              <p className="text-xs text-muted-foreground">
                {paid
                  ? t('club.invoices.paidOn', { date: paid })
                  : due
                    ? t('club.invoices.dueOn', { date: due })
                    : t('club.invoices.noDueDate')}
                {' · '}
                {t('club.invoices.term', { count: invoice.termMonths })}
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium text-foreground">
              {formatCents(invoice.amountCents, invoice.currency, i18n.language)}
            </span>
            {invoice.hostedInvoiceUrl && (
              <a
                href={invoice.hostedInvoiceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t('club.invoices.openHosted')}
                title={t('club.invoices.openHosted')}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {invoice.invoicePdf && (
              <a
                href={invoice.invoicePdf}
                target="_blank"
                rel="noreferrer"
                aria-label={t('club.invoices.openPdf')}
                title={t('club.invoices.openPdf')}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
