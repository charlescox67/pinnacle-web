# Pinnacle

Sports analytics terminal. Compares live odds across 5 sportsbooks with per-outcome hit rates and AI-powered insight.

**Stack:** vanilla HTML/JS frontend + Vercel serverless proxy → The Odds API.

## Quick start

```bash
cp .env.example .env.local      # paste your ODDS_API_KEY into .env.local
npm install -g vercel
vercel dev                       # runs on http://localhost:3000
```

Get a free Odds API key at https://the-odds-api.com (500 reqs/mo free tier).

## Full integration guide

See **[HANDOFF.md](./HANDOFF.md)** — covers deployment, the data shape contract, known limitations, and next steps for player props / hit rates / AI Insight.
