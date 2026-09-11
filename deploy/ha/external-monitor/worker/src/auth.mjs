// Bearer token validation for /heartbeat/{host}.
//
// Both the presented and the expected token are hashed with SHA-256 and the
// fixed-length digests are compared with a full-length XOR loop, so the
// comparison time does not depend on where the tokens differ or on their
// lengths. When a host has no configured token, a dummy digest is compared
// anyway so the response time is the same as for a wrong token.

const encoder = new TextEncoder();
const DUMMY = new Uint8Array(32);

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

function digestsEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ (b[i] ?? 0);
  return diff === 0;
}

/** Extract the bearer credential or null. Never logs or echoes it. */
export function bearerToken(request, maxBytes) {
  const header = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(header)) return null;
  const token = header.slice(header.indexOf(' ') + 1).trim();
  if (token.length === 0 || token.length > maxBytes) return null;
  return token;
}

/**
 * Parse the HEARTBEAT_TOKENS secret (JSON object host -> token). Returns an
 * empty map on any parse problem so a misconfigured secret rejects
 * everything instead of throwing details into logs.
 */
export function parseTokenMap(raw, hosts) {
  try {
    const parsed = JSON.parse(raw || '{}');
    const map = new Map();
    for (const host of hosts) {
      const value = parsed?.[host];
      if (typeof value === 'string' && value.length > 0) map.set(host, value);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Constant-time check of `presented` against the token configured for host. */
export async function tokenMatches(tokenMap, host, presented) {
  const expected = tokenMap.get(host);
  const [given, want] = await Promise.all([
    sha256(presented),
    expected === undefined ? Promise.resolve(DUMMY) : sha256(expected),
  ]);
  const equal = digestsEqual(given, want);
  return expected !== undefined && equal;
}
