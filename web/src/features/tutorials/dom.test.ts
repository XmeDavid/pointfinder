import { afterEach, describe, expect, it } from 'vitest'
import { anchorElement, isAnchorVisible, pressedIn, readAnchorField } from './dom'

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

function stubRect(el: Element, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('readAnchorField', () => {
  it('reads and trims an input value', () => {
    mount('<input data-testid="base-name-input" value="  Old mill  " />')
    expect(readAnchorField('base-name-input')).toEqual({ present: true, value: 'Old mill', pressed: null })
  })

  it('reads a textarea value', () => {
    const host = mount('<textarea data-testid="operator-notes"></textarea>')
    host.querySelector('textarea')!.value = 'Bring spare tags'
    expect(readAnchorField('operator-notes').value).toBe('Bring spare tags')
  })

  it('reads a ProseMirror contenteditable nested under the anchor', () => {
    mount(
      '<div data-testid="challenge-content"><div class="ProseMirror" contenteditable="true"><p>Count the arches</p></div></div>',
    )
    expect(readAnchorField('challenge-content')).toEqual({
      present: true,
      value: 'Count the arches',
      pressed: null,
    })
  })

  it('reads aria-pressed and aria-checked as a tri-state', () => {
    mount('<button data-testid="auto-validate-toggle" aria-pressed="true">Auto-validate</button>')
    expect(readAnchorField('auto-validate-toggle').pressed).toBe(true)

    document.body.innerHTML = ''
    mount('<button data-testid="auto-validate-toggle" aria-pressed="false">Auto-validate</button>')
    expect(readAnchorField('auto-validate-toggle').pressed).toBe(false)

    document.body.innerHTML = ''
    mount('<button data-testid="enforce-base-order-switch" role="switch" aria-checked="true"></button>')
    expect(readAnchorField('enforce-base-order-switch').pressed).toBe(true)
  })

  it('falls back to text content and reports a missing anchor', () => {
    mount('<div data-testid="team-join-code"> BRAVO-42 </div>')
    expect(readAnchorField('team-join-code').value).toBe('BRAVO-42')
    expect(readAnchorField('nope')).toEqual({ present: false, value: '', pressed: null })
  })
})

describe('pressedIn', () => {
  it('returns the test id of the pressed child', () => {
    mount(`
      <div data-testid="base-checkin-method">
        <button data-testid="base-checkin-method-nfc" aria-pressed="false"></button>
        <button data-testid="base-checkin-method-location" aria-pressed="true"></button>
      </div>
    `)
    expect(pressedIn('base-checkin-method')).toBe('base-checkin-method-location')
  })

  it('returns null when nothing is pressed or the group is absent', () => {
    mount('<div data-testid="base-checkin-method"><button aria-pressed="false"></button></div>')
    expect(pressedIn('base-checkin-method')).toBeNull()
    expect(pressedIn('missing-group')).toBeNull()
  })
})

describe('anchorElement and isAnchorVisible', () => {
  it('prefers the visible duplicate, as the desktop and mobile rails share ids', () => {
    const host = mount('<button data-testid="mode-build" id="desktop"></button><button data-testid="mode-build" id="mobile"></button>')
    const [desktop, mobile] = Array.from(host.querySelectorAll('button'))
    stubRect(desktop, { width: 0, height: 0, right: 0, bottom: 0 })
    stubRect(mobile, { top: 700, bottom: 744, left: 0, right: 44, width: 44, height: 44 })
    expect(anchorElement('mode-build')?.id).toBe('mobile')
  })

  it('treats a zero-sized or fully off-screen element as not visible', () => {
    const host = mount('<div data-testid="go-live-btn"></div>')
    const el = host.firstElementChild!
    stubRect(el, { width: 0, height: 0 })
    expect(isAnchorVisible(el)).toBe(false)
    stubRect(el, { top: -400, bottom: -300, left: 0, right: 100, width: 100, height: 100 })
    expect(isAnchorVisible(el)).toBe(false)
    stubRect(el, { top: 10, bottom: 50, left: 10, right: 100, width: 90, height: 40 })
    expect(isAnchorVisible(el)).toBe(true)
    expect(isAnchorVisible(null)).toBe(false)
  })
})
