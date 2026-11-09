const EBSU_CONFIG = {
  SUPABASE_URL:       'https://qsrfvfdojtmsinewxetz.supabase.co',
  SUPABASE_ANON_KEY:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzcmZ2ZmRvanRtc2luZXd4ZXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTE4MzgsImV4cCI6MjA5NTYyNzgzOH0.xi_5AayCMDLMI3cXHt1eaYXO0M-9E86H1hFKE92Hdso',
  ISSUE_CARD_URL:         'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/issue-card',
  VERIFY_CARD_URL:        'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/verify-card',
  STAFF_LOGIN_URL:        'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/staff-login',
  START_VERIFICATION_URL: 'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/start-verification',
  CONFIRM_IDENTITY_URL:   'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/confirm-identity',
  CARD_PAYMENT_URL:       'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/card-payment',
  SUPPORT_DESK_URL:       'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/support-desk',
  MINT_PASS_URL:          'https://qsrfvfdojtmsinewxetz.supabase.co/functions/v1/mint-pass',
  TURNSTILE_SITE_KEY:     '1x00000000000000000000AA',
  ED25519_PUBLIC_KEY:     'jYIxfg4nA/8ATCxQ1NMaysjMfhBKgUWVxOt+ambAULs=',
  // Deployment environment identifier: 'demo' | 'staging' | 'production'
  DEPLOY_ENV:             'demo',
  // Security: DEMO_MODE must be false in production and remote deployments.
  // When true, demo behavior is permitted ONLY on localhost / private LAN addresses.
  // Public hostnames strictly ignore demo flags regardless of this setting.
  DEMO_MODE:              false,
  // Canonical public-facing domain baked into printed physical card QR codes.
  // CRITICAL: Must be the final production HTTPS domain before printing physical cards.
  // In browser/local runtime, defaults dynamically to window.location.origin unless explicitly overridden.
  PUBLIC_BASE_URL: (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file:') && !window.location.origin.includes('null'))
    ? window.location.origin
    : 'https://id.ebsu.edu.ng',
};

if (typeof window !== 'undefined') {
  window.EBSU_CONFIG = EBSU_CONFIG;
  window.APP_CONFIG  = EBSU_CONFIG;
}
