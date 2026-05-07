# Pinnacle — Project Notes for Claude

## Stack (deliberate)

Single-file vanilla HTML/JS app. **Do not** restructure into a build pipeline without explicit user confirmation — the single-file deploy is treated as a feature in `HANDOFF.md`.

- `index.html` — all UI, all state, all rendering. ~2300 lines.
- Tailwind via **CDN** (`<script src="https://cdn.tailwindcss.com"></script>`), not PostCSS. No `tailwind.config.js`, no build.
- Inline `<style>` block for design tokens (`--accent`, etc.) and custom rules.
- Render is plain template-string functions (`renderTerminal`, `renderSidebar`, `renderGameCard`, ...) called from `renderApp()`. No React, no JSX, no virtual DOM.
- Live-data layer in the same file: `MOCK_GAMES` constant + `LIVE_GAMES` overlay populated by `loadLiveGames(sport)` from `/api/odds`.
- Backend = `api/odds.js` Vercel serverless function. Reads `ODDS_API_KEY` from env.

## How to use the configured MCP servers in this project

`magic` (21st.dev) and `shadcn` are both registered in `.mcp.json`. Use them as **design references**, not as runtime dependencies:

- **shadcn MCP** → query for component source, props, and patterns (`view`, `search`, `docs`). **Never run `shadcn add` here** — it would write `.tsx` files that can't run in this project. To use a shadcn pattern: read it via the MCP, then port the markup + Tailwind classes into the relevant `render*()` function in `index.html`.
- **magic MCP** → use `21st_magic_component_inspiration` to fetch design ideas, then port to the existing template-string render functions. Don't accept its raw React output as-is.
- **`ui-ux-pro-max` skill** → safe to use directly for palette / typography / style guidance.

When porting from React/JSX to this project's vanilla template strings:
- `className=` → `class=`
- `{value}` → `${value}` inside backticks
- Replace `useState`/`useEffect` patterns with mutations on the existing `appState` object + a `renderApp()` call
- Drop `import` statements; everything lives in the one `<script>` block
- Keep Tailwind classes as-is — the CDN supports the full class set

## Out of scope unless asked

- Build pipeline (Vite, Webpack, esbuild)
- React / framework migration
- Component file splitting
- TypeScript
- PostCSS Tailwind

If a task seems to require any of these, stop and confirm with the user before proceeding.

## See also

- `HANDOFF.md` — full integration guide, data shape contract, deployment steps
- `README.md` — TL;DR
