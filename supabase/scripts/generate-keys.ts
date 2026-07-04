/**
 * generate-keys.ts — One-time Ed25519 keypair generation script.
 *
 * Run ONCE to produce your keypair.  Keep the private key secret.
 *
 * Usage:
 *   deno run --allow-env supabase/scripts/generate-keys.ts
 *
 * Output (copy each line to the appropriate place):
 *   ED25519_PRIVATE_KEY=...  → paste into Supabase secret (Dashboard → Settings → Secrets)
 *   ED25519_PUBLIC_KEY=...   → paste into config.js as EBSU_CONFIG.ED25519_PUBLIC_KEY
 *
 * NEVER share or commit the private key.  If it leaks, regenerate immediately
 * and re-run the migration to re-sign all existing cards.
 */

// Generate a fresh Ed25519 keypair using Deno's built-in Web Crypto
const keypair = await crypto.subtle.generateKey(
  { name: 'Ed25519' },
  true,            // exportable
  ['sign', 'verify'],
);

// Export in formats compatible with crypto.ts helpers:
//   Private key → PKCS8 DER bytes, base64-encoded
//   Public key  → raw 32-byte compressed point, base64-encoded
const privateKeyPKCS8 = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);
const publicKeyRaw    = await crypto.subtle.exportKey('raw',   keypair.publicKey);

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

const privB64 = toB64(privateKeyPKCS8);
const pubB64  = toB64(publicKeyRaw);

console.log('');
console.log('════════════════════════════════════════════════════');
console.log('  EBSU ID Card System — Ed25519 Keypair');
console.log('════════════════════════════════════════════════════');
console.log('');
console.log('▶ Add to Supabase secrets (Dashboard → Settings → Secrets):');
console.log('');
console.log(`  ED25519_PRIVATE_KEY=${privB64}`);
console.log('');
console.log('▶ Add to client config.js as EBSU_CONFIG.ED25519_PUBLIC_KEY:');
console.log('');
console.log(`  ED25519_PUBLIC_KEY=${pubB64}`);
console.log('');
console.log('════════════════════════════════════════════════════');
console.log('  ⚠  PRIVATE KEY IS ABOVE — KEEP IT SECRET');
console.log('     Never commit it, paste it in chat, or share it.');
console.log('════════════════════════════════════════════════════');
console.log('');
