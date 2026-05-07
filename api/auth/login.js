/**
 * POST /api/auth/login
 *  Body: { email: string, password: string }
 *
 * SECURITY
 *   - Per-IP rate limit (5 / 5 min) and per-email rate limit (10 / 15 min).
 *   - Generic "invalid_credentials" reply on every failure path (no enumeration).
 *   - Constant-time password compare via bcrypt.
 *   - HttpOnly + Secure + SameSite=Strict + __Host- prefixed session cookie.
 *   - Pseudo-DB stub — replace `findUserByEmail` with real query.
 */

'use strict';

const bcrypt = require('bcryptjs');
const {
  signSession, setSessionCookie,
  validateEmail, validatePassword,
  rateLimit, clientIp, readJsonBody,
} = require('../_lib/auth');

async function findUserByEmail(email) {
  // Replace with real DB lookup (Postgres / Mongo / Supabase).
  // Return null when not found (do NOT throw — masquerading prevents user enumeration).
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = clientIp(req);
  if (!rateLimit(`login:ip:${ip}`, 5, 5 * 60_000)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: 'invalid_request' }); }

  const email    = String(body.email    || '').toLowerCase().trim();
  const password = String(body.password || '');

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'invalid_credentials' });
  }

  if (!rateLimit(`login:em:${email}`, 10, 15 * 60_000)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  // Use a stable dummy hash when user not found to prevent timing-based user enumeration.
  const DUMMY = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8qzN9QbB2QnRPqXq0wNNu0a/xN6wKi';
  const user = await findUserByEmail(email);
  const hash = user?.password_hash || DUMMY;

  let ok = false;
  try { ok = await bcrypt.compare(password, hash); } catch { ok = false; }

  if (!user || !ok) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = signSession({ uid: user.id, role: user.role || 'user' });
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true });
};
