import { isNative } from './runtime'
import { onForeground } from './lifecycle'

export interface SafeAreaInsets { top: number; right: number; bottom: number; left: number }
const edges = ['top', 'right', 'bottom', 'left'] as const

/** Native values override CSS env(), which older Android WebViews report as zero. */
export function applySafeAreaInsets(insets: SafeAreaInsets) {
  if (!insets || !edges.every((edge) => Number.isFinite(insets[edge]) && insets[edge] >= 0)) return
  for (const edge of edges) document.documentElement.style.setProperty(`--native-safe-${edge}`, `${insets[edge]}px`)
}

/** One subscription per application lifetime; CSS env() remains the browser fallback. */
export async function initializeSafeArea(): Promise<() => void> {
  if (!isNative()) return () => {}
  const { invoke, addPluginListener } = await import('@tauri-apps/api/core')
  let alive = true
  let revision = 0
  const refresh = async () => {
    const current = ++revision
    try {
      const insets = await invoke<SafeAreaInsets>('plugin:pointfinder-device|safe_area_insets')
      if (alive && current === revision) applySafeAreaInsets(insets)
    } catch { /* Keep CSS env() or the last known native values until layout is ready. */ }
  }
  const listener = await addPluginListener<SafeAreaInsets>('pointfinder-device', 'safeAreaChanged', (insets) => {
    ++revision
    if (alive) applySafeAreaInsets(insets)
  })
  window.addEventListener('resize', refresh)
  const stopForeground = onForeground(() => { void refresh() })
  await refresh()
  return () => {
    alive = false
    window.removeEventListener('resize', refresh)
    stopForeground()
    void listener.unregister()
  }
}
