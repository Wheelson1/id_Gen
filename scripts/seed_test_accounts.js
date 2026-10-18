/**
 * seed_test_accounts.js — Automated QA Test Account Seeder via Supabase Admin API
 * 
 * Usage:
 *   node scripts/seed_test_accounts.js
 * 
 * Requirements:
 *   Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env or environment).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qsrfvfdojtmsinewxetz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.includes('PASTE_')) {
  console.error('\n❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is missing.');
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY in your .env file or environment variables.');
  console.error('Alternatively, run the SQL script directly in the Supabase Dashboard SQL Editor:');
  console.error('scripts/seed_test_accounts.sql\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEFAULT_PASSWORD = 'QaTest@2026!Secured';

const TEST_STAFF = [
  {
    email: 'superadmin+test@example.com',
    role: 'super_admin',
    staff_id: 'STF-QA-001',
    full_name: 'Test Super Admin',
    department: 'Directorate of ICT & Mothership',
    phone: '+1-555-0101'
  },
  {
    email: 'admin+test@example.com',
    role: 'admin',
    staff_id: 'STF-QA-002',
    full_name: 'Test University Admin',
    department: 'Student Identity Affairs',
    phone: '+1-555-0102'
  },
  {
    email: 'manager+test@example.com',
    role: 'registrar',
    staff_id: 'STF-QA-003',
    full_name: 'Test Academic Registrar',
    department: 'Registrar Academic Records',
    phone: '+1-555-0103'
  },
  {
    email: 'editor+test@example.com',
    role: 'operator',
    staff_id: 'STF-QA-004',
    full_name: 'Test Card Operator',
    department: 'ID Production Bureau',
    phone: '+1-555-0104'
  },
  {
    email: 'verifier+test@example.com',
    role: 'verifier',
    staff_id: 'STF-QA-005',
    full_name: 'Test Security Guard',
    department: 'Campus Security Division',
    phone: '+1-555-0105'
  }
];

const TEST_STUDENTS = [
  {
    email: 'student+test@example.com',
    matric: 'EBSU/2024/900001',
    name: 'NNAJI WILSON SOMTOCHUKWU',
    first_name: 'WILSON',
    last_name: 'NNAJI',
    faculty: 'Faculty of Science',
    dept: 'Computer Science',
    level: '100 Level',
    session: '2024/2025',
    blood: 'A+',
    genotype: 'AA',
    expiry: 2029,
    status: 'active',
    jamb_no: '09035005623',
    school_reg_no: 'EBSU/2024/900001',
    fees_paid: true,
    jamb_year: 2026,
    is_email_verified: true,
    phone: '+1-555-0106'
  },
  {
    email: 'student_unpaid+test@example.com',
    matric: 'EBSU/2024/900002',
    name: 'CHUKWUEMEKA CHIDERA ESTHER',
    first_name: 'CHIDERA',
    last_name: 'CHUKWUEMEKA',
    faculty: 'Faculty of Law',
    dept: 'Public Law',
    level: '200 Level',
    session: '2024/2025',
    blood: 'O+',
    genotype: 'AS',
    expiry: 2028,
    status: 'provisional',
    jamb_no: '09035005624',
    school_reg_no: 'EBSU/2024/900002',
    fees_paid: false,
    jamb_year: 2025,
    is_email_verified: true,
    phone: '+1-555-0107'
  },
  {
    email: 'student_revoked+test@example.com',
    matric: 'EBSU/2024/900003',
    name: 'OKORO GODWIN BLESSING',
    first_name: 'GODWIN',
    last_name: 'OKORO',
    faculty: 'Faculty of Management Sciences',
    dept: 'Accountancy',
    level: '300 Level',
    session: '2024/2025',
    blood: 'B+',
    genotype: 'AA',
    expiry: 2027,
    status: 'revoked',
    status_reason: 'Card lost on campus transit',
    status_reference: 'SEC/LOST/2026/089',
    jamb_no: '09035005625',
    school_reg_no: 'EBSU/2024/900003',
    fees_paid: true,
    jamb_year: 2024,
    is_email_verified: true,
    phone: '+1-555-0108'
  }
];

async function seed() {
  console.log('====================================================');
  console.log('🚀 EBSU ID SYSTEM — QA SEED SCRIPT INITIALIZING');
  console.log('====================================================\n');

  // 1. Seed Staff Accounts
  for (const staff of TEST_STAFF) {
    process.stdout.write(`Creating staff account: ${staff.email} (${staff.role})... `);
    let userId;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: staff.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { role: staff.role, full_name: staff.full_name, phone: staff.phone }
    });

    if (createErr) {
      if (createErr.message.includes('already registered')) {
        // Find existing user ID
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users.users.find(u => u.email === staff.email);
        userId = existing?.id;
        // Update user metadata & password
        await supabase.auth.admin.updateUserById(userId, {
          password: DEFAULT_PASSWORD,
          user_metadata: { role: staff.role, full_name: staff.full_name, phone: staff.phone }
        });
        console.log('Existing updated ✅');
      } else {
        console.log(`Failed ❌: ${createErr.message}`);
        continue;
      }
    } else {
      userId = created.user.id;
      console.log('Created ✅');
    }

    if (userId) {
      await supabase.from('staff_profiles').upsert({
        id: userId,
        staff_id: staff.staff_id,
        full_name: staff.full_name,
        role: staff.role === 'operator' ? 'staff' : (staff.role === 'verifier' ? 'scanner' : staff.role),
        department: staff.department
      });
    }
  }

  // 2. Seed Student Accounts
  for (const st of TEST_STUDENTS) {
    process.stdout.write(`Creating student account: ${st.email} (${st.matric})... `);
    let userId;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: st.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'student', full_name: st.name, phone: st.phone }
    });

    if (createErr) {
      if (createErr.message.includes('already registered')) {
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users.users.find(u => u.email === st.email);
        userId = existing?.id;
        await supabase.auth.admin.updateUserById(userId, {
          password: DEFAULT_PASSWORD,
          user_metadata: { role: 'student', full_name: st.name, phone: st.phone }
        });
        console.log('Existing updated ✅');
      } else {
        console.log(`Failed ❌: ${createErr.message}`);
        continue;
      }
    } else {
      userId = created.user.id;
      console.log('Created ✅');
    }

    // Upsert into students table
    const { phone, ...stData } = st;
    const studentPayload = { ...stData };
    if (userId) studentPayload.id = userId;

    const { error: studentErr } = await supabase
      .from('students')
      .upsert(studentPayload, { onConflict: 'matric' });

    if (studentErr) {
      console.error(`   ⚠️ Failed to upsert student record: ${studentErr.message}`);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 QA Test Seeding Complete! All accounts ready for testing.');
  console.log('Default Password for all test accounts: ' + DEFAULT_PASSWORD);
  console.log('====================================================\n');
}

seed().catch(err => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
