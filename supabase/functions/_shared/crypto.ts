/**
 * crypto.ts — Ed25519 sign / verify helpers for EBSU Edge Functions.
 *
 * Key format:
 *   Private key  →  PKCS8 DER bytes, base64-encoded  (stored in Supabase secret ED25519_PRIVATE_KEY)
 *   Public key   →  Raw 32-byte compressed point, base64-encoded  (safe for client config)
 *
 * Signature format:
 *   64 raw bytes encoded as base64url (no padding) — compact enough for QR codes.
 *
 * QR token format:
 *   EBSU1:<card_id_uuid>:<signature_base64url>
 */

// ── Encoding helpers ─────────────────────────────────────────────────────────

function b64ToBytes(b64: string): Uint8Array {
  // Handle both standard base64 and base64url
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - std.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Sign ─────────────────────────────────────────────────────────────────────

/**
 * Sign a card_id string with the Ed25519 private key from Supabase secrets.
 * Returns the signature as a base64url string (no padding).
 */
export async function signCardId(cardId: string, privateKeyB64: string): Promise<string> {
  const keyBytes = b64ToBytes(privateKeyB64);

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );

  const data = new TextEncoder().encode(cardId);
  const sigBuffer = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, data);
  return bytesToB64url(new Uint8Array(sigBuffer));
}

// ── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verify an Ed25519 signature against a card_id and the public key.
 * Returns true only if the signature is cryptographically valid.
 */
export async function verifyCardId(
  cardId: string,
  sigB64url: string,
  publicKeyB64: string,
): Promise<boolean> {
  try {
    const keyBytes = b64ToBytes(publicKeyB64);

    const publicKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    const data = new TextEncoder().encode(cardId);
    const sig  = b64ToBytes(sigB64url);

    return await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, sig, data);
  } catch {
    return false;
  }
}

// ── QR token helpers ─────────────────────────────────────────────────────────

/** Build the opaque QR payload from a card_id + signature. */
export function buildQRToken(cardId: string, sig: string): string {
  return `EBSU1:${cardId}:${sig}`;
}

/**
 * Parse and strictly validate a QR token string.
 * Returns { cardId, sig } or null if the token is malformed.
 */
export function parseQRToken(
  token: string,
): { cardId: string; sig: string } | null {
  if (!token.startsWith('EBSU1:')) return null;

  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [, cardId, sig] = parts;

  // card_id must be a UUID v4
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(cardId)) return null;

  // sig must look like base64url (at least 80 chars for a 64-byte signature)
  if (!/^[A-Za-z0-9_-]{80,}$/.test(sig)) return null;

  return { cardId, sig };
}
