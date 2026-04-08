package com.prayer.pointfinder.entity;

public enum ActivityEventType {
    check_in,
    submission,
    approval,
    rejection,
    // ── V36 audit foundation additions ─────────────────────────────────
    // These three values are added now so Phases 2 and 3 do not need a
    // second enum migration. operator_override covers mark-completed and
    // unlock override actions in Phase 2 (Operator Rescue and Overrides).
    // team_join and team_switch cover membership history in Phase 3
    // (Activity Audit and Export). They are reserved for upcoming work and
    // are NOT emitted by the V36 phase itself.
    operator_override,
    team_join,
    team_switch
}
