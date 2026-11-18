# EBSU Student ID System: Setup Guide

Last updated 18 November 2026. This replaces the older two-function guide.

## What the system is made of

| Part | Where it lives | What it does |
|------|----------------|--------------|
| Website (HTML, CSS, plain JavaScript) | Vercel: https://ebsu-id-card.vercel.app | Student pages, scanner, staff console, briefing page |
| Database | Supabase Postgres, project `qsrfvfdojtmsinewxetz` | Students, schools, card designs, payments, audit logs. Row-level security on every table |
| Server functions | Supabase Edge Functions (Deno) | Every step that must be trusted runs here, never in the browser |
| File storage | Supabase Storage | Passport photos, signatures, registration uploads |
| Libraries | `js/vendor/` | supabase-js, jsQR, jsPDF, SheetJS, QR code. Stored locally so the site works without a CDN |

### Pages

| Page | Who uses it |
|------|-------------|
| `index.html` | Students: find my record, confirm it is me, pay, get my card |
| `student-portal.html` | Students: open my card, download it, show a live pass |
| `verify.html` | Gate and exam-hall staff: scan a card |
| `c.html` (`/c/<id>.<sig>`) | Anyone who scans a card with a normal phone camera |
| `app.html` | Registry staff console, including the Card Design Lab |
| `login.html` | Staff sign-in |
| `support.html` | Students not found in the system, problem reports, ticket replies |
| `invest.html` | Briefing page for the university and partners |
| `mobile.html` | Presentation helper: phone shows the card, laptop scans it |

### Server functions (9)

`start-verification`, `confirm-identity`, `card-payment`, `issue-card`, `mint-pass`, `verify-card`, `staff-login`, `support-desk`, `request-otp`

### Database migrations (15)

`0001_init` to `0015_independent_review_fixes`, in `supabase/migrations/`. Run them in order.

### How a card proves itself

- The printed QR holds a link: `https://ebsu-id-card.vercel.app/c/<card id>.<Ed25519 signature>`. Only the server holds the private key, so a copied or edited card fails.
- The live pass on a phone is `EBSU2:<card id>:<expiry>:<signature>`. It lasts 60 seconds and works once.
- The scanner always asks `verify-card`. It never decides on its own, so a revoked card is refused straight away.

## Secrets (set in Supabase, never in the website)

```bash
supabase secrets set ED25519_PRIVATE_KEY="..."        # from supabase/scripts/generate-keys.ts
supabase secrets set ED25519_PUBLIC_KEY="..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."   # Settings > API
supabase secrets set TURNSTILE_SECRET_KEY="..."        # Cloudflare Turnstile
supabase secrets set PAYMENT_PROVIDER="paystack"       # or flutterwave
supabase secrets set PAYSTACK_SECRET_KEY="sk_test_..." # sk_live_ when going live
supabase secrets set VERIFICATION_SOURCE="supabase"    # "portal" once EBSU ICT gives an API
```

Optional: `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `VERIFY_RATE_LIMIT_PER_MIN`, `PORTAL_API_BASE`, `PORTAL_API_KEY`.
Leave `ALLOW_LOCAL_CHECKOUT` and `ENABLE_LEGACY_EMAIL_OTP` unset in production.

Without `TURNSTILE_SECRET_KEY` the student functions refuse every request. That is deliberate.

## Setting up from scratch

1. Create the Supabase project and note the URL, anon key and service-role key.
2. `supabase link --project-ref <ref>` then `supabase db push --include-all`.
3. Generate the signing keys: `deno run --allow-env supabase/scripts/generate-keys.ts`. Save the private key now; it is shown once.
4. Set the secrets above.
5. Deploy all nine functions: `supabase functions deploy <name>` for each.
6. Set the card fee for each school: `update public.schools set card_fee_amount = 250000 where code = 'EBSU';` (amount in kobo, so 250000 is ₦2,500).
7. Create staff in Authentication. Put the role in `app_metadata` (never `user_metadata`) and add a row to `public.staff_profiles`. Roles: `super_admin`, `admin`, `registrar`, `operator`, `verifier`. Admin roles must set up two-factor sign-in.
8. Edit `config.js`: Supabase URL, anon key, function URLs, `TURNSTILE_SITE_KEY`, `ED25519_PUBLIC_KEY`.
9. Push to GitHub; Vercel deploys it.

## Demo mode and going live

`config.js` currently has `DEPLOY_ENV: 'demo'` and `DEMO_MODE: true`, for the presentation.

Demo mode only switches on when the page is opened from this computer or the local network (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, 172.16-31.x.x). On the public Vercel address it is always off. Demo results are labelled as demo on screen.

Before real students use the live site:

- set `DEMO_MODE: false` and `DEPLOY_ENV: 'production'`;
- replace the placeholder Turnstile site key with the real one;
- set all the secrets above and deploy the functions;
- delete the old test student (reg no. 1234567890) from the live database;
- sign in with a real admin account and save a design in the Card Design Lab once, to confirm saving works.

## Running it on this computer

Double-click `START_PRESENTATION.bat`. It starts a local server on port 8000 and opens the briefing page. Python must be installed (`python --version` in a command prompt). For the full presentation steps, see the run-sheet.

## Card Design Lab

Console > Registry & Admin > Card Design Lab. Each school's admin or registrar can move, resize, hide and recolour every part of the card, and edit its wording and crest. The design is saved per school in `public.card_templates` and every card the console draws uses it. Saving is blocked if the QR becomes too small to scan, the reg number becomes too small to read, or a required part leaves the card.

## Things never to commit

`supabase/` server code is kept out of git by `.gitignore`, along with `_backup_*` folders (they contain old test logins), `*.md`, `*.csv`, `*.bat` and `scripts/`. Never put the service-role key or the Ed25519 private key in any website file.

## Switching to the EBSU portal later

When EBSU ICT provides an API: update `PortalSource.lookup()` in `supabase/functions/verify-card/index.ts`, set `VERIFICATION_SOURCE=portal`, `PORTAL_API_BASE` and `PORTAL_API_KEY`, then redeploy `verify-card`. The website does not change.
