import type { IncomingLink } from './tauri/deepLinks'
import { isNative } from './runtime'
export type { IncomingLink } from './tauri/deepLinks'
export async function listenForLinks(handler: (link: IncomingLink) => void, options: { signal?: AbortSignal } = {}): Promise<() => void> {
  return isNative() ? (await import('./tauri/deepLinks')).listenForLinks(handler, options) : () => {}
}
