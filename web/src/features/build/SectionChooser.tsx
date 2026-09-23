import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DrawerTab } from '@/stores/workspace'
import { CONTENT_SECTIONS } from './contentSections'

/**
 * The phone's content-panel navigation (OW-36): the active section's icon and
 * name, opening one list of every section. Each entry keeps the drawer tab's
 * test id and pressed state, so tutorials and tests address it the same way.
 */
export function SectionChooser({ active, onSelect }: { active: DrawerTab; onSelect: (tab: DrawerTab) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const current = CONTENT_SECTIONS.find((s) => s.key === active) ?? CONTENT_SECTIONS[0]
  const CurrentIcon = current.Icon
  return (
    <div className="relative min-w-0 flex-1" data-testid="drawer-tabs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t('workspace.chooseSection', { section: t(current.labelKey) })}
        data-testid="drawer-section-chooser"
        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium text-foreground"
      >
        <CurrentIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{t(current.labelKey)}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul
          id={listId}
          aria-label={t('workspace.sections')}
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {CONTENT_SECTIONS.map(({ key, labelKey, Icon }) => {
            const isActive = key === active
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    onSelect(key)
                    setOpen(false)
                  }}
                  data-testid={`tab-${key}`}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm',
                    isActive ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t(labelKey)}</span>
                  {isActive && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
