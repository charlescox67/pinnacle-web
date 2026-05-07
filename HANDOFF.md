# Pinnacle — Live API Integration Handoff

This is the complete project context for connecting Pinnacle's frontend to live sportsbook odds. Read this fully before making changes.

---

## TL;DR for Claude Code

The site is a **single-file frontend** (`index.html`) that currently runs on hardcoded mock data. Your job: wire it to live odds via a Vercel serverless proxy that hides the API key. Most of the proxy is already written in `api/odds.js`. The remaining work is patching the frontend to fetch from it, then deploying.

**Critical rule:** the API key must NEVER appear in `index.html`. It must stay server-side, in Vercel env vars, accessed only by `api/odds.js`. Bypassing this exposes the user's billing.

---

## Project structure

```
pinnacle-handoff/
├── index.html          # Single-file frontend — landing + terminal, mock data baked in
├── api/
│   └── odds.js         # Vercel serverless function — proxies The Odds API
├── vercel.json         # Vercel config
├── .env.example        # Template for env vars
├── .gitignore
└── HANDOFF.md          # This file
```

When deployed to Vercel, requests to `/api/odds?sport=NBA` invoke the serverless function, which calls The Odds API server-side and returns transformed data the frontend already knows how to render.

---

## What's already done

1. **Frontend** — full working site, styled, dark/light modes, all rendering logic. Reads from a `MOCK_GAMES` constant.
2. **Proxy function** (`api/odds.js`) — calls The Odds API, transforms its response into Pinnacle's data shape, includes:
   - Sport label → API key mapping (NBA → `basketball_nba`, etc.)
   - Best-price detection per outcome
   - Edge % calculation vs. median
   - Arbitrage flag (when implied probabilities sum to <100%)
   - Edge cache headers (60s) to conserve free-tier quota
3. **Vercel config** — deploy-ready
4. **Env template** — `.env.example`

---

## What you need to do

### Step 1 — Get an API key (5 min)

1. Sign up at https://the-odds-api.com
2. Verify email
3. Copy the API key from the dashboard
4. Free tier = **500 requests/month**. Edge cache makes this stretch a long way for demo use.

### Step 2 — Set up the project locally

```bash
cd pinnacle-handoff
npm install -g vercel        # if you don't have it
cp .env.example .env.local   # create a local env file
# Edit .env.local — paste your ODDS_API_KEY value
vercel dev                   # runs the site + serverless functions locally on port 3000
```

Visit `http://localhost:3000` — you should see the landing page.

### Step 3 — Patch the frontend to fetch live data

Open `index.html` and find the line `const MOCK_GAMES = {`. Right after the closing `};` of that object (around line ~1565 — search for `Boxing: [], Lacrosse: [], KFT: []` followed by `};`), add this block:

```javascript
// ============================================
// LIVE DATA LAYER
// ============================================
let LIVE_GAMES = {};                      // sport -> games array (overrides MOCK_GAMES when present)
const USE_LIVE_API = true;                // flip false to force mock data

function gamesFor(sport) {
    return LIVE_GAMES[sport] || MOCK_GAMES[sport] || [];
}

async function loadLiveGames(sport) {
    if (!USE_LIVE_API) return;
    try {
        const resp = await fetch(`/api/odds?sport=${encodeURIComponent(sport)}`);
        if (!resp.ok) {
            console.warn(`Odds proxy ${resp.status} for ${sport}, using mock`);
            return;
        }
        const data = await resp.json();
        if (!data.games || !data.games.length) {
            console.info(`No live games for ${sport}, keeping mock`);
            return;
        }
        // Stitch in narrative data (h2h/injuries/aiInsight) from mock for matching games.
        // Match by team-code pair so live game data inherits any human-curated context.
        const mockBySport = MOCK_GAMES[sport] || [];
        const byCodes = (g) => `${g.awayTeam}@${g.homeTeam}`;
        const mockMap = Object.fromEntries(mockBySport.map(g => [byCodes(g), g]));
        LIVE_GAMES[sport] = data.games.map(g => {
            const mock = mockMap[byCodes(g)] || {};
            return {
                ...g,
                h2h: mock.h2h || [],
                injuries: mock.injuries || [],
                aiInsight: mock.aiInsight || null,
            };
        });
        renderApp();
    } catch (e) {
        console.warn("Live data fetch failed:", e);
    }
}
```

### Step 4 — Replace MOCK_GAMES reads with gamesFor()

Search `index.html` for every read of `MOCK_GAMES[` (should be five locations — sidebar count, enterTerminal, changeSport, expandAll, renderTerminal). Replace each with `gamesFor(...)`. Example:

```javascript
// BEFORE
const games = MOCK_GAMES[appState.currentSport] || [];

// AFTER
const games = gamesFor(appState.currentSport);
```

Don't replace the reads inside `gamesFor()` itself or inside `loadLiveGames()` — those need direct access to MOCK_GAMES.

### Step 5 — Trigger the loader at the right moments

Find `function enterTerminal()` and add a `loadLiveGames(...)` call:

```javascript
function enterTerminal() {
    appState.currentPage = 'terminal';
    appState.isAuthenticated = true;
    const games = gamesFor(appState.currentSport);
    if (games.length && Object.keys(appState.expandedGames).length === 0) {
        appState.expandedGames[games[0].id] = true;
    }
    renderApp();
    loadLiveGames(appState.currentSport);   // <-- add this
}
```

Find `function changeSport(sport)` and do the same:

```javascript
function changeSport(sport) {
    appState.currentSport = sport;
    appState.expandedGames = {};
    const games = gamesFor(sport);
    if (games.length) appState.expandedGames[games[0].id] = true;
    renderApp();
    loadLiveGames(sport);   // <-- add this
}
```

### Step 6 — Test locally

```bash
vercel dev
```

Open the site, click "Enter Terminal", and watch the browser DevTools Network tab. You should see a `GET /api/odds?sport=NBA` request returning live games. Check the Console for any warnings.

If you see errors like "ODDS_API_KEY not configured," your `.env.local` isn't being read — make sure the file is named exactly `.env.local` and is in the project root.

### Step 7 — Deploy to Vercel

```bash
vercel        # first time: prompts to log in and link the project
vercel --prod # ship it
```

Then in the Vercel dashboard:
1. Project → Settings → Environment Variables
2. Add `ODDS_API_KEY` = your key
3. Save → Redeploy

Verify the live URL works by checking the Network tab on the deployed site.

---

## The data shape contract

The frontend expects this shape per game (this is what `MOCK_GAMES.NBA[0]` looks like — match it exactly):

```javascript
{
  id: string,
  homeTeam: string,             // 3-letter code
  awayTeam: string,             // 3-letter code
  time: string,                 // human-readable, "Tue 8:00 PM EST"
  arbitrage: boolean,           // shows the ⚡ Value tag when true
  lines: {
    'team-games': [             // shown on the Game Lines tab
      {
        name: string,           // "Spread" | "Moneyline" | "Total" (or "Run Line" / "Puck Line")
        outcomes: [
          {
            name: string,       // e.g. "LAL", "Over"
            line: string,       // e.g. "-6.5", "215.5", "" for moneyline
            bookmakers: [
              { name: "DraftKings", odds: -110, best: false },
              { name: "FanDuel",    odds: -105, best: true, advantage: 5 },
              // ...one per book in BOOK_ORDER
            ],
            hit: { rate: 0.65, sample: 20, last5: [1,1,0,1,1] } | null
          }
        ]
      }
    ],
    'player-bets': [...]        // shown on the Player Props tab — empty array OK
  },
  h2h: [...] | [],
  injuries: [...] | [],
  aiInsight: { pick, confidence, reason } | null
}
```

The proxy returns this shape directly. If you need to debug, hit `/api/odds?sport=NBA` in your browser and inspect the JSON.

---

## Known limitations and next steps

The proxy gives you live odds, but four pieces of UI need data the API doesn't provide:

### 1. Player props (the Player Props tab)
The Odds API exposes player props on a separate per-event endpoint (`/v4/sports/{sport}/events/{eventId}/odds`) and props eat way more quota. Not implemented yet. Suggested approach when you tackle this:
- Only fetch props for the currently-expanded game
- Cache for longer (5 min)
- Use a separate `/api/props?eventId=X` proxy route

### 2. Hit rates per outcome
These need historical data. Two approaches:
- **Easier:** scrape free historical odds from `oddssharp.com` or `bettingpros.com` weekly into a JSON file, look up by `team + line`
- **Better:** subscribe to a stats API (Sportradar, PrizePicks) and store rolling hit rates in Postgres. Adds ~$50–500/mo cost.

For now the proxy returns `hit: null` and the frontend just doesn't render the pill.

### 3. H2H + injuries
- **H2H:** can be computed from past games in The Odds API (the `/scores` endpoint, free)
- **Injuries:** ESPN's unofficial API (`site.web.api.espn.com/apis/site/v2/sports/...`) returns team injury reports, free, no auth. Wrap in a `/api/injuries?team=LAL` route.

### 4. AI Insight
Once h2h/injuries are wired in, add a `/api/insight` route that calls Claude:
- POST `{ game, h2h, injuries, lines }` to Anthropic's API
- Use Claude Sonnet for cost (Opus is overkill here)
- Cache aggressively — game state doesn't change between bets
- Already in `.env.example` as `ANTHROPIC_API_KEY`

### 5. Caching
For real production traffic, Vercel's edge cache + 60s isn't enough. Add Upstash Redis (free tier) and cache responses by `sport` for 30s. Cuts API calls 90%+.

### 6. Authentication
For Pro/Elite tiers, you'll need:
- Auth (Clerk or Supabase Auth — both have free tiers)
- Stripe for subscriptions
- A middleware check on `/api/*` routes that gates premium features

---

## Money / quota math

- **Free tier** = 500 requests/month
- With 60s edge cache, every cached hit = 0 API calls
- 7 sports × 1 fresh fetch every 60s × 24h = 10,080 calls/day if you have constant traffic
- **You will exhaust the free tier in ~1.2 hours of real traffic.**

For a working demo, this is fine. For real users, you need either:
- The $30/mo plan (20K requests) — about 6 hours of traffic
- The $59/mo plan (100K requests) — about 30 hours
- Switch to OddsJam ($500+/mo, but unlimited)

Alternative: cache per-sport for 5+ minutes. Sportsbook lines barely move on most markets — 5-min staleness is fine for casual users.

---

## How to test the proxy in isolation

Without the frontend, you can hit the function directly:

```bash
curl "http://localhost:3000/api/odds?sport=NBA" | jq
```

Look for:
- `games` array, non-empty during NBA season
- Each game has `lines['team-games']` with Spread/Moneyline/Total
- Each outcome has `bookmakers` array with one entry per book in BOOK_ORDER
- `best: true` flagged on exactly one entry per outcome
- `remaining` and `used` headers showing your quota

If you see empty arrays during the NBA off-season, that's correct — try `sport=NFL` during the season instead.

---

## File-by-file map of what to touch

| File | Status | What to do |
|------|--------|-----------|
| `index.html` | Mock data only | Add live loader (Step 3), replace MOCK_GAMES reads (Step 4), trigger loader (Step 5) |
| `api/odds.js` | Done | No changes needed unless you want to add markets/sports |
| `vercel.json` | Done | No changes |
| `.env.example` | Done | Copy to `.env.local`, fill in your keys |
| `package.json` | Doesn't exist yet | Run `npm init -y` if you want one (not strictly required for Vercel) |

---

## If something breaks

**"ODDS_API_KEY not configured"** — env var not set. Locally: check `.env.local`. Production: check Vercel dashboard.

**CORS errors in browser** — the proxy is on the same origin as the frontend, so this shouldn't happen. If it does, you're probably calling The Odds API directly from the browser somewhere — search index.html for `the-odds-api.com` and remove.

**429 rate limited** — you hit the free tier ceiling. Either upgrade or extend the cache TTL.

**Empty games array even though season is active** — check Vercel function logs. Common causes: typo'd sport key in SPORTS_MAP, the API returning empty for off-day, or your key not being valid. Log the upstream URL in `api/odds.js` to debug.

**Site loads but odds are still mock** — check browser console for "Live data fetch failed". Means the loader ran but hit an error. Check Network tab for the `/api/odds` request status.

---

## Reference: The Odds API docs

- Overview: https://the-odds-api.com/liveapi/guides/v4/
- Sports list: https://the-odds-api.com/sports-odds-data/sports-apis.html
- Markets: https://the-odds-api.com/sports-odds-data/betting-markets.html
- Bookmaker keys: https://the-odds-api.com/sports-odds-data/bookmaker-apis.html

The `apiSport` keys in `api/odds.js` come from the Sports list page. If the user wants to add a new sport (say, EPL), look up its key there and add it to `SPORTS_MAP`.

---

## Out of scope for this handoff

- Mobile native app (would be React Native rebuild)
- Backtest engine (Elite tier feature)
- API tier (exposing your aggregated data to other developers)
- Anything legal — Pinnacle is analytics-only, never take wagers, never call the product a sportsbook
