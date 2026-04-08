package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * Request body for the operator "mark completed" rescue endpoint
 * ({@code POST /api/games/{gameId}/teams/{teamId}/bases/{baseId}/mark-completed}).
 *
 * <p>Synthesizes an approved {@link com.prayer.pointfinder.entity.Submission}
 * on the operator's behalf. Used when a team has physically completed a
 * task but the app got stuck — wrong NFC token, uploader crash, lost
 * connectivity at review time, etc. The resulting submission carries the
 * V36 audit fields so the operator action can be traced in the activity
 * export later.
 *
 * <p><strong>Requirements captured on the audit trail:</strong>
 * <ul>
 *   <li>Which operator performed the rescue (from the security context).</li>
 *   <li>Which team/base/challenge was marked complete (from the URL and
 *       this request body).</li>
 *   <li>Optional free-text justification via {@link #reason}.</li>
 *   <li>Optional numeric override via {@link #pointsOverride}; defaults to
 *       the challenge's configured point value when absent.</li>
 * </ul>
 *
 * <p>The actor identity is never trusted from the request body — it is
 * always recovered from {@code SecurityUtils.getCurrentUser()}.
 */
@Getter
@Setter
@NoArgsConstructor
public class MarkCompletedRequest {

    /**
     * Challenge to mark as complete for the team at the given base. Must
     * belong to the same game as the base.
     */
    @NotNull
    private UUID challengeId;

    /**
     * Optional free-text justification for the mark-completed action.
     * Persisted on {@code submissions.operator_reason} so the audit export
     * can surface "why" alongside "who" and "when".
     */
    @Size(max = 500)
    private String reason;

    /**
     * Optional point override. When null, the synthesized submission is
     * awarded the challenge's configured {@code points}. When non-null,
     * the supplied value is persisted on the submission as-is. Negative
     * values are allowed on the review path today (see commit
     * {@code 3b721c8 "fix: allow negative points on review"}) so they are
     * allowed here too for symmetry.
     */
    private Integer pointsOverride;
}
