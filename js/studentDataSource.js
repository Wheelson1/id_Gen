/**
 * studentDataSource.js — Canonical Student Data Source Resolver (Phase 2)
 * Resolves student records strictly through RLS-protected Supabase queries
 * requiring an authenticated staff session. SEED_DATABASE and localStorage
 * student stores have been removed so no student PII resides in client code.
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
   * Adapts raw database row into standard StudentRecord
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
      dob: row.dob || null,
      expiry: row.expiry || 2029,
      status: row.status || 'active',
      feesPaid: Boolean(row.fees_paid),
      photo: row.photo_url || row.photo || null,
      photoUrl: row.photo_url || null,
      sig: row.signature_url || row.sig_url || row.sig || null,
      signatureUrl: row.signature_url || row.sig_url || null,
      qrString: row.card_signature ? `EBSU1:${row.id}:${row.card_signature}` : (row.qr_string || null),
      cardId: row.id || null,
      email: row.email || null
    };
  }

  /**
   * Resolves a student record strictly from RLS-protected Supabase students table.
   * Requires an authenticated staff session; returns null otherwise.
   */
  async function resolve(identifier) {
    if (!identifier || typeof identifier !== 'string') return null;
    const cleanId = identifier.trim().toUpperCase();
    if (cleanId.length < 3) return null;

    const client = getClient();
    if (!client) return null;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return null;

      const { data, error } = await client
        .from('students')
        .select('*')
        .or(`jamb_no.ilike.${cleanId},matric.ilike.${cleanId},school_reg_no.ilike.${cleanId}`)
        .maybeSingle();

      if (!error && data) {
        return mapToStudentRecord(data);
      }
    } catch (err) {
      console.warn('Supabase student lookup failed:', err);
    }

    return null;
  }

  return {
    resolve,
    mapToStudentRecord
  };
})();

if (typeof window !== 'undefined') {
  window.StudentDataSource = StudentDataSource;
}
