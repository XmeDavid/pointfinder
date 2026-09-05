import { isNative } from './runtime'
let nativeForeground: boolean | undefined
export const isForeground = () => nativeForeground ?? document.visibilityState !== 'hidden'

/** Webviews dispatch visibility changes on pause/resume; pageshow covers BFCache. */
export function onForeground(handler: () => void): () => void {
  return onAppVisibility((active) => { if (active) handler() })
}

/** Native activity events complement WebView visibility, which varies by OS. */
export function onAppVisibility(handler: (active: boolean) => void): () => void {
  let alive = true
  let foreground = isForeground()
  const deliver = (next: boolean) => {
    if (next !== foreground) handler(next)
    foreground = next
  }
  const visibility = () => {
    deliver(isForeground())
  }
  const pageShow = (event: PageTransitionEvent) => { if (event.persisted && isForeground()) handler(true) }
  let unregister: (() => void) | undefined
  if (isNative()) void import('@tauri-apps/api/core').then(async ({ addPluginListener }) => {
    if (!alive) return
    const listener = await addPluginListener<{ active: boolean }>('pointfinder-device', 'foreground', (event) => {
      if (!alive) return
      nativeForeground = event.active
      deliver(event.active)
    })
    if (!alive) await listener.unregister()
    else unregister = () => { void listener.unregister() }
  }).catch(() => { /* WebView visibility remains the fallback. */ })
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pageshow', pageShow)
  return () => {
    alive = false
    unregister?.()
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pageshow', pageShow)
  }
}
