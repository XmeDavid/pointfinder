import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormLabel } from '@/components/ui/form-label'
import { adminApi } from '@/lib/api/admin'
import { getApiErrorMessage } from '@/lib/api/errors'
import { fromDateInputValue } from '@/lib/clubBilling'
import type { CreateClubResult } from '@/types/admin'
import { ClubLimitsFields } from './ClubLimitsFields'
import { clubDefaultLimits, invalidLimitKeys, limitsToOverrides, type LimitState } from './clubLimits'

interface Props {
  open: boolean
  onClose: () => void
  /** Open the club that was just created. */
  onCreated: (orgId: string) => void
}

/**
 * Standing a club up after a deal is signed: the club's name, the person who
 * will run it, the term it has paid for, an internal note, and the agreed
 * limits — pre-filled with the standard deal and editable key by key.
 */
export function NewClubDialog({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [termEnd, setTermEnd] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [limits, setLimits] = useState<LimitState>(clubDefaultLimits)
  const [result, setResult] = useState<CreateClubResult | null>(null)

  const invalid = invalidLimitKeys(limits)

  const create = useMutation({
    mutationFn: () =>
      adminApi.createClub({
        name: name.trim(),
        adminEmail: adminEmail.trim(),
        quotaOverrides: limitsToOverrides(limits),
        ...(termEnd ? { termEnd: fromDateInputValue(termEnd) ?? undefined } : {}),
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] })
      setResult(created)
    },
  })

  const reset = () => {
    setName('')
    setAdminEmail('')
    setTermEnd('')
    setAdminNote('')
    setLimits(clubDefaultLimits())
    setResult(null)
    create.reset()
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const canSubmit =
    name.trim().length >= 2 &&
    adminEmail.trim().length > 0 &&
    invalid.length === 0 &&
    !create.isPending

  if (result) {
    // The one thing an admin needs to know next: was the administrator
    // attached to the club, or is the club waiting on them to register?
    const attached = result.adminUserId != null
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent onClose={handleClose} data-testid="new-club-result">
          <DialogHeader>
            <DialogTitle>{t('admin.club.created', { name: result.org.name })}</DialogTitle>
            <DialogDescription>
              {attached
                ? t('admin.club.adminAttached', { email: result.adminEmail })
                : t('admin.club.adminInvited', { email: result.adminEmail })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {t('common.close', 'Close')}
            </Button>
            <Button
              data-testid="new-club-open"
              onClick={() => {
                const orgId = result.org.id
                reset()
                onCreated(orgId)
              }}
            >
              {t('admin.club.openClub')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent onClose={handleClose} className="max-w-2xl" data-testid="new-club-dialog">
        <DialogHeader>
          <DialogTitle>{t('admin.club.newTitle')}</DialogTitle>
          <DialogDescription>{t('admin.club.newDesc')}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) create.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FormLabel htmlFor="new-club-name" required>
                {t('admin.club.name')}
              </FormLabel>
              <Input
                id="new-club-name"
                data-testid="new-club-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <div>
              <FormLabel htmlFor="new-club-admin-email" required>
                {t('admin.club.adminEmail')}
              </FormLabel>
              <Input
                id="new-club-admin-email"
                data-testid="new-club-admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.club.adminEmailHint')}</p>
            </div>
            <div>
              <FormLabel htmlFor="new-club-term-end" optional>
                {t('admin.club.termEnd')}
              </FormLabel>
              <Input
                id="new-club-term-end"
                data-testid="new-club-term-end"
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.club.termEndHint')}</p>
            </div>
            <div>
              <FormLabel htmlFor="new-club-note" optional>
                {t('admin.club.note')}
              </FormLabel>
              <Textarea
                id="new-club-note"
                data-testid="new-club-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
                className="min-h-0"
              />
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-foreground mb-1">{t('admin.limits.title')}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t('admin.limits.newClubHint')}</p>
            <ClubLimitsFields value={limits} onChange={setLimits} invalidKeys={invalid} disabled={create.isPending} />
          </section>

          {create.isError && (
            <p className="text-sm text-destructive" role="alert" data-testid="new-club-error">
              {getApiErrorMessage(create.error, t('common.serverError'))}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={create.isPending} data-testid="new-club-submit">
              {t('admin.club.createAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
