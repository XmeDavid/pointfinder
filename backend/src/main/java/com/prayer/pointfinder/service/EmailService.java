package com.prayer.pointfinder.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {
    private static final String BRAND_NAME = "PointFinder";
    private static final Set<String> SUPPORTED_FRONTEND_HOSTS = Set.of(
            "pointfinder.pt",
            "pointfinder.ch"
    );

    private final JavaMailSender mailSender;

    private volatile String emailTemplateCache;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.mail.enabled}")
    private boolean mailEnabled;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Async
    public void sendRegistrationInvite(String toEmail, String token, String inviterName, String requestHost) {
        String frontendBaseUrl = resolveFrontendBaseUrl(requestHost);
        String subject = "You've been invited to " + BRAND_NAME;
        String registrationLink = frontendBaseUrl + "/register/" + token;
        String safeInviterName = escapeHtml(inviterName);
        String html = buildEmailTemplate(
                "Operator invitation",
                "You're invited to " + BRAND_NAME,
                """
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    <strong>%s</strong> invited you to join as a game operator on <strong>%s</strong>.
                </p>
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    Create your account to access the dashboard and start managing your games.
                </p>
                """.formatted(safeInviterName, BRAND_NAME),
                "Create Account",
                registrationLink
        );

        sendHtmlEmail(toEmail, subject, html);
    }

    @Async
    public void sendSelfRegistrationEmail(String toEmail, String token, String requestHost) {
        String frontendBaseUrl = resolveFrontendBaseUrl(requestHost);
        String subject = "Complete your " + BRAND_NAME + " registration";
        String registrationLink = frontendBaseUrl + "/register/" + token;
        String html = buildEmailTemplate(
                "Registration",
                "Complete your registration",
                """
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    You requested to create an account on <strong>%s</strong>.
                </p>
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    Click the button below to continue your registration and set up your account.
                </p>
                """.formatted(BRAND_NAME),
                "Continue Registration",
                registrationLink
        );

        sendHtmlEmail(toEmail, subject, html);
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String token, String requestHost) {
        String frontendBaseUrl = resolveFrontendBaseUrl(requestHost);
        String subject = "Reset your " + BRAND_NAME + " password";
        String resetLink = frontendBaseUrl + "/reset-password/" + token;
        String html = buildEmailTemplate(
                "Password reset",
                "Reset your password",
                """
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    We received a request to reset your password for your <strong>%s</strong> account.
                </p>
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
                </p>
                """.formatted(BRAND_NAME),
                "Reset Password",
                resetLink
        );

        sendHtmlEmail(toEmail, subject, html);
    }

    @Async
    public void sendGameInvite(String toEmail, String gameName, String inviterName, String requestHost) {
        String frontendBaseUrl = resolveFrontendBaseUrl(requestHost);
        String subject = "You've been invited to operate a game on " + BRAND_NAME;
        String link = frontendBaseUrl + "/games";
        String safeInviterName = escapeHtml(inviterName);
        String safeGameName = escapeHtml(gameName);
        String html = buildEmailTemplate(
                "Game invitation",
                "You're invited to operate a game",
                """
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    <strong>%s</strong> invited you to operate <strong>%s</strong> on <strong>%s</strong>.
                </p>
                <p style="margin: 0 0 14px; color: #404040; font-size: 16px; line-height: 1.6;">
                    Sign in to your account to review and accept the invitation.
                </p>
                """.formatted(safeInviterName, safeGameName, BRAND_NAME),
                "Open " + BRAND_NAME,
                link
        );

        sendHtmlEmail(toEmail, subject, html);
    }

    private String loadEmailTemplate() {
        if (emailTemplateCache != null) {
            return emailTemplateCache;
        }
        try (InputStream is = getClass().getResourceAsStream("/templates/email-template.html")) {
            if (is == null) {
                throw new IllegalStateException("Email template not found: /templates/email-template.html");
            }
            emailTemplateCache = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            return emailTemplateCache;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load email template", e);
        }
    }

    private String buildEmailTemplate(String label, String title, String contentHtml, String ctaLabel, String actionUrl) {
        return loadEmailTemplate()
                .replace("{{LABEL}}", escapeHtml(label))
                .replace("{{TITLE}}", escapeHtml(title))
                .replace("{{CONTENT_HTML}}", contentHtml)
                .replace("{{ACTION_URL}}", actionUrl)
                .replace("{{CTA_LABEL}}", escapeHtml(ctaLabel));
    }

    private String resolveFrontendBaseUrl(String requestHost) {
        String normalizedHost = normalizeHost(requestHost);
        if (normalizedHost != null && SUPPORTED_FRONTEND_HOSTS.contains(normalizedHost)) {
            return "https://" + normalizedHost;
        }
        return frontendUrl;
    }

    private String normalizeHost(String rawHost) {
        if (rawHost == null) {
            return null;
        }

        String host = rawHost.trim();
        if (host.isEmpty()) {
            return null;
        }

        int commaIndex = host.indexOf(',');
        if (commaIndex >= 0) {
            host = host.substring(0, commaIndex).trim();
        }

        int schemeSeparatorIndex = host.indexOf("://");
        if (schemeSeparatorIndex >= 0) {
            host = host.substring(schemeSeparatorIndex + 3);
        }

        int slashIndex = host.indexOf('/');
        if (slashIndex >= 0) {
            host = host.substring(0, slashIndex);
        }

        int colonIndex = host.indexOf(':');
        if (colonIndex >= 0) {
            host = host.substring(0, colonIndex);
        }

        host = host.toLowerCase(Locale.ROOT);
        if (host.endsWith(".")) {
            host = host.substring(0, host.length() - 1);
        }
        return host.isBlank() ? null : host;
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private void sendHtmlEmail(String to, String subject, String htmlBody) {
        if (!mailEnabled) {
            log.info("Mail disabled. Would send to={}, subject={}", to, subject);
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("Email sent to={}, subject={}", to, subject);
        } catch (MessagingException e) {
            log.error("Failed to send email to={}, subject={}", to, subject, e);
        }
    }
}
