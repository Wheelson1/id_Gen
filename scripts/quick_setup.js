/**
 * Quick setup script — creates Wilson's test account directly via Supabase REST API.
 * Uses the anon key (public) to upsert a record into the students table,
 * then attempts to sign up the auth user.
 * 
 * Run: node scripts/quick_setup.js
 */

const SUPABASE_URL = 'https://qsrfvfdojtmsinewxetz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzcmZ2ZmRvanRtc2luZXd4ZXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTE4MzgsImV4cCI6MjA5NTYyNzgzOH0.xi_5AayCMDLMI3cXHt1eaYXO0M-9E86H1hFKE92Hdso';

const STUDENT = {
  jamb_no: '09035005623',
  full_name: 'Wilson Somtochukwu Nnaji',
  department: 'Computer Science',
  faculty: 'Faculty of Science',
  fees_paid: true,
  school_reg_no: 'EBSU/2024/900001',
  jamb_year: 2026,
  is_email_verified: false,
  status: 'active',
  blood_group: 'A+',
  genotype: 'AA',
  level: '100 Level',
  session: '2024/2025',
  linked_email: '09035005623@ebsu.edu.ng',
};

async function run() {
  console.log('=== EBSU ID Card Generator — Quick Account Setup ===\n');

  // Step 1: Try to sign up the auth user
  const email = `${STUDENT.jamb_no}@ebsu.edu.ng`;
  const password = STUDENT.jamb_no; // JAMB No = default password

  console.log(`1. Creating auth user: ${email}`);
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      data: { role: 'student' }
    }),
  });
  const signupData = await signupRes.json();

  if (signupRes.ok) {
    console.log('   ✅ Auth user created successfully!');
    if (signupData.id) console.log(`   User ID: ${signupData.id}`);
  } else if (signupData?.msg?.includes('already registered') || signupData?.message?.includes('already registered') || JSON.stringify(signupData).includes('already')) {
    console.log('   ℹ️  Auth user already exists (that is fine!)');
  } else {
    console.log('   ⚠️  Auth signup response:', JSON.stringify(signupData, null, 2));
  }

  // Step 2: Sign in to get a valid session token
  console.log(`\n2. Signing in as ${email}...`);
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await loginRes.json();

  if (!loginRes.ok) {
    console.log('   ❌ Login failed:', JSON.stringify(loginData, null, 2));
    console.log('\n   This likely means email confirmation is required in your Supabase settings.');
    console.log('   Fix: Go to Supabase Dashboard → Authentication → Providers → Email');
    console.log('   → Toggle OFF "Confirm email" → Save');
    console.log('   Then re-run this script.\n');
    return;
  }

  console.log('   ✅ Signed in! Token acquired.');
  const accessToken = loginData.access_token;
  const userId = loginData.user?.id;
  console.log(`   User ID: ${userId}`);

  // Step 3: Upsert student record into the students table
  console.log(`\n3. Upserting student record for JAMB: ${STUDENT.jamb_no}...`);
  
  const upsertBody = { ...STUDENT };
  if (userId) upsertBody.id = userId;

  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/students`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(upsertBody),
  });

  if (upsertRes.ok || upsertRes.status === 201) {
    console.log('   ✅ Student record upserted successfully!');
  } else {
    const errText = await upsertRes.text();
    console.log('   ⚠️  Upsert response:', upsertRes.status, errText);
    
    // Try a simpler insert without the id field
    console.log('   Retrying without id field...');
    delete upsertBody.id;
    const retryRes = await fetch(`${SUPABASE_URL}/rest/v1/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(upsertBody),
    });
    if (retryRes.ok || retryRes.status === 201) {
      console.log('   ✅ Student record inserted on retry!');
    } else {
      console.log('   ❌ Retry failed:', retryRes.status, await retryRes.text());
    }
  }

  // Step 4: Verify the record
  console.log(`\n4. Verifying record exists...`);
  const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/students?jamb_no=eq.${STUDENT.jamb_no}&select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const records = await verifyRes.json();
  
  if (records && records.length > 0) {
    console.log('   ✅ Record found in database!');
    console.log(`   Name: ${records[0].full_name}`);
    console.log(`   Dept: ${records[0].department}`);
    console.log(`   Fees Paid: ${records[0].fees_paid}`);
    console.log(`   Status: ${records[0].status}`);
  } else {
    console.log('   ⚠️  No record found. Check RLS policies.');
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  YOUR TEST LOGIN CREDENTIALS:');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Username:  09035005623`);
  console.log(`  Password:  09035005623`);
  console.log('══════════════════════════════════════════════════');
  console.log(`\n  Site: https://wheelson1.github.io/id_Gen/`);
  console.log('  (Wait ~30 seconds for GitHub Pages to rebuild after our push)\n');
}

run().catch(err => {
  console.error('Fatal error:', err);
});
