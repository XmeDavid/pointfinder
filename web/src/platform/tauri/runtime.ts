/**
 * Where is this code running? The same bundle is served inside the Tauri shell on phones
 * and could be opened in a plain browser during development. Anything that touches a
 * native plugin must go through `isNative()` first so the browser build degrades cleanly.
 */
import { platform, type Platform } from '@tauri-apps/plugin-os'

import { isNative } from '../runtime'
export { isNative } from '../runtime'

let cached: Platform | 'browser' | null = null

export function currentPlatform(): Platform | 'browser' {
  if (cached) return cached
  cached = isNative() ? platform() : 'browser'
  return cached
}

export const isIOS = () => currentPlatform() === 'ios'
export const isAndroid = () => currentPlatform() === 'android'
export const isPhone = () => isIOS() || isAndroid()
