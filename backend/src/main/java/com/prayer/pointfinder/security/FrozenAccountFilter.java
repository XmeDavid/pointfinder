package com.prayer.pointfinder.security;

import com.prayer.pointfinder.entity.SubscriptionStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserSubscription;
import com.prayer.pointfinder.repository.UserSubscriptionRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class FrozenAccountFilter extends OncePerRequestFilter {

    private final UserSubscriptionRepository userSubRepository;

    private static final Set<String> ALLOWED_PREFIXES = Set.of(
        "/api/billing",
        "/api/webhooks",
        "/api/auth",
        "/api/workspaces",
        "/api/quota"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();

        // Always allow non-API and whitelisted paths
        if (!path.startsWith("/api/") || isAllowedPath(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof User user)) {
            filterChain.doFilter(request, response);
            return;
        }

        UserSubscription sub = userSubRepository.findByUserId(user.getId()).orElse(null);
        if (sub != null && sub.getStatus() == SubscriptionStatus.frozen) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write(
                "{\"error\":\"ACCOUNT_FROZEN\",\"message\":\"Your account is frozen. Please update your payment method.\"}"
            );
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean isAllowedPath(String path) {
        return ALLOWED_PREFIXES.stream().anyMatch(path::startsWith);
    }
}
