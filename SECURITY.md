# EBSU ID Card System — Security Model

## Trust Architecture

Cards are **not self-attesting**. A physical card carries a printed QR code containing only an opaque signed token. The token proves nothing by itself; its validity depends on:

1. **A valid Ed25519 cryptographic signature** (proves the token was issued by the server, not forged).
2. **A live database lookup** (confirms the card has not been revoked, the expiry is current, and the record matches the cardholder shown to the guard).

A forged card — even a perfect visual replica — will fail step 1 immediately. A stolen/lost card can be invalidated via revocation (step 2).

### QR token format

```
EBSU1:<card_id_uuid>:<ed25519_signature_base64url>
```

- `card_id` is a server-generated UUID v4; it is never predictable.
- `signature` is an Ed25519 signature of `card_id` produced with a private key that lives **only in Supabase secrets**, never in any client file.
- No name, matric, or personal data appears in the QR.

---

## Security Fixes (16-point Checklist)

| # | Vulnerability | Fix |
|---|--------------|-----|
| 1 | QR was self-attesting plaintext PII | QR now encodes only `EBSU1:<id>:<sig>` — opaque, no PII |
| 2 | Typed/pasted data could produce a valid verdict | Every verdict requires Ed25519 signature verification + server DB lookup |
| 3 | Manual paste bypassed scanning entirely | Manual input now routed through the identical `handleQRData()` pipeline |
| 4 | Validity was based solely on expiry year in the QR | Validity depends on the server record's `status` field + expiry from DB |
| 5 | Matric not validated; invented matrics could be issued | `issue-card` enforces `^EBSU\/\d{4}\/\d{6,8}$`; client mirrors the check |
| 6 | Hardcoded PIN `ebsu2025` in `verify.html` | PIN system deleted; replaced with Supabase Auth email+password |
| 7 | Verifier had no real auth (client-side PIN only) | Verifier requires Supabase JWT with `role: verifier/operator/admin` |
| 8 | `admin.html` had no auth at all | Admin gate requires Supabase JWT with `role: admin`; full-page overlay blocks all controls |
| 9 | `savePin()` stored PIN in `localStorage` (trivially readable) | `savePin()` deleted; no PIN system exists anymore |
| 10 | XSS via `innerHTML` with scanned/returned data | All dynamic output in `verify.html` uses `textContent` or safe DOM construction; zero `innerHTML` with untrusted values |
| 11 | Expiry parsing: `9999`, non-numeric, or negative accepted | Server validates `currentYear ≤ expiry ≤ currentYear + 10`; client mirrors this |
| 12 | No card-to-human binding at verification point | Verifier fetches and displays `photo_url` from the server record so the guard can compare face to database photo |
| 13 | No revocation mechanism | `students.status` field; admin panel has revoke-by-matric UI; `verify-card` returns `revoked` status |
| 14 | Private signing key risk | Private key exists only in Supabase secrets (`ED25519_PRIVATE_KEY`); public key is in `config.js` (safe to expose) |
| 15 | `buildQRData()` encoded 4 fields client-side but verifier expected 9 (inconsistency) | `buildQRData()` replaced entirely; it now returns `st.qrString` (the opaque server-issued token); old field-encoding codepath removed |
| 16 | `inversionAttempts: 'dontInvert'` missed some real-world QR codes | Changed to `'attemptBoth'` for better scan reliability |

---

## Key Material

| Key | Location | Who can see it |
|-----|----------|----------------|
| `ED25519_PRIVATE_KEY` | Supabase secrets only | Nobody — not even you after setup |
| `ED25519_PUBLIC_KEY` | `config.js` + Supabase secrets | Everyone — it is safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets only | Nobody — used only inside edge functions |
| `SUPABASE_ANON_KEY` | `config.js` | Everyone — RLS policies limit what it can access |

---

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Printing a fake card | QR signature cannot be forged without the private key |
| Replaying a valid QR | Guard checks photo from DB matches the physical cardholder |
| Lost/stolen card | Admin revokes in the DB; next scan returns `revoked` |
| Offline forgery attack | Local Ed25519 check rejects invalid signatures even without network |
| Network outage at scan point | Offline mode shows amber warning `⚠ SIGNATURE VALID — OFFLINE`; guard decides whether to proceed |
| Compromised signing key | Regenerate keypair, re-issue all cards (new signatures), rotate secret |
| Compromised service-role key | Rotate in Supabase Dashboard → Secrets; redeploy functions |
| SQL injection | Supabase client uses parameterized queries; no raw SQL in functions |
| XSS via returned student data | All output via `textContent`; no `innerHTML` with untrusted content |

---

## Verification Source Swap

Set `VERIFICATION_SOURCE=portal` in Supabase secrets to route lookups through the EBSU ICT portal REST API. See `supabase/functions/verify-card/index.ts` → `PortalSource` adapter and `SETUP.md` for instructions. The client trust model is unchanged.
