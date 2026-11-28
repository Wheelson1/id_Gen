/**
 * student-account: email link + password for students.
 *
 * Actions (all POST, JSON):
 *   send_link    { session_id, email, turnstile_token }  after the date of birth is verified; emails a one-time link
 *   confirm_link { session_id, token }                    the student opened the link; the email is now proven
 *   set_password { session_id, password }                 after the link; creates the account
 *   sign_in      { school_id?, number, password, turnstile_token }   later visits: number + password
 *
 * Email is sent by Supabase Auth (its own mailer). Secret needed: SITE_URL (e.g. https://id-gen-peach.vercel.app).
 * In Supabase: Authentication > URL Configuration, add SITE_URL/** to Redirect URLs.
 * Extra action: forgot_start { number, email, turnstile_token } sends the same kind of link for a password reset.
 */
import { createClient }               from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { verifyTurnstile }            from '../_shared/turnstile.ts';
import { hashPassword, verifyPassword } from '../_shared/password.ts';

const MIN_MS = 500;
const LINK_MINUTES = 30;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const DEFAULT_SCHOOL = '00000000-0000-4000-8000-000000000001';

async function pad(start: number) {
  const e = Date.now() - start;
  if (e < MIN_MS) await new Promise(r => setTimeout(r, MIN_MS - e));
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  const start = Date.now();
  const origin = req.headers.get('origin') ?? '';
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const reply = async (body: unknown, status = 200) => { await pad(start); return new Response(JSON.stringify(body), { status, headers }); };

  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown').split(',')[0].trim();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply({ error: 'Invalid request.' }, 400); }
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');

    async function loadSession(id: string) {
      if (!id) return null;
      const { data } = await admin.from('onboarding_sessions')
        .select('id, school_id, student_id, jamb_no, step, expires_at, email, email_token_hash, email_sent_at, email_verified_at')
        .eq('id', id).maybeSingle();
      if (!data || !data.student_id) return null;
      if (new Date(data.expires_at).getTime() <= Date.now()) return null;
      if (!['verified_dob', 'paid', 'card_issued'].includes(data.step)) return null;
      return data;
    }

    // ── send_link ───────────────────────────────────────────────
    if (action === 'send_link') {
      const email = str('email').toLowerCase();
      if (!EMAIL_RE.test(email)) return reply({ error: 'Enter a valid email address.' }, 400);
      if (!(await verifyTurnstile(str('turnstile_token'), ip))) return reply({ error: 'Security challenge failed. Please refresh and try again.' }, 403);

      const sess = await loadSession(str('session_id'));
      if (!sess) return reply({ error: 'Your session expired. Please start again.' }, 410);

      const [a, b, c] = await Promise.all([
        admin.rpc('check_rate_limit', { p_key: `mail:ip:${ip}`, p_max: 8, p_window_seconds: 3600 }),
        admin.rpc('check_rate_limit', { p_key: `mail:sess:${sess.id}`, p_max: 4, p_window_seconds: 3600 }),
        admin.rpc('check_rate_limit', { p_key: `mail:addr:${email}`, p_max: 4, p_window_seconds: 3600 }),
      ]);
      if (a.data === false || b.data === false || c.data === false) return reply({ error: 'Too many emails requested. Please wait a while and try again.' }, 429);

      // An email already used by a different student is refused (one account per email).
      const { data: taken } = await admin.from('student_accounts').select('student_id')
        .eq('school_id', sess.school_id).ilike('email', email).maybeSingle();
      if (taken && taken.student_id !== sess.student_id) {
        return reply({ error: 'That email is already linked to another student. Use a different email.' }, 409);
      }

      const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
      if (!siteUrl) { console.error('SITE_URL is not set'); return reply({ error: 'Email sending is not set up yet.' }, 503); }

      const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { error: upErr } = await admin.from('onboarding_sessions').update({
        email,
        email_token_hash: null,
        email_sent_at: new Date().toISOString(),
        email_verified_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', sess.id);
      if (upErr) return reply({ error: 'Could not start email check. Please try again.' }, 500);

      const { error: mailErr } = await anon.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl}/index.html?sid=${sess.id}` },
      });
      if (mailErr) {
        console.error('signInWithOtp failed', mailErr.message);
        return reply({ error: 'We could not send the email. Check the address, or wait a few minutes and try again.' }, 502);
      }
      return reply({ ok: true });
    }

    // ── forgot_start: same link, for a student who already has an account ──
    if (action === 'forgot_start') {
      const number = str('number').replace(/[,()]/g, '');
      const email = str('email').toLowerCase();
      if (!number || !EMAIL_RE.test(email)) return reply({ error: 'Enter your number and the email you signed up with.' }, 400);
      if (!(await verifyTurnstile(str('turnstile_token'), ip))) return reply({ error: 'Security challenge failed. Please refresh and try again.' }, 403);
      const [a1, b1] = await Promise.all([
        admin.rpc('check_rate_limit', { p_key: `forgot:ip:${ip}`, p_max: 6, p_window_seconds: 3600 }),
        admin.rpc('check_rate_limit', { p_key: `forgot:num:${number.toLowerCase()}`, p_max: 3, p_window_seconds: 3600 }),
      ]);
      if (a1.data === false || b1.data === false) return reply({ error: 'Too many requests. Please wait a while and try again.' }, 429);

      let schoolId = str('school_id');
      if (!/^[0-9a-f-]{36}$/i.test(schoolId)) schoolId = DEFAULT_SCHOOL;
      const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
      if (!siteUrl) return reply({ error: 'Email sending is not set up yet.' }, 503);

      const { data: cand } = await admin.from('students')
        .select('id, card_fee_paid_at').eq('school_id', schoolId)
        .or(`jamb_no.ilike.${number},matric.ilike.${number}`).limit(1);
      const st = Array.isArray(cand) && cand.length ? cand[0] : null;
      const { data: acct } = st ? await admin.from('student_accounts').select('email').eq('student_id', st.id).maybeSingle() : { data: null };
      // Same answer whether or not it matches, so nobody can probe for accounts.
      if (st && acct && String(acct.email).toLowerCase() === email) {
        const { data: ns } = await admin.from('onboarding_sessions').insert({
          school_id: schoolId, student_id: st.id, jamb_no: number,
          step: st.card_fee_paid_at ? 'paid' : 'verified_dob', ip_address: ip,
          email, email_sent_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }).select('id').single();
        if (ns) {
          const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
          await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl}/index.html?sid=${ns.id}` } });
        }
      }
      return reply({ ok: true, message: 'If those details match an account, we sent a link to that email.' });
    }

    // ── confirm_link ────────────────────────────────────────────
    if (action === 'confirm_link') {
      const sess = await loadSession(str('session_id'));
      const accessToken = str('access_token');
      if (!sess || !sess.email || !accessToken) return reply({ error: 'This link has expired or was already used. Please start again.' }, 410);
      const ageMin = (Date.now() - new Date(sess.email_sent_at ?? 0).getTime()) / 60000;
      if (ageMin > LINK_MINUTES) return reply({ error: 'This link has expired. Please start again.' }, 410);
      const { data: u, error: uErr } = await admin.auth.getUser(accessToken);
      if (uErr || !u?.user?.email || u.user.email.toLowerCase() !== String(sess.email).toLowerCase()) {
        return reply({ error: 'This link is not valid. Please start again.' }, 410);
      }
      await admin.from('onboarding_sessions').update({
        email_verified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', sess.id);
      const [un, dm] = String(sess.email).split('@');
      return reply({ ok: true, email_masked: `${un.slice(0, 2)}***@${dm}` });
    }

    // ── set_password ────────────────────────────────────────────
    if (action === 'set_password') {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 8 || password.length > 128) return reply({ error: 'Choose a password of at least 8 characters.' }, 400);
      const sess = await loadSession(str('session_id'));
      if (!sess || !sess.email_verified_at || !sess.email) return reply({ error: 'Please confirm your email first.' }, 403);

      const { error } = await admin.from('student_accounts').upsert({
        student_id: sess.student_id,
        school_id: sess.school_id,
        email: sess.email,
        password_hash: await hashPassword(password),
        email_verified_at: sess.email_verified_at,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });
      if (error) return reply({ error: 'Could not save your password. Please try again.' }, 500);
      const { data: st } = await admin.from('students').select('card_fee_paid_at, card_payment_reference').eq('id', sess.student_id).maybeSingle();
      if (st?.card_fee_paid_at && sess.step === 'verified_dob') {
        await admin.from('onboarding_sessions').update({ step: 'paid' }).eq('id', sess.id);
      }
      return reply({ ok: true, already_paid: Boolean(st?.card_fee_paid_at), payment_reference: st?.card_payment_reference ?? null });
    }

    // ── sign_in ─────────────────────────────────────────────────
    if (action === 'sign_in') {
      const number = str('number');
      const password = typeof body.password === 'string' ? body.password : '';
      if (!number || !password) return reply({ error: 'Enter your number and password.' }, 400);
      if (!(await verifyTurnstile(str('turnstile_token'), ip))) return reply({ error: 'Security challenge failed. Please refresh and try again.' }, 403);

      let schoolId = str('school_id');
      if (!/^[0-9a-f-]{36}$/i.test(schoolId)) schoolId = DEFAULT_SCHOOL;

      const numKey = `pw:${schoolId}:${number.toLowerCase()}`;
      const ipKey = `ip:${ip}`;
      const [{ data: l1 }, { data: l2 }] = await Promise.all([
        admin.rpc('is_dob_locked', { p_key: numKey }),
        admin.rpc('is_dob_locked', { p_key: ipKey }),
      ]);
      const r1 = Array.isArray(l1) ? l1[0] : l1;
      const r2 = Array.isArray(l2) ? l2[0] : l2;
      if (r1?.locked || r2?.locked) {
        const sec = Math.max(r1?.retry_after_seconds ?? 0, r2?.retry_after_seconds ?? 0, 60);
        return reply({ error: `Too many failed attempts. Please wait ${Math.ceil(sec / 60)} minutes.`, retry_after_seconds: sec }, 429);
      }

      const { data: cand } = await admin.from('students')
        .select('id, card_fee_paid_at, card_payment_reference, verification_frozen')
        .eq('school_id', schoolId)
        .or(`jamb_no.ilike.${number.replace(/[,()]/g, '')},matric.ilike.${number.replace(/[,()]/g, '')}`)
        .limit(1);
      const student = Array.isArray(cand) && cand.length ? cand[0] : null;
      const { data: acct } = student
        ? await admin.from('student_accounts').select('password_hash').eq('student_id', student.id).maybeSingle()
        : { data: null };

      // Always run one hash so timing does not reveal whether an account exists.
      const ok = await verifyPassword(password, acct?.password_hash ?? 'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      if (!student || !acct || !ok || student.verification_frozen) {
        await Promise.all([
          admin.rpc('record_dob_failure', { p_key: numKey }),
          admin.rpc('record_dob_failure', { p_key: ipKey }),
        ]);
        return reply({ error: 'That number and password do not match. If you forgot your password, start with "Get my ID" and confirm your email again.' }, 401);
      }
      await admin.rpc('clear_dob_failures', { p_key: numKey });

      const paid = Boolean(student.card_fee_paid_at);
      const { data: ns, error } = await admin.from('onboarding_sessions').insert({
        school_id: schoolId,
        student_id: student.id,
        jamb_no: number,
        step: paid ? 'paid' : 'verified_dob',
        ip_address: ip,
        email_verified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }).select('id, step, expires_at').single();
      if (error || !ns) return reply({ error: 'Could not sign you in. Please try again.' }, 500);
      return reply({
        session_id: ns.id, step: ns.step, already_paid: paid,
        payment_reference: student.card_payment_reference ?? null, expires_at: ns.expires_at,
      });
    }

    return reply({ error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('student-account error:', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
