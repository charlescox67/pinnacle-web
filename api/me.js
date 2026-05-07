/**
 * GET /api/me
 *  Returns minimal profile for current session.
 *
 * SECURITY
 *   - requireAuth() validates HMAC signature + expiry on session cookie.
 *   - Returns ONLY non-sensitive fields. Never serialize password_hash, tokens, etc.
 *   - IDOR-safe: the user being returned is derived from the session, not from any param.
 */

'use strict';

const { requireAuth } = require('./_lib/auth');

async function findUserById(uid) {
  // Replace with real DB lookup.
  return { id: uid, email: 'stub@example.com', role: 'user', tier: 'pro' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const session = requireAuth(req, res);
  if (!session) return; // requireAuth already wrote 401

  const user = await findUserById(session.uid);
  if (!user) return res.status(404).json({ error: 'not_found' });

  // Allowlist serialization — never spread the user object.
  return res.status(200).json({
    id:    user.id,
    email: user.email,
    role:  user.role,
    tier:  user.tier,
  });
};
