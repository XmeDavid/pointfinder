package com.dbv.scoutmission.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromAddress;

    @Value("${app.mail.enabled}")
    private boolean mailEnabled;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Async
    public void sendRegistrationInvite(String toEmail, String token, String inviterName) {
        String subject = "You've been invited to Scout HQ";
        String registrationLink = frontendUrl + "/register/" + token;

        String html = """
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1a1a1a;">You're invited to Scout HQ</h2>
                    <p style="color: #4a4a4a; font-size: 16px;">
                        <strong>%s</strong> has invited you to join as a game operator on Scout HQ.
                    </p>
                    <p style="color: #4a4a4a; font-size: 16px;">
                        Click the button below to create your account and get started:
                    </p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="%s"
                           style="background-color: #171717; color: #ffffff; padding: 12px 32px;
                                  text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">
                            Create Account
                        </a>
                    </div>
                    <p style="color: #8a8a8a; font-size: 14px;">
                        Or copy and paste this link into your browser:<br/>
                        <a href="%s" style="color: #6366f1;">%s</a>
                    </p>
                    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;"/>
                    <p style="color: #8a8a8a; font-size: 12px;">
                        If you didn't expect this invitation, you can safely ignore this email.
                    </p>
                </div>
                """.formatted(inviterName, registrationLink, registrationLink, registrationLink);

        sendHtmlEmail(toEmail, subject, html);
    }

    @Async
    public void sendGameInvite(String toEmail, String gameName, String inviterName) {
        String subject = "You've been invited to operate a game on Scout HQ";
        String loginLink = frontendUrl + "/login";

        String html = """
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1a1a1a;">Game Invitation</h2>
                    <p style="color: #4a4a4a; font-size: 16px;">
                        <strong>%s</strong> has invited you to operate the game <strong>%s</strong> on Scout HQ.
                    </p>
                    <p style="color: #4a4a4a; font-size: 16px;">
                        Log in to your account to accept the invitation:
                    </p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="%s"
                           style="background-color: #171717; color: #ffffff; padding: 12px 32px;
                                  text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">
                            Go to Scout HQ
                        </a>
                    </div>
                    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;"/>
                    <p style="color: #8a8a8a; font-size: 12px;">
                        If you didn't expect this invitation, you can safely ignore this email.
                    </p>
                </div>
                """.formatted(inviterName, gameName, loginLink);

        sendHtmlEmail(toEmail, subject, html);
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
