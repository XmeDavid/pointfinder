package com.prayer.pointfinder.security;

import com.prayer.pointfinder.entity.SubscriptionStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserSubscription;
import com.prayer.pointfinder.repository.OrganizationRepository;
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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Blocks a frozen workspace from acting.
 *
 * <p>Two independent gates, because the two workspaces are billed separately:
 * <ul>
 *   <li>the caller's own personal subscription is frozen — they may not use
 *       the API at all, exactly as before;</li>
 *   <li>the request carries an <em>org context</em> and that org is frozen —
 *       the caller may not act inside it, even though their personal account
 *       is fine.</li>
 * </ul>
 *
 * <p>The org context is read from the path, not from a repository scan: a
 * {@code /api/orgs/{id}/**} request names its org directly, and a
 * {@code /api/games/{id}/**} request resolves to at most one org through a
 * single projection query ({@code findSubscriptionStatusByGameId}) that
 * returns the status column alone. A personal game yields an empty Optional
 * and passes. Since {@link OncePerRequestFilter} runs this once per request,
 * that is one extra query on org-scoped requests and none on personal ones —
 * the "cache per request" the design asks for falls out of the filter's own
 * lifecycle, with no cache to invalidate.
 *
 * <p>The allow-list keeps billing, auth, and the read-only workspace/quota
 * endpoints reachable, so a frozen club's admin can still see why they are
 * frozen and settle the invoice.
 *
 * <p>Two org-scoped routes are carved out of the org gate for the same reason:
 * {@code GET /api/orgs/{id}/invoices} is the invoice a frozen club must reach
 * to pay, and {@code POST /api/orgs/{id}/leave} is the door a member must be
 * able to walk out of. Freezing a club must not trap the people in it or hide
 * the bill that unfreezes it. Everything else inside the org stays refused.
 *
 * <p>Players carry a {@code Player} principal, never a {@code User}, so a
 * frozen club never locks out players already in a live game.
 */
@Component
@RequiredArgsConstructor
public class FrozenAccountFilter extends OncePerRequestFilter {

    private final UserSubscriptionRepository userSubRepository;
    private final OrganizationRepository orgRepository;

    private static final Set<String> ALLOWED_PREFIXES = Set.of(
        "/api/billing",
        "/api/webhooks",
        "/api/auth",
        "/api/workspaces",
        "/api/quota"
    );

    private static final String ORGS_PREFIX = "/api/orgs/";
    private static final String GAMES_PREFIX = "/api/games/";

    /**
     * The org-scoped routes a frozen club may still use: reading the invoice
     * that will unfreeze it, and leaving it. Keyed by the path tail after
     * {@code /api/orgs/{id}}, valued by the method that is allowed there.
     */
    private static final Map<String, String> FROZEN_ORG_CARVE_OUTS = Map.of(
        "/invoices", "GET",
        "/leave", "POST"
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
            reject(response, "Your account is frozen. Please update your payment method.");
            return;
        }

        if (isOrgContextFrozen(path, request.getMethod())) {
            reject(response, "This organization is frozen. Please settle the outstanding invoice.");
            return;
        }

        filterChain.doFilter(request, response);
    }

    /** Resolves the org this request acts inside, if any, and reports whether it is frozen. */
    private boolean isOrgContextFrozen(String path, String method) {
        if (path.startsWith(ORGS_PREFIX)) {
            UUID orgId = parseFirstSegment(path, ORGS_PREFIX);
            if (orgId == null) return false;
            if (isFrozenOrgCarveOut(path, orgId, method)) return false;
            return orgRepository.findById(orgId)
                .map(org -> org.getSubscriptionStatus() == SubscriptionStatus.frozen)
                .orElse(false);
        }
        if (path.startsWith(GAMES_PREFIX)) {
            UUID gameId = parseFirstSegment(path, GAMES_PREFIX);
            if (gameId == null) return false;
            Optional<SubscriptionStatus> status = orgRepository.findSubscriptionStatusByGameId(gameId);
            return status.filter(s -> s == SubscriptionStatus.frozen).isPresent();
        }
        return false;
    }

    /**
     * Whether this is one of the two routes a frozen club keeps: its invoice
     * list and its exit. Matched on the exact tail and method, so nothing
     * deeper than {@code /api/orgs/{id}/invoices} slips through.
     */
    private boolean isFrozenOrgCarveOut(String path, UUID orgId, String method) {
        String tail = path.substring(ORGS_PREFIX.length() + orgId.toString().length());
        String allowedMethod = FROZEN_ORG_CARVE_OUTS.get(tail);
        return allowedMethod != null && allowedMethod.equalsIgnoreCase(method);
    }

    /** The path segment right after {@code prefix}, parsed as a UUID, or null when it is not one. */
    private UUID parseFirstSegment(String path, String prefix) {
        String rest = path.substring(prefix.length());
        int slash = rest.indexOf('/');
        String segment = slash >= 0 ? rest.substring(0, slash) : rest;
        try {
            return UUID.fromString(segment);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private void reject(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"error\":\"ACCOUNT_FROZEN\",\"code\":\"ACCOUNT_FROZEN\",\"message\":\"" + message + "\"}"
        );
    }

    private boolean isAllowedPath(String path) {
        return ALLOWED_PREFIXES.stream().anyMatch(path::startsWith);
    }
}
