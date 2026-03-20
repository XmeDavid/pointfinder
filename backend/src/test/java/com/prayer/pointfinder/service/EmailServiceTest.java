package com.prayer.pointfinder.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmailServiceTest {

    @Mock
    private JavaMailSender mailSender;

    @InjectMocks
    private EmailService emailService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(emailService, "fromAddress", "noreply@pointfinder.pt");
        ReflectionTestUtils.setField(emailService, "frontendUrl", "https://pointfinder.pt");
    }

    // ── Registration invite — mail disabled ─────────────────────────

    @Test
    void sendRegistrationInvite_mailDisabled_logsOnly() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", false);

        emailService.sendRegistrationInvite("user@example.com", "token123", "Admin User", "pointfinder.pt");

        verify(mailSender, never()).createMimeMessage();
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    // ── Registration invite — mail enabled ──────────────────────────

    @Test
    void sendRegistrationInvite_mailEnabled_sendsEmail() throws MessagingException {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendRegistrationInvite("user@example.com", "token123", "Admin User", "pointfinder.pt");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendRegistrationInvite_usesCorrectSubject() throws MessagingException {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        // Capture the real MimeMessage to inspect its content via MimeMessageHelper
        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendRegistrationInvite("user@example.com", "token123", "Admin User", "pointfinder.pt");

        assertThat(realMessage.getSubject()).isEqualTo("You've been invited to PointFinder");
    }

    @Test
    void sendRegistrationInvite_usesFromAddress() throws MessagingException {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        ReflectionTestUtils.setField(emailService, "fromAddress", "noreply@pointfinder.pt");

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendRegistrationInvite("user@example.com", "token123", "Admin User", "pointfinder.pt");

        assertThat(realMessage.getFrom()).isNotNull();
        assertThat(realMessage.getFrom()[0].toString()).contains("noreply@pointfinder.pt");
    }

    @Test
    void sendRegistrationInvite_bodyContainsRegistrationLink() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendRegistrationInvite("user@example.com", "abc-token", "Admin", "pointfinder.pt");

        // Extract body content — MimeMessage with multipart/alternative from MimeMessageHelper
        Object content = realMessage.getContent();
        String bodyText = extractTextFromContent(content);
        assertThat(bodyText).contains("https://pointfinder.pt/register/abc-token");
    }

    @Test
    void sendRegistrationInvite_bodyContainsInviterName() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendRegistrationInvite("user@example.com", "token", "John Scout", "pointfinder.pt");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("John Scout");
    }

    @Test
    void sendRegistrationInvite_usesFrontendUrlForKnownHost() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        ReflectionTestUtils.setField(emailService, "frontendUrl", "https://pointfinder.pt");

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        // pointfinder.ch is a known supported host → should use https://pointfinder.ch
        emailService.sendRegistrationInvite("user@example.com", "abc-token", "Admin", "pointfinder.ch");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("https://pointfinder.ch/register/abc-token");
    }

    @Test
    void sendRegistrationInvite_unknownHostFallsBackToFrontendUrl() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        ReflectionTestUtils.setField(emailService, "frontendUrl", "https://pointfinder.pt");

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        // unknown host → falls back to frontendUrl
        emailService.sendRegistrationInvite("user@example.com", "xyz-token", "Admin", "unknown.host.example");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("https://pointfinder.pt/register/xyz-token");
    }

    @Test
    void sendRegistrationInvite_usesCorrectFrontendUrl() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        ReflectionTestUtils.setField(emailService, "frontendUrl", "https://pointfinder.ch");

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendRegistrationInvite("user@example.com", "abc-token", "Admin", "pointfinder.ch");

        verify(mailSender).send(realMessage);
        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("pointfinder.ch/register/abc-token");
    }

    // ── Game invite — mail disabled ─────────────────────────────────

    @Test
    void sendGameInvite_mailDisabled_logsOnly() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", false);

        emailService.sendGameInvite("user@example.com", "Fun Game", "Admin User", "pointfinder.pt");

        verify(mailSender, never()).createMimeMessage();
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    // ── Game invite — mail enabled ──────────────────────────────────

    @Test
    void sendGameInvite_mailEnabled_sendsEmail() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendGameInvite("user@example.com", "Fun Game", "Admin User", "pointfinder.pt");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendGameInvite_usesCorrectSubject() throws MessagingException {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendGameInvite("user@example.com", "Fun Game", "Admin User", "pointfinder.pt");

        assertThat(realMessage.getSubject()).isEqualTo("You've been invited to operate a game on PointFinder");
    }

    @Test
    void sendGameInvite_bodyContainsGameNameAndInviter() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendGameInvite("user@example.com", "Forest Rally", "Jane Leader", "pointfinder.pt");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("Forest Rally");
        assertThat(bodyText).contains("Jane Leader");
    }

    @Test
    void sendGameInvite_bodyContainsGamesLink() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendGameInvite("user@example.com", "Fun Game", "Admin", "pointfinder.pt");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("https://pointfinder.pt/games");
    }

    // ── XSS / HTML escaping ─────────────────────────────────────────

    @Test
    void escapeHtml_handlesSpecialCharacters() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // Names with HTML special chars should not throw
        emailService.sendRegistrationInvite("user@example.com", "token", "<script>alert('xss')</script>", null);

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendRegistrationInvite_inviterNameIsHtmlEscapedInBody() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendRegistrationInvite("user@example.com", "token", "<script>xss</script>", null);

        String bodyText = extractTextFromContent(realMessage.getContent());
        // Raw script tag must not appear; escaped form must
        assertThat(bodyText).doesNotContain("<script>xss</script>");
        assertThat(bodyText).contains("&lt;script&gt;xss&lt;/script&gt;");
    }

    @Test
    void sendGameInvite_gameNameIsHtmlEscapedInBody() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendGameInvite("user@example.com", "<b>Evil Game</b>", "Admin", null);

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).doesNotContain("<b>Evil Game</b>");
        assertThat(bodyText).contains("&lt;b&gt;Evil Game&lt;/b&gt;");
    }

    @Test
    void escapeHtml_handlesNullInviterName() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendRegistrationInvite("user@example.com", "token", null, null);

        verify(mailSender).send(mimeMessage);
    }

    // ── Direct escapeHtml unit tests via reflection ─────────────────

    @Test
    void escapeHtml_ampersand() {
        assertEquals("AT&amp;T", invokeEscapeHtml("AT&T"));
    }

    @Test
    void escapeHtml_lessThan() {
        assertEquals("a &lt; b", invokeEscapeHtml("a < b"));
    }

    @Test
    void escapeHtml_greaterThan() {
        assertEquals("a &gt; b", invokeEscapeHtml("a > b"));
    }

    @Test
    void escapeHtml_doubleQuote() {
        assertEquals("say &quot;hello&quot;", invokeEscapeHtml("say \"hello\""));
    }

    @Test
    void escapeHtml_singleQuote() {
        assertEquals("it&#39;s", invokeEscapeHtml("it's"));
    }

    @Test
    void escapeHtml_allSpecialChars() {
        assertEquals("&lt;b&gt;&quot;Hello&quot; &amp; &#39;World&#39;&lt;/b&gt;",
                invokeEscapeHtml("<b>\"Hello\" & 'World'</b>"));
    }

    @Test
    void escapeHtml_nullReturnsEmpty() {
        assertEquals("", invokeEscapeHtml(null));
    }

    @Test
    void escapeHtml_emptyString() {
        assertEquals("", invokeEscapeHtml(""));
    }

    @Test
    void escapeHtml_noSpecialChars() {
        assertEquals("plain text", invokeEscapeHtml("plain text"));
    }

    // ── Error handling ──────────────────────────────────────────────

    @Test
    void sendHtmlEmail_messagingException_doesNotPropagate() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        try {
            doThrow(new MessagingException("SMTP failure"))
                    .when(mimeMessage).setContent(any());
        } catch (MessagingException e) {
            fail("Setup should not throw");
        }
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        // Should not throw -- MessagingException is caught and logged
        assertDoesNotThrow(() ->
                emailService.sendRegistrationInvite("user@example.com", "token", "Inviter", null));
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    // ── Self-registration email ─────────────────────────────────────

    @Test
    void sendSelfRegistrationEmail_mailEnabled_sendsEmail() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendSelfRegistrationEmail("user@example.com", "self-token", "pointfinder.pt");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendSelfRegistrationEmail_usesCorrectSubject() throws MessagingException {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendSelfRegistrationEmail("user@example.com", "self-token", "pointfinder.pt");

        assertThat(realMessage.getSubject()).isEqualTo("Complete your PointFinder registration");
    }

    @Test
    void sendSelfRegistrationEmail_bodyContainsRegistrationLink() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendSelfRegistrationEmail("user@example.com", "self-token-abc", "pointfinder.pt");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("https://pointfinder.pt/register/self-token-abc");
    }

    // ── Password reset email ────────────────────────────────────────

    @Test
    void sendPasswordResetEmail_mailEnabled_sendsEmail() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendPasswordResetEmail("user@example.com", "reset-token", "pointfinder.pt");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendPasswordResetEmail_usesCorrectSubject() throws MessagingException {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendPasswordResetEmail("user@example.com", "reset-token", "pointfinder.pt");

        assertThat(realMessage.getSubject()).isEqualTo("Reset your PointFinder password");
    }

    @Test
    void sendPasswordResetEmail_bodyContainsResetLink() throws Exception {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);

        jakarta.mail.Session session = jakarta.mail.Session.getDefaultInstance(new java.util.Properties());
        MimeMessage realMessage = new MimeMessage(session);
        when(mailSender.createMimeMessage()).thenReturn(realMessage);

        emailService.sendPasswordResetEmail("user@example.com", "reset-xyz", "pointfinder.pt");

        String bodyText = extractTextFromContent(realMessage.getContent());
        assertThat(bodyText).contains("https://pointfinder.pt/reset-password/reset-xyz");
    }

    // ── Helpers ─────────────────────────────────────────────────────

    private String invokeEscapeHtml(String input) {
        return (String) ReflectionTestUtils.invokeMethod(emailService, "escapeHtml", input);
    }

    /**
     * Recursively extracts all text content from a MimeMessage body.
     * Handles both plain text and multipart (text/html alternative) messages.
     */
    private String extractTextFromContent(Object content) throws Exception {
        if (content instanceof String s) {
            return s;
        }
        if (content instanceof jakarta.mail.Multipart mp) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < mp.getCount(); i++) {
                sb.append(extractTextFromContent(mp.getBodyPart(i).getContent()));
            }
            return sb.toString();
        }
        return content.toString();
    }
}
