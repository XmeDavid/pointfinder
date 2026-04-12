package com.prayer.pointfinder.entity;

public enum OrgPermission {
    OPERATE_GAMES(1),
    CREATE_GAMES(2),
    DELETE_GAMES(4),
    INVITE_MEMBERS(8),
    MANAGE_PERMS(16),
    MANAGE_BILLING(32),
    MANAGE_RESOURCES(64);

    private final int bit;

    OrgPermission(int bit) {
        this.bit = bit;
    }

    public int getBit() {
        return bit;
    }

    public static final int ALL = 127;

    public static boolean hasPermission(int bitmask, OrgPermission permission) {
        return (bitmask & permission.bit) != 0;
    }

    public static int grant(int bitmask, OrgPermission permission) {
        return bitmask | permission.bit;
    }

    public static int revoke(int bitmask, OrgPermission permission) {
        return bitmask & ~permission.bit;
    }
}
