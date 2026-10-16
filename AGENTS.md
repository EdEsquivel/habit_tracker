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
- The visual target is the Figma file "Habit Tracker". Sample its palette and type from the frames rather than inventing values, but this design is **flat**: no shadows, no glows, no glass.
- Type is **Lora** for display (title, big numerals) and **Inter** for UI. Both are bundled in `fonts/` as latin-subset variable woff2 so the app stays offline; there are no webfont requests.
- The type scale is role-based, sampled from the mockup: Lora 38/36px for screen headlines (line-height 1.12, tracking −1px, sentence case), Lora 22–40px for the big numerals, Inter 10–15px for UI text, and Inter 13–15px SemiBold for section headings. Section overlines are Inter 11px SemiBold **uppercase with 1.5px tracking** — never sentence-case an overline.
- Icons are inline `<symbol>` shapes in an SVG sprite in `index.html`, referenced with `<use href="#i-name">`. No icon font, no CDN, no image downloads; dynamic icons are built with `createElementNS` rather than `innerHTML`.
- Every colour is a custom property declared in `:root`. The dark theme only redefines those properties under `[data-theme='dark']`, so no component rule knows which theme is active. Never hardcode a colour inside a component rule.
- Keep contrast at WCAG AA: 4.5:1 for normal text, 3:1 for large text. Both palettes are held to this, and `color-scheme` must be set per theme so native controls (date picker, number spinners) follow along.
- When a source colour misses AA, darken it to the nearest passing value in the same hue family and note the change in the CSS. Contrast outranks pixel-fidelity to the mockup.

## Data Storage
- `habitTracker.logs` — an array of completion logs:
  `{ date: "YYYY-MM-DD", habit: string, note?: string, minutes?: number, id?: string, createdAt?: number, habitId?: string }`.
- `date`, `habit`, and `note` drive the UI; `minutes` is omitted when no time was typed, and `id` / `createdAt` are optional metadata used to keep same-day entries in newest-first order.
- `habitTracker.habits` — the habits themselves (added with the user's approval):
  `{ id, name, icon, accent, frequency: 'daily' | 'specific', weekdays: number[], goalMinutes, reminderEnabled, reminderTime, createdAt }`.
  `icon` is a key from the `ICONS` list, `accent` is `'sage' | 'warm'`, and `weekdays` uses `Date.getDay()` numbering (0 = Sunday). A completion belongs to a habit through `habitId`.
- `habitId` is optional on purpose: logs saved before habits existed carry only a name and are matched to a habit by that name. Such a log still counts towards the global streak and still appears in History, but it is NOT counted in the per-habit Insights ratios, which consider real habits only. Never rewrite an old log to add `habitId`.
- New fields must stay optional so logs saved by older versions keep working; never rewrite existing records unless the user asks.
- Summaries (today's progress, weekly/monthly/yearly insights, streaks) are aggregated from the saved logs every time the page is drawn, and are never written to storage; do not add summary records to either array.
- `habitTracker.settings` holds `{ theme: 'dark' | 'light', language: 'en' | 'es' }` and is stored separately from the logs, so changing a setting can never touch user data. Defaults are dark + English; unknown values fall back to those defaults.
- Logs, habits and settings each live in their OWN key, precisely so that adding habits or changing a setting can never touch the other two. Keep it that way: a new concern gets a new key.
- `index.html` carries a tiny inline script that applies the saved theme before the first paint (to avoid a flash of the wrong theme). Keep it in sync with `SETTINGS_KEY` / `DEFAULT_SETTINGS` in `app.js`.
- Never change a storage key without asking the user first.

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
- Implement strictly what is requested: do not add unprompted features or icons.
- Bundled font files in `fonts/` are the one sanctioned third-party asset. Anything else must be self-contained: no CDN links, no webfont requests, no external stylesheets.
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
- ⚠️ Ask before: adding new files, altering the `localStorage` data schema (the approved keys are currently `habitTracker.logs`, `habitTracker.habits` and `habitTracker.settings`), changing the week or month boundary definition, adding a language, or changing the default theme.
- 🚫 Never: introduce dependencies, npm packages, UI frameworks, or build tools.

## Verification
- There are no automated tests. After each change, verify using the Chrome DevTools MCP: open `index.html`, test the functionality, check the console, and inspect the mobile view.
- Reset state: DevTools → Application → Local Storage → delete the `habitTracker.logs`, `habitTracker.habits` and `habitTracker.settings` keys.
- Date and streak checks worth repeating after touching date logic: several completions on one day count once; yesterday-only activity keeps the current streak alive; an older longer run still shows as the best streak; entries dated in the future never affect either number. A single habit's streak uses the same rules over that habit's own days.
- Today checks: the progress card counts only the habits that are DUE today, so a habit scheduled for other weekdays is left out of the denominator; completing every due habit opens the celebration once per visit, never on page load.
- Rest-day checks: a habit that is not due today shows "Rest day today", its completion control is disabled on both the card and the detail screen, and it is excluded from the Today denominator.
- Insights checks: Week draws 7 day bars, Month one bar per week of the month, Year one per month. Every range counts DISTINCT habits per block, so the percentage is habits completed over (habits × blocks that have STARTED) — a week still in progress must not be punished for the days still to come. The row ratios and the anchor sentence are built from the same rows, so they can never disagree.
- Legacy-log checks: an entry with no `habitId` still counts towards the global streak and still appears in History, but never appears in the Insights ratios. Deleting a habit keeps its completions in History.
- Theme and language checks worth repeating: toggle both, reload, and confirm both choices persist and no log changed; confirm every `data-i18n` key exists in both languages (a missing key shows `undefined`); check contrast in both palettes.
- When changing styles, screenshot both themes and at least a 320px width. Headless Chrome clamps the window to a 500px minimum, so simulate a narrow screen by capping `.app` / `.overlay-screen` to `max-width: 320px` and comparing each element's right edge against the column's own right edge. A fixed-width `<iframe>` can be screenshotted but not inspected on `file://` (cross-origin). All `file://` pages share one localStorage bucket, so test one variant at a time.