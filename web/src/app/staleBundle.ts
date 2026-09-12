/**
 * After a deploy, a tab that still runs the previous build asks for lazy
 * chunks that no longer exist on the server. Vite reports that as
 * `vite:preloadError`; the browser as a rejected dynamic import. Either way
 * the only fix is a fresh page, so reload once per tab session. The flag is
 * kept until the tab closes: clearing it after render would let a chunk that
 * is truly broken reload the page forever instead of reaching the error screen.
 */
const FLAG = 'pf.stale-bundle-reload'

export function isStaleChunkError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module/i.test(message)
}

export function recoverFromStaleBundle(win: Window = window): () => void {
  const reload = (event: Event) => {
    let alreadyTried = false
    try {
      alreadyTried = win.sessionStorage.getItem(FLAG) === '1'
      if (!alreadyTried) win.sessionStorage.setItem(FLAG, '1')
    } catch {
      /* storage blocked: reload once anyway, the flag was only a loop guard */
    }
    if (alreadyTried) return
    event.preventDefault()
    win.location.reload()
  }
  const onPreloadError = (event: Event) => reload(event)
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isStaleChunkError(event.reason)) reload(event)
  }
  win.addEventListener('vite:preloadError', onPreloadError)
  win.addEventListener('unhandledrejection', onRejection)
  return () => {
    win.removeEventListener('vite:preloadError', onPreloadError)
    win.removeEventListener('unhandledrejection', onRejection)
  }
}
