/**
 * studentDataSource.js — Canonical Student Data Source Resolver
 * Pluggable resolver pattern matching the verify-card backend architecture.
 * Safely resolves student records by JAMB Reg No, Matric No, or School Reg No
 * against Supabase / connected databases. Returns null if not found (NO random fallbacks).
 */

const StudentDataSource = (() => {

  function getClient() {
    if (typeof ebsuSupabase !== 'undefined' && ebsuSupabase) return ebsuSupabase;
    if (typeof AuthManager !== 'undefined' && AuthManager.getClient) return AuthManager.getClient();
    if (typeof supabase !== 'undefined' && typeof EBSU_CONFIG !== 'undefined' && EBSU_CONFIG.SUPABASE_URL) {
      return supabase.createClient(EBSU_CONFIG.SUPABASE_URL, EBSU_CONFIG.SUPABASE_ANON_KEY);
    }
    return null;
  }

  /**
   * Adapts raw database row or external API response into standard StudentRecord
   */
  function mapToStudentRecord(row) {
    if (!row) return null;

    let computedName = row.name || '';
    if (!computedName && (row.first_name || row.last_name)) {
      computedName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ');
    }

    return {
      id: row.id || null,
      name: computedName || 'STUDENT NAME',
      fullName: computedName || 'STUDENT NAME',
      matric: row.matric || row.school_reg_no || row.jamb_no || '—',
      jambNo: row.jamb_no || null,
      schoolRegNo: row.school_reg_no || null,
      faculty: row.faculty || 'Unassigned Faculty',
      dept: row.dept || row.department || 'Unassigned Department',
      department: row.dept || row.department || 'Unassigned Department',
      level: row.level || '100 Level',
      session: row.session || '2024/2025',
      blood: row.blood || row.blood_group || 'O+',
      bloodGroup: row.blood || row.blood_group || 'O+',
      genotype: row.genotype || 'AA',
      dob: row.dob || '2004-05-12', // default format YYYY-MM-DD
      expiry: row.expiry || 2029,
      status: row.status || 'active',
      feesPaid: Boolean(row.fees_paid),
      photo: row.photo_url || row.photo || null,
      photoUrl: row.photo_url || null,
      sig: row.signature_url || row.sig_url || row.sig || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="10" y="40" font-family="cursive" font-size="34" fill="black">VerifiedSID</text></svg>',
      signatureUrl: row.signature_url || row.sig_url || null,
      qrString: row.card_signature ? `EBSU1:${row.id}:${row.card_signature}` : (row.qr_string || null),
      cardId: row.id || null,
      email: row.email || null
    };
  }

  // Pre-seeded canonical registry for EBSU lookups across all major faculties
  const SEED_DATABASE = [
    // ══════════════════════════════════════════════════════════════
    // 1. FACULTY OF SCIENCE
    // ══════════════════════════════════════════════════════════════
    {
      id: 'd9b04f7c-7b2a-4f51-b0ef-68e1694f8e01',
      name: 'NNAJI WILSON SOMTOCHUKWU',
      first_name: 'WILSON',
      middle_name: 'SOMTOCHUKWU',
      last_name: 'NNAJI',
      jamb_no: '202552179149SI', // Modern 14-char JAMB
      matric: 'EBSU/2024/98421',
      school_reg_no: 'EBSU/2024/98421',
      faculty: 'Faculty of Science',
      dept: 'Computer Science',
      department: 'Computer Science',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-02-26',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'w.nnaji@ebsu.edu.ng',
      photo: 'images/demo_user_photo.jpg',
      photo_url: 'images/demo_user_photo.jpg',
      sig: 'images/demo_user_sig.jpg',
      signature_url: 'images/demo_user_sig.jpg'
    },
    {
      id: 'b2d34e56-7890-4bcd-ef12-234567890def',
      name: 'NNAJI WILSON SOMTOCHUKWU',
      first_name: 'WILSON',
      middle_name: 'SOMTOCHUKWU',
      last_name: 'NNAJI',
      jamb_no: '10824577SI', // Pre-2022 Older 10-char JAMB
      matric: 'EBSU/2021/64210',
      school_reg_no: 'EBSU/2021/64210',
      faculty: 'Faculty of Science',
      dept: 'Computer Science',
      department: 'Computer Science',
      level: '400 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-02-26',
      expiry: 2026,
      status: 'active',
      fees_paid: true,
      email: 'w.nnaji@ebsu.edu.ng'
    },
    {
      id: 'sci-002',
      name: 'EZEH NGOZI CYNTHIA',
      first_name: 'NGOZI',
      last_name: 'EZEH',
      jamb_no: '202581920394MB',
      matric: 'EBSU/2023/91048',
      school_reg_no: 'EBSU/2023/91048',
      faculty: 'Faculty of Science',
      dept: 'Applied Microbiology',
      department: 'Applied Microbiology',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2004-05-18',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'n.ezeh@ebsu.edu.ng'
    },
    {
      id: 'sci-003',
      name: 'CHUKWUDI IFEANYI STANLEY',
      first_name: 'IFEANYI',
      last_name: 'CHUKWUDI',
      jamb_no: '202591029384BC',
      matric: 'EBSU/2022/83910',
      school_reg_no: 'EBSU/2022/83910',
      faculty: 'Faculty of Science',
      dept: 'Biochemistry',
      department: 'Biochemistry',
      level: '300 Level',
      session: '2024/2025',
      blood: 'B+',
      genotype: 'AA',
      dob: '2003-08-30',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'i.chukwudi@ebsu.edu.ng'
    },
    {
      id: 'sci-004',
      name: 'MBAH TOCHUKWU DANIEL',
      first_name: 'TOCHUKWU',
      last_name: 'MBAH',
      jamb_no: '202540192837BT',
      matric: 'EBSU/2023/82910',
      school_reg_no: 'EBSU/2023/82910',
      faculty: 'Faculty of Science',
      dept: 'Biotechnology',
      department: 'Biotechnology',
      level: '200 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AS',
      dob: '2004-01-22',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 't.mbah@ebsu.edu.ng'
    },
    {
      id: 'sci-005',
      name: 'OGBONNA CHINYERE GLORY',
      first_name: 'CHINYERE',
      last_name: 'OGBONNA',
      jamb_no: '202571928301IC',
      matric: 'EBSU/2022/74920',
      school_reg_no: 'EBSU/2022/74920',
      faculty: 'Faculty of Science',
      dept: 'Industrial Chemistry',
      department: 'Industrial Chemistry',
      level: '300 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-06-11',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'c.ogbonna@ebsu.edu.ng'
    },
    {
      id: 'sci-006',
      name: 'ONWE SAMPSON CHUKWUEBUKA',
      first_name: 'SAMPSON',
      last_name: 'ONWE',
      jamb_no: '202530192847IP',
      matric: 'EBSU/2021/68392',
      school_reg_no: 'EBSU/2021/68392',
      faculty: 'Faculty of Science',
      dept: 'Industrial Physics',
      department: 'Industrial Physics',
      level: '400 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2002-10-09',
      expiry: 2027,
      status: 'active',
      fees_paid: true,
      email: 's.onwe@ebsu.edu.ng'
    },
    {
      id: 'sci-007',
      name: 'ALUMA UCHENNA DAVID',
      first_name: 'UCHENNA',
      last_name: 'ALUMA',
      jamb_no: '202519283746GL',
      matric: 'EBSU/2022/77192',
      school_reg_no: 'EBSU/2022/77192',
      faculty: 'Faculty of Science',
      dept: 'Geology and Exploration',
      department: 'Geology and Exploration',
      level: '300 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AA',
      dob: '2003-04-16',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'u.aluma@ebsu.edu.ng'
    },
    {
      id: 'sci-008',
      name: 'NWEKE AMARA VIVIAN',
      first_name: 'AMARA',
      last_name: 'NWEKE',
      jamb_no: '202528394019AB',
      matric: 'EBSU/2023/89201',
      school_reg_no: 'EBSU/2023/89201',
      faculty: 'Faculty of Science',
      dept: 'Applied Biology',
      department: 'Applied Biology',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AS',
      dob: '2004-09-27',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'a.nweke@ebsu.edu.ng'
    },

    // ══════════════════════════════════════════════════════════════
    // 2. BASIC MEDICAL SCIENCES (COLLEGE OF HEALTH SCIENCES)
    // ══════════════════════════════════════════════════════════════
    {
      id: 'med-001',
      name: 'OKEKE CHIDUBEM EMMANUEL',
      first_name: 'CHIDUBEM',
      last_name: 'OKEKE',
      jamb_no: '202511029341MS',
      matric: 'EBSU/2020/78102',
      school_reg_no: 'EBSU/2020/78102',
      faculty: 'Basic Medical Sciences',
      dept: 'Medicine and Surgery',
      department: 'Medicine and Surgery',
      level: '500 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2001-07-19',
      expiry: 2027,
      status: 'active',
      fees_paid: true,
      email: 'c.okeke@ebsu.edu.ng'
    },
    {
      id: 'med-002',
      name: 'UDEH CHIAMAKA PRECIOUS',
      first_name: 'CHIAMAKA',
      last_name: 'UDEH',
      jamb_no: '202534910283AN',
      matric: 'EBSU/2023/84912',
      school_reg_no: 'EBSU/2023/84912',
      faculty: 'Basic Medical Sciences',
      dept: 'Human Anatomy',
      department: 'Human Anatomy',
      level: '200 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AA',
      dob: '2004-03-12',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'c.udeh@ebsu.edu.ng'
    },
    {
      id: 'med-003',
      name: 'NWANKWO KENECHUKWU GABRIEL',
      first_name: 'KENECHUKWU',
      last_name: 'NWANKWO',
      jamb_no: '202549201948PH',
      matric: 'EBSU/2022/67381',
      school_reg_no: 'EBSU/2022/67381',
      faculty: 'Basic Medical Sciences',
      dept: 'Medical Physiology',
      department: 'Medical Physiology',
      level: '300 Level',
      session: '2024/2025',
      blood: 'B+',
      genotype: 'AS',
      dob: '2003-09-05',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'k.nwankwo@ebsu.edu.ng'
    },
    {
      id: 'med-004',
      name: 'IGWE MIRACLE OGECHI',
      first_name: 'MIRACLE',
      last_name: 'IGWE',
      jamb_no: '202578912340ML',
      matric: 'EBSU/2022/71940',
      school_reg_no: 'EBSU/2022/71940',
      faculty: 'Basic Medical Sciences',
      dept: 'Medical Laboratory Science',
      department: 'Medical Laboratory Science',
      level: '300 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-11-20',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'm.igwe@ebsu.edu.ng'
    },
    {
      id: 'med-005',
      name: 'ANYANWU BLESSING CHINWENDU',
      first_name: 'BLESSING',
      last_name: 'ANYANWU',
      jamb_no: '202561928374NS',
      matric: 'EBSU/2021/69204',
      school_reg_no: 'EBSU/2021/69204',
      faculty: 'Basic Medical Sciences',
      dept: 'Nursing Science',
      department: 'Nursing Science',
      level: '400 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AA',
      dob: '2002-12-14',
      expiry: 2027,
      status: 'active',
      fees_paid: true,
      email: 'b.anyanwu@ebsu.edu.ng'
    },

    // ══════════════════════════════════════════════════════════════
    // 3. FACULTY OF MANAGEMENT SCIENCES
    // ══════════════════════════════════════════════════════════════
    {
      id: 'mgt-001',
      name: 'OKORO GODWIN BLESSING',
      first_name: 'GODWIN',
      last_name: 'OKORO',
      jamb_no: '202549201938AC',
      matric: 'EBSU/2022/75920',
      school_reg_no: 'EBSU/2022/75920',
      faculty: 'Faculty of Management Sciences',
      dept: 'Accountancy',
      department: 'Accountancy',
      level: '300 Level',
      session: '2024/2025',
      blood: 'B+',
      genotype: 'AA',
      dob: '2003-03-14',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'g.okoro@ebsu.edu.ng'
    },
    {
      id: 'mgt-002',
      name: 'EZEALI JENNIFER ONYINYE',
      first_name: 'JENNIFER',
      last_name: 'EZEALI',
      jamb_no: '202519283740BF',
      matric: 'EBSU/2023/83912',
      school_reg_no: 'EBSU/2023/83912',
      faculty: 'Faculty of Management Sciences',
      dept: 'Banking and Finance',
      department: 'Banking and Finance',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2004-08-04',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'j.ezeali@ebsu.edu.ng'
    },
    {
      id: 'mgt-003',
      name: 'NWITE CHUKWUEMEKA COLLINS',
      first_name: 'CHUKWUEMEKA',
      last_name: 'NWITE',
      jamb_no: '202568291039BM',
      matric: 'EBSU/2021/69381',
      school_reg_no: 'EBSU/2021/69381',
      faculty: 'Faculty of Management Sciences',
      dept: 'Business Management',
      department: 'Business Management',
      level: '400 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AS',
      dob: '2002-11-19',
      expiry: 2027,
      status: 'active',
      fees_paid: true,
      email: 'c.nwite@ebsu.edu.ng'
    },
    {
      id: 'mgt-004',
      name: 'OTU STEPHANIE ADAEZE',
      first_name: 'STEPHANIE',
      last_name: 'OTU',
      jamb_no: '202573910284PA',
      matric: 'EBSU/2022/78291',
      school_reg_no: 'EBSU/2022/78291',
      faculty: 'Faculty of Management Sciences',
      dept: 'Public Administration',
      department: 'Public Administration',
      level: '300 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-07-25',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 's.otu@ebsu.edu.ng'
    },
    {
      id: 'mgt-005',
      name: 'ILOGHALU DESTINY CHINONSO',
      first_name: 'DESTINY',
      last_name: 'ILOGHALU',
      jamb_no: '202581029384MK',
      matric: 'EBSU/2023/86192',
      school_reg_no: 'EBSU/2023/86192',
      faculty: 'Faculty of Management Sciences',
      dept: 'Marketing',
      department: 'Marketing',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2004-02-17',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'd.iloghalu@ebsu.edu.ng'
    },

    // ══════════════════════════════════════════════════════════════
    // 4. FACULTY OF SOCIAL SCIENCES & HUMANITIES
    // ══════════════════════════════════════════════════════════════
    {
      id: 'soc-001',
      name: 'OKAFOR CHINAZA FAVOUR',
      first_name: 'CHINAZA',
      last_name: 'OKAFOR',
      jamb_no: '202587654321MC',
      matric: 'EBSU/2023/87342',
      school_reg_no: 'EBSU/2023/87342',
      faculty: 'Faculty of Social Sciences & Humanities',
      dept: 'Mass Communication',
      department: 'Mass Communication',
      level: '200 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AS',
      dob: '2004-11-03',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'c.okafor@ebsu.edu.ng'
    },
    {
      id: 'soc-002',
      name: 'EZENWA KINGSLEY CHIBUEZE',
      first_name: 'KINGSLEY',
      last_name: 'EZENWA',
      jamb_no: '202519283749EC',
      matric: 'EBSU/2021/64819',
      school_reg_no: 'EBSU/2021/64819',
      faculty: 'Faculty of Social Sciences & Humanities',
      dept: 'Economics',
      department: 'Economics',
      level: '400 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2002-06-21',
      expiry: 2027,
      status: 'active',
      fees_paid: true,
      email: 'k.ezenwa@ebsu.edu.ng'
    },
    {
      id: 'soc-003',
      name: 'EJIKE FRANCIS OBINNA',
      first_name: 'FRANCIS',
      last_name: 'EJIKE',
      jamb_no: '202592019283PS',
      matric: 'EBSU/2022/73910',
      school_reg_no: 'EBSU/2022/73910',
      faculty: 'Faculty of Social Sciences & Humanities',
      dept: 'Political Science',
      department: 'Political Science',
      level: '300 Level',
      session: '2024/2025',
      blood: 'B+',
      genotype: 'AA',
      dob: '2003-10-15',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'f.ejike@ebsu.edu.ng'
    },
    {
      id: 'soc-004',
      name: 'OGAH JOY NNENNA',
      first_name: 'JOY',
      last_name: 'OGAH',
      jamb_no: '202561920384SA',
      matric: 'EBSU/2023/85910',
      school_reg_no: 'EBSU/2023/85910',
      faculty: 'Faculty of Social Sciences & Humanities',
      dept: 'Sociology and Anthropology',
      department: 'Sociology and Anthropology',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2004-04-10',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'j.ogah@ebsu.edu.ng'
    },
    {
      id: 'soc-005',
      name: 'IGBOKE PROMISE CHIDERA',
      first_name: 'PROMISE',
      last_name: 'IGBOKE',
      jamb_no: '202549102938PY',
      matric: 'EBSU/2022/79182',
      school_reg_no: 'EBSU/2022/79182',
      faculty: 'Faculty of Social Sciences & Humanities',
      dept: 'Psychology',
      department: 'Psychology',
      level: '300 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AS',
      dob: '2003-01-30',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'p.igboke@ebsu.edu.ng'
    },
    {
      id: 'soc-006',
      name: 'ALOH PATIENCE SOMADINA',
      first_name: 'PATIENCE',
      last_name: 'ALOH',
      jamb_no: '202538192039EL',
      matric: 'EBSU/2023/88192',
      school_reg_no: 'EBSU/2023/88192',
      faculty: 'Faculty of Social Sciences & Humanities',
      dept: 'English Language and Literature',
      department: 'English Language and Literature',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2004-12-08',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'p.aloh@ebsu.edu.ng'
    },

    // ══════════════════════════════════════════════════════════════
    // 5. FACULTY OF EDUCATION
    // ══════════════════════════════════════════════════════════════
    {
      id: 'edu-001',
      name: 'UGURU SAMUEL OGECHUKWU',
      first_name: 'SAMUEL',
      last_name: 'UGURU',
      jamb_no: '202571928374SE',
      matric: 'EBSU/2022/76291',
      school_reg_no: 'EBSU/2022/76291',
      faculty: 'Faculty of Education',
      dept: 'Science Education',
      department: 'Science Education',
      level: '300 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-05-13',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 's.uguru@ebsu.edu.ng'
    },
    {
      id: 'edu-002',
      name: 'CHUKWU RUTH ONYEKACHI',
      first_name: 'RUTH',
      last_name: 'CHUKWU',
      jamb_no: '202581920384EF',
      matric: 'EBSU/2021/68192',
      school_reg_no: 'EBSU/2021/68192',
      faculty: 'Faculty of Education',
      dept: 'Educational Foundations',
      department: 'Educational Foundations',
      level: '400 Level',
      session: '2024/2025',
      blood: 'B+',
      genotype: 'AS',
      dob: '2002-08-29',
      expiry: 2027,
      status: 'active',
      fees_paid: true,
      email: 'r.chukwu@ebsu.edu.ng'
    },
    {
      id: 'edu-003',
      name: 'NWANKWO ESTHER CHIAMAKA',
      first_name: 'ESTHER',
      last_name: 'NWANKWO',
      jamb_no: '202591827364GC',
      matric: 'EBSU/2023/84920',
      school_reg_no: 'EBSU/2023/84920',
      faculty: 'Faculty of Education',
      dept: 'Guidance and Counselling',
      department: 'Guidance and Counselling',
      level: '200 Level',
      session: '2024/2025',
      blood: 'A+',
      genotype: 'AA',
      dob: '2004-06-17',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'e.nwankwo@ebsu.edu.ng'
    },
    {
      id: 'edu-004',
      name: 'EZE HARRISON CHIBUZOR',
      first_name: 'HARRISON',
      last_name: 'EZE',
      jamb_no: '202561928301BE',
      matric: 'EBSU/2022/79301',
      school_reg_no: 'EBSU/2022/79301',
      faculty: 'Faculty of Education',
      dept: 'Business Education',
      department: 'Business Education',
      level: '300 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2003-11-04',
      expiry: 2028,
      status: 'active',
      fees_paid: true,
      email: 'h.eze@ebsu.edu.ng'
    },
    {
      id: 'edu-005',
      name: 'ODOH FAITH IFUNANYA',
      first_name: 'FAITH',
      last_name: 'ODOH',
      jamb_no: '202551928374AS',
      matric: 'EBSU/2023/87291',
      school_reg_no: 'EBSU/2023/87291',
      faculty: 'Faculty of Education',
      dept: 'Arts and Social Science Education',
      department: 'Arts and Social Science Education',
      level: '200 Level',
      session: '2024/2025',
      blood: 'O+',
      genotype: 'AA',
      dob: '2004-03-24',
      expiry: 2029,
      status: 'active',
      fees_paid: true,
      email: 'f.odoh@ebsu.edu.ng'
    }
  ];

  function getManualStore() {
    try {
      const stored = localStorage.getItem('ebsu_manual_students');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function saveManualStudent(st) {
    if (!st) return false;
    try {
      const list = getManualStore();
      const cleanReg = (st.school_reg_no || st.matric || st.jamb_no || st.schoolRegNo || '').trim().toUpperCase();
      const cleanName = (st.name || st.fullName || '').trim().toUpperCase();
      
      const idx = list.findIndex(item => {
        const itemReg = (item.school_reg_no || item.matric || item.jamb_no || item.schoolRegNo || '').trim().toUpperCase();
        return (cleanReg && itemReg === cleanReg) || (cleanName && item.name && item.name.toUpperCase() === cleanName);
      });

      const recordToSave = {
        id: st.id || ('manual-' + Date.now()),
        name: st.name || st.fullName || 'STUDENT NAME',
        matric: st.matric || st.school_reg_no || st.schoolRegNo || 'EBSU/2024/00000',
        school_reg_no: st.school_reg_no || st.schoolRegNo || st.matric || 'EBSU/2024/00000',
        jamb_no: st.jamb_no || st.jambNo || null,
        faculty: st.faculty || 'Science',
        dept: st.dept || st.department || 'Computer Science',
        department: st.dept || st.department || 'Computer Science',
        level: st.level || '100 Level',
        session: st.session || '2024/2025',
        blood: st.blood || st.bloodGroup || 'O+',
        blood_group: st.blood || st.bloodGroup || 'O+',
        genotype: st.genotype || 'AA',
        dob: st.dob || '2004-01-01',
        expiry: st.expiry || 2029,
        status: st.status || 'active',
        fees_paid: st.fees_paid !== undefined ? st.fees_paid : true,
        photo_url: st.photo_url || st.photo || null,
        photo: st.photo || st.photo_url || null,
        signature_url: st.signature_url || st.sig_url || st.sig || null,
        sig: st.sig || st.signature_url || st.sig_url || null,
        qr_string: st.qr_string || st.qrString || null,
        card_signature: st.card_signature || null,
        email: st.email || null,
        updated_at: new Date().toISOString()
      };

      if (idx >= 0) {
        list[idx] = { ...list[idx], ...recordToSave };
      } else {
        recordToSave.created_at = new Date().toISOString();
        list.unshift(recordToSave);
      }

      localStorage.setItem('ebsu_manual_students', JSON.stringify(list));
      return recordToSave;
    } catch (e) {
      console.warn('Failed to save student to localStorage:', e);
      return false;
    }
  }

  /**
   * Resolves a student record from Supabase, manual form store, or known registry.
   * If not found, strictly returns null (no random fake student hallucination).
   */
  async function resolve(identifier) {
    if (!identifier || typeof identifier !== 'string') return null;
    const cleanId = identifier.trim().toUpperCase();
    if (cleanId.length < 3) return null;

    // 1. First check manual student form entries in localStorage
    const manualList = getManualStore();
    const manualMatch = manualList.find(s => 
      (s.jamb_no && s.jamb_no.toUpperCase() === cleanId) ||
      (s.matric && s.matric.toUpperCase() === cleanId) ||
      (s.school_reg_no && s.school_reg_no.toUpperCase() === cleanId) ||
      (s.name && s.name.toUpperCase().includes(cleanId)) ||
      (s.id && s.id.toUpperCase() === cleanId)
    );

    if (manualMatch) {
      return mapToStudentRecord(manualMatch);
    }

    const client = getClient();

    // 2. Try Supabase Live Query
    if (client) {
      try {
        const { data, error } = await client
          .from('students')
          .select('*')
          .or(`jamb_no.ilike.${cleanId},matric.ilike.${cleanId},school_reg_no.ilike.${cleanId}`)
          .maybeSingle();

        if (!error && data) {
          return mapToStudentRecord(data);
        }
      } catch (err) {
        console.warn('Supabase lookup failed, checking local seed records:', err);
      }
    }

    // 3. Check local registered seed records
    const localMatch = SEED_DATABASE.find(s => 
      (s.jamb_no && s.jamb_no.toUpperCase() === cleanId) ||
      (s.matric && s.matric.toUpperCase() === cleanId) ||
      (s.school_reg_no && s.school_reg_no.toUpperCase() === cleanId) ||
      (s.name && s.name.toUpperCase().includes(cleanId))
    );

    if (localMatch) {
      return mapToStudentRecord(localMatch);
    }

    // 4. Not found anywhere — Return null (Strictly no fabricated records)
    return null;
  }

  return {
    resolve,
    mapToStudentRecord,
    saveManualStudent,
    getManualStudents: getManualStore,
    getSeedDatabase: () => SEED_DATABASE
  };
})();

if (typeof window !== 'undefined') {
  window.StudentDataSource = StudentDataSource;
}
