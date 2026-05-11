# Audit Decisions

Design decisions made while fixing findings from `full-codebase-audit-2026-03-21.md`.

---

## Finding 6.16 — Android contentDescription accessibility

**Decision:** Add content descriptions only to standalone/interactive icons (12 of 47 instances). Leave decorative icons with `contentDescription = null`.

**Alternatives considered:**
- Add descriptions to all 47 icons regardless of context
- Skip all icons and defer entirely

**Rationale:** Per Android accessibility guidelines, decorative icons that appear alongside text labels should use `contentDescription = null` to avoid redundant announcements by TalkBack. Only standalone icons (empty-state illustrations, standalone status indicators, interactive icons in disclosure rows without text labels) received descriptions. This follows the Material Design accessibility guidance: "Decorative elements don't need content descriptions."

The 12 icons that received descriptions are:
- Large standalone icons in empty states (NFC scan, no notifications, no activity, no stages, error)
- Status icons without adjacent text (locked challenge, submission result)
- Warning indicators (setup hub warnings)
- Media content (submission images)
- Disclosure row icons in settings (location, notifications, camera permissions)
