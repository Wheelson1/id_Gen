/**
 * verify-card/index.ts — Supabase Edge Function
 *
 * Accepts { card_id, signature }, verifies the Ed25519 signature,
 * then resolves the card through the configured VerificationSource.
 *
 * POST /functions/v1/verify-card
 * (No authentication required — the verifier may be a guard at a gate)
 *
 * Body:  { card_id: string, signature: string }
 *
 * Response:
 * {
 *   status:    'valid' | 'expired' | 'revoked' | 'not_found' | 'tampered'
 *   student?:  { name, matric, faculty, dept, level, session, blood, genotype, photo_url, expiry }
 *   expiry?:   number
 *   checked_at: string  (ISO 8601)
 * }
 *
 * Status precedence:
 *   bad signature  → tampered
 *   no DB row      → not_found
 *   row.status === 'revoked' → revoked
 *   expiry < currentYear     → expired
 *   otherwise                → valid
 */

import { createClient }                  from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions }    from '../_shared/cors.ts';
import { verifyCardId, parseQRToken }    from '../_shared/crypto.ts';

// ── Verification source selection ────────────────────────────────────────────
// Set VERIFICATION_SOURCE=portal in Supabase secrets to swap to the portal adapter.
// Default: 'supabase'

type NormalizedStudent = {
  name:      string;
  matric:    string;
  faculty:   string | null;
  dept:      string | null;
  level:     string | null;
  session:   string | null;
  blood:     string | null;
  genotype:  string | null;
  photo_url: string | null;
  expiry:    number;
  status:    string;
  fees_paid: boolean;
  school_reg_no: string | null;
};

type VerificationResult =
  | { found: false }
  | { found: true; student: NormalizedStudent };

/** VerificationSource interface — swap implementations below. */
interface VerificationSource {
  lookup(cardId: string): Promise<VerificationResult>;
}

// ── SupabaseSource ───────────────────────────────────────────────────────────
/** Looks the card up in the Supabase students table (default). */
class SupabaseSource implements VerificationSource {
  private client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async lookup(cardId: string): Promise<VerificationResult> {
    const { data, error } = await this.client
      .from('students')
      .select('name,matric,faculty,dept,level,session,blood,genotype,photo_url,expiry,status,fees_paid,school_reg_no')
      .eq('id', cardId)
      .maybeSingle();

    if (error) {
      console.error('SupabaseSource lookup error:', error.message);
      return { found: false };
    }
    if (!data) return { found: false };

    return {
      found: true,
      student: {
        name:      data.name,
        matric:    data.matric,
        faculty:   data.faculty   ?? null,
        dept:      data.dept      ?? null,
        level:     data.level     ?? null,
        session:   data.session   ?? null,
        blood:     data.blood     ?? null,
        genotype:  data.genotype  ?? null,
        photo_url: data.photo_url ?? null,
        expiry:    Number(data.expiry),
        status:    data.status,
        fees_paid: Boolean(data.fees_paid ?? true),
        school_reg_no: data.school_reg_no ?? null,
      },
    };
  }
}

// ── PortalSource ─────────────────────────────────────────────────────────────
/**
 * Adapter for the EBSU school portal REST API.
 *
 * TODO: Confirm the real portal endpoint and auth header with EBSU ICT.
 *
 * Expected env vars (set in Supabase secrets):
 *   PORTAL_API_BASE  e.g. https://portal.ebsu.edu.ng/api/v1
 *   PORTAL_API_KEY   the API key issued by EBSU ICT
 *
 * Expected portal response shape (normalize here if different):
 *   GET /students/:card_id
 *   {
 *     full_name, matric_number, faculty, department,
 *     level, session, blood_group, genotype,
 *     passport_url, expiry_year, card_status
 *   }
 *
 * Gate this adapter behind VERIFICATION_SOURCE=portal in Supabase secrets.
 */
class PortalSource implements VerificationSource {
  async lookup(cardId: string): Promise<VerificationResult> {
    const base   = Deno.env.get('PORTAL_API_BASE');
    const apiKey = Deno.env.get('PORTAL_API_KEY');

    if (!base || !apiKey) {
      console.error('PortalSource: PORTAL_API_BASE or PORTAL_API_KEY not set');
      return { found: false };
    }

    // TODO: confirm real portal endpoint + auth header with EBSU ICT
    const url = `${base}/students/${encodeURIComponent(cardId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          // TODO: confirm exact auth header name with EBSU ICT
          'X-API-Key':    apiKey,
          'Accept':       'application/json',
        },
      });
    } catch (err) {
      console.error('PortalSource fetch error:', err);
      return { found: false };
    }

    if (res.status === 404) return { found: false };
    if (!res.ok) {
      console.error('PortalSource HTTP error:', res.status);
      return { found: false };
    }

    let raw: Record<string, unknown>;
    try {
      raw = await res.json();
    } catch {
      console.error('PortalSource: invalid JSON response');
      return { found: false };
    }

    // Normalize portal response to our internal shape
    // TODO: adjust field names once EBSU ICT confirms the exact API response shape
    return {
      found: true,
      student: {
        name:      String(raw.full_name      ?? raw.name ?? ''),
        matric:    String(raw.matric_number  ?? raw.matric ?? ''),
        faculty:   raw.faculty               ? String(raw.faculty) : null,
        dept:      raw.department            ? String(raw.department) : null,
        level:     raw.level                 ? String(raw.level) : null,
        session:   raw.session               ? String(raw.session) : null,
        blood:     raw.blood_group           ? String(raw.blood_group) : null,
        genotype:  raw.genotype              ? String(raw.genotype) : null,
        photo_url: raw.passport_url          ? String(raw.passport_url) : null,
        expiry:    Number(raw.expiry_year    ?? 0),
        status:    String(raw.card_status    ?? 'active'),
        fees_paid: raw.fees_paid !== undefined ? Boolean(raw.fees_paid) : true,
        school_reg_no: raw.school_reg_no     ? String(raw.school_reg_no) : null,
      },
    };
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const origin  = req.headers.get('origin') ?? '';
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

  const checkedAt = new Date().toISOString();

  try {
    // ── 1. Parse body ────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ status: 'tampered', checked_at: checkedAt }, 400, headers);
    }

    const cardId = typeof body.card_id   === 'string' ? body.card_id.trim()   : '';
    const sig    = typeof body.signature === 'string' ? body.signature.trim() : '';

    // Also accept a raw token string for convenience
    if (!cardId && typeof body.token === 'string') {
      const parsed = parseQRToken(body.token as string);
      if (!parsed) return json({ status: 'tampered', checked_at: checkedAt }, 200, headers);
      return handleVerify(parsed.cardId, parsed.sig, headers, checkedAt);
    }

    if (!cardId || !sig) {
      return json({ status: 'tampered', checked_at: checkedAt }, 200, headers);
    }

    return handleVerify(cardId, sig, headers, checkedAt);

  } catch (err) {
    console.error('verify-card unhandled error:', err);
    return json({ status: 'tampered', checked_at: checkedAt }, 500, headers);
  }
});

async function handleVerify(
  cardId: string,
  sig: string,
  headers: Record<string, string>,
  checkedAt: string,
): Promise<Response> {
  // ── 2. Verify Ed25519 signature first ────────────────────────
  const publicKeyB64 = Deno.env.get('ED25519_PUBLIC_KEY');
  if (!publicKeyB64) {
    console.error('verify-card: ED25519_PUBLIC_KEY not set');
    return json({ status: 'tampered', checked_at: checkedAt }, 500, headers);
  }

  const sigValid = await verifyCardId(cardId, sig, publicKeyB64);
  if (!sigValid) {
    // Signature is wrong — forged or tampered card
    return json({ status: 'tampered', checked_at: checkedAt }, 200, headers);
  }

  // ── 3. Look up card in the configured source ─────────────────
  const sourceType = Deno.env.get('VERIFICATION_SOURCE') ?? 'supabase';

  let source: VerificationSource;
  if (sourceType === 'portal') {
    source = new PortalSource();
  } else {
    source = new SupabaseSource();
  }

  const result = await source.lookup(cardId);

  if (!result.found) {
    return json({ status: 'not_found', checked_at: checkedAt }, 200, headers);
  }

  const { student } = result;

  // ── 4. Determine final status ────────────────────────────────
  // Precedence: revoked > expired > valid
  const currentYear = new Date().getFullYear();

  let status: string;
  if (student.fees_paid === false) {
    status = 'unpaid';
  } else if (student.status === 'revoked') {
    status = 'revoked';
  } else if (student.expiry < currentYear) {
    status = 'expired';
  } else {
    status = 'valid';
  }

  // Return only safe fields — never leak issued_by, updated_at, etc.
  const safeStudent = {
    name:      student.name,
    matric:    student.matric,
    faculty:   student.faculty,
    dept:      student.dept,
    level:     student.level,
    session:   student.session,
    blood:     student.blood,
    genotype:  student.genotype,
    photo_url: student.photo_url,
    expiry:    student.expiry,
    fees_paid: student.fees_paid,
    school_reg_no: student.school_reg_no,
  };

  return json({
    status,
    student: safeStudent,
    expiry:  student.expiry,
    checked_at: checkedAt,
  }, 200, headers);
}

// ── Helper ───────────────────────────────────────────────────────────────────
function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
