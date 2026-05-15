# PointFinder Visual System

This folder is the design foundation for PointFinder across web, iOS, and
Android. It is intentionally written as a desired-state contract, not a snapshot
of every current screen. The current codebase has drift. New work should follow
this system, and refactors should move existing UI toward it.

PointFinder is one app with different post-login worlds. A player and an
operator should feel that they are using the same product, but their interfaces
should optimize for very different jobs.

## What PointFinder Should Feel Like

PointFinder is a field-game command system for scouting organizations. It should
feel capable, grounded, and alive in the real world.

The product language is:

- Map-first, not spreadsheet-first.
- Field-ready, not fantasy adventure.
- Operationally calm, not visually noisy.
- Trustworthy during live events.
- Tactile enough for NFC and outdoor play.
- Clear enough for stressed operators and moving players.

The strongest existing direction is the web workspace: dense map surfaces,
operator modes, floating control panels, and a restrained green-led palette. The
public landing page may be more editorial, but authenticated product UI should
stay practical.

## Foundation Documents

- [Principles](principles.md): core design principles and quality bar.
- [Product Modes](product-modes.md): the visual and UX rules for each major area.
- [Tokens](tokens.md): semantic color, spacing, radius, type, elevation, and motion.
- [Web Tailwind Contract](web-tailwind.md): exact Tailwind usage rules and token mapping.
- [Components](components.md): structure rules for reusable components.
- [Patterns](patterns.md): canonical product patterns and states.
- [Platform Parity](platform-parity.md): how concepts map across web, iOS, and Android.
- [Adoption](adoption.md): how to apply this system during refactors and new work.
- [Refactor Readiness](refactor-readiness.md): what is required before larger visual refactors.
- [Agent Checklist](agent-checklist.md): required checklist for AI agents touching UI.

## Non-Negotiables

1. Use semantic tokens, not ad hoc colors or one-off visual effects.
2. Screens compose existing components. They do not invent new primitives inline.
3. Any repeated visual element becomes a reusable component.
4. Every meaningful component has loading, empty, error, disabled, and long-text behavior when those states can happen.
5. Player UI must not expose operator-only concepts such as other-team scores, operator notes, or full leaderboards.
6. Operator UI must prioritize live clarity, recovery actions, auditability, and dense scanning.
7. Web is currently the strongest visual north star, but platform-native behavior still matters.
8. New visual patterns must be documented here before they become a habit.

## How To Use This System

Before adding or changing UI:

1. Identify the product mode from [Product Modes](product-modes.md).
2. Look for an existing component or pattern.
3. Use tokens from [Tokens](tokens.md).
4. Keep layout and behavior consistent with [Patterns](patterns.md).
5. Add or update reusable components rather than styling directly in a screen.
6. Check [Agent Checklist](agent-checklist.md) before submitting changes.

## Current Implementation Anchors

These files are useful references, but this visual system has authority when
they disagree:

- Web tokens and primitives: `web-admin/src/index.css`, `web-admin/src/components/ui/`
- Web workspace shell: `web-admin/src/features/workspace/GameWorkspace.tsx`
- Web map/control components: `web-admin/src/components/map/`, `web-admin/src/features/command/`
- iOS tokens: `ios-app/dbv-nfc-games/App/Theme/DesignTokens.swift`
- Android tokens: `android-app/app/src/main/java/com/prayer/pointfinder/ui/theme/`

## The Direction In One Sentence

One product, two post-login worlds: player screens are simple and field-ready;
operator screens are map-first, dense, recoverable, and calm under pressure.
