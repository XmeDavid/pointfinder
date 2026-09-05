/** Device capabilities are independent of viewport size and user role. */
export function isNative(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isNativeEntry(): boolean {
  return isNative() || import.meta.env.VITE_NATIVE_BUILD
}

export function configureNativeViewport(): void {
  if (!isNative()) return
  document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
  )
}
