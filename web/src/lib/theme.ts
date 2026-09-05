/** Theme preference shared by the operator rail and player settings. Dark mode is the `.dark` class on <html>. */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'pointfinder-theme'

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(): void {
  const preference = getThemePreference()
  const dark = preference === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : preference === 'dark'
  document.documentElement.classList.toggle('dark', dark)
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* storage unavailable: apply for this session only */
  }
  applyTheme()
}
