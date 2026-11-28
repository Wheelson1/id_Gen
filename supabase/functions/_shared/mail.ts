/** _shared/mail.ts: sends one email through Resend. Needs RESEND_API_KEY and MAIL_FROM secrets. */
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('MAIL_FROM')?.trim();
  if (!key || !from) { console.error('sendMail: RESEND_API_KEY or MAIL_FROM is not set.'); return false; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!res.ok) console.error('sendMail failed', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.error('sendMail error', e);
    return false;
  }
}
