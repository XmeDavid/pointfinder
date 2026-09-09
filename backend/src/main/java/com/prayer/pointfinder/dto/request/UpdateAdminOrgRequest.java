package com.prayer.pointfinder.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * A partial update to a club. Every field is optional; only the ones present
 * are applied. {@code tier} and {@code status} are validated against the Java
 * enums so a typo answers 400, not 500.
 *
 * <p><b>Absent is not the same as null.</b> {@code termEnd},
 * {@code gracePeriodEnd} and {@code adminNote} are the three fields an admin
 * can legitimately want to <em>clear</em>, and the web form sends an explicit
 * {@code null} to do it. Treating null as "not sent" made those three
 * unclearable: once a club had a term end, no admin screen could take it away
 * again. So each of them records whether Jackson actually set it, through a
 * hand-written setter that also feeds {@code presentFields}. Lombok skips
 * generating a setter it can already see, and no extra dependency is needed
 * for what is three fields' worth of bookkeeping.
 */
@Data
public class UpdateAdminOrgRequest {

    @Size(min = 2, max = 100)
    private String name;

    /** {@code free} or {@code club}. */
    private String tier;

    /** {@code active}, {@code past_due}, {@code grace_period}, {@code frozen}, {@code cancelled}. */
    private String status;

    private Map<String, Object> quotaOverrides;

    private Instant termEnd;

    private Instant gracePeriodEnd;

    private String adminNote;

    /** The clearable fields the request body actually carried, null or not. */
    @JsonIgnore
    private final Set<String> presentFields = new HashSet<>();

    public void setTermEnd(Instant termEnd) {
        this.termEnd = termEnd;
        presentFields.add("termEnd");
    }

    public void setGracePeriodEnd(Instant gracePeriodEnd) {
        this.gracePeriodEnd = gracePeriodEnd;
        presentFields.add("gracePeriodEnd");
    }

    public void setAdminNote(String adminNote) {
        this.adminNote = adminNote;
        presentFields.add("adminNote");
    }

    @JsonIgnore
    public boolean hasTermEnd() {
        return presentFields.contains("termEnd");
    }

    @JsonIgnore
    public boolean hasGracePeriodEnd() {
        return presentFields.contains("gracePeriodEnd");
    }

    @JsonIgnore
    public boolean hasAdminNote() {
        return presentFields.contains("adminNote");
    }
}
