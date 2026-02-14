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

import java.util.Locale;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {
    private static final String BRAND_NAME = "PointFinder";
    private static final String PRIMARY_COLOR = "#16a34a";
    private static final Set<String> SUPPORTED_FRONTEND_HOSTS = Set.of(
            "pointfinder.pt",
            "pointfinder.ch"
    );

    private final JavaMailSender mailSender;

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

    private String buildEmailTemplate(String label, String title, String contentHtml, String ctaLabel, String actionUrl) {
        return """
                <!doctype html>
                <html lang="en">
                <body style="margin: 0; padding: 24px; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #171717;">
                    <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden;">
                        <div style="padding: 24px; border-bottom: 1px solid #e5e5e5; background-color: #fafafa;">
                            <p style="margin: 0; font-size: 13px; letter-spacing: 0.4px; text-transform: uppercase; color: #737373;">%s</p>
                            <p style="margin: 8px 0 0; font-size: 24px; font-weight: 700; color: %s;">%s</p>
                        </div>
                        <div style="padding: 24px;">
                            <h2 style="margin: 0 0 14px; font-size: 24px; line-height: 1.35; color: #171717;">%s</h2>
                            %s
                            <div style="margin: 28px 0; text-align: center;">
                                <a href="%s"
                                   style="display: inline-block; background-color: %s; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 12px 24px; font-size: 15px; font-weight: 600;">
                                    %s
                                </a>
                            </div>
                            <p style="margin: 0; color: #737373; font-size: 13px; line-height: 1.6;">
                                If the button does not work, copy and paste this link into your browser:<br/>
                                <a href="%s" style="color: %s; word-break: break-all;">%s</a>
                            </p>
                        </div>
                        <div style="padding: 16px 24px; border-top: 1px solid #e5e5e5; background-color: #fafafa;">
                            <p style="margin: 0; color: #737373; font-size: 12px; line-height: 1.5;">
                                This email was sent by %s. If you were not expecting this invitation, you can safely ignore it.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
                """.formatted(
                escapeHtml(label),
                PRIMARY_COLOR,
                BRAND_NAME,
                escapeHtml(title),
                contentHtml,
                actionUrl,
                PRIMARY_COLOR,
                escapeHtml(ctaLabel),
                actionUrl,
                PRIMARY_COLOR,
                actionUrl,
                BRAND_NAME
        );
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
