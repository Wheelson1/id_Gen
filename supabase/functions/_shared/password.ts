/** _shared/password.ts: PBKDF2-SHA256 password hashing and token helpers (Web Crypto only). */
const ITER = 210_000;

function toB64(b: Uint8Array): string {
  let s = ''; b.forEach(x => { s += String.fromCharCode(x); }); return btoa(s);
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await derive(password, salt, ITER);
  return `pbkdf2$${ITER}$${toB64(salt)}$${toB64(h)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iterS, saltB, hashB] = (stored || '').split('$');
  if (alg !== 'pbkdf2') return false;
  const h = await derive(password, fromB64(saltB), parseInt(iterS, 10));
  return timingSafeEqual(h, fromB64(hashB));
}

export function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('');
}
