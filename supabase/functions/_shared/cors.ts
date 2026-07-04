/**
 * cors.ts — CORS headers for EBSU Edge Functions.
 *
 * Adjust ALLOWED_ORIGINS to the domains you actually serve the app from.
 * In production this should be your exact hostname, not '*'.
 */

const ALLOWED_ORIGINS: string[] = [
  // Add your production domain here, e.g.:
  // 'https://id.ebsu.edu.ng',
  'https://ebsu-id-card.vercel.app',

  // During development / local file serving, file:// origins are null.
  // The cybercafé opens index.html directly from disk, so we allow null.
  'null',

  // Allow localhost variants for development
  'http://localhost',
  'http://127.0.0.1',
];

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] ?? '*';

  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/** Respond to CORS preflight (OPTIONS) requests. */
export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req.headers.get('origin')),
    });
  }
  return null;
}
