package com.prayer.pointfinder.entity;

/**
 * Organizations are sales-led: there is no self-serve org checkout. An org is
 * either {@code free} (no deal, or a lapsed one) or {@code club} (a signed deal
 * with a term and per-deal quota overrides).
 *
 * <p>The Postgres {@code org_tier} type still carries the retired 'base' and
 * 'high' labels; V65 migrated every row off them. See docs/business-logic.md,
 * "Clubs and invoicing".
 */
public enum OrgTier {
    free,
    club
}
