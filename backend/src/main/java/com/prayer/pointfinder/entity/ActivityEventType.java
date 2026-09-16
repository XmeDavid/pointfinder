package com.prayer.pointfinder.entity;

public enum ActivityEventType {
    check_in,
    submission,
    approval,
    rejection,
    // ── V36 audit foundation additions ─────────────────────────────────
    // operator_override: mark-completed and unlock override actions.
    // team_join: a device's first join of a team (PlayerJoinService).
    // team_switch: a phone moving to the account's saved participation
    // (PlayerAccountService.recover).
    operator_override,
    team_join,
    team_switch
}
