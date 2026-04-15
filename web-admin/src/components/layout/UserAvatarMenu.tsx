import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { User, Sun, Moon, Check, LogOut } from 'lucide-react'
import { useAuthStore } from '@/lib/auth/store'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
] as const

interface UserAvatarMenuProps {
  isDark: boolean
  onToggleTheme: () => void
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

export function UserAvatarMenu({ isDark, onToggleTheme, className }: UserAvatarMenuProps) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const currentLang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2)
  const initials = user?.name ? getInitials(user.name) : '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-[11px] cursor-pointer hover:opacity-90 transition-opacity ${className ?? ''}`}
        aria-label={t('profile.title', 'Profile')}
        data-testid="user-avatar-btn"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={8}>
        <DropdownMenuItem
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2"
          data-testid="menu-profile"
        >
          <User size={14} />
          {t('profile.title', 'Profile')}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={onToggleTheme}
          className="flex items-center gap-2"
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          {isDark ? t('common.lightMode', 'Light mode') : t('common.darkMode', 'Dark mode')}
        </DropdownMenuItem>

        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className="flex items-center justify-between gap-4 pl-8"
          >
            {lang.label}
            {currentLang === lang.code && (
              <Check size={14} className="text-primary" />
            )}
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
