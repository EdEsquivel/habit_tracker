/**
 * Habit Tracker
 * ------------------------------------------------------------------
 * A small app that keeps your habits and the days you completed them in
 * the browser (localStorage), then shows your rhythm: today's progress,
 * streaks, and a weekly/monthly/yearly picture.
 *
 * There is no server and no build step: index.html opens straight from
 * disk and everything is drawn from the saved data each time.
 *
 * Data model
 * ----------
 * A "habit" is something you want to do again and again:
 *   {
 *     id: 'h-abc123',            // unique id
 *     name: 'Mindful walk',      // what you call it
 *     icon: 'walk',              // key from the ICONS list
 *     accent: 'sage' | 'warm',   // which symbol colour the card uses
 *     frequency: 'daily' | 'specific',
 *     weekdays: [1, 2, 3, 4, 5], // 0 = Sunday ... 6 = Saturday
 *     goalMinutes: 20,           // 0 when no goal was set
 *     reminderEnabled: false,
 *     reminderTime: '21:00',
 *     createdAt: 1699999999999
 *   }
 *
 * A "log" is one completion, on one day:
 *   {
 *     id: 'abc123',              // unique id
 *     createdAt: 1699999999999,  // sorting tie-break
 *     date: '2026-10-02',        // the DAY, in local time
 *     habit: 'Mindful walk',     // the name, kept for older saves
 *     habitId: 'h-abc123',       // which habit this belongs to (optional)
 *     note: 'Chapter 4',         // optional text
 *     minutes: 25                // optional number
 *   }
 *
 * Logs saved before this version have no `habitId`. They still count
 * towards streaks and appear in History; they are matched to a habit by
 * name. Nothing in storage is ever rewritten.
 */

/* ========================= 1. Constants & state ========================= */

// Habits live in their OWN key, so adding them could never touch old logs.
const HABITS_KEY = 'habitTracker.habits';

// Key used to store our completion logs inside localStorage.
const STORAGE_KEY = 'habitTracker.logs';

// Settings live in their OWN key so changing them can never touch the logs.
const SETTINGS_KEY = 'habitTracker.settings';

// Dark is the starting look; English is the canonical language.
const DEFAULT_SETTINGS = { theme: 'dark', language: 'en' };

// The icons offered when creating a habit, in the order they are shown.
const ICONS = [
  'flower',
  'droplets',
  'footprints',
  'walk',
  'book',
  'notebook',
  'sprout',
  'sun',
  'flame',
  'clock',
];

// The habits you can complete, and the days you completed them.
let habits = loadHabits();
let logs = loadLogs();

// The chosen theme ('dark' | 'light') and language ('en' | 'es').
let settings = loadSettings();

// Which screen is open, and which chart range is chosen.
let activeView = 'today';
let activeRange = 'week';
let openHabitId = null;

// The habit being built on the "New habit" screen.
let draftHabit = createEmptyDraft();

// The celebration only appears once per visit for a given day.
let celebrationShownFor = null;

/* ========================= 2. Date helpers =========================
 * Always build dates from the user's LOCAL clock.
 * `toISOString()` is NOT used on purpose: it converts to UTC, which makes
 * the day "jump" for people whose timezone is ahead or behind GMT.
 */

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-11
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // -> 'YYYY-MM-DD'
}

function getTodayString() {
  return toLocalDateString(new Date());
}

function getYesterdayString() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1); // handles month/year rollovers
  return toLocalDateString(yesterday);
}

// Turns a 'YYYY-MM-DD' string back into a local Date for pretty printing.
function parseLocalDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Dates follow the chosen language, so Spanish shows "lun, 5 oct 2026".
function formatDateForDisplay(dateString, options) {
  return parseLocalDateString(dateString).toLocaleDateString(
    settings.language,
    options || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
  );
}

// Dates in the mockups read as a full weekday and month, in capitals.
function formatEyebrowDate(dateString) {
  return parseLocalDateString(dateString).toLocaleDateString(settings.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function addDays(dateString, amount) {
  const date = parseLocalDateString(dateString);
  date.setDate(date.getDate() + amount);
  return toLocalDateString(date);
}

/* ---- Weekday names ----------------------------------------------------
 * 0 = Sunday ... 6 = Saturday, the same numbering Date.getDay() uses.
 * 1 January 2024 was a Monday, so it makes a reliable reference week and
 * the names come out translated without hard-coding them.
 */

function referenceDateForWeekday(weekday) {
  const offset = (weekday + 6) % 7; // Monday first
  return new Date(2024, 0, 1 + offset);
}

function weekdayName(weekday, style) {
  return referenceDateForWeekday(weekday).toLocaleDateString(settings.language, {
    weekday: style || 'long',
  });
}

/**
 * A short way to name a set of weekdays.
 * Days that run together collapse to a range ("Mon–Fri") and anything else
 * becomes a count, so a habit card never grows a line of seven day names.
 */
function formatWeekdays(days) {
  if (days.length === 0) return t('specificDays');
  if (days.length === 7) return t('everyDayShort');

  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first

  if (sorted.length === 1) return weekdayName(sorted[0], 'short');

  const isRun = sorted.every(
    (day, index) => index === 0 || (sorted[index - 1] + 1) % 7 === day % 7
  );
  if (isRun) {
    return `${weekdayName(sorted[0], 'short')}–${weekdayName(sorted[sorted.length - 1], 'short')}`;
  }
  return fill(t('daysAWeek'), { count: sorted.length });
}

/* ========================= 3. Storage helpers ========================= */

function createEmptyDraft() {
  return {
    name: '',
    icon: 'walk',
    accent: 'sage',
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5], // Monday to Friday, the mockup's default
    goalMinutes: 10,
    reminderEnabled: false,
    reminderTime: '21:00',
  };
}

function loadHabits() {
  try {
    const saved = window.localStorage.getItem(HABITS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    // Keep only entries that look valid, so bad data can never break the app.
    return parsed.filter(
      (habit) => habit && typeof habit.id === 'string' && typeof habit.name === 'string'
    );
  } catch (error) {
    console.warn('Could not read saved habits:', error);
    return [];
  }
}

function saveHabits() {
  try {
    window.localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
    return true;
  } catch (error) {
    console.warn('Could not save habits:', error);
    return false;
  }
}

function loadLogs() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (log) => log && typeof log.habit === 'string' && typeof log.date === 'string'
    );
  } catch (error) {
    console.warn('Could not read saved logs:', error);
    return [];
  }
}

function saveLogs() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    return true;
  } catch (error) {
    console.warn('Could not save logs:', error);
    return false;
  }
}

// Unknown values fall back to the defaults, so a bad save can never break the app.
function loadSettings() {
  try {
    const saved = window.localStorage.getItem(SETTINGS_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }; // e.g. "null"

    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      language: parsed.language === 'es' ? 'es' : 'en',
    };
  } catch (error) {
    console.warn('Could not read saved settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // Private-mode browsers: the app still works for this visit.
    console.warn('Could not save settings:', error);
  }
}

/* ========================= 4. Habits and completions ========================= */

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findHabit(habitId) {
  return habits.find((habit) => habit.id === habitId) || null;
}

function isDueOn(habit, dateString) {
  if (habit.frequency !== 'specific') return true; // "every day" is always due
  const weekday = parseLocalDateString(dateString).getDay();
  return habit.weekdays.includes(weekday);
}

// Logs saved before habits existed only carry a name, so fall back to it.
function logMatchesHabit(log, habit) {
  if (log.habitId) return log.habitId === habit.id;
  return log.habit === habit.name;
}

function isHabitCompleteOn(habit, dateString) {
  return logs.some((log) => log.date === dateString && logMatchesHabit(log, habit));
}

function completedHabitsOn(dateString) {
  return habits.filter((habit) => isHabitCompleteOn(habit, dateString));
}

// Habits that are due today; "specific days" habits rest on their off days.
function habitsDueOn(dateString) {
  return habits.filter((habit) => isDueOn(habit, dateString));
}

function completionDatesFor(habit) {
  return new Set(logs.filter((log) => logMatchesHabit(log, habit)).map((log) => log.date));
}

function totalCompletionsFor(habit) {
  return logs.filter((log) => logMatchesHabit(log, habit)).length;
}

/* ========================= 5. Streak logic =========================
 * A day is "active" when it has at least one completion.
 */

/**
 * Counts consecutive active days ending today.
 *
 * Rules:
 *  - If today is active, the streak is measured backwards from today.
 *  - If today is not active yet, the streak still counts from yesterday:
 *    the day is not over, so it is not broken yet.
 *  - Otherwise the streak is 0.
 */
function calculateStreakFromDays(activeDays) {
  const today = getTodayString();
  const yesterday = getYesterdayString();

  let cursor;
  if (activeDays.has(today)) {
    cursor = parseLocalDateString(today);
  } else if (activeDays.has(yesterday)) {
    cursor = parseLocalDateString(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  while (activeDays.has(toLocalDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// True when `laterDateString` is the calendar day right after `earlierDateString`.
// We step a local Date forward instead of counting milliseconds: on days with a
// DST change a "day" is 23 or 25 hours long, which breaks millisecond maths.
function isNextDay(earlierDateString, laterDateString) {
  const nextDay = parseLocalDateString(earlierDateString);
  nextDay.setDate(nextDay.getDate() + 1);
  return toLocalDateString(nextDay) === laterDateString;
}

/**
 * The longest run of consecutive active days ever recorded.
 * Days in the future are ignored: they cannot be part of a real streak.
 */
function calculateBestStreakFromDays(activeDays) {
  const today = getTodayString();
  const sortedDays = [...activeDays].filter((date) => date <= today).sort();

  let bestRun = 0;
  let currentRun = 0;
  let previousDay = null;

  for (const day of sortedDays) {
    if (previousDay !== null && isNextDay(previousDay, day)) {
      currentRun += 1;
    } else {
      currentRun = 1; // first day, or a gap: a new streak starts here
    }
    bestRun = Math.max(bestRun, currentRun);
    previousDay = day;
  }

  return bestRun;
}

function allActiveDays() {
  return new Set(logs.map((log) => log.date));
}

/* ========================= 6. Aggregations ========================= */

// Monday-first week containing `date`.
function getStartOfWeek(date) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

/**
 * The days of the current week (Monday first), as { date, weekday }.
 * The mockup shows the whole week, including the days still to come.
 */
function getCurrentWeekDays() {
  const monday = getStartOfWeek(new Date());
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    days.push({ date: toLocalDateString(date), weekday: date.getDay() });
  }
  return days;
}

// The seven days ending today, newest last. Used on the habit screen.
function getRollingWeekDays() {
  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const dateString = addDays(getTodayString(), -index);
    days.push({ date: dateString, weekday: parseLocalDateString(dateString).getDay() });
  }
  return days;
}

/**
 * The blocks of time the Insights chart is built from.
 * Week -> 7 days, Month -> the weeks of this month, Year -> 12 months.
 * Each block is { start, end, label } and comparisons use date strings,
 * which sort like dates, so no milliseconds are involved.
 */
function buildPeriods(range) {
  const today = new Date();

  if (range === 'week') {
    return getCurrentWeekDays().map((day) => ({
      start: day.date,
      end: day.date,
      label: weekdayName(day.weekday, 'narrow'),
      today: true,
    }));
  }

  if (range === 'month') {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const periods = [];
    const cursor = getStartOfWeek(firstOfMonth);

    while (cursor <= lastOfMonth) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // Weeks are trimmed to the month, so every block stays inside it.
      const start = cursor < firstOfMonth ? firstOfMonth : cursor;
      const end = weekEnd > lastOfMonth ? lastOfMonth : weekEnd;

      periods.push({
        start: toLocalDateString(start),
        end: toLocalDateString(end),
        label: String(start.getDate()),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return periods;
  }

  // Year: one block per month.
  return Array.from({ length: 12 }, (unused, monthIndex) => ({
    start: toLocalDateString(new Date(today.getFullYear(), monthIndex, 1)),
    end: toLocalDateString(new Date(today.getFullYear(), monthIndex + 1, 0)),
    label: new Date(today.getFullYear(), monthIndex, 1).toLocaleDateString(settings.language, {
      month: 'narrow',
    }),
  }));
}

// Ties a saved log back to one of today's habits, so an old entry can never
// be counted as a habit of its own. Returns null when nothing matches.
function habitForLog(log) {
  if (log.habitId) return habits.find((habit) => habit.id === log.habitId) || null;
  return habits.find((habit) => habit.name === log.habit) || null;
}

/**
 * How many distinct habits were completed at least once inside a block.
 * Counting habits rather than entries is what makes the three ranges
 * comparable: a block is a day, a week or a month, so the possible total is
 * always habits x blocks. It also matches the marks drawn in the breakdown.
 */
function completedHabitsBetween(start, end) {
  const seen = new Set();
  for (const log of logs) {
    if (log.date < start || log.date > end) continue;
    const habit = habitForLog(log);
    if (habit) seen.add(habit.id);
  }
  return seen.size;
}

/**
 * The numbers behind the Insights chart.
 * Blocks that have not started yet are left out of the total, so a week in
 * progress is not punished for the days still to come.
 */
function buildInsights(range) {
  const today = getTodayString();
  const periods = buildPeriods(range).map((period) => {
    const completed = completedHabitsBetween(period.start, period.end);
    return {
      ...period,
      completed: completed,
      started: period.start <= today,
      isToday: period.start <= today && today <= period.end,
    };
  });

  const startedPeriods = periods.filter((period) => period.started).length;
  const done = periods.reduce((sum, period) => sum + period.completed, 0);
  const possible = habits.length * startedPeriods;

  return {
    periods: periods,
    done: done,
    possible: possible,
    percent: possible > 0 ? Math.round((done / possible) * 100) : 0,
    rangeStart: periods[0] ? periods[0].start : today,
    rangeEnd: periods[periods.length - 1] ? periods[periods.length - 1].end : today,
    change: buildChange(range, startedPeriods, done),
  };
}

/**
 * Compares this range with the one before it.
 * We look at the same number of blocks in each, so a range that is only
 * part-way through is compared fairly. If nothing was recorded in the earlier
 * range there is nothing to compare against, so the badge stays hidden.
 */
function buildChange(range, blocksSoFar, doneNow) {
  const possible = habits.length * blocksSoFar;
  if (possible === 0) return null;

  const before = buildPastPeriods(range, blocksSoFar).reduce(
    (sum, period) => sum + completedHabitsBetween(period.start, period.end),
    0
  );
  if (before === 0) return null;

  const nowPercent = Math.round((doneNow / possible) * 100);
  const beforePercent = Math.round((before / possible) * 100);
  const difference = nowPercent - beforePercent;

  if (difference === 0) return null;
  return { difference: difference, range: range };
}

// The equivalent blocks one range earlier (last week / month / year).
function buildPastPeriods(range, count) {
  const today = new Date();

  if (range === 'week') {
    const monday = getStartOfWeek(today);
    monday.setDate(monday.getDate() - 7);
    return Array.from({ length: count }, (unused, index) => {
      const start = new Date(monday);
      start.setDate(start.getDate() + index);
      const day = toLocalDateString(start);
      return { start: day, end: day };
    });
  }

  if (range === 'month') {
    const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const periods = [];
    const cursor = getStartOfWeek(firstOfLastMonth);

    while (cursor <= lastOfLastMonth && periods.length < count) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const start = cursor < firstOfLastMonth ? firstOfLastMonth : cursor;
      const end = weekEnd > lastOfLastMonth ? lastOfLastMonth : weekEnd;
      periods.push({ start: toLocalDateString(start), end: toLocalDateString(end) });
      cursor.setDate(cursor.getDate() + 7);
    }
    return periods;
  }

  return Array.from({ length: count }, (unused, monthIndex) => ({
    start: toLocalDateString(new Date(today.getFullYear() - 1, monthIndex, 1)),
    end: toLocalDateString(new Date(today.getFullYear() - 1, monthIndex + 1, 0)),
  }));
}

// Newest day first; for the same day, the most recently added log first.
function sortLogsNewestFirst(allLogs) {
  return [...allLogs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/**
 * One entry per habit: which blocks of the range it was completed in.
 * The breakdown rows and the reflection note both read from this, so the
 * ratio on screen and the sentence under it can never disagree.
 */
function buildHabitRows(periods) {
  return habits
    .map((habit) => {
      const marks = periods.map((period) => ({
        done: isHabitCompleteOnRange(habit, period.start, period.end),
      }));
      return { habit: habit, marks: marks, doneCount: marks.filter((mark) => mark.done).length };
    })
    .sort((a, b) => b.doneCount - a.doneCount || a.habit.name.localeCompare(b.habit.name));
}

/* ========================= 7. Translations =========================
 * Every user-facing string lives here. English is the canonical version;
 * Spanish mirrors it key for key. `index.html` marks its own copy with
 * data-i18n / data-i18n-placeholder, and the {placeholders} below are
 * filled in by fill().
 */

const TRANSLATIONS = {
  en: {
    documentTitle: 'Habit Tracker',
    avatarInitial: 'H',

    tabToday: 'Today',
    tabInsights: 'Insights',
    tabYou: 'You',

    // Today
    todayTitle: 'Your daily rhythm.',
    todayProgressNote: 'Small steps, a little more you',
    progressStart: 'A gentle start.',
    progressSome: 'A good beginning.',
    progressAll: 'Today, gently done.',
    habitsCompleteCount: '{done} of {total} habits complete',
    yourHabits: 'Your habits',
    newHabit: 'New habit',
    noHabitsYet: 'No habits yet.',
    noHabitsHint: 'Create your first habit and it will show up here every day.',
    streakDaysOne: '1 day',
    streakDaysMany: '{days} days',
    everyDayShort: 'Every day',
    daysAWeek: '{count} days a week',

    // Insights
    insightsEyebrow: 'The bigger picture',
    insightsTitle: 'Progress, not perfect.',
    insightsLede: 'Every small return to yourself counts.',
    rangeWeek: 'Week',
    rangeMonth: 'Month',
    rangeYear: 'Year',
    longestStreak: 'Longest streak',
    allHabitsComplete: 'All habits complete',
    percentCaption: '{done} of {total} habits completed',
    changeVs: '{percent}% vs last {range}',
    weekWins: 'A week of small wins',
    ratioFormat: '{done}/{total}',
    anchorNote: '{habit} is your anchor — {done} of {total} {unit}.',
    unitDays: 'days',
    unitWeeks: 'weeks',
    unitMonths: 'months',
    noInsightsYet: 'Create a habit and your progress will appear here.',

    // You
    youEyebrow: 'Your space',
    youTitle: 'A record of you.',
    youLede: 'Every entry stays in this browser, on this device.',
    themeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    languageLabel: 'Language',
    historyTitle: 'Completed logs',
    noLogsYet: 'Nothing logged yet. Your completed habits will appear here.',
    storageWarning:
      'Storage is not available in this browser, so nothing will be saved when you close the page.',
    logSingular: '1 log',
    logPlural: '{count} logs',
    today: 'Today',

    // Habit detail
    yourHabit: 'Your habit',
    dayStreak: 'day streak',
    timesCompleted: 'times completed',
    recentRhythm: 'Your recent rhythm',
    dailyGoal: 'Daily goal',
    reminder: 'Reminder',
    noGoal: 'No goal',
    reminderOff: 'Off',
    markTodayComplete: 'Mark today complete',
    completedToday: 'Completed today',
    habitRestDay: 'Rest day today',
    minutesGoal: '{minutes} min',
    deleteHabitAria: 'Delete this habit',
    deleteConfirm: 'Delete "{habit}"? Your completed logs stay in your history.',
    deleteBlocked: 'Keep at least one habit.',

    // New habit
    newHabitTitle: 'New habit',
    newHabitHeading: 'Make room for you.',
    newHabitLede: 'Start small. Build a rhythm that feels good.',
    whatToDo: 'What would you like to do?',
    habitNamePlaceholder: 'Evening stretch',
    chooseIconAria: 'Use the {icon} icon',
    iconFlower: 'flower',
    iconDroplets: 'water drops',
    iconFootprints: 'footsteps',
    iconWalk: 'walking figure',
    iconBook: 'open book',
    iconNotebook: 'notebook',
    iconSprout: 'sprout',
    iconSun: 'sun',
    iconFlame: 'flame',
    iconClock: 'clock',
    howOften: 'How often?',
    everyDay: 'Every day',
    specificDays: 'Specific days',
    setGoal: 'Set a gentle goal',
    minutesUnit: 'minutes',
    littleReminder: 'A little reminder',
    yourLocalTime: 'Your local time',
    createHabit: 'Create habit',
    previewDaily: '{minutes} minutes, every day.',
    previewNoGoalDaily: 'Every day, at your own pace.',
    previewSpecific: '{minutes} minutes, {days}.',
    previewNoGoalSpecific: '{days}.',
    errorHabitRequired: 'Please write the habit you want to build.',
    errorNoDays: 'Pick at least one day.',

    // Celebration
    celebrationEyebrow: 'You showed up for you',
    celebrationTitle: 'A little more present.',
    celebrationLede: 'All {count} habits, a little care for yourself.',
    todayGentle: 'Today, gently done.',
    backToToday: 'Back to today',
    milestoneTitle: '{days} days of {habit}',
    milestoneNote: 'Your longest run so far. Keep going.',
  },

  es: {
    documentTitle: 'Rastreador de Hábitos',
    avatarInitial: 'R',

    tabToday: 'Hoy',
    tabInsights: 'Progreso',
    tabYou: 'Tú',

    // Today
    todayTitle: 'Tu ritmo diario.',
    todayProgressNote: 'Pasos pequeños, un poco más de ti',
    progressStart: 'Un comienzo suave.',
    progressSome: 'Un buen comienzo.',
    progressAll: 'Hoy, hecho con calma.',
    habitsCompleteCount: '{done} de {total} hábitos completados',
    yourHabits: 'Tus hábitos',
    newHabit: 'Nuevo hábito',
    noHabitsYet: 'Aún no hay hábitos.',
    noHabitsHint: 'Crea tu primer hábito y aparecerá aquí cada día.',
    streakDaysOne: '1 día',
    streakDaysMany: '{days} días',
    everyDayShort: 'Cada día',
    daysAWeek: '{count} días a la semana',

    // Insights
    insightsEyebrow: 'La imagen completa',
    insightsTitle: 'Progreso, no perfección.',
    insightsLede: 'Cada pequeño regreso a ti cuenta.',
    rangeWeek: 'Semana',
    rangeMonth: 'Mes',
    rangeYear: 'Año',
    longestStreak: 'Racha más larga',
    allHabitsComplete: 'Todos los hábitos',
    percentCaption: '{done} de {total} hábitos completados',
    changeVs: '{percent}% vs la {range} pasada',
    weekWins: 'Una semana de pequeños logros',
    ratioFormat: '{done}/{total}',
    anchorNote: '{habit} es tu ancla: {done} de {total} {unit}.',
    unitDays: 'días',
    unitWeeks: 'semanas',
    unitMonths: 'meses',
    noInsightsYet: 'Crea un hábito y tu progreso aparecerá aquí.',

    // You
    youEyebrow: 'Tu espacio',
    youTitle: 'Un registro de ti.',
    youLede: 'Cada registro se queda en este navegador, en este dispositivo.',
    themeLabel: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    languageLabel: 'Idioma',
    historyTitle: 'Registros completados',
    noLogsYet: 'Aún no hay registros. Tus hábitos completados aparecerán aquí.',
    storageWarning:
      'El almacenamiento no está disponible en este navegador, así que no se guardará nada al cerrar la página.',
    logSingular: '1 registro',
    logPlural: '{count} registros',
    today: 'Hoy',

    // Habit detail
    yourHabit: 'Tu hábito',
    dayStreak: 'días seguidos',
    timesCompleted: 'veces completado',
    recentRhythm: 'Tu ritmo reciente',
    dailyGoal: 'Meta diaria',
    reminder: 'Recordatorio',
    noGoal: 'Sin meta',
    reminderOff: 'Desactivado',
    markTodayComplete: 'Marcar hoy como hecho',
    completedToday: 'Completado hoy',
    habitRestDay: 'Hoy descansa',
    minutesGoal: '{minutes} min',
    deleteHabitAria: 'Eliminar este hábito',
    deleteConfirm: '¿Eliminar "{habit}"? Tus registros completados se quedan en tu historial.',
    deleteBlocked: 'Conserva al menos un hábito.',

    // New habit
    newHabitTitle: 'Nuevo hábito',
    newHabitHeading: 'Hazte un espacio.',
    newHabitLede: 'Empieza pequeño. Crea un ritmo que se sienta bien.',
    whatToDo: '¿Qué te gustaría hacer?',
    habitNamePlaceholder: 'Estiramiento nocturno',
    chooseIconAria: 'Usar el icono de {icon}',
    iconFlower: 'flor',
    iconDroplets: 'gotas de agua',
    iconFootprints: 'pisadas',
    iconWalk: 'figura caminando',
    iconBook: 'libro abierto',
    iconNotebook: 'cuaderno',
    iconSprout: 'brote',
    iconSun: 'sol',
    iconFlame: 'llama',
    iconClock: 'reloj',
    howOften: '¿Cada cuánto?',
    everyDay: 'Cada día',
    specificDays: 'Días específicos',
    setGoal: 'Define una meta amable',
    minutesUnit: 'minutos',
    littleReminder: 'Un pequeño recordatorio',
    yourLocalTime: 'Tu hora local',
    createHabit: 'Crear hábito',
    previewDaily: '{minutes} minutos, cada día.',
    previewNoGoalDaily: 'Cada día, a tu propio ritmo.',
    previewSpecific: '{minutes} minutos, {days}.',
    previewNoGoalSpecific: '{days}.',
    errorHabitRequired: 'Por favor, escribe el hábito que quieres crear.',
    errorNoDays: 'Elige al menos un día.',

    // Celebration
    celebrationEyebrow: 'Estuviste presente para ti',
    celebrationTitle: 'Un poco más presente.',
    celebrationLede: 'Los {count} hábitos, un poco de cuidado para ti.',
    todayGentle: 'Hoy, hecho con calma.',
    backToToday: 'Volver a hoy',
    milestoneTitle: '{days} días de {habit}',
    milestoneNote: 'Tu racha más larga hasta ahora. Sigue así.',
  },
};

// Replaces {name} placeholders. `{days: 3}` fills in a named value.
function fill(template, values) {
  let result = template;
  for (const [name, value] of Object.entries(values)) {
    result = result.replace(`{${name}}`, value);
  }
  return result;
}

// Shorthand for a single string in the active language.
function t(key) {
  return TRANSLATIONS[settings.language][key];
}

/* ========================= 8. DOM references ========================= */

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

const todayEyebrow = document.getElementById('today-eyebrow');
const avatar = document.getElementById('avatar');
const todayWeek = document.getElementById('today-week');
const todayProgress = document.getElementById('today-progress');
const todayRingFill = document.getElementById('today-ring-fill');
const todayRingValue = document.getElementById('today-ring-value');
const todayProgressTitle = document.getElementById('today-progress-title');
const todayProgressCount = document.getElementById('today-progress-count');
const todayHabits = document.getElementById('today-habits');
const todayEmpty = document.getElementById('today-empty');
const newHabitButton = document.getElementById('new-habit-button');

const rangeSwitch = document.getElementById('range-switch');
const chartCard = document.querySelector('.chart-card');
const chartRange = document.getElementById('chart-range');
const chartPercent = document.getElementById('chart-percent');
const chartCaption = document.getElementById('chart-caption');
const chartChange = document.getElementById('chart-change');
const chartChangeText = document.getElementById('chart-change-text');
const chartBars = document.getElementById('chart-bars');
const metricRow = document.querySelector('.metric-row');
const insightLongest = document.getElementById('insight-longest');
const insightPerfect = document.getElementById('insight-perfect');
const insightHabits = document.getElementById('insight-habits');
const insightEmpty = document.getElementById('insight-empty');
const insightReflection = document.getElementById('insight-reflection');
const breakdown = document.querySelector('.breakdown');
const reflection = document.querySelector('.reflection');

const historyCount = document.getElementById('history-count');
const logList = document.getElementById('log-list');
const emptyState = document.getElementById('empty-state');
const storageWarning = document.getElementById('storage-warning');

const habitBack = document.getElementById('habit-back');
const habitDelete = document.getElementById('habit-delete');
const habitEyebrow = document.getElementById('habit-eyebrow');
const habitTitle = document.getElementById('habit-title');
const habitLede = document.getElementById('habit-lede');
const habitHeroIcon = document.getElementById('habit-hero-icon');
const habitHeroText = document.getElementById('habit-hero-text');
const habitStreak = document.getElementById('habit-streak');
const habitTotal = document.getElementById('habit-total');
const habitWeekRange = document.getElementById('habit-week-range');
const habitWeek = document.getElementById('habit-week');
const habitGoal = document.getElementById('habit-goal');
const habitReminder = document.getElementById('habit-reminder');
const habitComplete = document.getElementById('habit-complete');
const habitCompleteText = document.getElementById('habit-complete-text');

const habitForm = document.getElementById('habit-form');
const newBack = document.getElementById('new-back');
const newClose = document.getElementById('new-close');
const pickedIcon = document.getElementById('picked-icon');
const habitInput = document.getElementById('habit-input');
const iconPicker = document.getElementById('icon-picker');
const frequencyGroup = document.querySelector('.frequency');
const weekdayPicker = document.getElementById('weekday-picker');
const goalMinus = document.getElementById('goal-minus');
const goalValue = document.getElementById('goal-value');
const goalPlus = document.getElementById('goal-plus');
const reminderToggle = document.getElementById('reminder-toggle');
const reminderInput = document.getElementById('reminder-input');
const previewText = document.getElementById('preview-text');
const formError = document.getElementById('form-error');

const celebration = document.getElementById('celebration');
const celebrationDate = document.getElementById('celebration-date');
const celebrationClose = document.getElementById('celebration-close');
const celebrationRatio = document.getElementById('celebration-ratio');
const celebrationHabits = document.getElementById('celebration-habits');
const celebrationMilestone = document.getElementById('celebration-milestone');
const milestoneTitle = document.getElementById('milestone-title');
const milestoneNote = document.getElementById('milestone-note');
const celebrationDone = document.getElementById('celebration-done');
const celebrationLede = document.getElementById('celebration-lede');

const themeButtons = document.querySelectorAll('[data-theme-option]');
const languageButtons = document.querySelectorAll('[data-language-option]');
const tabButtons = document.querySelectorAll('.tab');
const freqButtons = document.querySelectorAll('[data-frequency]');

/* ========================= 9. Small DOM helpers ========================= */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Builds <svg class="icon icon-{size}"><use href="#i-{name}"/></svg>.
// createElementNS keeps this free of innerHTML, so user text never gets parsed.
function icon(name, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon icon-${size}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Sets the <use> reference on an icon that already sits in the HTML.
function setIcon(useElement, name) {
  useElement.setAttribute('href', `#i-${name}`);
}

/* ========================= 10. Rendering: shared pieces ========================= */

// The progress ring on the Today screen. The circle is 30 units round, so the
// dash length is 2 * PI * 30, and the offset hides the part not yet done.
function renderRing(percent) {
  const circumference = 2 * Math.PI * 30;
  todayRingFill.style.strokeDasharray = String(circumference);
  todayRingFill.style.strokeDashoffset = String(circumference * (1 - percent / 100));
  todayRingValue.textContent = `${percent}%`;
}

/**
 * One row of circles for a week.
 * variant 'activity' draws the day number with a dot underneath, the way the
 * Today screen does; variant 'completion' shows a tick for days that are done.
 * `habit` is only needed by the completion variant.
 */
function renderWeekStrip(container, days, variant, habit) {
  container.textContent = '';
  container.dataset.variant = variant;
  const today = getTodayString();

  for (const day of days) {
    const column = element('div', 'week-day');
    const letter = element('span', 'week-letter', weekdayName(day.weekday, 'narrow'));

    const state = element('span', 'week-state');
    const isToday = day.date === today;

    if (variant === 'activity') {
      const active = logs.some((log) => log.date === day.date);
      state.textContent = String(parseLocalDateString(day.date).getDate());
      if (isToday) state.classList.add('is-today');
      const dot = element('span', 'week-dot');
      if (active) dot.classList.add('is-active');
      column.append(letter, state, dot);
    } else if (isToday) {
      // Today keeps its date and is drawn as an outline, so it reads as "open".
      state.textContent = String(parseLocalDateString(day.date).getDate());
      state.classList.add('is-today');
      column.append(letter, state);
    } else {
      if (habit && isHabitCompleteOn(habit, day.date)) {
        state.classList.add('is-done');
        state.appendChild(icon('check', 16));
      }
      column.append(letter, state);
    }

    container.appendChild(column);
  }
}

/* ========================= 11. Rendering: Today ========================= */

function renderToday() {
  const today = getTodayString();
  const due = habitsDueOn(today);
  const done = completedHabitsOn(today).filter((habit) => due.includes(habit));

  todayEyebrow.textContent = formatEyebrowDate(today);
  avatar.textContent = t('avatarInitial');

  renderWeekStrip(todayWeek, getCurrentWeekDays(), 'activity');

  // The progress card only says something useful once there is a habit.
  todayProgress.hidden = habits.length === 0;
  if (habits.length > 0) {
    const percent = due.length > 0 ? Math.round((done.length / due.length) * 100) : 0;
    renderRing(percent);

    if (percent === 100) {
      todayProgressTitle.textContent = t('progressAll');
    } else if (percent > 0) {
      todayProgressTitle.textContent = t('progressSome');
    } else {
      todayProgressTitle.textContent = t('progressStart');
    }
    todayProgressCount.textContent = fill(t('habitsCompleteCount'), {
      done: done.length,
      total: due.length,
    });
  }

  todayHabits.textContent = '';
  todayEmpty.hidden = habits.length > 0;

  if (habits.length === 0) {
    todayEmpty.textContent = `${t('noHabitsYet')} ${t('noHabitsHint')}`;
    return;
  }

  for (const habit of habits) {
    todayHabits.appendChild(buildHabitCard(habit, today));
  }
}

function buildHabitCard(habit, today) {
  const item = element('li', 'habit-card');
  item.dataset.accent = habit.accent;

  // The left side is one button, so the card opens on tap AND with the
  // keyboard, and the completion control next to it stays a separate target.
  const open = element('button', 'habit-open');
  open.type = 'button';
  open.setAttribute('aria-label', habit.name);

  const symbol = element('span', 'habit-symbol');
  symbol.appendChild(icon(habit.icon, 20));

  const info = element('span', 'habit-info');
  info.appendChild(element('span', 'habit-name', habit.name));

  // "10 min · Every day" — the goal and the rhythm, nothing invented.
  const rhythm = habit.frequency === 'daily' ? t('everyDayShort') : formatWeekdays(habit.weekdays);
  const metaParts = [];
  if (habit.goalMinutes > 0) metaParts.push(fill(t('minutesGoal'), { minutes: habit.goalMinutes }));
  metaParts.push(rhythm);
  info.appendChild(element('span', 'habit-meta', metaParts.join(' · ')));

  const streak = calculateStreakFromDays(completionDatesFor(habit));
  if (!isDueOn(habit, today)) {
    // Off-schedule habits stay visible, but say so instead of showing a streak.
    info.appendChild(element('span', 'habit-rest', t('habitRestDay')));
  } else if (streak > 0) {
    const streakRow = element('span', 'habit-streak');
    streakRow.appendChild(icon('flame', 11));
    streakRow.appendChild(
      element('span', null, streak === 1 ? t('streakDaysOne') : fill(t('streakDaysMany'), { days: streak }))
    );
    info.appendChild(streakRow);
  }

  open.append(symbol, info);
  open.addEventListener('click', () => openHabitView(habit.id));

  const due = isDueOn(habit, today);
  const control = element('button', 'complete-control');
  control.type = 'button';
  const complete = isHabitCompleteOn(habit, today);
  control.disabled = !due;
  control.setAttribute('aria-pressed', String(complete));
  control.setAttribute(
    'aria-label',
    !due ? t('habitRestDay') : complete ? t('completedToday') : t('markTodayComplete')
  );
  if (complete) control.appendChild(icon('check', 16));
  control.addEventListener('click', () => toggleHabitOn(habit, today));

  item.append(open, control);
  return item;
}

/* ========================= 12. Rendering: Insights ========================= */

function renderInsights() {
  for (const button of document.querySelectorAll('.range-option')) {
    const selected = button.dataset.range === activeRange;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }

  const hasHabits = habits.length > 0;
  chartCard.hidden = !hasHabits;
  metricRow.hidden = !hasHabits;
  breakdown.hidden = !hasHabits;
  insightEmpty.hidden = hasHabits;
  if (!hasHabits) {
    insightEmpty.textContent = t('noInsightsYet');
    reflection.hidden = true;
    return;
  }

  const insights = buildInsights(activeRange);

  chartRange.textContent = `${formatDateForDisplay(insights.rangeStart, {
    month: 'short',
    day: 'numeric',
  })} – ${formatDateForDisplay(insights.rangeEnd, { month: 'short', day: 'numeric' })}`.toUpperCase();

  chartPercent.textContent = `${insights.percent}%`;
  chartCaption.textContent = fill(t('percentCaption'), {
    done: insights.done,
    total: insights.possible,
  });

  if (insights.change) {
    chartChange.hidden = false;
    const sign = insights.change.difference > 0 ? '+' : '';
    chartChangeText.textContent = fill(t('changeVs'), {
      percent: `${sign}${insights.change.difference}`,
      range: t(
        insights.change.range === 'week'
          ? 'rangeWeek'
          : insights.change.range === 'month'
            ? 'rangeMonth'
            : 'rangeYear'
      ).toLowerCase(),
    });
  } else {
    chartChange.hidden = true;
  }

  renderBars(insights.periods);

  insightLongest.textContent = fill(t('streakDaysMany'), {
    days: calculateBestStreakFromDays(allActiveDays()),
  });

  // A day where every habit was completed.
  insightPerfect.textContent = fill(t('streakDaysMany'), { days: countPerfectDays() });

  const rows = buildHabitRows(insights.periods);
  renderBreakdown(rows, insights.periods.length);
  renderReflection(rows, insights.periods.length);
}

// One bar per block: the number of habits completed, against a full house.
function renderBars(periods) {
  chartBars.textContent = '';
  chartBars.style.setProperty('--bar-gap', periods.length > 8 ? '8px' : '20px');
  const max = Math.max(habits.length, 1);

  for (const period of periods) {
    const column = element('div', 'daily-bar');
    column.appendChild(element('p', 'bar-count', String(period.completed)));

    const track = element('div', 'bar-track');
    const barFill = element('div', 'bar-fill');
    barFill.style.height = `${Math.round((period.completed / max) * 100)}%`;
    if (period.isToday) barFill.classList.add('is-today');
    track.appendChild(barFill);

    column.appendChild(track);
    column.appendChild(element('p', 'bar-label', period.label));
    chartBars.appendChild(column);
  }
}

// Days where every habit that was due got completed.
function countPerfectDays() {
  const days = new Set(logs.map((log) => log.date));
  let perfect = 0;
  for (const day of days) {
    const due = habitsDueOn(day);
    if (due.length > 0 && due.every((habit) => isHabitCompleteOn(habit, day))) perfect += 1;
  }
  return perfect;
}

// One row per habit: how much of this range it was completed for.
function renderBreakdown(rows, periodCount) {
  insightHabits.textContent = '';

  for (const row of rows) {
    const item = element('li', 'rhythm-row');
    item.appendChild(element('span', 'rhythm-habit', row.habit.name));

    const marks = element('span', 'rhythm-marks');
    for (const mark of row.marks) {
      const dot = element('span', 'day-mark');
      if (mark.done) dot.classList.add('is-done');
      marks.appendChild(dot);
    }

    item.append(
      marks,
      element(
        'span',
        'rhythm-ratio',
        fill(t('ratioFormat'), { done: row.doneCount, total: periodCount })
      )
    );
    insightHabits.appendChild(item);
  }
}

function isHabitCompleteOnRange(habit, start, end) {
  return logs.some((log) => logMatchesHabit(log, habit) && log.date >= start && log.date <= end);
}

// A short, honest observation about the habit that held steadiest this range.
function renderReflection(rows, periodCount) {
  const steadiest = rows[0];

  if (!steadiest || steadiest.doneCount === 0) {
    reflection.hidden = true;
    return;
  }

  reflection.hidden = false;
  insightReflection.textContent = fill(t('anchorNote'), {
    habit: steadiest.habit.name,
    done: steadiest.doneCount,
    total: periodCount,
    unit: t(
      activeRange === 'week' ? 'unitDays' : activeRange === 'month' ? 'unitWeeks' : 'unitMonths'
    ),
  });
}

/* ========================= 13. Rendering: History ========================= */

function renderHistory() {
  const sorted = sortLogsNewestFirst(logs);
  const today = getTodayString();

  logList.textContent = '';
  historyCount.textContent = fill(logs.length === 1 ? t('logSingular') : t('logPlural'), {
    count: logs.length,
  });
  emptyState.hidden = logs.length > 0;

  for (const log of sorted) {
    const item = element('li', 'log-item');

    const name = element('p', 'log-habit', log.habit);
    if (log.minutes) {
      name.appendChild(element('span', 'log-time', ` · ${log.minutes} min`));
    }

    const date = element('p', 'log-date');
    if (log.date === today) {
      date.appendChild(element('span', 'log-today', t('today')));
      date.appendChild(document.createTextNode(' · '));
    }
    date.appendChild(document.createTextNode(formatDateForDisplay(log.date)));

    item.appendChild(name);
    if (log.note) item.appendChild(element('p', 'log-note', log.note));
    item.appendChild(date);
    logList.appendChild(item);
  }
}

/* ========================= 14. Rendering: Habit detail ========================= */

function renderHabitDetail() {
  const habit = findHabit(openHabitId);
  if (!habit) return;

  const today = getTodayString();
  const dates = completionDatesFor(habit);

  habitEyebrow.textContent =
    habit.frequency === 'daily' ? t('everyDayShort') : formatWeekdays(habit.weekdays);
  habitTitle.textContent = habit.name;
  habitLede.textContent =
    habit.goalMinutes > 0
      ? `${fill(t('minutesGoal'), { minutes: habit.goalMinutes })} · ${formatWeekdays(
          habit.weekdays
        )}`
      : formatWeekdays(habit.weekdays);

  setIcon(habitHeroIcon, habit.icon);
  const goalLabel =
    habit.goalMinutes > 0 ? fill(t('minutesGoal'), { minutes: habit.goalMinutes }) : t('noGoal');
  habitHeroText.textContent = goalLabel;

  habitStreak.textContent = String(calculateStreakFromDays(dates));
  habitTotal.textContent = String(totalCompletionsFor(habit));

  const weekDays = getRollingWeekDays();
  habitWeekRange.textContent = `${formatDateForDisplay(weekDays[0].date, {
    month: 'short',
    day: 'numeric',
  })} – ${formatDateForDisplay(weekDays[6].date, { month: 'short', day: 'numeric' })}`;
  habitWeek.dataset.habitId = habit.id;
  renderWeekStrip(habitWeek, weekDays, 'completion', habit);

  habitGoal.textContent = goalLabel;
  habitReminder.textContent = habit.reminderEnabled ? habit.reminderTime : t('reminderOff');

  const complete = isHabitCompleteOn(habit, today);
  const due = isDueOn(habit, today);
  habitComplete.classList.toggle('is-done', complete);
  habitComplete.disabled = !due;
  habitCompleteText.textContent = !due
    ? t('habitRestDay')
    : complete
      ? t('completedToday')
      : t('markTodayComplete');
}

/* ========================= 15. Rendering: New habit ========================= */

function renderNewHabit() {
  habitInput.value = draftHabit.name;
  setIcon(pickedIcon, draftHabit.icon);

  // Icon picker
  iconPicker.textContent = '';
  for (const iconName of ICONS) {
    const button = element('button', 'icon-option');
    button.type = 'button';
    button.setAttribute('aria-label', fill(t('chooseIconAria'), { icon: t(`icon${capitalise(iconName)}`) }));
    button.setAttribute('aria-pressed', String(draftHabit.icon === iconName));
    if (draftHabit.icon === iconName) button.classList.add('is-selected');
    button.appendChild(icon(iconName, 20));
    button.addEventListener('click', () => {
      draftHabit.icon = iconName;
      // The first two habits read as the warm accent, like the mockup.
      draftHabit.accent = iconName === 'footprints' || iconName === 'walk' ? 'warm' : 'sage';
      renderNewHabit();
    });
    iconPicker.appendChild(button);
  }

  // Frequency
  for (const button of freqButtons) {
    const selected = button.dataset.frequency === draftHabit.frequency;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }

  // Weekdays (Monday first)
  weekdayPicker.textContent = '';
  weekdayPicker.hidden = draftHabit.frequency !== 'specific';
  if (draftHabit.frequency === 'specific') {
    for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
      const button = element('button', 'weekday-option');
      button.type = 'button';
      button.textContent = weekdayName(weekday, 'narrow');
      button.setAttribute('aria-label', weekdayName(weekday, 'long'));
      const selected = draftHabit.weekdays.includes(weekday);
      button.setAttribute('aria-pressed', String(selected));
      if (selected) button.classList.add('is-selected');
      button.addEventListener('click', () => {
        if (selected) {
          draftHabit.weekdays = draftHabit.weekdays.filter((day) => day !== weekday);
        } else {
          draftHabit.weekdays = [...draftHabit.weekdays, weekday];
        }
        renderNewHabit();
      });
      weekdayPicker.appendChild(button);
    }
  }

  goalValue.textContent = String(draftHabit.goalMinutes);

  reminderToggle.setAttribute('aria-pressed', String(draftHabit.reminderEnabled));
  reminderToggle.classList.toggle('is-on', draftHabit.reminderEnabled);
  reminderInput.value = draftHabit.reminderTime;
  reminderInput.disabled = !draftHabit.reminderEnabled;

  previewText.textContent = buildPreviewText();
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// "10 minutes, every day." / "10 minutes, Mon, Tue and Wed."
function buildPreviewText() {
  const minutes = draftHabit.goalMinutes;
  const hasGoal = minutes > 0;

  if (draftHabit.frequency === 'daily') {
    return hasGoal
      ? fill(t('previewDaily'), { minutes: minutes })
      : t('previewNoGoalDaily');
  }

  const days = formatWeekdays(draftHabit.weekdays);

  return hasGoal
    ? fill(t('previewSpecific'), { minutes: minutes, days: days })
    : fill(t('previewNoGoalSpecific'), { days: days });
}

/* ========================= 16. Rendering: Celebration ========================= */

function renderCelebration() {
  const today = getTodayString();
  const due = habitsDueOn(today);
  const done = due.filter((habit) => isHabitCompleteOn(habit, today));

  celebrationDate.textContent = formatEyebrowDate(today);
  celebrationRatio.textContent = fill(t('ratioFormat'), { done: done.length, total: due.length });
  celebrationLede.textContent = fill(t('celebrationLede'), { count: done.length });

  celebrationHabits.textContent = '';
  for (const habit of done) {
    const chip = element('span', 'completed-habit');
    chip.appendChild(icon(habit.icon, 19));
    celebrationHabits.appendChild(chip);
  }

  // The milestone names the habit with the longest run right now.
  let best = null;
  for (const habit of habits) {
    const streak = calculateStreakFromDays(completionDatesFor(habit));
    if (streak > 0 && (!best || streak > best.streak)) best = { habit: habit, streak: streak };
  }

  if (best && best.streak > 1) {
    celebrationMilestone.hidden = false;
    milestoneTitle.textContent = fill(t('milestoneTitle'), {
      days: best.streak,
      habit: best.habit.name,
    });
    milestoneNote.textContent = t('milestoneNote');
  } else {
    celebrationMilestone.hidden = true;
  }
}

/* ========================= 17. Actions ========================= */

// Adds or removes today's completion for a habit.
function toggleHabitOn(habit, dateString) {
  const existing = logs.find((log) => log.date === dateString && logMatchesHabit(log, habit));

  if (existing) {
    logs = logs.filter((log) => log !== existing);
  } else {
    logs.push({
      id: makeId('log'),
      createdAt: Date.now(),
      date: dateString,
      habit: habit.name,
      habitId: habit.id,
    });
  }

  const saved = saveLogs();
  renderAll();

  if (!saved) storageWarning.hidden = false;

  // Finishing every habit is worth celebrating, once per day per visit.
  if (!existing) maybeCelebrate();
}

function maybeCelebrate() {
  const today = getTodayString();
  const due = habitsDueOn(today);
  if (due.length === 0) return;

  const allDone = due.every((habit) => isHabitCompleteOn(habit, today));
  if (allDone && celebrationShownFor !== today) {
    celebrationShownFor = today;
    openCelebration();
  }
}

function openCelebration() {
  renderCelebration();
  celebration.hidden = false;
  document.body.classList.add('has-overlay');
  celebrationDone.focus();
}

function closeCelebration() {
  celebration.hidden = true;
  document.body.classList.remove('has-overlay');
}

// Creates the habit from the finished draft.
function createHabitFromDraft() {
  const name = draftHabit.name.trim();

  if (name === '') {
    showFormError(t('errorHabitRequired'));
    habitInput.focus();
    return;
  }
  if (draftHabit.frequency === 'specific' && draftHabit.weekdays.length === 0) {
    showFormError(t('errorNoDays'));
    return;
  }
  hideFormError();

  habits.push({
    id: makeId('habit'),
    name: name,
    icon: draftHabit.icon,
    accent: draftHabit.accent,
    frequency: draftHabit.frequency,
    weekdays: [...draftHabit.weekdays],
    goalMinutes: draftHabit.goalMinutes,
    reminderEnabled: draftHabit.reminderEnabled,
    reminderTime: draftHabit.reminderTime,
    createdAt: Date.now(),
  });

  if (!saveHabits()) storageWarning.hidden = false;

  draftHabit = createEmptyDraft();
  showView('today');
}

function deleteHabit(habit) {
  if (habits.length <= 1) {
    window.alert(t('deleteBlocked'));
    return;
  }
  if (!window.confirm(fill(t('deleteConfirm'), { habit: habit.name }))) return;

  // Only the habit goes: completed logs stay in the history on purpose.
  habits = habits.filter((entry) => entry !== habit);
  saveHabits();
  showView('today');
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function hideFormError() {
  formError.hidden = true;
}

/* ========================= 18. Views ========================= */

function showView(view) {
  activeView = view;
  app.dataset.activeView = view;

  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.dataset.view !== view;
  }
  for (const button of tabButtons) {
    const selected = button.dataset.tab === view;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }

  window.scrollTo(0, 0);
  renderAll();
}

function openHabitView(habitId) {
  openHabitId = habitId;
  showView('habit');
}

function openNewHabitView() {
  draftHabit = createEmptyDraft();
  hideFormError();
  showView('new');
  habitInput.focus();
}

/* ========================= 19. Rendering: everything ========================= */

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  for (const button of themeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === settings.theme));
  }
}

// Rewrites every marked string, then redraws the generated ones.
function applyLanguage() {
  document.documentElement.lang = settings.language;
  document.title = t('documentTitle');

  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const button of languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.languageOption === settings.language));
  }

  renderAll();
}

function renderAll() {
  renderToday();
  renderInsights();
  renderHistory();
  if (openHabitId) renderHabitDetail();
  if (activeView === 'new') renderNewHabit();
}

/* ========================= 20. Events ========================= */

newHabitButton.addEventListener('click', openNewHabitView);
newBack.addEventListener('click', () => showView('today'));
newClose.addEventListener('click', () => showView('today'));
habitBack.addEventListener('click', () => showView('today'));
habitDelete.addEventListener('click', () => {
  const habit = findHabit(openHabitId);
  if (habit) deleteHabit(habit);
});

habitComplete.addEventListener('click', () => {
  const habit = findHabit(openHabitId);
  if (habit) toggleHabitOn(habit, getTodayString());
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.tab));
});

for (const button of document.querySelectorAll('.range-option')) {
  button.addEventListener('click', () => {
    activeRange = button.dataset.range;
    renderAll();
  });
}

for (const button of freqButtons) {
  button.addEventListener('click', () => {
    draftHabit.frequency = button.dataset.frequency;
    renderNewHabit();
  });
}

goalMinus.addEventListener('click', () => {
  draftHabit.goalMinutes = Math.max(0, draftHabit.goalMinutes - 5);
  renderNewHabit();
});
goalPlus.addEventListener('click', () => {
  draftHabit.goalMinutes = Math.min(240, draftHabit.goalMinutes + 5);
  renderNewHabit();
});

reminderToggle.addEventListener('click', () => {
  draftHabit.reminderEnabled = !draftHabit.reminderEnabled;
  renderNewHabit();
});
reminderInput.addEventListener('change', () => {
  draftHabit.reminderTime = reminderInput.value || '21:00';
  renderNewHabit();
});

habitInput.addEventListener('input', () => {
  draftHabit.name = habitInput.value;
  hideFormError();
  previewText.textContent = buildPreviewText();
});

habitForm.addEventListener('submit', (event) => {
  event.preventDefault(); // we do not want to reload the page
  createHabitFromDraft();
});

celebrationClose.addEventListener('click', closeCelebration);
celebrationDone.addEventListener('click', closeCelebration);
celebration.addEventListener('click', (event) => {
  if (event.target === celebration) closeCelebration();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !celebration.hidden) closeCelebration();
});

for (const button of themeButtons) {
  button.addEventListener('click', () => {
    settings.theme = button.dataset.themeOption;
    saveSettings();
    applyTheme();
  });
}

for (const button of languageButtons) {
  button.addEventListener('click', () => {
    settings.language = button.dataset.languageOption;
    saveSettings();
    applyLanguage();
  });
}

/* ========================= 21. Start the app ========================= */

applyTheme();
showView('today'); // renders everything, in the saved language
applyLanguage();
