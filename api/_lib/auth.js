/**
 * Pinnacle — shared auth utilities (session signing, cookie management, validation)
 *
 * SECURITY
 *   - HMAC-SHA256 session tokens — stateless, verifiable, tamper-proof.
 *   - __Host- prefix cookie: requires Secure + no Domain + Path=/ (no subdomain theft).
 *   - HttpOnly + SameSite=Strict prevent XSS and CSRF token theft.
 *   - timingSafeEqual for HMAC comparison — prevents timing attacks.
 *   - In-memory token bucket rate limiting (replace Map with Upstash Redis in prod).
 *   - Email + password validation with strict regex (no external library needed).
 *   - readJsonBody enforces BODY_LIMIT — prevents request body bombs.
 */

'use strict';

const crypto = require('crypto');

// ── Config ─────────────────────────────────────────────────────────
const SECRET      = Buffer.from(process.env.SESSION_SECRET || '', 'hex');
const COOKIE_NAME = '__Host-sid';
const MAX_AGE_SEC = 7 * 24 * 3600;   // 7 days
const BODY_LIMIT  = 4096;             // 4 KB max JSON body
const EMAIL_RE    = /^[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]{1,253}\.[a-zA-Z]{2,}$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*[0-9]).{12,256}$/;

if (SECRET.length < 16) {
  console.warn('[auth] WARNING: SESSION_SECRET is missing or too short — sessions will be insecure');
}

// ── Rate limiting (in-memory; replace with Upstash for multi-instance) ─
const _buckets = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [k, v] of _buckets) if (v.ts < cutoff) _buckets.delete(k);
}, 5 * 60_000).unref?.();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b   = _buckets.get(key) || { tokens: limit, ts: now };
  b.tokens  = Math.min(limit, b.tokens + ((now - b.ts) / windowMs) * limit);
  b.ts      = now;
  if (b.tokens < 1) { _buckets.set(key, b); return false; }
  b.tokens -= 1;
  _buckets.set(key, b);
  return true;
}

// ── Base64url helpers ──────────────────────────────────────────────
function b64u(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
function db64u(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ── Session token: base64url(json).base64url(hmac-sha256) ──────────
function signSession(payload) {
  const data = b64u(Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  })));
  const sig = b64u(crypto.createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}

function verifySession(token) {
  if (typeof token !== 'string' || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);

  // Constant-time comparison
  const expected = b64u(crypto.createHmac('sha256', SECRET).update(data).digest());
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(db64u(data).toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ── Cookie management ──────────────────────────────────────────────
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SEC}; Path=/`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`
  );
}

function requireAuth(req, res) {
  const raw   = req.headers.cookie || '';
  const match = raw.split(';').map(s => s.trim())
    .find(s => s.startsWith(`${COOKIE_NAME}=`));
  const token   = match ? match.slice(COOKIE_NAME.length + 1) : '';
  const payload = verifySession(token);
  if (!payload) {
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
  return payload;
}

// ── Input validation ───────────────────────────────────────────────
function validateEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}
function validatePassword(pass) {
  return typeof pass === 'string' && PASSWORD_RE.test(pass);
}

// ── Request helpers ────────────────────────────────────────────────
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || '0.0.0.0';
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > BODY_LIMIT) {
        reject(new Error('body_too_large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  validateEmail,
  validatePassword,
  rateLimit,
  clientIp,
  readJsonBody,
};
