/**
 * Join codes arrive typed, pasted, or inside a QR. QR payloads may be the bare code or a
 * join link (`https://pointfinder.pt/join?code=ABC123`). Codes are upper-case letters and digits.
 */
export function parseJoinCode(input: string | null | undefined): string | null {
  if (!input) return null
  const text = input.trim()
  try {
    const url = new URL(text)
    const fromQuery = url.searchParams.get('code') ?? url.searchParams.get('joinCode')
    if (fromQuery) return normalize(fromQuery)
    const last = url.pathname.split('/').filter(Boolean).pop()
    return last && /^[A-Za-z0-9-]{4,}$/.test(last) && url.pathname.includes('/join') ? normalize(last) : null
  } catch {
    return normalize(text)
  }
}

function normalize(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z0-9]{4,32}$/.test(code) ? code : null
}
