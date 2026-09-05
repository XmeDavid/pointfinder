import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { User, LogOut, Check, Globe } from 'lucide-react'
import { useAuthStore } from '@/lib/auth/store'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

export function UserAvatarMenu({ className }: { className?: string }) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const initials = user?.name ? getInitials(user.name) : '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-[11px] cursor-pointer hover:opacity-90 transition-opacity', className)}
        aria-label={t('profile.title', 'Profile')}
        data-testid="user-avatar-btn"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent portal>
        <DropdownMenuItem
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2"
          data-testid="menu-profile"
        >
          <User size={14} />
          {t('profile.title', 'Profile')}
        </DropdownMenuItem>

        <div className="h-px bg-border my-1" />

        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground" data-testid="language-picker-btn">
          <Globe size={14} aria-hidden />{t('playerApp.settings.language')}
        </div>
        {([{ code: 'en', label: 'English' }, { code: 'pt', label: 'Português' }, { code: 'de', label: 'Deutsch' }] as const).map(({ code, label }) => (
          <DropdownMenuItem key={code} onClick={() => { void i18n.changeLanguage(code) }} className="min-h-11 justify-between gap-3">
            {label}{(i18n.resolvedLanguage ?? i18n.language).startsWith(code) && <Check size={14} aria-hidden />}
          </DropdownMenuItem>
        ))}

        <div className="h-px bg-border my-1" />

        <DropdownMenuItem
          onClick={() => { logout(); navigate('/login') }}
          className="flex items-center gap-2 text-destructive"
          data-testid="menu-logout"
        >
          <LogOut size={14} />
          {t('common.logout', 'Logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
