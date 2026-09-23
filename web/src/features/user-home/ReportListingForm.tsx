import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicationReportReason, PublicationReportRequest } from '@pointfinder/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'

const REPORT_REASONS: readonly PublicationReportReason[] = ['inappropriate', 'misleading', 'unsafe', 'spam', 'other']
const MAX_DETAILS = 1000

export interface ReportListingFormProps {
  title: string
  online: boolean
  onSubmit: (body: PublicationReportRequest) => Promise<void>
  onBack: () => void
}

function statusOf(error: unknown): number | undefined {
  const failure = error as { status?: number; response?: { status?: number } } | null
  return failure?.status ?? failure?.response?.status
}

/**
 * OW-06: a signed-in account tells the platform admins what is wrong with a
 * public listing. The organizer never learns who reported it. A report that
 * is already open counts as received.
 */
export function ReportListingForm({ title, online, onSubmit, onBack }: ReportListingFormProps) {
  const { t } = useTranslation(undefined, { keyPrefix: 'experience.report' })
  const name = useId()
  const detailsId = useId()
  const [reason, setReason] = useState<PublicationReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'gone' | 'error'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason || !online || state === 'sending') return
    setState('sending')
    try {
      await onSubmit({ reason, details: details.trim() || null })
      setState('sent')
    } catch (error) {
      const status = statusOf(error)
      setState(status === 409 ? 'sent' : status === 404 ? 'gone' : 'error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="flex flex-col gap-4" data-testid="report-listing-sent">
        <p role="status" className="text-sm">{t('sent')}</p>
        <Button variant="outline" className="min-h-11" onClick={onBack}>{t('back')}</Button>
      </div>
    )
  }

  const sending = state === 'sending'
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} data-testid="report-listing-form">
      <p className="text-sm text-muted-foreground break-words">{t('intro', { title })}</p>
      <fieldset className="flex flex-col gap-2" disabled={sending}>
        <legend className="mb-2 text-sm font-medium">{t('reasonLegend')}</legend>
        {REPORT_REASONS.map((value) => (
          <label
            key={value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
              reason === value ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted',
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="h-5 w-5 shrink-0 accent-primary"
              data-testid={`report-reason-${value}`}
            />
            <span className="min-w-0 flex-1 break-words">{t(`reasons.${value}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={detailsId} className="text-sm font-medium">{t('details')}</label>
        <Textarea
          id={detailsId}
          value={details}
          maxLength={MAX_DETAILS}
          onChange={(e) => setDetails(e.target.value)}
          disabled={sending}
          aria-describedby={`${detailsId}-hint`}
          data-testid="report-details"
        />
        <p id={`${detailsId}-hint`} className="text-xs text-muted-foreground">{t('detailsHint', { count: MAX_DETAILS - details.length })}</p>
      </div>
      {state === 'gone' && <p role="alert" className="text-sm text-destructive">{t('gone')}</p>}
      {state === 'error' && <p role="alert" className="text-sm text-destructive">{t('error')}</p>}
      {!online && <p className="text-sm text-muted-foreground">{t('offline')}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11" onClick={onBack} disabled={sending}>{t('back')}</Button>
        <Button type="submit" className="min-h-11" disabled={!reason || !online || sending} loading={sending} data-testid="report-send">
          {t('send')}
        </Button>
      </div>
    </form>
  )
}
