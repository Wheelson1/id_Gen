/**
 * config.example.js — Copy this file to config.js and fill in real values.
 *
 * config.js is listed in .gitignore and must NEVER be committed.
 * All values here are safe to expose to the browser EXCEPT:
 *   - There is no private key here; the private key lives only in Supabase secrets.
 *
 * After running supabase/scripts/generate-keys.ts, paste the public key below.
 * After deploying your Supabase project, paste its URL and anon key below.
 */

// eslint-disable-next-line no-unused-vars
const EBSU_CONFIG = {
  // ── Supabase project ──────────────────────────────────────────────────────
  SUPABASE_URL:       'https://qsrfvfdojtmsinewxetz.supabase.co',
  SUPABASE_ANON_KEY:  'sb_publishable_xA_kHJ598AoX62iZZHGEww_DRoS0eyZ',

  // ── Edge function URLs ────────────────────────────────────────────────────
  // These are derived from SUPABASE_URL + /functions/v1/<name>
  // Hard-code them here so they work even if the URL formula ever changes.
  ISSUE_CARD_URL:  'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/issue-card',
  VERIFY_CARD_URL: 'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/verify-card',

  // ── Ed25519 public key (safe to expose) ───────────────────────────────────
  // Run:  deno run supabase/scripts/generate-keys.ts
  // Copy the ED25519_PUBLIC_KEY= value (everything after the '=') here.
  // The matching private key goes into Supabase secrets as ED25519_PRIVATE_KEY.
  ED25519_PUBLIC_KEY: 'BASE64_ENCODED_32_BYTE_PUBLIC_KEY',
};
