# MEMORY.md — Habit Tracker
Project memory across sessions. Maximum ~50 lines: summarize or prune anything that no longer adds value.

## Current State
- v8 is the full rebuild to the five Figma screens (Today, Habit detail, Progress, New habit, Celebration). Everything on disk, uncommitted; `e0fb4fa` is still HEAD.
- Three screens/tabs: **Today** (progress ring, week strip, habit cards), **Progress** (Week/Month/Year chart, two metrics, per-habit breakdown, anchor note), **You** (theme + language, completed-logs History). Habit detail and New habit are full-screen views, not tabs.
- Habits are real records now: create, edit fields, and delete. Completion is a log with an optional `habitId`.
- Storage: `habitTracker.logs` (completions, key unchanged), `habitTracker.habits` (NEW, user-approved), `habitTracker.settings` (theme + language). No build step, no network; fonts bundled in `fonts/`.

## Decisions (and Rationale)
- The user asked for the full five-screen rebuild and said "What I have in Figma is the target", which superseded the earlier reskin-only scope and authorised the schema addition.
- Habits live in their OWN key so adding a habit can never touch logs. `habitId` on a log is optional: a legacy log (name only) is matched to a habit by name, so old data keeps working and is never rewritten. Legacy logs count for streaks + History but are excluded from the Insights ratios.
- Per-habit streak reuses the global rules over that habit's own days. Yesterday-only activity keeps a streak alive (today may simply not be done yet).
- Insights counts **distinct habits per block**, not raw entries, so all three ranges share one unit and the percentage is always habits ÷ (habits × blocks that have STARTED). Week = 7 day bars, Month = one bar per week of the month, Year = one per month. A week/month/year still in progress is compared against the same number of past blocks.
- The breakdown rows and the anchor sentence are built from the SAME rows, so the ratio on screen and the sentence under it can never disagree.
- The change pill is hidden when the previous block had no completions — "+80% vs last week" over a zero baseline is noise.
- Habits not due today stay visible but muted ("Rest day today") and cannot be completed from either the card or the detail screen; they are also excluded from the Today denominator.
- The celebration shows the first time all due habits are done in a visit, never on page load (don't nag). It gets one focusable Close button; Escape also closes it.
- Two mockup colours missed WCAG AA and were darkened within the same hue family: `#7a8176` → `#61685e`, `#865d40` → `#7d5537`. Contrast outranks pixel-fidelity.
- Icons are an inline SVG sprite (`<symbol>` + `<use>`); dynamic icons use `createElementNS`, never `innerHTML`.
- Overlines ARE tracked uppercase (Inter 11px SemiBold, 1.5px). This corrects the old "no uppercase tracking anywhere" note.

## Lessons Learned & Pitfalls to Avoid
- Reload with `ignoreCache: true` after editing `app.js`: a plain reload reuses the cached `file://` script and you will "verify" the previous build.
- Never compare days with `(later - earlier) / 86400000` (DST days are 23/25h). Step a local `Date` with `setDate(+1)` and compare date strings. Month boundaries come from `new Date(y, m, 1)`.
- A click listener on a card AND on a control inside it means the control's tap also opens the card. Make the tappable area a real `<button>` sibling of the control instead — that fixes the bubbling bug and keyboard access at once.
- Give every colour a token: `[data-theme='dark']` and `:root` tie on specificity, so the dark block must come after `:root`.
- `textContent` on a label deletes nested spans; anything new in the UI needs a key in BOTH languages or the user sees `undefined`.
- Endless weekday lists ("Mon, Tue, Wed, Thu, Fri") overflow: collapse a run to "Mon–Fri" and anything else to "N days a week".
- 7 weekday circles at a fixed 40px overflow below ~370px. `flex: 1 1 0; max-width: 40px` shrinks them at 320px and keeps 40px on wider screens.
- Hidden flex containers still need `[hidden] { display: none !important }`.
- `file://` quirks: all pages share one localStorage bucket; `<link rel=preload as=font crossorigin>` is rejected; an `<iframe>` is cross-origin for inspection (but can be screenshotted).
- Headless Chrome clamps the window to 500px. To test 320px, cap `.app`/`.overlay-screen` to `max-width: 320px` and compare each element's right edge to the column's own right edge.

## Next Steps
- Delete / edit individual log entries (only habits can be deleted today).
- A celebration/heat-map history for a habit's own detail view.
- Commit and push once the user has reviewed the rebuild.
