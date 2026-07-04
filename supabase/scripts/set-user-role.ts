const SUPABASE_URL     = 'https://qsrfvfdojtmsinewxetz.supabase.co';
const SERVICE_ROLE_KEY = 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE';
const EMAIL            = '26.02.2024.wc@gmail.com';
const ROLE             = 'admin';

const headers = {
  'apikey':        SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type':  'application/json',
};

const listRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, { headers });
const listData = await listRes.json();
const user     = (listData.users ?? []).find((u: { email: string }) => u.email === EMAIL);

if (!user) { console.error('User not found:', EMAIL); Deno.exit(1); }

const res    = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
  method:  'PUT',
  headers,
  body:    JSON.stringify({ user_metadata: { role: ROLE } }),
});
const result = await res.json();

if (res.ok) console.log(`✅  ${EMAIL} → role set to "${ROLE}"`);
else        console.error('❌  Failed:', result);
