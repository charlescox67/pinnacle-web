/**
 * POST /api/auth/signup
 *
 * SECURITY
 *   - Bcrypt cost 12 (~250ms) — tuned for current hardware.
 *   - Per-IP rate limit (3 / 10 min) — limits mass account creation.
 *   - Email + password strict validation.
 *   - Mass-assignment safe: only email + password copied from body.
 *     Role/permissions are NEVER taken from request input.
 *   - Generic 409 on duplicate to limit enumeration (still leaks somewhat;
 *     acceptable tradeoff for UX. For zero-leak, send a verification email
 *     and return the same response in both branches).
 */

'use strict';

const bcrypt = require('bcryptjs');
const {
  signSession, setSessionCookie,
  validateEmail, validatePassword,
  rateLimit, clientIp, readJsonBody,
} = require('../_lib/auth');

const COST = Math.max(10, Math.min(15, parseInt(process.env.BCRYPT_COST || '12', 10)));

async function createUser({ email, password_hash }) {
  // Replace with real persistence. MUST throw on duplicate email
  // (let the unique constraint enforce, don't pre-check separately).
  return { id: 'stub_id', email, role: 'user' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!rateLimit(`signup:ip:${clientIp(req)}`, 3, 10 * 60_000)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: 'invalid_request' }); }

  // Mass-assignment guard: pull ONLY the fields we trust.
  const email    = String(body.email    || '').toLowerCase().trim();
  const password = String(body.password || '');

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({
      error: 'weak_password',
      hint:  'min 12 chars, must include letters and numbers',
    });
  }

  let user;
  try {
    const hash = await bcrypt.hash(password, COST);
    user = await createUser({ email, password_hash: hash });
  } catch (err) {
    if (err?.code === 'DUPLICATE') {
      return res.status(409).json({ error: 'email_taken' });
    }
    console.error('[signup] failed:', err?.code || 'unknown');
    return res.status(500).json({ error: 'signup_failed' });
  }

  const token = signSession({ uid: user.id, role: 'user' });
  setSessionCookie(res, token);
  return res.status(201).json({ ok: true });
};
