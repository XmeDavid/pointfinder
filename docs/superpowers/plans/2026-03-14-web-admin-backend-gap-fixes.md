# Web-admin & Backend Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 verified gaps in web-admin (form validation, error handling) and backend (coordinate validation).

**Architecture:** Add client-side trim/length validation to match backend constraints. Fix API interceptor to distinguish 401 from 403. Add coordinate range annotations at the backend DTO layer. Use `getApiErrorMessage()` in catch blocks to surface backend error messages.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Spring Boot, Java 21, Jakarta Validation

**Gaps addressed:** GAP-V-4, GAP-V-5, GAP-V-7, GAP-V-8, GAP-V-9, GAP-V-10, GAP-E-3, GAP-E-4

---

## Chunk 1: Form Validation & Backend Coordinate Validation

### Task 1: Web-admin Form Validation — Registration (GAP-V-8, GAP-V-9)

**Files:**
- Modify: `web-admin/src/features/auth/RegisterPage.tsx`
- Modify: `web-admin/src/i18n/locales/en.json`
- Modify: `web-admin/src/i18n/locales/pt.json`
- Modify: `web-admin/src/i18n/locales/de.json`

**Context:** `RegisterPage.tsx` has `handleSubmit` (line 40) that only checks password match. Name uses HTML5 `required` (accepts whitespace). Password has no `minLength`. Backend requires `@NotBlank` name and `@Size(min=6)` password.

- [ ] **Step 1: Add validation to handleSubmit**

In `RegisterPage.tsx`, add these checks at the top of `handleSubmit` (after `e.preventDefault()`, before the password match check):

```tsx
const trimmedName = name.trim();
if (!trimmedName) {
  setError(t("auth.nameRequired"));
  return;
}
if (password.length < 6) {
  setError(t("auth.passwordTooShort"));
  return;
}
```

Update the `register` call to use `trimmedName` instead of `name`:
```tsx
await register(token ?? "", trimmedName, email, password);
```

- [ ] **Step 2: Add minLength attribute to password input**

On the password `<Input>` (line 89), add `minLength={6}`:
```tsx
<Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
```

- [ ] **Step 3: Add translation keys**

Add to `en.json` under `"auth"`:
```json
"nameRequired": "Please enter your name",
"passwordTooShort": "Password must be at least 6 characters"
```

Add equivalent translations to `pt.json`:
```json
"nameRequired": "Por favor, insira o seu nome",
"passwordTooShort": "A palavra-passe deve ter pelo menos 6 caracteres"
```

Add equivalent translations to `de.json`:
```json
"nameRequired": "Bitte geben Sie Ihren Namen ein",
"passwordTooShort": "Das Passwort muss mindestens 6 Zeichen lang sein"
```

- [ ] **Step 4: Run lint and tests**

Run: `cd web-admin && npm run lint && npm run test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/features/auth/RegisterPage.tsx web-admin/src/i18n/
git commit -m "fix(web-admin): validate registration name and password length

Fixes GAP-V-8, GAP-V-9. Trim-check name (reject whitespace-only) and
enforce min 6 chars for password before submission."
```

### Task 2: Web-admin Form Validation — Game Entity Forms (GAP-V-4, GAP-V-5, GAP-V-7)

**Files:**
- Modify: `web-admin/src/features/game-detail/BasesPage.tsx`
- Modify: `web-admin/src/features/game-detail/ChallengesPage.tsx`
- Modify: `web-admin/src/features/game-detail/TeamsPage.tsx`

**Context:** All three forms use HTML5 `required` which accepts whitespace-only input. Backend requires `@NotBlank` for base name, challenge title, and team name. The team edit form already has `.trim()` validation but the creation form does not.

- [ ] **Step 1: Fix BasesPage.tsx base creation**

Read `BasesPage.tsx`. Find `handleSubmit` (around line 114-118) which calls `createBase.mutate(form as CreateBaseDto)`. Add a trim check before the mutate call and pass trimmed name in the payload:
```tsx
const trimmedName = (form.name ?? "").trim();
if (!trimmedName) return;
createBase.mutate({ ...form, name: trimmedName } as CreateBaseDto);
```
Do the same for the update path if it uses a similar pattern.

- [ ] **Step 2: Fix ChallengesPage.tsx challenge creation**

Read `ChallengesPage.tsx`. Find `handleSubmit` (around line 139-154) which constructs a `payload` object. Add a trim check for `title` and pass the trimmed value:
```tsx
const trimmedTitle = (form.title ?? "").trim();
if (!trimmedTitle) return;
// Include trimmedTitle in the payload object
```

- [ ] **Step 3: Fix TeamsPage.tsx team creation**

Read `TeamsPage.tsx`. The edit handler `handleSave` (around line 189-194) already trims with `editName.trim()`. The creation form submits at the `<form>` `onSubmit` (around line 126) which calls `createTeam.mutate()`. The mutation (around line 37) reads `teamName` from closure state. Add trim check before `mutate()`:
```tsx
const trimmed = teamName.trim();
if (!trimmed) return;
```
Either pass `trimmed` to the mutation or set `teamName` to the trimmed value before calling `mutate()`.

- [ ] **Step 4: Run lint and tests**

Run: `cd web-admin && npm run lint && npm run test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add web-admin/src/features/game-detail/
git commit -m "fix(web-admin): add trim validation to base, challenge, and team forms

Fixes GAP-V-4, GAP-V-5, GAP-V-7. Reject whitespace-only names/titles
in creation forms to match backend @NotBlank constraints."
```

### Task 3: Backend Coordinate Range Validation (GAP-V-10)

**Files:**
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/CreateBaseRequest.java`
- Modify: `backend/src/main/java/com/prayer/pointfinder/dto/request/UpdateBaseRequest.java`
- Create: `backend/src/test/java/com/prayer/pointfinder/dto/request/BaseRequestValidationTest.java`

- [ ] **Step 1: Write validation test**

```java
package com.prayer.pointfinder.dto.request;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class BaseRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsLatitudeAbove90() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(91.0);
        req.setLng(0.0);
        assertThat(validator.validate(req))
            .anyMatch(v -> v.getPropertyPath().toString().equals("lat"));
    }

    @Test
    void rejectsLatitudeBelow90() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(-91.0);
        req.setLng(0.0);
        assertThat(validator.validate(req))
            .anyMatch(v -> v.getPropertyPath().toString().equals("lat"));
    }

    @Test
    void rejectsLongitudeAbove180() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(0.0);
        req.setLng(181.0);
        assertThat(validator.validate(req))
            .anyMatch(v -> v.getPropertyPath().toString().equals("lng"));
    }

    @Test
    void acceptsValidCoordinates() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(47.3769);
        req.setLng(8.5417);
        assertThat(validator.validate(req)).isEmpty();
    }

    @Test
    void acceptsBoundaryCoordinates() {
        var req = new CreateBaseRequest();
        req.setName("Test");
        req.setLat(90.0);
        req.setLng(-180.0);
        assertThat(validator.validate(req)).isEmpty();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests '*BaseRequestValidationTest*'`
Expected: FAIL — no range constraints yet

- [ ] **Step 3: Add validation annotations to CreateBaseRequest.java**

Change lat/lng fields from:
```java
@NotNull
private Double lat;

@NotNull
private Double lng;
```
to:
```java
@NotNull
@DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
@DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
private Double lat;

@NotNull
@DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
@DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
private Double lng;
```

Add imports:
```java
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
```

- [ ] **Step 4: Apply same annotations to UpdateBaseRequest.java**

Same changes as Step 3.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests '*BaseRequestValidationTest*'`
Expected: PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && ./gradlew test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "fix(backend): add coordinate range validation to base requests

Fixes GAP-V-10. Adds @DecimalMin/@DecimalMax for latitude (-90..90)
and longitude (-180..180) on CreateBaseRequest and UpdateBaseRequest."
```

## Chunk 2: API Error Handling

### Task 4: Fix 403 vs 401 in API Interceptor (GAP-E-4)

**Files:**
- Modify: `web-admin/src/lib/api/client.ts`

**Context:** Line 104 of `client.ts` treats both 401 and 403 as "token expired" and attempts refresh. 403 means "insufficient permissions" — refreshing won't help and masks the real error.

- [ ] **Step 1: Remove 403 from refresh logic**

In `client.ts` line 104, change:
```typescript
if ((status === 401 || status === 403) && !originalRequest._retry) {
```
to:
```typescript
if (status === 401 && !originalRequest._retry) {
```

Update the comment on line 92 accordingly:
```typescript
// Response interceptor: on 401, attempt one refresh then retry.
```

- [ ] **Step 2: Run frontend tests**

Run: `cd web-admin && npm run lint && npm run test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/lib/api/client.ts
git commit -m "fix(web-admin): stop treating 403 Forbidden as expired token

Fixes GAP-E-4. Only 401 Unauthorized triggers token refresh.
403 Forbidden now passes through as a rejected promise so
components can display permission-denied errors."
```

### Task 5: Surface Backend Error Messages in RegisterPage (GAP-E-3)

**Files:**
- Modify: `web-admin/src/features/auth/RegisterPage.tsx`

**Context:** `getApiErrorMessage()` in `errors.ts` correctly extracts backend error messages. TeamsPage, BasesPage, and ChallengesPage already use it in their mutation `onError` handlers. However, `RegisterPage.tsx` (line 51) uses a bare `catch` with a hardcoded translation key, so backend errors (constraint violations, duplicate email) are never shown.

**Note:** TeamsPage, BasesPage, and ChallengesPage already import and use `getApiErrorMessage` in their React Query `onError` callbacks — no changes needed there.

- [ ] **Step 1: Update RegisterPage catch block**

In `RegisterPage.tsx` line 51, change:
```tsx
} catch {
  setError(t("auth.registrationFailed"));
}
```
to:
```tsx
} catch (err) {
  setError(getApiErrorMessage(err, t("auth.registrationFailed")));
}
```

Add the import at the top:
```tsx
import { getApiErrorMessage } from "@/lib/api/errors";
```

- [ ] **Step 2: Run lint and tests**

Run: `cd web-admin && npm run lint && npm run test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add web-admin/src/features/auth/RegisterPage.tsx
git commit -m "fix(web-admin): surface backend error messages in registration form

Fixes GAP-E-3. Use getApiErrorMessage() with translation fallback
in RegisterPage catch block. Game entity forms already use it."
```
