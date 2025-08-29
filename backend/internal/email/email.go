package email

import (
	"backend/internal/config"
	"fmt"
	"strconv"

	"gopkg.in/mail.v2"
)

type Service struct {
	config *config.Config
}

func NewService(cfg *config.Config) *Service {
	return &Service{config: cfg}
}

func (s *Service) SendOperatorInvite(toEmail, toName, inviteLink string) error {
	if s.config.SMTPUser == "" || s.config.SMTPPass == "" {
		return fmt.Errorf("SMTP credentials not configured")
	}

	m := mail.NewMessage()
	m.SetHeader("From", s.config.AdminEmail)
	m.SetHeader("To", toEmail)
	m.SetHeader("Subject", "You've been invited to join DBV NFC Games")

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>DBV NFC Games - Operator Invitation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c5aa0;">DBV NFC Games - Operator Invitation</h2>
        
        <p>Hello %s,</p>
        
        <p>You've been invited to join <strong>DBV NFC Games</strong> as an operator. As an operator, you'll be able to create and manage adventure games for teams to play.</p>
        
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>To complete your registration, please click the link below:</strong></p>
            <p style="margin: 10px 0;"><a href="%s" style="background-color: #2c5aa0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a></p>
        </div>
        
        <p><strong>Important:</strong> This invitation link will expire in 48 hours for security reasons.</p>
        
        <p>If you have any questions, please contact us at <a href="mailto:%s">%s</a>.</p>
        
        <p>Welcome to DBV NFC Games!</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #666;">
            This is an automated email from DBV NFC Games. Please do not reply to this email.
        </p>
    </div>
</body>
</html>`, toName, inviteLink, s.config.AdminEmail, s.config.AdminEmail)

	m.SetBody("text/html", body)

	port, err := strconv.Atoi(s.config.SMTPPort)
	if err != nil {
		return fmt.Errorf("invalid SMTP port: %v", err)
	}

	d := mail.NewDialer(s.config.SMTPHost, port, s.config.SMTPUser, s.config.SMTPPass)
	
	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}