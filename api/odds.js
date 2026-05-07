/**
 * Pinnacle — Odds API Proxy (Vercel Edge/Node)
 *
 * SECURITY POSTURE
 *   - API key never leaves the server (read from process.env)
 *   - Sport param strict-allowlisted before any upstream call
 *   - CORS pinned to ALLOWED_ORIGINS env var (comma-split, exact match)
 *   - Rate limited per IP with 60req/min token bucket
 *   - 10s upstream timeout via AbortController (prevents hanging sockets)
 *   - 5MB payload cap; rejects oversized responses
 *   - Generic error responses (no stack traces, no upstream URL leakage)
 *   - Sets Cache-Control: no-store
 *
 * Deploy as /api/odds (Vercel auto-routes from /api directory).
 */

'use strict';

// ── Config (from env) ──────────────────────────────────────────────
const ODDS_API_KEY    = process.env.ODDS_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const UPSTREAM           = 'https://api.theoddsapi.com';
const MAX_PAYLOAD        = 5 * 1024 * 1024;  // 5 MB
const UPSTREAM_TIMEOUT   = 10_000;           // 10 s

// Strict allowlist — anything else gets 400 immediately.
const VALID_SPORTS = new Set([
  'basketball_nba', 'basketball_wnba', 'basketball_ncaab',
  'americanfootball_nfl', 'americanfootball_ncaaf',
  'baseball_mlb', 'icehockey_nhl',
  'mma_mixed_martial_arts', 'boxing_boxing',
  'golf_pga_championship', 'soccer_epl',
]);

const VALID_REGIONS = new Set(['us', 'us2']);
const VALID_MARKETS = new Set(['h2h', 'spreads', 'totals']);

// ── Rate limiting (in-memory token bucket) ─────────────────────────
const buckets = new Map();
const LIMIT     = 60;
const WINDOW_MS = 60_000;

function rateLimit(ip) {
  const now    = Date.now();
  const bucket = buckets.get(ip) || { tokens: LIMIT, ts: now };
  const elapsed = now - bucket.ts;
  bucket.tokens = Math.min(LIMIT, bucket.tokens + (elapsed / WINDOW_MS) * LIMIT);
  bucket.ts = now;
  if (bucket.tokens < 1) { buckets.set(ip, bucket); return false; }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 5 * WINDOW_MS;
  for (const [k, v] of buckets) if (v.ts < cutoff) buckets.delete(k);
}, WINDOW_MS).unref?.();

// ── CORS ──────────────────────────────────────────────────────────
function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
}

// ── Boundary sanitizer — never trust upstream ──────────────────────
function clamp(s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; }
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }

function sanitizeOutcome(o) {
  if (!o || typeof o !== 'object') return null;
  return {
    name:  clamp(o.name, 64),
    price: num(o.price),
    point: o.point != null ? num(o.point) : null,
  };
}
function sanitizeMarket(m) {
  if (!m || typeof m !== 'object') return null;
  if (!VALID_MARKETS.has(m.key)) return null;
  const outcomes = Array.isArray(m.outcomes) ? m.outcomes.slice(0, 50) : [];
  return {
    key:         m.key,
    last_update: clamp(m.last_update, 32),
    outcomes:    outcomes.map(sanitizeOutcome).filter(Boolean),
  };
}
function sanitizeBookmaker(b) {
  if (!b || typeof b !== 'object') return null;
  const markets = Array.isArray(b.markets) ? b.markets.slice(0, 10) : [];
  return {
    key:         clamp(b.key, 32),
    title:       clamp(b.title, 64),
    last_update: clamp(b.last_update, 32),
    markets:     markets.map(sanitizeMarket).filter(Boolean),
  };
}
function sanitizeGame(g) {
  if (!g || typeof g !== 'object') return null;
  const id = typeof g.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(g.id) ? g.id : null;
  if (!id) return null;
  const books = Array.isArray(g.bookmakers) ? g.bookmakers.slice(0, 5) : [];
  return {
    id,
    sport_key:     clamp(g.sport_key, 64),
    commence_time: clamp(g.commence_time, 32),
    home_team:     clamp(g.home_team, 64),
    away_team:     clamp(g.away_team, 64),
    bookmakers:    books.map(sanitizeBookmaker).filter(Boolean),
  };
}

// ── Handler ───────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'method_not_allowed' });

  if (!rateLimit(clientIp(req))) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  if (!ODDS_API_KEY) {
    console.error('[odds] ODDS_API_KEY not configured');
    return res.status(503).json({ error: 'service_unavailable' });
  }

  const sport  = String(req.query?.sport  || '');
  const region = String(req.query?.region || 'us');
  const market = String(req.query?.market || 'h2h,spreads,totals');

  if (!VALID_SPORTS.has(sport))   return res.status(400).json({ error: 'invalid_sport' });
  if (!VALID_REGIONS.has(region)) return res.status(400).json({ error: 'invalid_region' });

  const marketList = market.split(',').map(s => s.trim());
  if (marketList.length > 3 || !marketList.every(m => VALID_MARKETS.has(m))) {
    return res.status(400).json({ error: 'invalid_market' });
  }

  const url = new URL(`${UPSTREAM}/odds/`);
  url.searchParams.set('sport_key',  sport);
  url.searchParams.set('regions',    region);
  url.searchParams.set('markets',    marketList.join(','));
  url.searchParams.set('oddsFormat', 'american');

  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT);

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'x-api-key': ODDS_API_KEY },
    });

    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_PAYLOAD) return res.status(502).json({ error: 'payload_too_large' });

    if (upstream.status === 429) return res.status(429).json({ error: 'upstream_rate_limited' });
    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      console.error('[odds] upstream error', upstream.status, errBody.slice(0, 300));
      return res.status(502).json({ error: 'upstream_error', upstream_status: upstream.status });
    }

    const text = await upstream.text();
    if (text.length > MAX_PAYLOAD) return res.status(502).json({ error: 'payload_too_large' });

    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'upstream_invalid' }); }

    if (!Array.isArray(data)) return res.status(502).json({ error: 'upstream_invalid' });

    const sanitized = data.slice(0, 100).map(sanitizeGame).filter(Boolean);
    return res.status(200).json({ sport, count: sanitized.length, games: sanitized });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'upstream_timeout' });
    }
    console.error('[odds] upstream failure:', err?.code || 'unknown');
    return res.status(502).json({ error: 'upstream_failed' });
  } finally {
    clearTimeout(t);
  }
};
