package com.dbv.scoutmission.security;

import com.dbv.scoutmission.entity.Player;
import com.dbv.scoutmission.entity.User;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {

    private SecurityUtils() {}

    public static User getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user;
        }
        throw new IllegalStateException("No authenticated user found");
    }

    public static Player getCurrentPlayer() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Player player) {
            return player;
        }
        throw new IllegalStateException("No authenticated player found");
    }
}
