# Submission Feedback Flow

This document describes how operator feedback on submissions is currently handled across the system.

## End-to-end flow

1. Operator opens a submission in Web Admin and writes feedback in the review dialog.
2. Web Admin sends feedback in `PATCH /games/{gameId}/submissions/{submissionId}/review`.
3. Backend stores feedback on the `Submission.feedback` field.
4. Submission updates are broadcast over websocket with the updated submission payload.
5. Player apps show feedback in the submission result screen when present.

## Web Admin behavior

- Submission cards no longer show submission notes inline.
- Pending cards are clickable to open review quickly.
- Review dialog now preloads any existing feedback for non-pending submissions.
- Reviewed submissions with feedback show a short feedback preview line in the list.

## Source references

- Web Admin list/review UI: `web-admin/src/features/monitoring/SubmissionsPage.tsx`
- Web Admin API client: `web-admin/src/lib/api/submissions.ts`
- Backend review and persistence: `backend/src/main/java/com/prayer/pointfinder/service/SubmissionService.java`
- Backend entity field: `backend/src/main/java/com/prayer/pointfinder/entity/Submission.java`
- iOS feedback display: `ios-app/dbv-nfc-games/Features/Solve/SubmissionResultView.swift`
- Android feedback display: `android-app/feature/player/src/main/kotlin/com/prayer/pointfinder/feature/player/PlayerScreens.kt`
