# Support Email Routing Runbook

Goal: ensure `info@desbravadores.dev` forwards reliably to the maintained personal inbox.

## Inputs

- Domain registrar / DNS provider access for `desbravadores.dev`
- Email forwarding provider (for example: Cloudflare Email Routing, Fastmail aliases, ImprovMX, or equivalent)
- Target inbox address (private)

## Configuration steps

1. Create forwarding rule:
   - Source: `info@desbravadores.dev`
   - Destination: your maintained inbox
2. Ensure DNS records are present per provider requirements:
   - MX records for routing provider
   - SPF record that authorizes your outbound provider (if sending as this address)
   - DKIM/DMARC if provider supports signed outbound delivery
3. Keep app defaults aligned with store contact:
   - `docker-compose.yml` uses `MAIL_FROM=info@desbravadores.dev`
   - `backend/src/main/resources/application.yml` defaults to `MAIL_FROM=info@desbravadores.dev`

## Verification checklist

- [ ] Send test email from an external mailbox (Gmail/Outlook) to `info@desbravadores.dev`
- [ ] Confirm delivery in destination inbox within 2 minutes
- [ ] Reply from destination inbox (if configured for outbound alias) and verify sender identity
- [ ] Check spam/junk folders and update SPF/DKIM/DMARC if needed
- [ ] Repeat test from a second provider to validate cross-provider deliverability

## Incident fallback

If forwarding fails during release week:

1. Temporarily update store contact email to an already-working inbox.
2. Keep `info@desbravadores.dev` published on the privacy page only after routing is restored.
3. Re-run verification checklist before switching store metadata back.
