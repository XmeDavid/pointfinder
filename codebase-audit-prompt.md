# Codebase Documentation Audit & Gap Analysis

Use this prompt with Claude Code. It is designed to run in two phases, using subagents heavily for parallel exploration.

---

## The Prompt

```
You are about to perform a comprehensive codebase audit in two phases. You MUST use subagents (the Agent tool) extensively to parallelize work. Do not try to do everything sequentially yourself. Launch multiple agents simultaneously whenever their tasks are independent.

## PHASE 1: Exhaustive Discovery & Documentation Validation

### Step 1: Map Everything

Launch the following subagents IN PARALLEL to build a complete picture of the codebase:

1. **Backend Agent**: Explore the entire `backend/` directory. Map every:
   - REST controller and every endpoint (method, path, request/response types, auth requirements)
   - Service class and its public methods (what business logic does each one encode?)
   - Entity/model and its fields, relationships, and constraints
   - Flyway migration (what does each one do? are they consistent with current entity definitions?)
   - Configuration file (application.yml, security config, WebSocket config, push notification config)
   - Exception handler and error response format
   - Scheduled task or background job
   - Event listener or publisher (WebSocket topics, push notification triggers)
   - Test file (what is tested, what is NOT tested?)
   Report everything you find as structured notes. Do not summarize -- be exhaustive.

2. **Frontend Agent**: Explore the entire `web-admin/` directory. Map every:
   - Page/route and what it renders
   - API call (which endpoint does it hit, what params does it send, how does it handle errors?)
   - Zustand store (what state does it hold, what actions does it expose?)
   - React Query hook (what data does it fetch/mutate?)
   - Component that encodes business logic (form validation, conditional rendering based on game state, permission checks)
   - i18n key usage (are all keys in en.json also in pt.json and de.json? any orphaned keys?)
   - Test file (what is tested, what is NOT tested?)
   Report everything you find as structured notes.

3. **Android Agent**: Explore the entire `android-app/` directory. Map every:
   - Screen/composable and its purpose
   - API call and DTO (do DTOs match the backend response format?)
   - Repository and its methods
   - Room database entity and DAO
   - NFC handling logic (what happens on tag scan? what validation occurs?)
   - Location tracking logic
   - Push notification handling (FCM message types, what triggers what screen?)
   - Navigation graph (what are all the routes?)
   - Hilt modules and what they provide
   - Test file (what is tested, what is NOT tested?)
   Report everything you find as structured notes.

4. **iOS Agent**: Explore the entire `ios-app/` directory. Map every:
   - View/screen and its purpose
   - API call and model (do models match the backend response format?)
   - NFC session handling logic (what happens on tag scan? what validation occurs?)
   - Location tracking logic
   - Push notification handling (APNs message types, what triggers what screen?)
   - Navigation structure
   - Test file (what is tested, what is NOT tested?)
   Report everything you find as structured notes.

5. **Infrastructure Agent**: Explore `docker-compose.yml`, `nginx/`, `Makefile`, and any CI/CD config. Map:
   - Every service defined in docker-compose and its configuration
   - Nginx routing rules (what paths go where?)
   - Environment variables required and where they are used
   - Build and deployment pipeline steps
   - Volume mounts and data persistence strategy
   Report everything you find as structured notes.

6. **E2E & Docs Agent**: Explore `e2e/` and `docs/` directories. Map:
   - Every E2E test scenario and what it covers
   - The parity registry (scenarios.json) and what it claims about coverage
   - Every document in `docs/` -- read each one fully
   - Any README files anywhere in the project tree
   - The CLAUDE.md file at the root
   Report the full content and structure of all documentation found.

### Step 2: Cross-Reference Documentation Against Code

Once all agents from Step 1 have reported back, launch a new set of subagents IN PARALLEL:

1. **Backend Docs Validator**: Take the backend findings and compare them against all existing documentation (CLAUDE.md, docs/*.md, backend README if any, API docs if any). For each documented claim:
   - Is it accurate? Does the code actually work this way?
   - Is it complete? Are there endpoints, entities, or behaviors not mentioned?
   - Is it stale? Does it reference things that no longer exist?
   Produce a report of every inaccuracy, omission, and stale reference.

2. **Frontend Docs Validator**: Same exercise for the frontend findings.

3. **Android Docs Validator**: Same exercise for the Android findings.

4. **iOS Docs Validator**: Same exercise for the iOS findings.

5. **Infra Docs Validator**: Same exercise for infrastructure findings.

6. **E2E Docs Validator**: Compare E2E test scenarios against the actual features found in the codebase. Is the parity registry accurate? Are there features with no E2E coverage at all?

### Step 3: Produce Updated Documentation

Based on the validation reports, update or create documentation so that every aspect of the system is accurately documented somewhere. Follow these rules:
- Do NOT put everything in one giant file. Use the existing doc structure where it makes sense, create new when needed.
- Update CLAUDE.md if any of its claims are wrong or incomplete.
- Update docs/*.md files if they are stale.
- Create new docs if there are significant undocumented areas (e.g., if there is no API endpoint reference, create one; if business logic rules are undocumented, document them).
- For each business logic rule you document, note which platforms implement it (backend, frontend, Android, iOS) and HOW each platform implements it.
- Use subagents to write different documents in parallel.

At the end of Phase 1, commit all documentation changes with a clear commit message.

---

## PHASE 2: Gap Analysis

Now that documentation is validated and complete, launch subagents to find gaps.

### Gap Type 1: Business Logic Inconsistencies Across Platforms

Launch a subagent for each major business domain (use your judgment to identify these from Phase 1, but likely candidates include):
- Game lifecycle (creation, starting, pausing, ending)
- Team management (creation, joining, leaving)
- NFC tag scanning (validation, assignment verification)
- Challenge/submission flow (submitting, reviewing, scoring)
- Authentication and authorization (login, token refresh, role-based access)
- Push notifications (what events trigger them, what payload do they carry)
- Real-time updates (WebSocket subscriptions, what events are broadcast)

For EACH domain, the subagent should:
1. Describe the expected business logic based on the backend implementation (the backend is the source of truth)
2. Check if the frontend enforces or assumes the same rules
3. Check if the Android app enforces or assumes the same rules
4. Check if the iOS app enforces or assumes the same rules
5. Flag any divergence: places where a client allows something the backend rejects, or where a client blocks something the backend would accept, or where two clients behave differently from each other

### Gap Type 2: Missing Validation

Launch a subagent that checks for validation gaps:
- For every backend endpoint that validates input, do the clients validate the same constraints before sending?
- Are there backend validations that clients silently ignore (leading to confusing error messages)?
- Are there client-side validations that the backend does not enforce (meaning a direct API call could bypass them)?

### Gap Type 3: Error Handling Gaps

Launch a subagent that checks error handling:
- For every error the backend can return, do the clients handle it gracefully?
- Are there error codes or messages the clients are not prepared for?
- What happens on each client when the network is unavailable during a critical operation (NFC scan, submission, etc.)?

### Gap Type 4: Feature Parity

Launch a subagent that compares feature completeness:
- Is there any feature available on one client but not another?
- Is there any feature in the backend API that no client uses?
- Are there API endpoints that appear unused?

### Gap Type 5: Localization Completeness

Launch a subagent that checks:
- Are all user-facing strings on all platforms localized in all three languages (EN, PT, DE)?
- Are there hardcoded strings anywhere that should be localized?
- Do the translations convey the same meaning across languages?

### Step 4: Produce Gap Analysis Report

Compile all findings into a single `docs/gap-analysis.md` file with sections for each gap type. For each gap found:
- Describe the gap clearly
- State which platforms are affected
- Assess severity (critical / important / minor)
- Suggest the fix

Commit the gap analysis report.

---

## Execution Notes

- Use subagents aggressively. The goal is speed through parallelism.
- When a subagent needs to explore code, it should READ the actual source files, not guess from file names.
- Do not skip any directory or file. If something exists in the repo, it should be accounted for.
- If you find something ambiguous in the code, flag it as ambiguous rather than guessing.
- Prefer accuracy over speed. If a subagent needs to re-read files to be sure, it should.
```
