import { useMemo, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'
import { isNative } from '@/platform/runtime'
import { openExternal } from '@/platform/navigation'
import { apiOrigin } from '@/platform/config'
import { useToastStore } from '@/hooks/useToast'

/** Render operator-authored content through the same sanitizer used by the editor. */
export function RichContent({ html, className }: { html: string; className?: string }) {
  const { t } = useTranslation()
  const safe = useMemo(() => {
    const fragment = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, RETURN_DOM_FRAGMENT: true })
    for (const resource of fragment.querySelectorAll('[data-type="file-embed"][data-resource-url]')) {
      try {
        const url = new URL(resource.getAttribute('data-resource-url')!, apiOrigin())
        if (!['https:', 'http:'].includes(url.protocol)) continue
        const link = document.createElement('a')
        link.href = url.href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.dataset.playerResource = 'true'
        link.className = 'text-primary underline'
        link.textContent = resource.getAttribute('data-resource-name') || resource.textContent
        resource.replaceChildren(link)
      } catch { /* Missing/invalid resource URLs remain readable placeholders. */ }
    }
    const container = document.createElement('div')
    container.append(fragment)
    return container.innerHTML
  }, [html])
  function openResource(event: MouseEvent<HTMLDivElement>) {
    if (!isNative() || !(event.target instanceof Element)) return
    const link = event.target.closest<HTMLAnchorElement>('a[data-player-resource]')
    if (!link) return
    event.preventDefault()
    void openExternal(link.href).catch(() => useToastStore.getState().addToast(t('common.error'), 'error'))
  }
  return <div className={className} onClick={openResource} dangerouslySetInnerHTML={{ __html: safe }} />
}
