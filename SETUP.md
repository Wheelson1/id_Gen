# EBSU ID Card System — Setup Guide

Follow these steps in order. Each step must succeed before you proceed.

---

## Prerequisites

- [Supabase account](https://supabase.com) (free tier is fine)
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in
- [Deno](https://deno.land) installed (for the key-generation script)
- A static file server or any web host for the HTML files (or just `file://` for local use)

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Choose a region close to Nigeria (e.g. `eu-west-2` or `us-east-1`).
3. Note your **Project URL** and **anon key** (Settings → API).
4. Note your **service-role key** (Settings → API → Service role — keep this secret).

---

## Step 2 — Run the database migration

### Option A — Supabase CLI (recommended)

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --include-all
```

### Option B — Dashboard SQL editor

1. Open your project → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. Click **Run**.

---

## Step 3 — Create storage buckets

If the SQL migration did not create them automatically (some projects need this manually):

1. Go to **Storage** in the Supabase dashboard.
2. Create a bucket named **`student-photos`** — set **Public** to **on**.
3. Create a bucket named **`student-signatures`** — set **Public** to **on**.

---

## Step 4 — Generate the Ed25519 keypair

Run this **once** on your local machine:

```bash
deno run --allow-env supabase/scripts/generate-keys.ts
```

You will see output like:

```
ED25519_PRIVATE_KEY=MIGHAgEAMBMGByqGSM49AgEG...
ED25519_PUBLIC_KEY=MCowBQYDK2VwAyEA...
```

**Save both values somewhere safe now.** The private key is shown only once.

---

## Step 5 — Set Supabase secrets

These are injected into edge functions at runtime. They never touch the client.

```bash
supabase secrets set ED25519_PRIVATE_KEY="PASTE_PRIVATE_KEY_HERE"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="PASTE_SERVICE_ROLE_KEY_HERE"
supabase secrets set ED25519_PUBLIC_KEY="PASTE_PUBLIC_KEY_HERE"
supabase secrets set VERIFICATION_SOURCE="supabase"
```

To verify:

```bash
supabase secrets list
```

---

## Step 6 — Deploy edge functions

```bash
supabase functions deploy issue-card
supabase functions deploy verify-card
```

Both functions will be live at:
- `https://YOUR_PROJECT_REF.supabase.co/functions/v1/issue-card`
- `https://YOUR_PROJECT_REF.supabase.co/functions/v1/verify-card`

---

## Step 7 — Create user accounts

Create at least three users in **Authentication → Users → Invite user**:

| Role | Purpose |
|------|---------|
| `admin` | Access admin panel + can revoke cards |
| `operator` | Issue ID cards in the generator |
| `verifier` | Scan and verify cards (guards) |

After creating each user, set their role in **app_metadata** (never `user_metadata`) via the Supabase Admin API / service-role client and insert their row into `public.staff_profiles`:

```js
await supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'operator', school_id: '00000000-0000-4000-8000-000000000001' }
});
```

---

## Step 8 — Fill in config.js

```bash
cp config.example.js config.js
```

Open `config.js` and fill in:

```js
const EBSU_CONFIG = {
  SUPABASE_URL:       'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY:  'YOUR_ANON_KEY',
  ISSUE_CARD_URL:  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/issue-card',
  VERIFY_CARD_URL: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/verify-card',
  ED25519_PUBLIC_KEY: 'PASTE_PUBLIC_KEY_FROM_STEP_4',
};
```

`config.js` is listed in `.gitignore` — never commit it.

---

## Step 9 — Serve the static files

**Simplest (cybercafé, local disk):**
Open `index.html` directly in Chrome or Edge. File-origin (`file://`) requests are allowed in `cors.ts`.

**Recommended (LAN server):**
```bash
# Python 3
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`.

---

## Step 10 — Smoke-test

1. Open `index.html` → sign in as operator → fill in a student → click **Generate ID Card**.
   - You should see the card render with an opaque `EBSU1:…` QR code (no name/matric in the QR).
2. Open `verify.html` → sign in as verifier → scan the QR.
   - Result should show **✓ VERIFIED — Card is Valid** with the student's details pulled from the database.
3. Open `admin.html` → sign in as admin → revoke the card by matric.
4. Scan the same QR again → result should now show **CARD REVOKED**.

---

## Switching to the school portal (future)

When EBSU ICT provides a REST API:

1. Update `supabase/functions/verify-card/index.ts` → `PortalSource.lookup()` with the real endpoint and auth header format.
2. Set the secret: `supabase secrets set VERIFICATION_SOURCE="portal"`
3. Set: `supabase secrets set PORTAL_API_BASE="https://portal.ebsu.edu.ng/api/v1"`
4. Set: `supabase secrets set PORTAL_API_KEY="KEY_FROM_EBSU_ICT"`
5. Redeploy: `supabase functions deploy verify-card`

No frontend changes are needed — the trust model stays identical.
