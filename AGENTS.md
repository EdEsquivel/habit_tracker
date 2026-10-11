# AGENTS.md — Habit Tracker

Static web app to log daily habit completions and stay motivated by tracking consecutive active day streaks. Educational project: code must remain accessible and understandable for someone learning to program.

## Tech Stack & Structure
- Vanilla HTML, CSS, and JavaScript: no frameworks, external libraries, npm, bundlers, or build steps.
- Exactly three files: `index.html` (markup), `styles.css` (styles), and `app.js` (logic & state).
- Must work by double-clicking `index.html` via the `file://` protocol: no ES modules (`type="module"`), no local `fetch` calls, and nothing requiring a local web server.

## Conventions
- All user-facing copy lives in the `TRANSLATIONS` object in `app.js`. English is the canonical language and the fallback; Spanish is selectable and mirrors the English keys exactly.
- Static copy in `index.html` is marked with `data-i18n` (text) or `data-i18n-placeholder` (placeholders). Never hardcode user-facing text in the markup or in the logic.
- Sentences that need a number use `{placeholder}` keys plus `fill()`; singular and plural are separate keys instead of a plural-rules helper.
- Simple code, descriptive variable/function names, and comments only where they genuinely add value.
- Clean, responsive mobile-first design; any new view or component must look and feel great on mobile viewports.
- Every colour is a custom property declared in `:root`. The dark theme only redefines those properties under `[data-theme='dark']`, so no component rule knows which theme is active. Never hardcode a colour inside a component rule.
- Keep contrast at WCAG AA: 4.5:1 for normal text, 3:1 for large text. Both palettes are held to this, and `color-scheme` must be set per theme so native controls (date picker, number spinners) follow along.

## Data Storage
- Stored in `localStorage` under the key `habitTracker.logs`: an array of logs with this shape:
  `{ date: "YYYY-MM-DD", habit: string, note?: string, minutes?: number, id?: string, createdAt?: number }`.
- `date`, `habit`, and `note` drive the UI; `minutes` is omitted when no time was typed, and `id` / `createdAt` are optional metadata used to keep same-day entries in newest-first order.
- New fields must stay optional so logs saved by older versions keep working; never rewrite existing records unless the user asks.
- Summaries such as weekly totals are aggregated from the saved logs every time the page is drawn, and are never written to storage; do not add summary records to the array.
- `habitTracker.settings` holds `{ theme: 'dark' | 'light', language: 'en' | 'es' }` and is stored separately from the logs, so changing a setting can never touch user data. Defaults are dark + English; unknown values fall back to those defaults.
- `index.html` carries a tiny inline script that applies the saved theme before the first paint (to avoid a flash of the wrong theme). Keep it in sync with `SETTINGS_KEY` / `DEFAULT_SETTINGS` in `app.js`.
- Never change the storage key without asking the user first.

## Dates & Streak Calculation (Common Pitfalls)
- Always work in the user's local timezone. Never use `toISOString()` or `new Date("YYYY-MM-DD")`, as they parse in UTC and will shift the calendar date around midnight.
- Streak = consecutive days with at least 1 logged habit ending today. If nothing has been logged yet today but yesterday had activity, the streak remains active and counts up to yesterday.
- Best streak = the longest run of consecutive active days ever recorded, including a streak that is still running. Future-dated entries do not contribute.
- Multiple habit entries on the same day count as a single active day.
- To test whether two days are consecutive, step a local `Date` forward with `setDate(date + 1)` and compare local date strings. Never divide a millisecond difference by `86400000`: on DST days a day is 23 or 25 hours long, so that math gives the wrong answer.
- The week starts on Monday and ends today. Find the boundary with local `setDate`, then compare the `date` strings (`weekStart <= date <= today`) so previous-week and future-dated entries are excluded.
- In weekly totals, `minutes` is added per habit text; entries without `minutes` are skipped, never treated as zero.
- The month runs from the 1st through today. Build the boundary with `new Date(year, month, 1)` (local midnight) and compare `date` strings (`monthStart <= date <= today`) so last month's entries and future-dated entries are excluded.
- Monthly day counts keep a `Set` of day strings per habit, so the result counts DISTINCT DAYS and never a difference between two dates. Unlike weekly minutes, an entry without `minutes` still counts: days measure how often, not how long.

## Working Guidelines
- Implement strictly what is requested: do not add unprompted features, icons, or third-party fonts.
- Keep changes small and focused; avoid rewriting existing code that already works.
- Upon completion, summarize what was changed and highlight any implementation decisions requiring review.

## Memory
- At the start, read `MEMORY.md` to understand the project's current state and past decisions.
- After finishing a task, update it with: current status, key decisions (and the reasoning behind them), and pitfalls to avoid.
- Keep it concise (~50 lines max): summarize or prune anything that no longer adds value.
- If something becomes a permanent rule, propose moving it to `AGENTS.md` instead of leaving it in memory.
- Never store sensitive data (keys, tokens, personal information).

## Guardrails
- ✅ Always: enforce local date and streak calculation rules; route all UI copy through `TRANSLATIONS`.
- ✅ Always: update `MEMORY.md` after finishing each task.
- ⚠️ Ask before: adding new files, altering the `localStorage` data schema, changing the week or month boundary definition, adding a language, or changing the default theme.
- 🚫 Never: introduce dependencies, npm packages, UI frameworks, or build tools.

## Verification
- No automated test runners or linters. Validate manually by opening `index.html` directly in the browser.
- Reset state: DevTools → Application → Local Storage → delete the `habitTracker.logs` and `habitTracker.settings` keys.
- Streak checks worth repeating after touching date logic: several entries on one day count once; yesterday-only activity keeps the current streak alive; an older longer run still shows as the best streak; entries dated in the future never affect either number.
- Weekly total checks worth repeating: two entries for the same habit this week are added together; an entry from last week or from the future is excluded; a week with no minutes shows the empty message.
- Monthly day count checks worth repeating: two entries for the same habit on one day show one day; a habit logged without `minutes` still counts; an entry from last month or from the future is excluded.
- Theme and language checks worth repeating: toggle both, reload, and confirm both choices persist and no log changed; confirm every `data-i18n` key exists in both languages (a missing key shows `undefined`); check contrast in both palettes.
- When changing styles, screenshot both themes and at least a 320px width. Headless Chrome clamps the window to a 500px minimum, so put the page in a fixed-width `<iframe>` to see a true narrow layout, and note that all `file://` pages share one localStorage bucket, so test one variant at a time.