import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Pencil, Check, X } from 'lucide-react'
import { useAuthStore } from '@/lib/auth/store'
import { useToast } from '@/hooks/useToast'
import { useUpdateProfile } from '@/hooks/mutations/useProfileMutations'

export function GeneralTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const updateProfile = useUpdateProfile()
  const [searchParams, setSearchParams] = useSearchParams()

  // Inline edit state
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(user?.name ?? '')

  const [editingEmail, setEditingEmail] = useState(false)
  const [emailValue, setEmailValue] = useState(user?.email ?? '')

  // Show success toast when redirected back after email confirmation
  useEffect(() => {
    if (searchParams.get('emailConfirmed') === 'true') {
      toast.success(t('profile.emailConfirmed', 'Email address updated successfully.'))
      searchParams.delete('emailConfirmed')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveName = async () => {
    try {
      await updateProfile.mutateAsync({ name: nameValue })
      toast.success(t('profile.nameUpdated', 'Name updated successfully.'))
      setEditingName(false)
    } catch {
      toast.error(t('common.error', 'Something went wrong.'))
    }
  }

  const handleCancelName = () => {
    setNameValue(user?.name ?? '')
    setEditingName(false)
  }

  const handleSaveEmail = async () => {
    try {
      const result = await updateProfile.mutateAsync({ email: emailValue })
      const message = result.message ?? t('profile.emailVerificationSent', 'Verification email sent. Check your inbox.')
      toast.success(message)
      setEditingEmail(false)
    } catch {
      toast.error(t('common.error', 'Something went wrong.'))
    }
  }

  const handleCancelEmail = () => {
    setEmailValue(user?.email ?? '')
    setEditingEmail(false)
  }

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString()
    : '—'

  return (
    <div className="space-y-6 max-w-md">
      {/* Name */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          {t('profile.name', 'Name')}
        </p>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
              data-testid="profile-name-input"
            />
            <button
              onClick={handleSaveName}
              disabled={updateProfile.isPending}
              className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              aria-label={t('profile.save', 'Save')}
              data-testid="profile-name-save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancelName}
              className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"
              aria-label={t('profile.cancel', 'Cancel')}
              data-testid="profile-name-cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm">{user?.name}</span>
            <button
              onClick={() => {
                setNameValue(user?.name ?? '')
                setEditingName(true)
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
              aria-label={t('profile.edit', 'Edit')}
              data-testid="profile-name-edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Email */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          {t('profile.email', 'Email')}
        </p>
        {editingEmail ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                data-testid="profile-email-input"
              />
              <button
                onClick={handleSaveEmail}
                disabled={updateProfile.isPending}
                className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                aria-label={t('profile.save', 'Save')}
                data-testid="profile-email-save"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancelEmail}
                className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"
                aria-label={t('profile.cancel', 'Cancel')}
                data-testid="profile-email-cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('profile.emailVerificationNote', 'A verification email will be sent to the new address')}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm">{user?.email}</span>
            <button
              onClick={() => {
                setEmailValue(user?.email ?? '')
                setEditingEmail(true)
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
              aria-label={t('profile.edit', 'Edit')}
              data-testid="profile-email-edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Role — read-only */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          {t('profile.role', 'Role')}
        </p>
        <span className="text-foreground text-sm capitalize">{user?.role}</span>
      </div>

      {/* Member since — read-only */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
          {t('profile.memberSince', 'Member since')}
        </p>
        <span className="text-foreground text-sm">{memberSince}</span>
      </div>
    </div>
  )
}
