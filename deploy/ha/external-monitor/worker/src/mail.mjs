// Resend delivery. Fixed HTTPS endpoint, no redirects, bounded timeout.
// Outcomes: 'delivered' (2xx), 'rejected' (definite: 3xx/4xx) or 'uncertain'
// (5xx, timeout, network error) where the request may still have gone
// through and must be retried with the same Idempotency-Key. Response bodies
// are discarded unread; only the status code is logged.

import { MAIL_ENDPOINT, USER_AGENT } from './config.mjs';

export async function sendMail(env, pending, options, deps) {
  const controller = new AbortController();
  const timer = deps.setTimeout(() => controller.abort(), options.mailTimeoutMs);
  try {
    const response = await deps.fetch(MAIL_ENDPOINT, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': pending.key,
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({
        from: env.ALERT_FROM,
        to: [env.ALERT_TO],
        subject: pending.subject,
        text: pending.text,
      }),
    });
    await response.body?.cancel?.().catch(() => {});
    if (response.status >= 200 && response.status < 300) return { outcome: 'delivered', status: response.status };
    if (response.status >= 500) return { outcome: 'uncertain', status: response.status };
    return { outcome: 'rejected', status: response.status };
  } catch (error) {
    const name = error?.name === 'AbortError' ? 'timeout' : 'network';
    return { outcome: 'uncertain', status: 0, error: name };
  } finally {
    deps.clearTimeout(timer);
  }
}

export function mailConfigured(env) {
  return ['RESEND_API_KEY', 'ALERT_FROM', 'ALERT_TO'].every(
    (name) => typeof env[name] === 'string' && env[name].length > 0,
  );
}
