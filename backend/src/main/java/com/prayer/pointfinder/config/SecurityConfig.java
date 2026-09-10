package com.prayer.pointfinder.config;

import com.prayer.pointfinder.security.FrozenAccountFilter;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.http.HttpMethod;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final FrozenAccountFilter frozenAccountFilter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .headers(headers -> headers
                .frameOptions(frame -> frame.deny())
                .contentTypeOptions(contentType -> {})
                .httpStrictTransportSecurity(hsts -> hsts
                    .maxAgeInSeconds(31536000)
                    .includeSubDomains(true))
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"error\":\"Unauthorized\",\"message\":\"Authentication required\"}");
                })
                // Spring's default handler answers a role denial with
                // response.sendError(403), which asks the container for an
                // ERROR dispatch. This chain is stateless and re-runs on that
                // dispatch with an empty SecurityContext — JwtAuthenticationFilter
                // does not re-authenticate error dispatches — so the request
                // looked anonymous the second time round and the entry point
                // above overwrote the 403 with a 401. An authenticated operator
                // asking for /api/admin/** was therefore told to log in, which
                // they had already done.
                //
                // Writing the body here instead commits the response, so there
                // is no error dispatch and no second pass to lose the status.
                .accessDeniedHandler((request, response, deniedException) -> {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"error\":\"Forbidden\",\"message\":\"You are not authorized to perform this action\"}");
                    response.getWriter().flush();
                })
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/actuator/**").hasRole("ADMIN")
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/broadcast/**").permitAll()
                .requestMatchers("/api/webhooks/stripe").permitAll()
                // WebSocket handshakes must be allowed through HTTP security so
                // STOMP/native handlers can perform auth after the socket opens.
                .requestMatchers("/ws/**", "/ws-native").permitAll()
                .requestMatchers("/api/player/**").hasRole("PLAYER")
                // PF-01: the account behind a player. Operators can play too, so every
                // account role is admitted; the controller only ever acts on the caller.
                .requestMatchers("/api/account/**").hasAnyRole("ADMIN", "OPERATOR", "PARTICIPANT")
                // Platform administration — club creation, deal terms,
                // invoicing, ownership transfer. Gated at the filter chain so
                // no controller can accidentally ship an unguarded method.
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                // Snapshot endpoint is reachable by players AND operators —
                // the controller branches on the JWT principal type and
                // delegates to GameAccessService for the per-role access
                // check. This carve-out must come BEFORE the blanket
                // /api/games/** matcher below, otherwise Spring Security
                // would reject player JWTs at the filter chain.
                // See docs/business-logic.md "State Snapshot and Version Contract".
                .requestMatchers(HttpMethod.GET, "/api/games/*/snapshot")
                .hasAnyRole("ADMIN", "OPERATOR", "PLAYER")
                .requestMatchers("/api/games/**", "/api/invites/**", "/api/users/**")
                .hasAnyRole("ADMIN", "OPERATOR")
                // Everything else (/api/orgs, /api/billing, workspaces, quota,
                // org invites, future controllers) is operator territory. A
                // participant account (PF-01) or a player token must never
                // inherit reach here just because a route has no matcher.
                .anyRequest().hasAnyRole("ADMIN", "OPERATOR")
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(frozenAccountFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        source.registerCorsConfiguration("/ws/**", config);
        source.registerCorsConfiguration("/ws-native", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
