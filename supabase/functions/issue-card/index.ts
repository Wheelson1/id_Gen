/**
 * issue-card/index.ts — Supabase Edge Function
 *
 * Authenticates an operator/admin, validates the student payload,
 * upserts the student record, signs the card_id with Ed25519, and
 * returns the opaque QR token.
 *
 * POST /functions/v1/issue-card
 * Authorization: Bearer <supabase_access_token>
 *
 * Body (JSON):
 * {
 *   name:      string   (required)
 *   matric:    string   (required, must match EBSU format)
 *   email?:    string   (optional)
 *   expiry:    number   (required, integer, currentYear..currentYear+10)
 *   faculty?:  string
 *   dept?:     string
 *   level?:    string
 *   session?:  string
 *   blood?:    string
 *   genotype?: string
 *   photo_b64?: string  (data:image/...;base64,... — max ~512 KB)
 *   sig_b64?:   string
 * }
 *
 * Response:
 * { card_id, signature, qr_string }
 */

import { createClient }                  from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions }    from '../_shared/cors.ts';
import { signCardId, buildQRToken }      from '../_shared/crypto.ts';

// ── Matric format: EBSU/YYYY/NNNNNN  (6-8 digits after the year)
// Confirm exact pattern with EBSU ICT if the format ever changes.
const MATRIC_RE = /^EBSU\/\d{4}\/\d{6,8}$/;

const MAX_PHOTO_BYTES = 524_288; // 512 KB after base64 decode

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const origin = req.headers.get('origin') ?? '';
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

  try {
    // ── 1. Parse body ────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, headers);
    }

    // ── 2. Authenticate caller ───────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401, headers);
    }
    const accessToken = authHeader.slice(7);

    // Use anon client to validate the user's JWT
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return json({ error: 'Unauthenticated' }, 401, headers);
    }

    // Verify role
    const role = (user.user_metadata?.role as string) ?? '';
    if (!['operator', 'admin'].includes(role)) {
      return json({ error: 'Forbidden — requires operator or admin role' }, 403, headers);
    }

    // ── 3. Validate inputs ───────────────────────────────────────
    const errors: string[] = [];

    const name   = typeof body.name   === 'string' ? body.name.trim()   : '';
    const matric = typeof body.matric === 'string' ? body.matric.trim() : '';
    const email  = typeof body.email  === 'string' ? body.email.trim()  : null;

    if (!name)              errors.push('name is required');
    if (!matric)            errors.push('matric is required');
    else if (!MATRIC_RE.test(matric))
      errors.push('matric must match EBSU/YYYY/NNNNNN format (e.g. EBSU/2024/123456)');

    const currentYear = new Date().getFullYear();
    const expiryRaw   = body.expiry;
    const expiry      = typeof expiryRaw === 'number'
      ? Math.trunc(expiryRaw)
      : parseInt(String(expiryRaw), 10);

    if (isNaN(expiry) || expiry < currentYear || expiry > currentYear + 10)
      errors.push(`expiry must be an integer between ${currentYear} and ${currentYear + 10}`);

    if (errors.length > 0) {
      return json({ error: 'Validation failed', details: errors }, 422, headers);
    }

    // ── 4. Upload photos to Supabase Storage (service-role) ──────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve any existing record for this matric so we can reuse the UUID
    const { data: existing } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('matric', matric)
      .maybeSingle();

    const cardId: string = existing?.id ?? crypto.randomUUID();

    async function uploadImage(
      b64field: unknown,
      bucket: string,
      fileName: string,
    ): Promise<string | null> {
      if (typeof b64field !== 'string' || !b64field.startsWith('data:')) return null;

      const commaIdx = b64field.indexOf(',');
      if (commaIdx === -1) return null;

      const mimeMatch = b64field.slice(0, commaIdx).match(/data:([^;]+)/);
      const mime      = mimeMatch?.[1] ?? 'image/jpeg';
      const b64Data   = b64field.slice(commaIdx + 1);

      // Decode to bytes and check size
      const binary = atob(b64Data);
      if (binary.length > MAX_PHOTO_BYTES) return null;

      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const ext   = mime.includes('png') ? 'png' : 'jpg';

      const path = `${fileName}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, bytes, { contentType: mime, upsert: true });

      if (uploadErr) {
        console.error('Storage upload error:', uploadErr.message);
        return null;
      }

      const { data: urlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(path);

      return urlData?.publicUrl ?? null;
    }

    const photoUrl = await uploadImage(body.photo_b64, 'student-photos',    cardId);
    const sigUrl   = await uploadImage(body.sig_b64,   'student-signatures', `${cardId}_sig`);

    // ── FEE PAYMENT ENFORCEMENT ─────────────────────────────────
    // Query the students table to check if fees are paid
    const { data: studentRecord, error: studentErr } = await supabaseAdmin
      .from('students')
      .select('fees_paid, status')
      .eq('matric', matric)
      .maybeSingle();

    if (studentErr) {
      return json({ error: 'Failed to verify fee payment status' }, 500, headers);
    }

    if (!studentRecord?.fees_paid) {
      return json({ error: 'ID Card generation blocked: School fees have not been confirmed. Please complete fee payment on your school portal first.' }, 403, headers);
    }

    if (studentRecord?.status === 'suspended' || studentRecord?.status === 'revoked') {
      return json({ error: `ID Card generation blocked: Your account status is '${studentRecord.status}'. Contact the admin office.` }, 403, headers);
    }

    // ── 5. Sign card_id with Ed25519 ─────────────────────────────
    const privateKeyB64 = Deno.env.get('ED25519_PRIVATE_KEY');
    if (!privateKeyB64) {
      return json({ error: 'Server configuration error — missing signing key' }, 500, headers);
    }

    const signature = await signCardId(cardId, privateKeyB64);
    const qrString  = buildQRToken(cardId, signature);

    // ── 6. Upsert student record ─────────────────────────────────
    const studentRow = {
      id:        cardId,
      matric,
      name,
      email,
      card_signature: signature,
      faculty:   typeof body.faculty  === 'string' ? body.faculty.trim()  : null,
      dept:      typeof body.dept     === 'string' ? body.dept.trim()     : null,
      level:     typeof body.level    === 'string' ? body.level.trim()    : null,
      session:   typeof body.session  === 'string' ? body.session.trim()  : null,
      blood:     typeof body.blood    === 'string' ? body.blood.trim()    : null,
      genotype:  typeof body.genotype === 'string' ? body.genotype.trim() : null,
      expiry,
      status:    'active',
      is_email_verified: user.app_metadata?.providers?.includes('google') || false,
      issued_by: user.id,
      ...(photoUrl && { photo_url: photoUrl }),
      ...(sigUrl   && { sig_url:   sigUrl   }),
    };

    const { error: upsertErr } = await supabaseAdmin
      .from('students')
      .upsert(studentRow, { onConflict: 'matric' });

    if (upsertErr) {
      console.error('DB upsert error:', upsertErr.message);
      return json({ error: 'Database error — could not save student record' }, 500, headers);
    }

    // ── 7. Return ────────────────────────────────────────────────
    return json({ card_id: cardId, signature, qr_string: qrString }, 200, headers);

  } catch (err) {
    console.error('issue-card unhandled error:', err);
    return json({ error: 'Internal server error' }, 500, headers);
  }
});

// ── Helper ───────────────────────────────────────────────────────────────────
function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
