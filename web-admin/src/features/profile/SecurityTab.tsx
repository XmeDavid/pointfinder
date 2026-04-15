import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChangePassword } from '@/hooks/mutations/useProfileMutations'
import { useToast } from '@/hooks/useToast'

export function SecurityTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const changePassword = useChangePassword()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mismatchError, setMismatchError] = useState(false)
  const [invalidCurrentError, setInvalidCurrentError] = useState(false)

  const isFormComplete =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0

  const isDisabled = !isFormComplete || changePassword.isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMismatchError(false)
    setInvalidCurrentError(false)

    if (newPassword !== confirmPassword) {
      setMismatchError(true)
      return
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success(t('profile.security.passwordChanged'))
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
        },
        onError: (err: unknown) => {
          const code = (err as { response?: { data?: { code?: string } } })
            ?.response?.data?.code
          if (code === 'INVALID_CURRENT_PASSWORD') {
            setInvalidCurrentError(true)
          } else {
            toast.error(t('profile.security.invalidCurrentPassword'))
          }
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      <h2 className="text-lg font-semibold text-foreground">
        {t('profile.security.changePassword')}
      </h2>

      <div>
        <label
          htmlFor="current-password"
          className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block"
        >
          {t('profile.security.currentPassword')}
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value)
            setInvalidCurrentError(false)
          }}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {invalidCurrentError && (
          <p className="mt-1.5 text-xs text-destructive">
            {t('profile.security.invalidCurrentPassword')}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="new-password"
          className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block"
        >
          {t('profile.security.newPassword')}
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block"
        >
          {t('profile.security.confirmPassword')}
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value)
            setMismatchError(false)
          }}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {mismatchError && (
          <p className="mt-1.5 text-xs text-destructive">
            {t('profile.security.passwordMismatch')}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {changePassword.isPending
          ? '…'
          : t('profile.security.changePassword')}
      </button>
    </form>
  )
}
