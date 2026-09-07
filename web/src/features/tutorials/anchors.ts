/**
 * Anchors are the contract between scenario files and screens. A scenario may
 * only point at an id listed here (static) or built from a prefix listed below
 * (template, e.g. `base-item-${id}`). Adding a scenario anchor means adding the
 * `data-testid` to the screen and the id to this catalogue in the same change.
 */
export const KNOWN_ANCHORS: readonly string[] = [
  // dashboard
  'create-game-btn',
  'game-name-input',
  'dashboard-empty-state',
  // workspace chrome
  'map-wrapper',
  'readiness-indicator',
  'go-live-btn',
  'open-content-panel',
  'mode-build',
  'mode-command',
  'mode-review',
  'mode-results',
  'settings-btn',
  'revert-to-setup-btn',
  'progress-keep-btn',
  'enforce-base-order-switch',
  // drawer
  'tab-bases',
  'tab-challenges',
  'tab-teams',
  'tab-stages',
  'tab-nfc',
  'new-entity-btn',
  'auto-assign-btn',
  'assignment-grid-btn',
  'assignment-grid',
  'unlocks-section',
  'unlocks-bases',
  'team-variables-editor',
  'variable-key-input',
  'add-variable-btn',
  'save-variables-btn',
  'completion-content',
  'arrange-route-btn',
  'base-route-editor',
  // base detail
  'base-name-input',
  'base-description-input',
  'base-lat-input',
  'base-lng-input',
  'base-checkin-method',
  'base-checkin-radius',
  'base-checkin-radius-error',
  'base-qr-print',
  'codes-print-sheet',
  'visibility-visible',
  'visibility-hidden',
  'link-challenge-btn',
  'save-base-btn',
  // challenge detail
  'challenge-title-input',
  'answer-type-group',
  'answer-type-text',
  'answer-type-file',
  'answer-type-none',
  'auto-validate-toggle',
  'challenge-content',
  'challenge-description',
  'correct-answer-input',
  'points-input',
  'completion-content',
  'location-bound-toggle',
  'operator-notes',
  'save-challenge',
  // team detail
  'team-join-code',
] as const

/** Template anchors: a scenario anchor may start with one of these and append an entity id. */
export const ANCHOR_PREFIXES: readonly string[] = [
  'unlocks-base-',
  'assignment-cell-',
  'assignment-base-',
  'variable-value-',
  'answer-type-',
  'base-checkin-method-',
  'base-item-',
  'challenge-item-',
  'nfc-write-',
  'team-item-',
  'unlock-trigger-',
] as const

/** True when `anchor` is a catalogued static id or starts with a catalogued prefix. */
export function isKnownAnchor(anchor: string): boolean {
  return KNOWN_ANCHORS.includes(anchor) || ANCHOR_PREFIXES.some((prefix) => anchor.startsWith(prefix))
}
