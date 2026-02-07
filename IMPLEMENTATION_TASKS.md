# Implementation Tasks

## 1. Simplify Game States (Draft vs Setup)

**Current Issue:**
The system uses a strict 4-state progression: `draft → setup → live → ended`. However, `draft` and `setup` states are functionally very similar from a UI perspective. Both show the same readiness checklist and allow the same configuration operations.

**Files Involved:**
- `backend/src/main/java/com/dbv/scoutmission/entity/GameStatus.java` - Enum definition
- `backend/src/main/java/com/dbv/scoutmission/service/GameService.java:101-116` - State transition validation
- `web-admin/src/features/game-detail/OverviewPage.tsx` - Frontend readiness checks

**Proposed Solution:**
Simplify to a 3-state model: `configuration → live → ended`
- Merge draft and setup into a single "draft" state
- Keep all validation checks in draft state before allowing transition to live
- Remove the `validateStatusTransition()` logic that enforces the draft→setup step
- Update frontend to show readiness checklist only in draft state


---

## 2. Auto-Assignment of Challenges When Game Goes Live

**Current Issue:**
There is NO automatic assignment of challenges to bases when a game transitions to `live` state. Operators must manually create all assignments before the game starts. The system should automatically:
- Assign random challenges to bases without assignments
- Create different assignments per team (except for location-bound challenges)
- Preserve any manually created assignments


**Proposed Solution:**
Add auto-assignment logic that triggers when game status changes to `live`:

1. For each base without a `fixedChallenge` AND without existing assignments:
   - If challenge is `locationBound=true`: Needs to be manually assigned before going live
   - If challenge is `locationBound=false`: Create per-team assignments with random distribution

2. Algorithm:
   ```
   For each base B without assignments:
     Get pool of available challenges (excluding already assigned ones, and excluding location bound ones)
     If base has fixedChallenge: skip
     Else:
       For each team T:
         Randomly select challenge C from pool
         Create Assignment(base=B, team=T, challenge=C)
   ```

---

## 3. Fix Authentication Race Condition

**Current Issue:**
The `AuthGuard` component has a critical race condition caused by Zustand's async hydration from localStorage. The guard checks authentication state BEFORE localStorage data is loaded, which can:
- Allow brief unauthorized access to protected routes
- Cause unnecessary redirects to login for authenticated users
- Create flickering/unstable navigation experience

**Suspected files Involved:**
- `web-admin/src/routes/AuthGuard.tsx` - The vulnerable component
- `web-admin/src/hooks/useAuth.ts` - Auth store with persist middleware
- `web-admin/src/lib/api/client.ts` - Token refresh interceptor

**Possible Improvements:**
1. Add `onRehydrateStorage` callback to auth store for proper hydration handling
2. Consider adding a `hasHydrated` flag to the store itself
3. Investigate why users are being logged out frequently (check refresh token expiration times)
4. Add better error logging for auth failures
5. Better handle logged out users on the UI (kick to the login screen)

---

## 5. Game Start/End Time Functionality

**Current Issue:**
Games have required `startDate` and `endDate` fields, but these are currently just metadata. The system doesn't:
- Automatically end games at `endDate`
- Validate that operations occur within the scheduled time window
- Use these dates for any game logic

**Proposed Solution:**
Add time-based validation and automation:
1. **Optional Start and End**
  -This should not be required

2. **Start:**
   - When user changes game to live, if there was no startDate, the instant it changes to live becomes the startDate
   - If there is a StartDate dont allow going live before that instant
   - Optional: Background job to auto-transition games to `live` at `startDate`

2. **End:**
   - Background job to auto-transition games to `ended` at `endDate`
   - if not end date, it will be when the operator manually ends.
   - Warning system for operators as end time approaches

3. **Date Validation:**
   - Prevent `endDate` before `startDate`
   - Add warnings when updating dates of active games

4. **UI**
  - Allow for editing of dates


**Optional Enhancements:**
- Time extension capability for operators

---

## 6. Implement Live Map View

**Current Issue:**
The Map page (`web-admin/src/features/monitoring/MapPage.tsx`) shows only a placeholder. The system has all the data needed for a live map (base locations, team locations, WebSocket updates) but no actual map visualization.

**Proposed Solution:**
Integrate a map library and implement real-time visualization:

**Technology Choice:**
- **Option A:** Google Maps (familiar, requires API key and billing) -> I think we would stay under the free tier, we at max will have 100 users
- **Option B:** Mapbox (better styling, requires API key)
- **Option C:** Leaflet (open source, no API key required)


**Features to Implement:**
   - Plot all bases as fixed markers with labels
   - Plot team locations as colored markers (using team.color)
   - Auto-center map to show all bases
   - Real-time updates via WebSocket for team movements
   - Click base marker to see: challenge assigned, teams visited, completion status per team
   - Click team marker to see: team name, last update time, current location

**WebSocket Integration:**
   - Subscribe to team location updates
   - Update team markers in real-time without full re-render
   - Show "signal lost" indicator if location data is stale (>5 minutes)

**UI Enhancements:**
   - Layer toggles (show/hide bases, teams)
   - Team filter (show only selected teams)
   - Zoom controls and full-screen mode
   - Export map as image functionality

---

## Additional Notes

### Priority Recommendations:
1. Fix #3 (Auth Race Condition)
2. Implement #2 (Auto-Assignment)
3. Fix #1 (Simplify States)
4. Fix #5 (Start/End Time Logic)
5. Implement #6 (Live Map)

### Testing Requirements:
- All changes should include unit tests
- Integration tests for game state transitions
- E2E tests for authentication flow
- Manual testing for map visualization

### Database Migrations:
No crucial data on database right now, we can wipe it clean if needed. Migration is also ok