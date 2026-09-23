import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '@/stores/workspace'
import { CONTENT_SECTIONS } from './contentSections'

/**
 * Build's direct entries to the content panel (OW-36): every section with its
 * icon and name, opening the drawer there. A phone scrolls the row sideways
 * rather than shrinking labels into an unexplained icon strip.
 */
export function BuildShortcuts() {
  const { t } = useTranslation()
  const openDrawer = useWorkspaceStore((s) => s.openDrawer)
  return (
    <nav aria-label={t('workspace.sections')} className="w-full min-w-0 max-w-full overflow-x-auto scrollbar-none" data-testid="build-shortcuts">
      <ul className="flex w-max gap-1.5 md:ml-auto">
        {CONTENT_SECTIONS.map(({ key, labelKey, Icon }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => openDrawer(key)}
              data-testid={`build-shortcut-${key}`}
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card/95 px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {t(labelKey)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
