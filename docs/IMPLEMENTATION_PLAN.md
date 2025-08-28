# Implementation Plan

This plan aligns the current codebase with the target experience described in "DBV NFC - Goal.md". It is split into milestones to deliver incremental value.

## Milestone 1: Team join hardening and team runtime

- Backend
  - Add DB fields to `teams`: `game_id uuid`, `invite_code text unique`, persist `members` and `leader_device_id` usage
  - Issue team-scoped JWTs (`role=team`, claims: `team_id`, `device_id`)
  - Harden `POST /api/auth/team/join` to validate `invite_code`, set/validate `leader_device_id`, upsert member
  - Allow team JWT to `POST /api/events` for `locationPing`
  - Optionally bypass CSRF when `Authorization: Bearer` is present (team/admin)
- iOS
  - Already uses `/auth/team/join` and posts progress; ensure token has `role=team`
  - Show “game not live yet” if backend returns that state from new `/team/me/state` (defer to Milestone 2)
- Web
  - No changes yet

## Milestone 2: Operators and game management

- Backend
  - Add `operators`, `operator_invites`, `operator_games` tables
  - Endpoints: operator invite/register/login; list/create games; CRUD bases/enigmas; toggle live; link NFC endpoint
  - Read endpoint `/api/team/me/state` to return cohesive runtime state for a team
- Web
  - Operator auth; game list; map/table editor for bases/enigmas; go-live button with enforcement
- iOS (operator)
  - Setup mode: list unlinked bases; write NFC + link

## Milestone 3: Gameplay polish and monitoring

- Backend: monitoring aggregates; filters; refined scoring and ordering rules
- Web: dashboard map with team locations; progress tables; events feed
- iOS: leader-only guard server-side; active-base gating; screenshot prevention on enigma; distance checks for location-dependent bases

## Cross-cutting hardening

- Security: rate limits per route/user; structured logging; health checks
- Token refresh for team; short-lived access tokens

## Immediate tasks (trackers)

- Add DB migration for teams invite_code and game_id
- Implement team JWT role and token issuer
- Harden /auth/team/join to validate against DB
- Allow team to POST /events for locationPing
- Bypass CSRF for Bearer-authenticated requests
- Extend Teams POST to accept invite_code and game_id
- Build backend and fix compile issues
