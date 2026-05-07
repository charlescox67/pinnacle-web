/**
 * POST /api/auth/logout
 *
 * SECURITY
 *   - POST-only (CSRF defense; SameSite=Strict cookie also covers this).
 *   - Always returns 200 — no information leak whether user was logged in.
 */

'use strict';

const { clearSessionCookie } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
