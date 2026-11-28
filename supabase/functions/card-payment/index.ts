/**
 * card-payment/index.ts — Supabase Edge Function (Phase 3 & Independent Review Hardened)
 *
 * Server-side Card Fee Checkout & Confirmation (Amount strictly from `public.schools.card_fee_amount`).
 *
 * SECURITY GUARANTEES:
 *   1. `ALLOW_LOCAL_CHECKOUT` defaults strictly to `false` in code.
 *   2. Amount is read exclusively from `public.schools.card_fee_amount` (in kobo, e.g. 300000 = ₦3,000).
 *      Zero hardcoded fee fallback exists.
 *   3. Server-side Paystack (`/transaction/initialize`) and Flutterwave (`/v3/payments`)
 *      checkout initialization with institutional split (`paystack_subaccount_code`,
 *      `paystack_split_code`, `flutterwave_subaccount_id`) and deterministic placeholder email.
 *   4. Reference lookup uses `.eq('reference', referenceInput)` (exact match).
 *   5. Verified webhooks return HTTP 200 (`{ received: true, ignored: true }`) for non-charge
 *      events to prevent webhook retry storms.
 */

import { createClient }               from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

type Purpose = 'first_card' | 'replacement' | 'renewal';
const PURPOSES: Purpose[] = ['first_card', 'replacement', 'renewal'];

// Price (kobo) comes only from the schools row. No hardcoded amounts.
function priceFor(school: Record<string, unknown> | null | undefined, purpose: Purpose): number {
  const col = purpose === 'replacement' ? 'replacement_fee_amount'
            : purpose === 'renewal'     ? 'renewal_fee_amount'
            : 'card_fee_amount';
  return Number(school?.[col]);
}

function generatePaymentReference(schoolCode = 'EBSU'): string {
  const now = new Date();
  const ymd =
    String(now.getUTCFullYear()) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randBytes = new Uint8Array(6);
  crypto.getRandomValues(randBytes);
  let suffix = '';
  for (let i = 0; i < randBytes.length; i++) {
    suffix += chars[randBytes[i] % chars.length];
  }
  return `${schoolCode.toUpperCase()}-PAY-${ymd}-${suffix}`;
}

function generatePlaceholderEmail(jambOrId: string, schoolCode = 'EBSU'): string {
  const cleanId = String(jambOrId || 'student')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 24) || 'student';
  const cleanSchool = String(schoolCode || 'ebsu')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return `${cleanSchool}-${cleanId}@pay.ebsu-id.local`;
}

async function verifyPaystackHmac(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return computedHex === signatureHeader.toLowerCase();
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const origin = req.headers.get('origin') ?? '';
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ALLOW_LOCAL_CHECKOUT defaults strictly to false in production code
  const allowLocalCheckout =
    (Deno.env.get('ALLOW_LOCAL_CHECKOUT') ?? 'false').trim().toLowerCase() === 'true';

  try {
    const rawText = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, headers);
    }

    // ── 1. Check if this is a Paystack / Flutterwave Webhook ───────────────
    const paystackSig = req.headers.get('x-paystack-signature');
    const flwHash     = req.headers.get('verif-hash');

    if (paystackSig || flwHash) {
      let verifiedRef = '';
      let verifiedAmount = 0;
      let verifiedCurrency = '';

      if (paystackSig) {
        const psSecret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
        if (!psSecret || !(await verifyPaystackHmac(rawText, paystackSig, psSecret))) {
          return json({ error: 'Invalid webhook signature' }, 401, headers);
        }
        const event = String(body.event ?? '');
        const data  = body.data as Record<string, unknown> | undefined;
        // Return 200 for ignored webhook events after verifying signature
        if (event !== 'charge.success' || !data || data.status !== 'success') {
          return json({ received: true, ignored: true, event }, 200, headers);
        }
        if (typeof data.reference === 'string') {
          verifiedRef = data.reference.trim();
          verifiedAmount = Number(data.amount) || 0; // kobo in Paystack
          verifiedCurrency = String(data.currency || '').toUpperCase();
        }
      } else if (flwHash) {
        const expectedHash = Deno.env.get('FLUTTERWAVE_WEBHOOK_HASH') ?? '';
        if (!expectedHash || flwHash !== expectedHash) {
          return json({ error: 'Invalid webhook hash' }, 401, headers);
        }
        const event = String(body.event ?? '');
        const data  = body.data as Record<string, unknown> | undefined;
        // Return 200 for ignored webhook events after verifying hash
        if (!data || data.status !== 'successful' || (event && event !== 'charge.completed')) {
          return json({ received: true, ignored: true, event }, 200, headers);
        }
        if (typeof data.tx_ref === 'string') {
          verifiedRef = data.tx_ref.trim();
          // Flutterwave sends amount in major units (Naira); convert to kobo
          verifiedAmount = Math.round(Number(data.amount ?? data.charged_amount ?? 0) * 100);
          verifiedCurrency = String(data.currency || '').toUpperCase();
        }
      }

      if (!verifiedRef) {
        return json({ received: true, ignored: true }, 200, headers);
      }

      const { data: payRow } = await supabaseAdmin
        .from('card_payments')
        .select('id, student_id, school_id, amount, currency, status, reference, purpose')
        .eq('reference', verifiedRef)
        .maybeSingle();

      if (!payRow) {
        return json({ error: 'Payment reference not found.' }, 404, headers);
      }

      // Check expected kobo exclusively from public.schools.card_fee_amount (no hardcoded fallback)
      const { data: schoolRow } = await supabaseAdmin
        .from('schools')
        .select('card_fee_amount, replacement_fee_amount, renewal_fee_amount')
        .eq('id', payRow.school_id)
        .maybeSingle();

      const rowPurpose = (PURPOSES.includes(payRow.purpose as Purpose) ? payRow.purpose : 'first_card') as Purpose;
      const expectedKobo = priceFor(schoolRow, rowPurpose);
      if (!expectedKobo || expectedKobo <= 0) {
        return json({ error: 'School fee for this payment type is not configured in database.' }, 500, headers);
      }

      if (verifiedAmount !== expectedKobo || payRow.amount !== expectedKobo || verifiedCurrency !== 'NGN') {
        return json({
          error: `Payment amount or currency mismatch: received ${verifiedAmount} ${verifiedCurrency}, expected ${expectedKobo} NGN.`,
        }, 400, headers);
      }

      if (payRow.status === 'paid') {
        return json({ received: true, already_processed: true }, 200, headers);
      }

      if (payRow.status !== 'pending') {
        return json({ error: `Cannot process payment with status ${payRow.status}.` }, 400, headers);
      }

      const paidAt = new Date().toISOString();
      await supabaseAdmin
        .from('card_payments')
        .update({ status: 'paid', paid_at: paidAt })
        .eq('id', payRow.id);

      if (rowPurpose === 'first_card') {
        await supabaseAdmin
          .from('students')
          .update({
            card_fee_paid_at: paidAt,
            card_payment_reference: payRow.reference,
          })
          .eq('id', payRow.student_id);

        await supabaseAdmin
          .from('onboarding_sessions')
          .update({ step: 'paid', updated_at: paidAt })
          .eq('student_id', payRow.student_id)
          .in('step', ['verified_dob', 'paid']);
      }

      await supabaseAdmin.from('activity_log').insert({
        student_id: payRow.student_id,
        school_id: payRow.school_id,
        action: `Card Fee Paid [${rowPurpose}] via Webhook (Ref ${payRow.reference} · ${verifiedAmount / 100} NGN)`,
        result: 'paid',
        location: 'Payment Webhook',
      });

      return json({ received: true }, 200, headers);
    }

    // ── 2. Interactive Student Checkout (`init` / `confirm`) ───────────────
    const action    = typeof body.action === 'string' ? body.action.trim() : 'init';
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const purposeIn = typeof body.purpose === 'string' ? body.purpose.trim() : 'first_card';
    if (!PURPOSES.includes(purposeIn as Purpose)) {
      return json({ error: 'Unknown payment purpose.' }, 400, headers);
    }
    const purpose = purposeIn as Purpose;

    if (!sessionId) {
      return json({ error: 'session_id is required.' }, 400, headers);
    }

    const { data: sessionRow, error: sessErr } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('id, school_id, student_id, jamb_no, step, expires_at, email_verified_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr || !sessionRow) {
      return json({ error: 'Verification session not found. Please start from Step 1.' }, 404, headers);
    }

    if (new Date(sessionRow.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Verification session expired. Please start again from Step 1.' }, 410, headers);
    }

    if (!['verified_dob', 'paid', 'card_issued'].includes(sessionRow.step) || !sessionRow.student_id) {
      return json({ error: 'Date of Birth must be verified before initiating card payment.' }, 403, headers);
    }

    if (sessionRow.step === 'verified_dob' && !sessionRow.email_verified_at) {
      return json({ error: 'Confirm your email and choose a password before paying.' }, 403, headers);
    }

    // Fetch school fee & split configuration strictly from DB (no hardcoded fallback)
    const { data: schoolRow, error: schoolErr } = await supabaseAdmin
      .from('schools')
      .select('code, name, current_session, card_fee_amount, replacement_fee_amount, renewal_fee_amount, paystack_subaccount_code, paystack_split_code, flutterwave_subaccount_id')
      .eq('id', sessionRow.school_id)
      .maybeSingle();

    const feeKobo = priceFor(schoolRow, purpose);
    if (schoolErr || !schoolRow || !feeKobo || feeKobo <= 0) {
      return json({ error: 'School fee configuration for this payment type is missing in database.' }, 500, headers);
    }

    const schoolCode = schoolRow.code || 'EBSU';
    const feeNaira   = Math.round(feeKobo / 100);
    const defaultProvider = allowLocalCheckout ? 'local_checkout' : 'paystack';
    const configuredProvider = (Deno.env.get('PAYMENT_PROVIDER') || defaultProvider).trim().toLowerCase();

    if (configuredProvider === 'local_checkout' && !allowLocalCheckout) {
      return json({
        error: 'Local checkout is disabled in production. Configure PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY.',
      }, 403, headers);
    }

    const placeholderEmail = generatePlaceholderEmail(sessionRow.jamb_no || sessionRow.student_id, schoolCode);

    // Helper: Initialize transaction on Paystack or Flutterwave with split configuration
    async function initializeProviderCheckout(reference: string, provider: string): Promise<{
      authorization_url: string | null;
      access_code: string | null;
    }> {
      if (provider === 'paystack') {
        const psKey = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
        if (!psKey) return { authorization_url: null, access_code: null };

        const initPayload: Record<string, unknown> = {
          email: placeholderEmail,
          amount: feeKobo,
          currency: 'NGN',
          reference,
          metadata: {
            student_id: sessionRow.student_id,
            school_id: sessionRow.school_id,
            jamb_no: sessionRow.jamb_no,
            purpose,
          },
        };
        // The school only shares in the first card fee. New-card (N500) and session (N300) fees
        // belong entirely to the company, so no split is applied to them.
        if (purpose === 'first_card') {
          if (schoolRow?.paystack_split_code) {
            initPayload.split_code = schoolRow.paystack_split_code;
          } else if (schoolRow?.paystack_subaccount_code) {
            initPayload.subaccount = schoolRow.paystack_subaccount_code;
          }
        }

        try {
          const psInitRes = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${psKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(initPayload),
          });
          const psInitJson = await psInitRes.json().catch(() => ({}));
          if (psInitRes.ok && psInitJson?.data) {
            return {
              authorization_url: psInitJson.data.authorization_url ?? null,
              access_code: psInitJson.data.access_code ?? null,
            };
          }
        } catch (err) {
          console.error('Paystack initialize error:', err);
        }
      } else if (provider === 'flutterwave') {
        const flwKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY') ?? '';
        if (!flwKey) return { authorization_url: null, access_code: null };

        const flwPayload: Record<string, unknown> = {
          tx_ref: reference,
          amount: feeNaira,
          currency: 'NGN',
          customer: {
            email: placeholderEmail,
            name: sessionRow.jamb_no || 'Student',
          },
          meta: {
            student_id: sessionRow.student_id,
            school_id: sessionRow.school_id,
          },
        };
        if (purpose === 'first_card' && schoolRow?.flutterwave_subaccount_id) {
          flwPayload.subaccounts = [{ id: schoolRow.flutterwave_subaccount_id }];
        }

        try {
          const flwInitRes = await fetch('https://api.flutterwave.com/v3/payments', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${flwKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(flwPayload),
          });
          const flwInitJson = await flwInitRes.json().catch(() => ({}));
          if (flwInitRes.ok && flwInitJson?.data?.link) {
            return {
              authorization_url: flwInitJson.data.link,
              access_code: null,
            };
          }
        } catch (err) {
          console.error('Flutterwave initialize error:', err);
        }
      }
      return { authorization_url: null, access_code: null };
    }

    // ── ACTION: INIT ───────────────────────────────────────────────────────
    if (action === 'init') {
      // Replacement and renewal are only for students who already own a paid first card
      if (purpose !== 'first_card') {
        const { data: firstPaid } = await supabaseAdmin
          .from('card_payments')
          .select('id')
          .eq('student_id', sessionRow.student_id)
          .eq('purpose', 'first_card')
          .eq('status', 'paid')
          .limit(1)
          .maybeSingle();
        if (!firstPaid) {
          return json({ error: 'The first card fee must be paid before a replacement or renewal.' }, 403, headers);
        }
      }

      // 1. Check if already paid in card_payments
      const { data: existingPaid } = await supabaseAdmin
        .from('card_payments')
        .select('id, reference, amount, currency, provider, status, paid_at')
        .eq('student_id', sessionRow.student_id)
        .eq('purpose', 'first_card')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Renewal (N300) is paid once per academic session
      const renewalSession: string | null = purpose === 'renewal' ? (schoolRow.current_session ?? null) : null;
      if (purpose === 'renewal') {
        if (!renewalSession) {
          return json({ error: 'The current academic session is not set yet. Please try again later.' }, 503, headers);
        }
        const { data: paidRenewal } = await supabaseAdmin
          .from('card_payments')
          .select('reference, amount, currency, provider, paid_at')
          .eq('student_id', sessionRow.student_id)
          .eq('purpose', 'renewal')
          .eq('session', renewalSession)
          .eq('status', 'paid')
          .limit(1)
          .maybeSingle();
        if (paidRenewal) {
          return json({
            already_paid: true, status: 'paid', session: renewalSession,
            reference: paidRenewal.reference, amount: Math.round(paidRenewal.amount / 100),
            amount_kobo: paidRenewal.amount, currency: paidRenewal.currency || 'NGN',
            provider: paidRenewal.provider, paid_at: paidRenewal.paid_at,
          }, 200, headers);
        }
      }

      // Only the first card is "pay once". Replacement and renewal can be paid again.
      if (existingPaid && purpose === 'first_card') {
        await supabaseAdmin
          .from('onboarding_sessions')
          .update({ step: 'paid', updated_at: new Date().toISOString() })
          .eq('id', sessionRow.id);

        return json({
          already_paid: true,
          status: 'paid',
          reference: existingPaid.reference,
          amount: Math.round(existingPaid.amount / 100),
          amount_kobo: existingPaid.amount,
          currency: existingPaid.currency || 'NGN',
          provider: existingPaid.provider,
          paid_at: existingPaid.paid_at,
        }, 200, headers);
      }

      // 2. Void any stale pending rows whose amount does not match current DB feeKobo
      await supabaseAdmin
        .from('card_payments')
        .update({ status: 'voided' })
        .eq('student_id', sessionRow.student_id)
        .eq('purpose', purpose)
        .eq('status', 'pending')
        .neq('amount', feeKobo);
      // (a pending renewal for an older session is also stale; handled below by matching session)

      // 3. Reuse an existing pending payment row if one matches current feeKobo
      const { data: existingPending } = await supabaseAdmin
        .from('card_payments')
        .select('id, reference, amount, currency, provider, status, created_at, session')
        .eq('student_id', sessionRow.student_id)
        .eq('purpose', purpose)
        .eq('status', 'pending')
        .eq('amount', feeKobo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPending && (purpose !== 'renewal' || existingPending.session === renewalSession)) {
        const providerInit = await initializeProviderCheckout(
          existingPending.reference,
          existingPending.provider || configuredProvider,
        );
        return json({
          already_paid: false,
          status: 'pending',
          reference: existingPending.reference,
          email: placeholderEmail,
          amount: feeNaira,
          amount_kobo: feeKobo,
          currency: existingPending.currency || 'NGN',
          provider: existingPending.provider || configuredProvider,
          authorization_url: providerInit.authorization_url,
          access_code: providerInit.access_code,
        }, 200, headers);
      }

      // 4. Create a fresh pending row in card_payments with amount from DB only
      const newRef = generatePaymentReference(schoolCode);
      const { data: insertedPay, error: payErr } = await supabaseAdmin
        .from('card_payments')
        .insert({
          student_id: sessionRow.student_id,
          school_id: sessionRow.school_id,
          amount: feeKobo,
          currency: 'NGN',
          provider: configuredProvider,
          reference: newRef,
          purpose,
          session: renewalSession,
          status: 'pending',
        })
        .select('id, reference, amount, currency, provider, status')
        .single();

      if (payErr || !insertedPay) {
        console.error('card_payments insert error:', payErr?.message);
        return json({ error: 'Unable to initialize payment reference. Please try again.' }, 500, headers);
      }

      const providerInit = await initializeProviderCheckout(insertedPay.reference, insertedPay.provider);

      return json({
        already_paid: false,
        status: 'pending',
        reference: insertedPay.reference,
        email: placeholderEmail,
        amount: feeNaira,
        amount_kobo: feeKobo,
        currency: 'NGN',
        provider: insertedPay.provider,
        authorization_url: providerInit.authorization_url,
        access_code: providerInit.access_code,
      }, 200, headers);
    }

    // ── ACTION: CONFIRM ────────────────────────────────────────────────────
    if (action === 'confirm') {
      const referenceInput = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
      if (!referenceInput) {
        return json({ error: 'Payment reference is required.' }, 400, headers);
      }

      // Item F: Use exact .eq('reference', referenceInput), never .ilike
      const { data: paymentRow, error: findErr } = await supabaseAdmin
        .from('card_payments')
        .select('id, student_id, school_id, amount, currency, provider, reference, status, paid_at, purpose')
        .eq('student_id', sessionRow.student_id)
        .eq('reference', referenceInput)
        .maybeSingle();

      if (findErr || !paymentRow) {
        return json({ error: 'Payment reference not found for this student session.' }, 404, headers);
      }

      const rowPurpose = (PURPOSES.includes(paymentRow.purpose as Purpose) ? paymentRow.purpose : 'first_card') as Purpose;
      const expectedForRow = priceFor(schoolRow, rowPurpose);
      if (!expectedForRow || paymentRow.amount !== expectedForRow || paymentRow.currency !== 'NGN') {
        return json({
          error: `Payment amount or currency mismatch: record has ${paymentRow.amount} ${paymentRow.currency}, expected ${expectedForRow} NGN.`,
        }, 400, headers);
      }

      if (paymentRow.status === 'paid') {
        const newExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const paidTimestamp = paymentRow.paid_at || new Date().toISOString();
        await Promise.all([
          rowPurpose === 'first_card'
            ? supabaseAdmin
                .from('students')
                .update({ card_fee_paid_at: paidTimestamp, card_payment_reference: paymentRow.reference })
                .eq('id', sessionRow.student_id)
            : Promise.resolve(null),
          rowPurpose === 'first_card'
            ? supabaseAdmin
                .from('onboarding_sessions')
                .update({ step: 'paid', expires_at: newExpires, updated_at: new Date().toISOString() })
                .eq('id', sessionRow.id)
            : Promise.resolve(null),
        ]);

        return json({
          ok: true,
          status: 'paid',
          reference: paymentRow.reference,
          amount: Math.round(paymentRow.amount / 100),
          amount_kobo: paymentRow.amount,
          currency: paymentRow.currency || 'NGN',
          provider: paymentRow.provider,
          paid_at: paidTimestamp,
          expires_at: newExpires,
        }, 200, headers);
      }

      if (paymentRow.status !== 'pending') {
        return json({ error: `Cannot process payment with status ${paymentRow.status}.` }, 400, headers);
      }

      const provider = (paymentRow.provider || configuredProvider).toLowerCase();

      if (provider === 'paystack') {
        const psKey = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
        if (!psKey) {
          return json({ error: 'Paystack verification is not configured on the server.' }, 500, headers);
        }
        const psRes = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentRow.reference)}`,
          { headers: { Authorization: `Bearer ${psKey}` } },
        );
        const psJson = await psRes.json().catch(() => ({}));
        const d = psJson?.data;
        if (
          !psRes.ok ||
          d?.status !== 'success' ||
          Number(d?.amount) !== paymentRow.amount ||
          String(d?.currency || '').toUpperCase() !== 'NGN' ||
          d?.reference !== paymentRow.reference
        ) {
          return json({
            error: 'Paystack transaction verification failed: status, amount, currency, or reference mismatch.',
          }, 402, headers);
        }
      } else if (provider === 'flutterwave') {
        const flwKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY') ?? '';
        if (!flwKey) {
          return json({ error: 'Flutterwave verification is not configured on the server.' }, 500, headers);
        }
        const flwRes = await fetch(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(paymentRow.reference)}`,
          { headers: { Authorization: `Bearer ${flwKey}` } },
        );
        const flwJson = await flwRes.json().catch(() => ({}));
        const d = flwJson?.data;
        const flwKobo = Math.round(Number(d?.amount ?? d?.charged_amount ?? 0) * 100);
        if (
          !flwRes.ok ||
          d?.status !== 'successful' ||
          flwKobo !== paymentRow.amount ||
          String(d?.currency || '').toUpperCase() !== 'NGN' ||
          d?.tx_ref !== paymentRow.reference
        ) {
          return json({
            error: 'Flutterwave transaction verification failed: status, amount, currency, or reference mismatch.',
          }, 402, headers);
        }
      } else if (provider === 'local_checkout') {
        if (!allowLocalCheckout) {
          return json({
            error: 'Local checkout is disabled in production. Payment must be verified by Paystack or Flutterwave.',
          }, 403, headers);
        }
      } else {
        return json({ error: `Unsupported or unverified payment provider: ${provider}` }, 402, headers);
      }

      const paidAt     = new Date().toISOString();
      const newExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: updPayErr } = await supabaseAdmin
        .from('card_payments')
        .update({ status: 'paid', paid_at: paidAt })
        .eq('id', paymentRow.id);

      if (updPayErr) {
        return json({ error: 'Could not update payment status.' }, 500, headers);
      }

      await Promise.all([
        rowPurpose === 'first_card'
          ? supabaseAdmin
              .from('students')
              .update({ card_fee_paid_at: paidAt, card_payment_reference: paymentRow.reference })
              .eq('id', sessionRow.student_id)
          : Promise.resolve(null),
        rowPurpose === 'first_card'
          ? supabaseAdmin
              .from('onboarding_sessions')
              .update({ step: 'paid', expires_at: newExpires, updated_at: paidAt })
              .eq('id', sessionRow.id)
          : Promise.resolve(null),
        supabaseAdmin.from('activity_log').insert({
          student_id: sessionRow.student_id,
          school_id: sessionRow.school_id,
          action: `Card Fee Paid [${rowPurpose}] (₦${Math.round(expectedForRow / 100).toLocaleString('en-NG')}) — Ref ${paymentRow.reference} [${provider}]`,
          result: 'paid',
          location: 'Student Onboarding Checkout',
        }),
      ]);

      return json({
        ok: true,
        status: 'paid',
        reference: paymentRow.reference,
        amount: feeNaira,
        amount_kobo: paymentRow.amount,
        currency: paymentRow.currency || 'NGN',
        provider,
        paid_at: paidAt,
        expires_at: newExpires,
      }, 200, headers);
    }

    return json({ error: `Unsupported action: ${action}` }, 400, headers);

  } catch (err) {
    console.error('card-payment unhandled error:', err);
    return json({ error: 'Internal server error' }, 500, headers);
  }
});

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
