import { isNative } from './runtime'

/** Native requests use platform TLS and avoid the webview's cross-origin transport. */
export const platformFetch: typeof fetch = async (input, init) => {
  if (!isNative()) return globalThis.fetch(input, init)
  const { fetch } = await import('@tauri-apps/plugin-http')
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  headers.set('Origin', '')
  return fetch(input, { ...init, headers })
}
