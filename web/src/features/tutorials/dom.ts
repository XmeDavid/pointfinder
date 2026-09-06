import type { FieldReading } from './types'

const MISSING: FieldReading = { present: false, value: '', pressed: null }

/** Zero-sized or entirely outside the viewport counts as "not there" for the tour. */
export function isAnchorVisible(el: Element | null): boolean {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

/**
 * The desktop rail and the mobile tab bar carry the same ids and only one of
 * them is laid out at a time, so prefer the visible match and fall back to the
 * first one so callers can still tell "present but scrolled away" apart from
 * "not rendered".
 */
export function anchorElement(testId: string): HTMLElement | null {
  if (typeof document === 'undefined' || !testId || testId.includes('"')) return null
  const matches = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`))
  return matches.find((el) => isAnchorVisible(el)) ?? matches[0] ?? null
}

function readPressed(el: Element): boolean | null {
  const pressed = el.getAttribute('aria-pressed')
  if (pressed === 'true') return true
  if (pressed === 'false') return false
  const checked = el.getAttribute('aria-checked')
  if (checked === 'true') return true
  if (checked === 'false') return false
  return null
}

export function readAnchorField(testId: string): FieldReading {
  const el = anchorElement(testId)
  if (!el) return MISSING

  const pressed = readPressed(el)

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return { present: true, value: el.value.trim(), pressed }
  }

  const editable =
    el.getAttribute('contenteditable') === 'true'
      ? el
      : el.querySelector<HTMLElement>('[contenteditable="true"]')
  if (editable) return { present: true, value: (editable.textContent ?? '').trim(), pressed }

  const nested = el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (nested) return { present: true, value: nested.value.trim(), pressed }

  return { present: true, value: (el.textContent ?? '').trim(), pressed }
}

/** The `data-testid` of the pressed/checked control inside a segmented group. */
export function pressedIn(groupTestId: string): string | null {
  const group = anchorElement(groupTestId)
  if (!group) return null
  const pressed = group.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]')
  return pressed?.getAttribute('data-testid') ?? null
}
