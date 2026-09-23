import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { contentLanguageName } from '@/lib/contentLanguage'

/**
 * OW-33: the language a game's content is written in, named in the reader's
 * interface language. It is information for choosing a game, not a promise of
 * translation. Unknown renders nothing unless the surface should say so.
 */
export function ContentLanguageTag({ code, showUnknown = false, className }: {
  code: string | null | undefined
  /** Say "not specified" instead of rendering nothing. */
  showUnknown?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const name = contentLanguageName(code, i18n.language)
  if (!name && !showUnknown) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)} data-testid="content-language">
      <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {name ? (
        <>
          <span className="sr-only">{t('experience.contentLanguageLabel', { language: name })}</span>
          <span aria-hidden className="truncate">{name}</span>
        </>
      ) : (
        <span className="truncate">{t('experience.contentLanguageUnknown')}</span>
      )}
    </span>
  )
}
