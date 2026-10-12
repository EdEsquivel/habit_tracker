# MEMORY.md — Habit Tracker
Project memory across sessions. Maximum ~50 lines: summarize or prune anything that no longer adds value.

## Current State
- v7 functional: log habits (date, habit name, optional note, optional minutes), streak 🔥, best streak 🏆, a This Week card (minutes per habit), a This Month card (days per habit), a completed logs list, plus dark/light and English/Spanish toggles.
- Visual identity is the warm editorial theme sampled from the Figma file "Habit Tracker": warm paper ground, sage greens, one sand accent, Lora display + Inter UI, flat with no shadows.
- No build step and no network requests; the two fonts are bundled in `fonts/`. Storage: `habitTracker.logs` (habits) and `habitTracker.settings` (theme + language).

## Decisions (and Rationale)
- No backend or dependencies: anyone should be able to run it with a double click via `file://`.
- Editable date in form, so past days can be backfilled; `max` is today, so future days cannot be logged.
- Single global streak (not per habit): keeps the logic straightforward while the MVP grows.
- The storage key stayed `habitTracker.logs` and `AGENTS.md` was corrected instead: the doc was wrong, not the code, so no user data had to be touched.
- `minutes`, `id` and `createdAt` are all optional on a log. `minutes` is omitted when blank and old logs are never rewritten, so no migration is ever needed. `id`/`createdAt` exist for newest-first ordering of same-day entries.
- Best streak is computed by sorting unique active days and walking the runs, so a streak in progress counts immediately and the record can never shrink.
- 🔥 current / 🏆 best read apart at a glance. Time renders as a muted `· 25 min`; `min` is an abbreviation, so there is no plural to get wrong.
- Week = Monday to today; totals group by exact habit text, most time first, A-Z on ties, with a range line that makes the boundary explicit.
- Month = 1st to today; day counts keep a `Set` of day strings per habit, so daylight saving cannot affect them. A day counts even without `minutes`: days measure how often, minutes how long.
- Both summaries are computed at render time and never stored, and both cards share the same CSS via selector lists.
- Dark is the default (no `prefers-color-scheme`); the choice sticks. Theming is token-only, so new components need no theme work. `color-scheme` is set per theme or the native date picker stays light.
- All copy sits in `TRANSLATIONS`; English is canonical and the fallback, Spanish mirrors it key for key, and dates follow the chosen language. Spanish wording: "racha" (not serie), "Agregar" (not Añadir), title "Rastreador de Hábitos".
- Reskinned to the Figma mockups: sampled the real fills, strokes, radii and font sizes from the file rather than inventing a palette. The earlier cyberpunk neon look was replaced outright, not blended.
- The design is flat on purpose: zero shadows, zero glows. Depth comes from the sage tints and spacing alone.
- Lora + Inter are bundled as latin-subset variable woff2 (86 KB total) so the app still works offline; `fonts/` is the one sanctioned third-party asset here.
- Two mockup colours missed WCAG AA and were darkened within the same hue family: `#7a8176` to `#61685e`, `#865d40` to `#7d5537`. Contrast outranks pixel-fidelity.
- Display serif (Lora) is used for the title and the big streak numerals; everything else is Inter in sentence case. No uppercase tracking anywhere.
- The visible Theme / Language labels are clip-hidden but kept for screen readers; the buttons read as Light | Dark and EN | ES.

## Lessons Learned & Pitfalls to Avoid
- Never compare two days with `(later - earlier) / 86400000`: on DST days a day is 23 or 25 hours long. Step a local `Date` with `setDate(+1)` and compare date strings instead.
- Month boundaries come from `new Date(year, month, 1)`, never from subtracting days: on the 5th, `shift(-5)` lands in the previous month. Likewise yesterday is not always in the current week.
- Filter out future-dated entries when scanning history, or they create fake streaks. Week totals skip entries without `minutes` rather than counting zero; day counts skip nothing.
- `[data-theme='dark']` and `:root` have equal specificity, so the dark block must come after `:root`. Docs can drift from code: check the real key in `app.js` before trusting `AGENTS.md`.
- Setting `textContent` on a label deletes nested `<span>`s, so `(required)` / `(optional)` each need their own `data-i18n`.
- Anything added to the UI needs a key in BOTH languages or the user sees `undefined`. The `habitRequired` validation message is easiest to forget.
- `localeCompare` breaks ties case-insensitively (`workout` before `Workout`) — intended. Habit names are free text, so name variants split into separate rows until a picker exists.
- Never wrap a `box-shadow` token inside `drop-shadow()`; the lists are incompatible so the filter is silently dropped.
- A `<link rel="preload" as="font" crossorigin>` is rejected by Chrome on `file://` (CORS is unsupported for that scheme) and floods the console. Local font preloads must omit `crossorigin`.
- Confirm a downloaded asset really is what it claims by checking `file` output or its magic bytes, not just the HTTP status.
- A `white-space: nowrap` label keeps side-by-side numerals aligned at 320px.
- Testing layout on macOS: headless Chrome clamps `--window-size` to 500px, so a "390px" shot is a 500px layout cropped. Use a fixed-width `<iframe>`. All `file://` pages share one localStorage bucket, so test one variant at a time.

## Next Steps
- Delete / edit existing log entries.
- Per-habit streaks and best streaks.
- A habit picker to stop one habit being split across name variants.
- Five cards is a tall page; consider one Week/Month switch if it bothers you on mobile.