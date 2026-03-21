# PointFinder Pre-Release Test Checklist

## At-Home Tests (do these before ANY release)

### A. Core Happy Path (15 min)

- [ ] **Web:** Create game → add 3 bases → add 3 challenges → add 2 teams → link NFC tags → go live
- [ ] **iOS:** Login as operator → verify game appears → see live dashboard
- [ ] **Android:** Login as operator → verify same game appears → see same dashboard data
- [ ] **iOS:** Join as player (team 1) → see map with bases
- [ ] **Android:** Join as player (team 2) → see map with same bases
- [ ] **Both phones:** Scan NFC tag → check in → see challenge → submit answer → see "Submitted"
- [ ] **Web:** See both submissions appear → approve one → reject one
- [ ] **Both phones:** See review result update in real-time (no refresh needed)
- [ ] **Web:** Check leaderboard shows correct points

### B. Offline Resilience (10 min)

*This is your #1 camp risk. Test thoroughly.*

- [ ] **Turn on airplane mode on a phone**
- [ ] Scan NFC tag → check in (should queue locally)
- [ ] Submit an answer (should queue locally)
- [ ] See "offline" banner and pending action count
- [ ] **Turn off airplane mode** → watch sync happen → verify check-in and submission appear on web dashboard
- [ ] **Kill the app while offline with pending actions** → reopen → verify pending actions are still there → reconnect → verify they sync
- [ ] **Submit while transitioning from WiFi to cellular** (walk away from router) → verify it eventually syncs

### C. NFC Edge Cases (5 min)

- [ ] Scan the SAME NFC tag twice with the same player → second scan should say "already checked in" (not error)
- [ ] Scan a tag from a DIFFERENT game → should show error, not crash
- [ ] Scan while the app is on a non-map screen → should still work (NFC is system-level)
- [ ] Hold phone near tag but pull away before scan completes → app should not hang

### D. Multi-Operator (5 min)

- [ ] Login as operator A on web, operator B on iOS
- [ ] Both looking at same game's submissions
- [ ] Both try to review the SAME submission simultaneously → one should succeed, other should see "already reviewed" (409 conflict)
- [ ] Operator A creates a base → appears on operator B's view within seconds

### E. Game Lifecycle (5 min)

- [ ] End the game → players see "Game has ended" overlay → can't submit new answers
- [ ] Try to check in after game ended → should be blocked
- [ ] Revert game to setup → verify progress is optionally cleared
- [ ] Go live again → players can resume

### F. Permission Edge Cases (3 min)

- [ ] Deny location permission → map should still work, just no "center on me"
- [ ] Deny camera permission → photo submission should show error, not crash
- [ ] Deny notification permission → app works, just no push notifications

### G. Operator Manual Check-in (5 min)

- [ ] **Web:** Open a team's detail → manually check in the team at a base they haven't visited
- [ ] Verify the check-in appears in the team's progress
- [ ] Verify the player on that team sees the base as "checked in" on their app
- [ ] Verify the challenge is now visible to the player
- [ ] Try to manually check in a team that's already checked in → should handle gracefully

---

## Field Test Scenarios (run at the camp venue, day before event)

### H. Real Network Conditions

- [ ] Walk between WiFi and cellular coverage areas → app handles transition
- [ ] Find a dead zone → queue actions → walk back to coverage → verify sync
- [ ] Leave app in background for 30 minutes → reopen → verify it reconnects and shows current data
- [ ] **Battery test:** Run the player app for 2 hours continuously with GPS on → check battery drain

### I. Scale Test

- [ ] Have at least 5 phones connected simultaneously
- [ ] All check in at the same base within 30 seconds → all succeed → leaderboard correct
- [ ] All submit answers to the same challenge → operator sees all submissions
- [ ] Operator reviews 5 submissions rapidly → all reflect correctly

### J. Recovery Scenarios

- [ ] Force-kill the app → reopen → player is still logged in, sees correct game state
- [ ] Server restart (docker restart) → apps reconnect automatically within 30 seconds
- [ ] Player phone dies → recharges → reopens app → still in the game, pending actions sync

### K. NFC Tag Reliability

- [ ] Test EVERY physical NFC tag at EVERY base location → all scan correctly
- [ ] Test with multiple phone models (not just yours) → NFC sensitivity varies
- [ ] Test scanning through phone cases → some thick cases block NFC
- [ ] Have a backup plan if a tag is damaged (operator manual check-in)

---

## Pre-Event Checklist (day of)

- [ ] All NFC tags are in place and tested
- [ ] Server is running and accessible from the venue
- [ ] Both operator teams can login and see their respective games
- [ ] At least one test player can join each game
- [ ] Cellular coverage confirmed at key base locations
- [ ] Operator phones are fully charged + have power banks
- [ ] You have SSH access to the server in case of emergency

---

## Emergency Runbook

**If the server goes down:** `docker compose up -d` — everything auto-recovers with health checks.

**If a player is stuck:** Operator can manually check in a team at a base, and can manually review/approve submissions.

**If an NFC tag stops working:** The base still shows on the map. Operator can manually check in the team.

**If WebSocket stops updating:** The apps have polling fallback (React Query 30s staleTime). Data will still sync, just with a delay.

**If a player's phone dies:** Their pending offline actions are preserved. When the phone charges and the app reopens, it syncs automatically.
