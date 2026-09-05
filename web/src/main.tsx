import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/variable-tag.css'
import i18n from './i18n'
import { restoreNativeOperator } from './lib/auth/store'
import { getServices } from './app/player/client'
import { isNative, kv } from './platform'
import { configureNativeViewport } from './platform/runtime'
import { resolveLanguage } from '@pointfinder/i18n'
import { ErrorBoundary, AppErrorFallback } from './components/feedback/ErrorBoundary'
import { LoadingState } from './components/feedback/LoadingState'
import { ErrorState } from './components/feedback/ErrorState'
import { initializeSafeArea } from './platform/safeArea'

const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => {
  const stored = localStorage.getItem('pointfinder-theme')
  document.documentElement.classList.toggle('dark', stored ? stored === 'dark' : dark.matches)
}
applyTheme()
dark.addEventListener('change', applyTheme)
window.addEventListener('storage', (event) => { if (event.key === 'pointfinder-theme') applyTheme() })
const root = createRoot(document.getElementById('root')!)
const safeAreaReady = initializeSafeArea().catch((error) => {
  console.warn('Native safe areas unavailable; using CSS safe areas', error)
})
if (import.meta.hot) import.meta.hot.dispose(() => { void safeAreaReady.then((stop) => stop?.()) })
async function start() {
  root.render(<LoadingState label={i18n.t('common.loading')} />)
  try {
    if (isNative()) {
      document.documentElement.classList.add('native-app')
      configureNativeViewport()
      await safeAreaReady
      const language = await kv.get('language')
      if (language) await i18n.changeLanguage(resolveLanguage(language))
      await restoreNativeOperator()
    }
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
    i18n.on('languageChanged', (language) => {
      document.documentElement.lang = language
      if (isNative()) void kv.set('language', language)
    })
    const services = await getServices()
    const { default: App } = await import('./App')
    root.render(<StrictMode><ErrorBoundary fallback={<AppErrorFallback />}><App services={services} /></ErrorBoundary></StrictMode>)
  } catch {
    root.render(<ErrorState title={i18n.t('common.error')} retryLabel={i18n.t('common.retry')} onRetry={() => void start()} />)
  }
}
void start()

if (import.meta.env.PROD && !import.meta.env.VITE_NATIVE_BUILD && !isNative() && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Offline shell unavailable', error))
}
