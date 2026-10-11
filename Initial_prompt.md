## Role
Act as a senior front-end developer who writes simple, clean, and easy-to-understand code for someone who is learning to program.

## Context
I want to build "Habit Tracker" from scratch—a lightweight web app to log my daily habits and stay motivated by tracking my consecutive day streaks. This is the initial MVP and must remain very simple. The project will grow incrementally, so right now I only need a clean, solid foundation that works out of the box.

## Task
Build the web app with the following features:
1. A form to log a completed habit with:
   - Date (defaults to today, but editable to allow logging past days)
   - Habit (text, required; e.g., "Read 20 mins", "Workout", "Drink 2L water")
   - Category or short note (text, optional; e.g., "Health", "Chapter 4", "No sugar")
2. The current streak displayed prominently in large text with a 🔥 emoji (calculated based on days with at least one logged habit).
3. A list of completed logs, sorted from newest to oldest.
4. Data persistence using localStorage so logs are preserved across page refreshes.

## Constraints and Rules
Streak Logic:
- A day counts if it has at least one logged habit.
- The streak represents consecutive days of activity ending today.
- If no habit has been logged yet today, but there was activity yesterday, the streak remains active (it does not break until today ends without activity).
- Logging an entry for today immediately counts toward the active streak.
- Always use the user's local date (`YYYY-MM-DD` in local time), never UTC, to prevent timezone mismatch bugs around midnight.

Technical Requirements:
- Vanilla HTML, CSS, and JavaScript—no frameworks, no external libraries, and no build steps.
- Exactly three files: `index.html`, `styles.css`, and `app.js`.
- Must run by double-clicking `index.html` directly in any modern browser, without needing a local server or installation.
- Do not add features, dependencies, or external icons/fonts not explicitly mentioned here.
- Clean, modern, responsive design (mobile-first) with good contrast and spacing.
- All interface copy and labels must be in English.

## Output Format
1. Create the three files directly in the project directory.
2. Once complete, reply with:
   - A 3–4 line summary of what you implemented.
   - Clear steps to test and verify the app in the browser.
   - Any design or implementation decisions you made independently that I should review.