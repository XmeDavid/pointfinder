import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/lib/auth/store'
import { useDeleteAccount } from '@/hooks/mutations/useProfileMutations'
import { useToast } from '@/hooks/useToast'

export function DangerZoneTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const deleteAccount = useDeleteAccount()

  const [showConfirm, setShowConfirm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  const isConfirmEnabled =
    emailInput.trim().toLowerCase() === (user?.email ?? '').toLowerCase() &&
    !deleteAccount.isPending

  function handleCancel() {
    setShowConfirm(false)
    setEmailInput('')
    setServerError(null)
  }

  function handleConfirm() {
    setServerError(null)
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('profile.dangerZone.deleted'))
      },
      onError: (err: unknown) => {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? ''
        if (message.toLowerCase().includes('active games')) {
          setServerError(t('profile.dangerZone.activeGamesBlock'))
        } else {
          setServerError(message || t('profile.dangerZone.activeGamesBlock'))
        }
      },
    })
  }

  return (
    <div className="rounded-xl border-2 border-destructive/30 p-6 max-w-md">
      <h2 className="text-lg font-semibold text-foreground mb-2">
        {t('profile.dangerZone.title')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t('profile.dangerZone.warning')}
      </p>

      {!showConfirm ? (
        <button
          type="button"
          data-testid="delete-account-btn"
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
        >
          {t('profile.dangerZone.deleteButton')}
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="confirm-delete-email"
              className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block"
            >
              {t('profile.dangerZone.confirmEmail')}
            </label>
            <input
              id="confirm-delete-email"
              type="email"
              data-testid="confirm-delete-email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value)
                setServerError(null)
              }}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50"
            />
          </div>

          {serverError && (
            <p
              data-testid="delete-error"
              className="text-sm text-destructive"
            >
              {serverError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              data-testid="confirm-delete-btn"
              disabled={!isConfirmEnabled}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {deleteAccount.isPending
                ? '…'
                : t('profile.dangerZone.deleteButton')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
            >
              {t('profile.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
