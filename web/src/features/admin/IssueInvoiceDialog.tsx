import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormLabel } from '@/components/ui/form-label'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/errors'
import { formatCents } from '@/lib/clubBilling'

interface Props {
  orgId: string
  open: boolean
  onClose: () => void
}

const CURRENCY = 'eur'

/**
 * Bill a club for an agreed term. The amount is the whole deal price, entered
 * in euros and sent in cents; the term months are what paying it buys, and the
 * confirmation line spells both out because the invoice is sent for real the
 * moment this is submitted.
 */
export function IssueInvoiceDialog({ orgId, open, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDays, setDueDays] = useState('30')
  const [termMonths, setTermMonths] = useState('12')

  const euros = Number(amount.replace(',', '.'))
  const amountCents = Number.isFinite(euros) ? Math.round(euros * 100) : 0
  const days = Number(dueDays)
  const months = Number(termMonths)

  const valid =
    amountCents > 0 &&
    description.trim().length > 0 &&
    Number.isInteger(days) &&
    days >= 1 &&
    Number.isInteger(months) &&
    months >= 1

  const issue = useMutation({
    mutationFn: () =>
      adminApi.issueOrgInvoice(orgId, {
        amountCents,
        currency: CURRENCY,
        description: description.trim(),
        dueDays: days,
        termMonths: months,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org', orgId, 'invoices'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'org', orgId] })
      handleClose()
    },
  })

  const handleClose = () => {
    setAmount('')
    setDescription('')
    setDueDays('30')
    setTermMonths('12')
    issue.reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent onClose={handleClose} data-testid="issue-invoice-dialog">
        <DialogHeader>
          <DialogTitle>{t('admin.invoice.issueTitle')}</DialogTitle>
          <DialogDescription>{t('admin.invoice.issueDesc')}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !issue.isPending) issue.mutate()
          }}
        >
          <div>
            <FormLabel htmlFor="issue-invoice-amount" required>
              {t('admin.invoice.amount')}
            </FormLabel>
            <Input
              id="issue-invoice-amount"
              data-testid="issue-invoice-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('admin.invoice.amountHint')}</p>
          </div>

          <div>
            <FormLabel htmlFor="issue-invoice-description" required>
              {t('admin.invoice.description')}
            </FormLabel>
            <Input
              id="issue-invoice-description"
              data-testid="issue-invoice-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel htmlFor="issue-invoice-due-days">{t('admin.invoice.dueDays')}</FormLabel>
              <Input
                id="issue-invoice-due-days"
                data-testid="issue-invoice-due-days"
                type="number"
                min="1"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
              />
            </div>
            <div>
              <FormLabel htmlFor="issue-invoice-term-months">{t('admin.invoice.termMonths')}</FormLabel>
              <Input
                id="issue-invoice-term-months"
                data-testid="issue-invoice-term-months"
                type="number"
                min="1"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.invoice.termMonthsHint')}</p>
            </div>
          </div>

          {valid && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground" data-testid="issue-invoice-confirm">
              {t('admin.invoice.confirm', {
                amount: formatCents(amountCents, CURRENCY, i18n.language),
                days,
                months,
              })}
            </p>
          )}

          {issue.isError && (
            <p className="text-sm text-destructive" role="alert" data-testid="issue-invoice-error">
              {getApiErrorMessage(issue.error, t('common.serverError'))}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!valid || issue.isPending}
              loading={issue.isPending}
              data-testid="issue-invoice-submit"
            >
              {t('admin.invoice.sendAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
