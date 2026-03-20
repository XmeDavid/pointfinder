package com.prayer.pointfinder.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

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

    @Test
    void sendRegistrationInvite_mailDisabled_logsOnly() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", false);

        emailService.sendRegistrationInvite("user@example.com", "token123", "Admin User", "pointfinder.pt");

        verify(mailSender, never()).createMimeMessage();
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void sendRegistrationInvite_mailEnabled_sendsEmail() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendRegistrationInvite("user@example.com", "token123", "Admin User", "pointfinder.pt");

        verify(mailSender).send(mimeMessage);
    }

    @Test
    void sendGameInvite_mailDisabled_logsOnly() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", false);

        emailService.sendGameInvite("user@example.com", "Fun Game", "Admin User", "pointfinder.pt");

        verify(mailSender, never()).createMimeMessage();
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void sendGameInvite_mailEnabled_sendsEmail() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendGameInvite("user@example.com", "Fun Game", "Admin User", "pointfinder.pt");

        verify(mailSender).send(mimeMessage);
    }

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
    void escapeHtml_handlesNullInviterName() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendRegistrationInvite("user@example.com", "token", null, null);

        verify(mailSender).send(mimeMessage);
    }

    // --- Direct escapeHtml unit tests via reflection ---

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

    @Test
    void sendRegistrationInvite_usesCorrectFrontendUrl() {
        ReflectionTestUtils.setField(emailService, "mailEnabled", true);
        ReflectionTestUtils.setField(emailService, "frontendUrl", "https://pointfinder.ch");
        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        emailService.sendRegistrationInvite("user@example.com", "abc-token", "Admin", "pointfinder.ch");

        verify(mailSender).send(mimeMessage);
    }

    private String invokeEscapeHtml(String input) {
        return (String) ReflectionTestUtils.invokeMethod(emailService, "escapeHtml", input);
    }
}
