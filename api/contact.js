/**
 * POST /api/contact
 *  Body: { name, email, subject, message }
 *
 * SECURITY
 *   - Rate limited per IP (5 / hour).
 *   - Input validated and length-capped before any processing.
 *   - Returns generic errors — no enumeration.
 *   - Stub: logs to console. Wire to Resend/SendGrid/Postmark in production.
 *     Example with Resend: npm install resend, then:
 *       const { Resend } = require('resend');
 *       const resend = new Resend(process.env.RESEND_API_KEY);
 *       await resend.emails.send({ from: 'noreply@pinnacle.app', to: 'team@pinnacle.app', subject, text });
 */

'use strict';

const { rateLimit, clientIp, readJsonBody, validateEmail } = require('./_lib/auth');

function clamp(s, n) { return typeof s === 'string' ? s.slice(0, n).trim() : ''; }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = clientIp(req);
  if (!rateLimit(`contact:ip:${ip}`, 5, 60 * 60_000)) {
    return res.status(429).json({ error: 'too_many_requests', hint: 'Please wait before sending another message.' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: 'invalid_request' }); }

  const name    = clamp(body.name,    120);
  const email   = clamp(body.email,   254).toLowerCase();
  const subject = clamp(body.subject,  60) || 'general';
  const message = clamp(body.message, 4000);

  if (!name)                return res.status(400).json({ error: 'name_required' });
  if (!validateEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (message.length < 20)  return res.status(400).json({ error: 'message_too_short', hint: 'Message must be at least 20 characters.' });

  const VALID_SUBJECTS = new Set(['general', 'press', 'partnerships', 'api', 'careers']);
  const safeSubject = VALID_SUBJECTS.has(subject) ? subject : 'general';

  // ── Production: replace this block with your email provider ──────
  console.log('[contact] New message', {
    from: email,
    name,
    subject: safeSubject,
    preview: message.slice(0, 80),
  });
  // ─────────────────────────────────────────────────────────────────

  return res.status(200).json({ ok: true });
};
