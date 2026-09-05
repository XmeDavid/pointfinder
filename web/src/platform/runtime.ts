/** Device capabilities are independent of viewport size and user role. */
export function isNative(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
